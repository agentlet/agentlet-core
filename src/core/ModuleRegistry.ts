/**
 * Simplified Module Registry for Agentlet Core
 * Manages module registration, activation, and lifecycle
 */

import type {
    AgentletModule,
    AgentletRegistryEntry,
    AgentletRegistryEntryStatus,
    EventBusAPI,
    ModuleActivationContext,
    ModuleRegistryAPI,
    ModuleStatistics
} from '../types/public-api';
import { logger } from '../utils/system/Logger.js';

/**
 * Constructor configuration. Not part of the public `window.agentlet`
 * surface (nothing in src/types/public-api.d.ts references it directly -
 * `AgentletCoreConfig` only carries `registryUrl` /
 * `skipRegistryModuleRegistration` at the top level and the core builds
 * this object itself), so it lives here rather than in public-api.d.ts.
 */
export interface ModuleRegistryConfig {
    eventBus?: EventBusAPI;
    registryUrl?: string;
    skipRegistryModuleRegistration?: boolean;
}

/**
 * A single entry inside a loaded registry's `agentlets` array. Same shape
 * as the public {@link AgentletRegistryEntry} - re-declared locally (rather
 * than imported and used directly everywhere) only where an internal-only
 * alias reads better; the two must stay in sync.
 */
type AgentletRegistryEntryConfig = AgentletRegistryEntry;

/**
 * Shape of the JSON-like payload delivered via the `agentletRegistryLoaded`
 * event (see `loadRegistryScript()`). This is data supplied by an
 * externally-hosted registry script, not something this codebase controls,
 * so its true shape is genuinely dynamic; this interface only documents the
 * fields this class itself reads/writes.
 */
interface AgentletRegistryPayload {
    agentlets?: AgentletRegistryEntryConfig[];
    libraries?: unknown;
    baseUrl?: string;
}

/**
 * Subset of {@link ModuleStatistics} tracked directly on `this.metrics`;
 * `activeModule` and `moduleList` are derived on demand in
 * `getStatistics()`.
 */
interface ModuleRegistryMetrics {
    totalModules: number;
    activationCount: number;
    failedActivations: number;
    registriesLoaded: number;
    registryLoadFailures: number;
}

export default class ModuleRegistry implements ModuleRegistryAPI {
    modules: Map<string, AgentletModule>;
    activeModule: AgentletModule | null;
    lastUrl: string;

    // Event system
    eventBus?: EventBusAPI;

    // Registry configuration
    registryUrl?: string;
    loadedRegistries: Set<string>;
    skipRegistryModuleRegistration: boolean;
    // Every registry entry seen so far (eager or `lazy: true`), keyed by
    // name, in the order the registry declared them. See loadFromRegistry(),
    // loadModule() and getRegistryEntries().
    registryEntries: Map<string, AgentletRegistryEntry>;

    // Callback for module changes
    onModuleChange: ((module: AgentletModule | null, context?: ModuleActivationContext) => void) | null;

    // Performance tracking - simplified
    metrics: ModuleRegistryMetrics;

    // Guards to prevent duplicate operations
    _registrationInProgress: Set<string>;
    _activationInProgress: Set<string>;

    // URL monitoring internals (see startUrlMonitoring()/stopUrlMonitoring())
    _urlMonitoringActive: boolean;
    _urlMonitoringIntervalId: ReturnType<typeof setInterval> | null;
    _popstateListener: (() => void) | null;
    _hashchangeListener: (() => void) | null;
    _originalPushState: History['pushState'] | null;
    _originalReplaceState: History['replaceState'] | null;
    _pushStateWrapper: History['pushState'] | null;
    _replaceStateWrapper: History['replaceState'] | null;

    constructor(config: ModuleRegistryConfig = {}) {
        this.modules = new Map();
        this.activeModule = null;
        this.lastUrl = window.location.href;

        // Event system
        this.eventBus = config.eventBus;

        // Registry configuration
        this.registryUrl = config.registryUrl;
        this.loadedRegistries = new Set();
        this.skipRegistryModuleRegistration = config.skipRegistryModuleRegistration || false;
        this.registryEntries = new Map();

        // Callback for module changes
        this.onModuleChange = null;

        // Performance tracking - simplified
        this.metrics = {
            totalModules: 0,
            activationCount: 0,
            failedActivations: 0,
            registriesLoaded: 0,
            registryLoadFailures: 0
        };

        // Guards to prevent duplicate operations
        this._registrationInProgress = new Set();
        this._activationInProgress = new Set();

        // URL monitoring internals
        this._urlMonitoringActive = false;
        this._urlMonitoringIntervalId = null;
        this._popstateListener = null;
        this._hashchangeListener = null;
        this._originalPushState = null;
        this._originalReplaceState = null;
        this._pushStateWrapper = null;
        this._replaceStateWrapper = null;

        // Start URL monitoring
        this.startUrlMonitoring();
    }

    /**
     * Register a module. Runs URL-based detection afterwards (a module
     * whose pattern matches the current URL is activated automatically) -
     * see `applyRegistration()` for the shared body used by `loadModule()`,
     * which registers without that detection step.
     * @param module - Module instance to register
     */
    register(module: AgentletModule): void {
        this.applyRegistration(module, true);
    }

    /**
     * Shared registration body for `register()` and the on-demand
     * `loadModule()` path: identical duplicate-detection, reentrancy guard,
     * modules-map mutation and `module:registered` event, but the caller
     * decides whether `checkUrlChange()` runs afterwards. `loadModule()`
     * passes `false` so loading a module never activates it just because
     * its pattern happens to match the current page.
     * @param module - Module instance to register
     * @param checkUrl - Whether to run URL-based detection after registering
     */
    private applyRegistration(module: AgentletModule, checkUrl: boolean): void {
        if (!module || !module.name) {
            throw new Error('Invalid module: name is required');
        }

        // Prevent double registration
        if (this._registrationInProgress.has(module.name)) {
            console.warn(`Registration already in progress for ${module.name}, skipping`);
            return;
        }

        this._registrationInProgress.add(module.name);

        try {
            // Enhanced duplicate detection
            if (this.modules.has(module.name)) {
                const existing = this.modules.get(module.name);
                if (existing === module) {
                    console.warn(`Module ${module.name} already registered with same instance, ignoring`);
                    return; // Don't re-register the exact same instance
                }
                console.warn(`Module ${module.name} already registered, replacing...`);
            }

            // Set event bus reference
            module.eventBus = this.eventBus;

            this.modules.set(module.name, module);
            this.metrics.totalModules = this.modules.size;

            logger.log(`📦 Module registered: ${module.name}`);
            this.emit('module:registered', { module: module.name });

            // Check if this module should be active for current URL
            if (checkUrl) {
                this.checkUrlChange();
            }
        } finally {
            this._registrationInProgress.delete(module.name);
        }
    }

    /**
     * Unregister a module
     * @param moduleName - Name of module to unregister
     */
    async unregister(moduleName: string): Promise<boolean> {
        const module = this.modules.get(moduleName);
        if (!module) return false;

        // Cleanup if it's the active module
        if (this.activeModule === module) {
            await this.deactivateModule();
        }

        // Cleanup the module
        if (typeof module.cleanup === 'function') {
            try {
                await module.cleanup();
            } catch (error) {
                console.error(`Error cleaning up module ${module.name}:`, error);
            }
        }

        this.modules.delete(moduleName);
        this.metrics.totalModules = this.modules.size;

        logger.log(`📦 Module unregistered: ${moduleName}`);
        this.emit('module:unregistered', { module: moduleName });

        return true;
    }

    /**
     * Find module that matches the current URL
     * @param url - URL to check (defaults to current URL)
     * @returns Matching module or null
     */
    findMatchingModule(url: string = window.location.href): AgentletModule | null {
        for (const module of this.modules.values()) {
            if (module.checkPattern && module.checkPattern(url)) {
                return module;
            }
        }
        return null;
    }

    /**
     * Activate a specific module
     * @param module - Module to activate
     * @param context - Activation context
     */
    async activateModule(module: AgentletModule, context: ModuleActivationContext = {}): Promise<void> {
        if (!module) return;

        // Prevent cascade activations
        const activationKey = `${module.name}-${context.trigger || 'default'}`;
        if (this._activationInProgress.has(activationKey)) {
            console.warn(`Activation already in progress for ${activationKey}, skipping`);
            return;
        }

        this._activationInProgress.add(activationKey);

        try {
            // Deactivate current module if different
            if (this.activeModule && this.activeModule !== module) {
                await this.deactivateModule(context);
            }

            // Skip if already active
            if (this.activeModule === module) return;

            // Initialize module if needed
            if (!module.isInitialized) {
                await module.init();
                module.isInitialized = true;
            }

            // Activate module
            await module.activate(context);
            this.activeModule = module;
            this.metrics.activationCount++;

            logger.log(`🔄 Module activated: ${module.name}`);
            this.emit('module:activated', { module: module.name, context });

            // Notify callback
            if (this.onModuleChange) {
                this.onModuleChange(module, context);
            }

        } catch (error) {
            this.metrics.failedActivations++;
            console.error(`❌ Module activation failed: ${module.name}`, error);
            this.emit('module:activationFailed', { module: module.name, error: (error as Error).message });
        } finally {
            this._activationInProgress.delete(activationKey);
        }
    }

    /**
     * Deactivate current module
     * @param context - Context describing why deactivation happened (e.g. a urlChange), forwarded to `module.cleanup()` and the module-change callback
     */
    async deactivateModule(context: ModuleActivationContext = {}): Promise<void> {
        if (!this.activeModule) return;

        const module = this.activeModule;
        try {
            await module.cleanup(context);
            logger.log(`⏸️ Module deactivated: ${module.name}`);
            this.emit('module:deactivated', { module: module.name });
        } catch (error) {
            console.error(`❌ Module deactivation failed: ${module.name}`, error);
        }

        this.activeModule = null;

        // Notify callback
        if (this.onModuleChange) {
            this.onModuleChange(null, context);
        }
    }

    /**
     * Check for URL changes and activate the appropriate module.
     *
     * URL-based re-detection only runs when the URL actually changed, or
     * when nothing is active yet (the initial/registration-time detection
     * case, see `register()`). Without that guard, this method's own 1s
     * poll (see `startUrlMonitoring()`) would re-run `findMatchingModule()`
     * every tick regardless of navigation and immediately override a module
     * activated explicitly via `activateModule()` - e.g. a "launcher"
     * module letting a visitor pick a different module by hand - about a
     * second later, even though the page never navigated.
     *
     * When the URL did change, if the module that is already active still
     * matches the new URL, it is left running rather than re-running
     * `findMatchingModule()` from scratch: `findMatchingModule()` returns
     * the *first* registered module whose pattern matches, which is not
     * necessarily the currently active one when several modules' patterns
     * overlap (e.g. two modules both matching `'*'`) - re-deriving from
     * scratch on every URL change would fight an explicit activation the
     * same way the polling case above did.
     */
    checkUrlChange(): void {
        const currentUrl = window.location.href;
        const urlChanged = currentUrl !== this.lastUrl;

        if (urlChanged || !this.activeModule) {
            const activeStillMatches = Boolean(
                this.activeModule &&
                typeof this.activeModule.checkPattern === 'function' &&
                this.activeModule.checkPattern(currentUrl)
            );

            if (!activeStillMatches) {
                const matchingModule = this.findMatchingModule(currentUrl);

                if (matchingModule !== this.activeModule) {
                    const context: ModuleActivationContext = {
                        trigger: urlChanged ? 'urlChange' : 'moduleRegistration',
                        oldUrl: this.lastUrl,
                        newUrl: currentUrl
                    };

                    if (matchingModule) {
                        this.activateModule(matchingModule, context);
                        this.emit('application:detected', { module: matchingModule.name, url: currentUrl });
                    } else {
                        this.deactivateModule(context);
                        this.emit('application:notDetected', { url: currentUrl });
                    }
                }
            }
        }

        if (urlChanged) {
            const previousUrl = this.lastUrl;
            this.lastUrl = currentUrl;
            this.emit('url:changed', { oldUrl: previousUrl, newUrl: currentUrl });
        }
    }

    /**
     * Start monitoring URL changes. Idempotent: a second call while
     * monitoring is already active is a no-op.
     */
    startUrlMonitoring(): void {
        if (this._urlMonitoringActive) {
            return;
        }
        this._urlMonitoringActive = true;

        // Check periodically
        this._urlMonitoringIntervalId = setInterval(() => {
            if (!this._urlMonitoringActive) return;
            this.checkUrlChange();
        }, 1000);

        // Listen for navigation events
        this._popstateListener = () => {
            setTimeout(() => {
                if (this._urlMonitoringActive) this.checkUrlChange();
            }, 100);
        };
        window.addEventListener('popstate', this._popstateListener);

        // Hash-only navigation (location.hash = ... / an in-page anchor
        // click) fires neither popstate nor pushState/replaceState, so
        // without this listener it would only be picked up by the 1s poll
        // above. Same 100ms-delayed checkUrlChange() as popstate, for
        // equally prompt detection of hash-based single-page navigation.
        this._hashchangeListener = () => {
            setTimeout(() => {
                if (this._urlMonitoringActive) this.checkUrlChange();
            }, 100);
        };
        window.addEventListener('hashchange', this._hashchangeListener);

        // Override pushState and replaceState
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;
        this._originalPushState = originalPushState;
        this._originalReplaceState = originalReplaceState;

        this._pushStateWrapper = (...args: Parameters<History['pushState']>): void => {
            originalPushState.apply(history, args);
            setTimeout(() => {
                if (this._urlMonitoringActive) this.checkUrlChange();
            }, 100);
        };

        this._replaceStateWrapper = (...args: Parameters<History['replaceState']>): void => {
            originalReplaceState.apply(history, args);
            setTimeout(() => {
                if (this._urlMonitoringActive) this.checkUrlChange();
            }, 100);
        };

        history.pushState = this._pushStateWrapper;
        history.replaceState = this._replaceStateWrapper;
    }

    /**
     * Stop monitoring URL changes: clears the polling interval, removes the
     * `popstate` listener, and restores `history.pushState`/`replaceState`
     * if they are still the wrappers installed by startUrlMonitoring().
     *
     * If another script has wrapped `history.pushState`/`replaceState` on
     * top of ours in the meantime, those methods are left untouched (they
     * are not ours to restore); the `_urlMonitoringActive` flag still makes
     * any call that reaches our wrapper through that chain a harmless no-op.
     */
    stopUrlMonitoring(): void {
        this._urlMonitoringActive = false;

        if (this._urlMonitoringIntervalId !== null) {
            clearInterval(this._urlMonitoringIntervalId);
            this._urlMonitoringIntervalId = null;
        }

        if (this._popstateListener) {
            window.removeEventListener('popstate', this._popstateListener);
            this._popstateListener = null;
        }

        if (this._hashchangeListener) {
            window.removeEventListener('hashchange', this._hashchangeListener);
            this._hashchangeListener = null;
        }

        if (this._originalPushState && history.pushState === this._pushStateWrapper) {
            history.pushState = this._originalPushState;
        }
        if (this._originalReplaceState && history.replaceState === this._replaceStateWrapper) {
            history.replaceState = this._originalReplaceState;
        }

        this._originalPushState = null;
        this._originalReplaceState = null;
        this._pushStateWrapper = null;
        this._replaceStateWrapper = null;
    }

    /**
     * Set callback for module changes
     * @param callback - Callback function
     */
    setModuleChangeCallback(callback: (module: AgentletModule | null, context?: ModuleActivationContext) => void): void {
        this.onModuleChange = callback;
    }

    /**
     * Load agentlets from registry JavaScript file via script injection
     * @param registryUrl - URL to registry JavaScript file (optional, uses config default)
     */
    async loadFromRegistry(registryUrl: string | null = null): Promise<void> {
        const url = registryUrl || this.registryUrl;
        if (!url) {
            console.warn('📦 No registry URL configured, skipping registry loading');
            return;
        }

        // Prevent loading the same registry multiple times
        if (this.loadedRegistries.has(url)) {
            logger.log(`📦 Registry already loaded: ${url}`);
            return;
        }

        try {
            logger.log(`📦 Loading agentlets registry from: ${url}`);

            // Payload shape is not guaranteed by the external registry script.
            const registryData = await this.loadRegistryScript(url);

            // Handle registry data structure
            const agentlets: AgentletRegistryEntryConfig[] | unknown = Array.isArray(registryData)
                ? registryData
                : (registryData as AgentletRegistryPayload).agentlets || [];

            if (!Array.isArray(agentlets)) {
                throw new Error('Registry must contain an agentlets array');
            }

            logger.log(`📦 Found ${agentlets.length} agentlet(s) in registry`);

            // Absolute registry URL: relative library paths and relative
            // entry URLs both resolve against it, not against the host page.
            const registryHref = new URL(url, window.location.href).href;
            const registryUrlObj = new URL(registryHref);
            const baseUrl = registryUrlObj.origin + registryUrlObj.pathname.replace(/[^/]+$/, '');

            // Add base URL to registry data if it has libraries
            if ((registryData as AgentletRegistryPayload).libraries) {
                (registryData as AgentletRegistryPayload).baseUrl = baseUrl;
            }

            // Load each agentlet module, except `lazy: true` entries: those
            // are recorded (so getRegistryEntries() lists them for a host to
            // show, e.g. a launcher UI) but not fetched here - only
            // loadModule() loads them, on demand.
            for (const rawConfig of agentlets as AgentletRegistryEntryConfig[]) {
                // Stored resolved, so a later loadModule(getRegistryEntries()[i])
                // fetches the same absolute URL the eager load would have.
                const agentletConfig: AgentletRegistryEntryConfig = {
                    ...rawConfig,
                    url: ModuleRegistry.resolveEntryUrl(rawConfig.url, registryHref)
                };
                this.registryEntries.set(agentletConfig.name, agentletConfig);

                if (agentletConfig.lazy) {
                    logger.log(`📦 Skipping eager load of lazy agentlet: ${agentletConfig.name}`);
                    continue;
                }

                try {
                    await this.loadAgentletModule(agentletConfig);
                } catch (error) {
                    console.error(`📦 Failed to load agentlet ${agentletConfig.name}:`, error);
                    this.metrics.registryLoadFailures++;
                }
            }

            this.loadedRegistries.add(url);
            this.metrics.registriesLoaded++;

            logger.log(`✅ Registry loaded successfully: ${agentlets.length} agentlet(s)`);
            this.emit('registry:loaded', { url, agentletCount: agentlets.length });

        } catch (error) {
            this.metrics.registryLoadFailures++;
            console.error(`❌ Failed to load registry from ${url}:`, error);
            this.emit('registry:loadFailed', { url, error: (error as Error).message });
        }
    }

    /**
     * Resolves a registry entry's `url` against the registry script's own
     * absolute URL, so `"./module-bundle.js"` loads from next to the
     * registry rather than from next to the host page. Absolute URLs pass
     * through unchanged; a missing or unparsable value is returned as is so
     * the existing validation in `loadAgentletModule()` still reports it.
     * @param entryUrl - `url` field of a registry entry
     * @param registryHref - Absolute URL of the registry script
     */
    static resolveEntryUrl(entryUrl: string, registryHref: string): string {
        if (typeof entryUrl !== 'string' || !entryUrl) {
            return entryUrl;
        }
        try {
            return new URL(entryUrl, registryHref).href;
        } catch (_error) {
            return entryUrl;
        }
    }

    /**
     * Load registry via script injection with event-based communication
     * @param url - Registry JavaScript file URL
     * @returns Registry data - shape depends entirely on the external registry script
     */
    loadRegistryScript(url: string): Promise<unknown> {
        return new Promise((resolve, reject) => {
            const timeoutMs = 10000; // 10 second timeout
            let timeoutId: ReturnType<typeof setTimeout>;
            let eventListener: (event: CustomEvent) => void;

            const cleanup = () => {
                if (timeoutId) clearTimeout(timeoutId);
                if (eventListener) {
                    window.removeEventListener('agentletRegistryLoaded', eventListener as EventListener);
                }
            };

            // Set up event listener for registry data
            eventListener = (event: CustomEvent) => {
                cleanup();
                logger.log('📦 Registry data received via event');
                resolve(event.detail);
            };

            window.addEventListener('agentletRegistryLoaded', eventListener as EventListener, { once: true });

            // Set up timeout
            timeoutId = setTimeout(() => {
                cleanup();
                reject(new Error(`Registry loading timeout after ${timeoutMs}ms: ${url}`));
            }, timeoutMs);

            // Create and inject script
            const script = document.createElement('script');
            script.src = url;
            script.type = 'text/javascript';
            script.crossOrigin = 'anonymous';

            script.onload = () => {
                logger.log(`📦 Registry script loaded: ${url}`);
                // Event handler will resolve the promise when data arrives
            };

            script.onerror = (error) => {
                cleanup();
                console.error(`📦 Registry script load failed: ${url}`, error);
                // Clean up failed script
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
                reject(new Error(`Failed to load registry script: ${url}`));
            };

            document.head.appendChild(script);
        });
    }

    /**
     * Load a single agentlet module from configuration
     * @param agentletConfig - Agentlet configuration {name, url, module}
     */
    async loadAgentletModule(agentletConfig: AgentletRegistryEntryConfig): Promise<void> {
        const { name, url, module: moduleClass } = agentletConfig;

        if (!name || !url || !moduleClass) {
            throw new Error('Agentlet config must have name, url, and module properties');
        }

        // Skip if already loaded
        if (this.modules.has(name)) {
            logger.log(`📦 Agentlet already loaded: ${name}`);
            return;
        }

        try {
            const moduleInstance = await this.instantiateAgentletModule(agentletConfig);

            // Only register if not skipping registry module registration
            if (!this.skipRegistryModuleRegistration) {
                // `applyRegistration(instance, false)`, not `register()`:
                // this runs once per entry inside loadFromRegistry()'s loop,
                // before every entry is known. Running checkUrlChange() here
                // too (as register() does) would race the SAME best-matching
                // module's activation against itself across iterations - the
                // second attempt finds the first still in
                // `_activationInProgress` and logs "Activation already in
                // progress ..., skipping" on every init that eagerly loads
                // more than one registry entry. loadFromRegistry() already
                // runs checkUrlChange() exactly once, in initialize(), after
                // the whole registry has loaded - matching loadModule()'s
                // on-demand path, which defers to the caller the same way.
                this.applyRegistration(moduleInstance, false);
                logger.log(`✅ Agentlet loaded and registered: ${name}`);
            } else {
                logger.log(`✅ Agentlet loaded (registration skipped): ${name}`);
            }

        } catch (error) {
            console.error(`❌ Failed to load agentlet module ${name}:`, error);
            throw error;
        }
    }

    /**
     * Loads `entry.url` and instantiates `window[entry.module]`, without
     * registering or activating it. Shared by `loadAgentletModule()` (the
     * eager, `init()`-time load) and `loadModule()` (the on-demand,
     * never-auto-activated load).
     * @param entry - Agentlet configuration {name, url, module}
     */
    private async instantiateAgentletModule(entry: AgentletRegistryEntryConfig): Promise<AgentletModule> {
        const { name, url, module: moduleClass } = entry;

        logger.log(`📦 Loading agentlet module: ${name} from ${url}`);

        // Dynamically import the module
        await this.loadScript(url);

        // Get the module class from global scope. `window` has no index
        // signature for arbitrary string keys, and the class named here is
        // genuinely dynamic (supplied by the registry payload), so it is
        // read through an untyped view of `window`.
        const ModuleClass = (window as unknown as Record<string, unknown>)[moduleClass] as (new () => AgentletModule) | undefined;
        if (!ModuleClass) {
            throw new Error(`Module class '${moduleClass}' not found in global scope after loading ${url}`);
        }

        // Create module instance
        const moduleInstance = new ModuleClass();
        if (!moduleInstance.name) {
            moduleInstance.name = name; // Set name if not provided
        }

        return moduleInstance;
    }

    /**
     * Loads a single registry entry on demand: fetches `entry.url`,
     * instantiates `window[entry.module]` and registers it - reusing
     * `instantiateAgentletModule()`, the same code the eager, `init()`-time
     * registry load uses - then resolves with the module instance, without
     * activating it (see `applyRegistration(module, false)`), even if its
     * pattern matches the current URL. Call `activateModule()` explicitly
     * afterwards to make it active.
     *
     * Resolves with the already-registered instance, without reloading, if
     * `entry.name` is already loaded. Records `entry` in `registryEntries`
     * regardless (so `getRegistryEntries()` reflects it), whether or not it
     * was declared by a loaded registry.
     * @param entry - Agentlet configuration {name, url, module, lazy?}
     */
    async loadModule(entry: AgentletRegistryEntryConfig): Promise<AgentletModule> {
        const { name, url, module: moduleClass } = entry;

        if (!name || !url || !moduleClass) {
            throw new Error('Agentlet config must have name, url, and module properties');
        }

        this.registryEntries.set(name, { ...entry });

        const existing = this.modules.get(name);
        if (existing) {
            logger.log(`📦 Agentlet already loaded: ${name}`);
            return existing;
        }

        const moduleInstance = await this.instantiateAgentletModule(entry);

        if (!this.skipRegistryModuleRegistration) {
            this.applyRegistration(moduleInstance, false);
            logger.log(`✅ Agentlet loaded and registered: ${name}`);
        } else {
            logger.log(`✅ Agentlet loaded (registration skipped): ${name}`);
        }

        return moduleInstance;
    }

    /**
     * Lists every registry entry seen so far (both eagerly loaded and
     * `lazy: true`), in the order the registry declared them, each
     * annotated with whether it has actually been loaded yet.
     */
    getRegistryEntries(): AgentletRegistryEntryStatus[] {
        return Array.from(this.registryEntries.values()).map(entry => ({
            ...entry,
            loaded: this.modules.has(entry.name)
        }));
    }

    /**
     * Load a script dynamically
     * @param url - Script URL
     */
    loadScript(url: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Check if script is already loaded
            const existingScript = document.querySelector(`script[src="${url}"]`);
            if (existingScript) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = url;
            script.type = 'text/javascript';
            script.crossOrigin = 'anonymous';

            script.onload = () => {
                logger.log(`📦 Script loaded: ${url}`);
                resolve();
            };

            script.onerror = (error) => {
                console.error(`📦 Script load failed: ${url}`, error);
                // Clean up failed script
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
                reject(new Error(`Failed to load script: ${url}`));
            };

            document.head.appendChild(script);
        });
    }

    /**
     * Initialize the registry
     */
    async initialize(): Promise<void> {
        logger.log('🚀 Module Registry initialized');

        // Load from registry if configured
        if (this.registryUrl) {
            await this.loadFromRegistry();
        }

        this.emit('registry:initialized', { totalModules: this.modules.size });

        // Check current URL
        this.checkUrlChange();
    }



    /**
     * Get all registered modules
     * @returns Array of module names
     */
    getAll(): string[] {
        return Array.from(this.modules.keys());
    }

    /**
     * Get module by name
     * @param name - Module name
     * @returns Module instance or null
     */
    get(name: string): AgentletModule | null {
        return this.modules.get(name) || null;
    }

    /**
     * Get registry statistics
     * @returns Statistics object
     */
    getStatistics(): ModuleStatistics {
        return {
            ...this.metrics,
            activeModule: this.activeModule?.name || null,
            moduleList: this.getAll()
        };
    }

    /**
     * Emit event to event bus
     * @param event - Event name
     * @param data - Event data
     */
    emit(event: string, data?: unknown): void {
        if (this.eventBus && typeof this.eventBus.emit === 'function') {
            this.eventBus.emit(event, data);
        }
    }

    /**
     * Cleanup all modules and stop monitoring
     */
    async cleanup(): Promise<void> {
        // Stop URL monitoring (interval, popstate listener, history wrappers)
        this.stopUrlMonitoring();

        // Deactivate current module
        await this.deactivateModule();

        // Cleanup all modules
        for (const module of this.modules.values()) {
            try {
                if (typeof module.cleanup === 'function') {
                    await module.cleanup();
                }
            } catch (error) {
                console.error(`Error cleaning up module ${module.name}:`, error);
            }
        }

        this.modules.clear();
        this.activeModule = null;

        logger.log('🧹 Module Registry cleaned up');
    }
}
