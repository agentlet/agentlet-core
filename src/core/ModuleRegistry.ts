/**
 * Simplified Module Registry for Agentlet Core
 * Manages module registration, activation, and lifecycle
 */

import type {
    AgentletModule,
    EventBusAPI,
    ModuleActivationContext,
    ModuleRegistryAPI,
    ModuleStatistics
} from '../types/public-api';

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

/** A single entry inside a loaded registry's `agentlets` array. */
interface AgentletRegistryEntryConfig {
    name: string;
    url: string;
    module: string;
}

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

    // Callback for module changes
    onModuleChange: ((module: AgentletModule | null, context?: ModuleActivationContext) => void) | null;

    // Performance tracking - simplified
    metrics: ModuleRegistryMetrics;

    // Guards to prevent duplicate operations
    _registrationInProgress: Set<string>;
    _activationInProgress: Set<string>;

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

        // Start URL monitoring
        this.startUrlMonitoring();
    }

    /**
     * Register a module
     * @param module - Module instance to register
     */
    register(module: AgentletModule): void {
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

            console.log(`📦 Module registered: ${module.name}`);
            this.emit('module:registered', { module: module.name });

            // Check if this module should be active for current URL
            this.checkUrlChange();
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
            await module.cleanup();
        }

        this.modules.delete(moduleName);
        this.metrics.totalModules = this.modules.size;

        console.log(`📦 Module unregistered: ${moduleName}`);
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

            console.log(`🔄 Module activated: ${module.name}`);
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
            console.log(`⏸️ Module deactivated: ${module.name}`);
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
     * Check for URL changes and activate appropriate module
     */
    checkUrlChange(): void {
        const currentUrl = window.location.href;
        const urlChanged = currentUrl !== this.lastUrl;

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

        if (urlChanged) {
            this.lastUrl = currentUrl;
            this.emit('url:changed', { oldUrl: this.lastUrl, newUrl: currentUrl });
        }
    }

    /**
     * Start monitoring URL changes
     */
    startUrlMonitoring(): void {
        // Check periodically
        setInterval(() => {
            this.checkUrlChange();
        }, 1000);

        // Listen for navigation events
        window.addEventListener('popstate', () => {
            setTimeout(() => this.checkUrlChange(), 100);
        });

        // Override pushState and replaceState
        const originalPushState = history.pushState;
        const originalReplaceState = history.replaceState;

        history.pushState = function (this: ModuleRegistry, ...args: Parameters<History['pushState']>): void {
            originalPushState.apply(history, args);
            setTimeout(() => this.checkUrlChange(), 100);
        }.bind(this);

        history.replaceState = function (this: ModuleRegistry, ...args: Parameters<History['replaceState']>): void {
            originalReplaceState.apply(history, args);
            setTimeout(() => this.checkUrlChange(), 100);
        }.bind(this);
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
            console.log(`📦 Registry already loaded: ${url}`);
            return;
        }

        try {
            console.log(`📦 Loading agentlets registry from: ${url}`);

            // Payload shape is not guaranteed by the external registry script.
            const registryData = await this.loadRegistryScript(url);

            // Handle registry data structure
            const agentlets: AgentletRegistryEntryConfig[] | unknown = Array.isArray(registryData)
                ? registryData
                : (registryData as AgentletRegistryPayload).agentlets || [];

            if (!Array.isArray(agentlets)) {
                throw new Error('Registry must contain an agentlets array');
            }

            console.log(`📦 Found ${agentlets.length} agentlet(s) in registry`);

            // Extract base URL from registry URL for relative library paths
            let baseUrl: string;
            try {
                const registryUrlObj = new URL(url);
                baseUrl = registryUrlObj.origin + registryUrlObj.pathname.replace(/[^/]+$/, '');
            } catch (_error) {
                const currentLocation = window.location.href;
                const registryUrlObj = new URL(url, currentLocation);
                baseUrl = registryUrlObj.origin + registryUrlObj.pathname.replace(/[^/]+$/, '');
            }

            // Add base URL to registry data if it has libraries
            if ((registryData as AgentletRegistryPayload).libraries) {
                (registryData as AgentletRegistryPayload).baseUrl = baseUrl;
            }

            // Load each agentlet module
            for (const agentletConfig of agentlets as AgentletRegistryEntryConfig[]) {
                try {
                    await this.loadAgentletModule(agentletConfig);
                } catch (error) {
                    console.error(`📦 Failed to load agentlet ${agentletConfig.name}:`, error);
                    this.metrics.registryLoadFailures++;
                }
            }

            this.loadedRegistries.add(url);
            this.metrics.registriesLoaded++;

            console.log(`✅ Registry loaded successfully: ${agentlets.length} agentlet(s)`);
            this.emit('registry:loaded', { url, agentletCount: agentlets.length });

        } catch (error) {
            this.metrics.registryLoadFailures++;
            console.error(`❌ Failed to load registry from ${url}:`, error);
            this.emit('registry:loadFailed', { url, error: (error as Error).message });
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
                console.log('📦 Registry data received via event');
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
                console.log(`📦 Registry script loaded: ${url}`);
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
            console.log(`📦 Agentlet already loaded: ${name}`);
            return;
        }

        try {
            console.log(`📦 Loading agentlet module: ${name} from ${url}`);

            // Dynamically import the module
            const _moduleScript = await this.loadScript(url);

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

            // Only register if not skipping registry module registration
            if (!this.skipRegistryModuleRegistration) {
                this.register(moduleInstance);
                console.log(`✅ Agentlet loaded and registered: ${name}`);
            } else {
                console.log(`✅ Agentlet loaded (registration skipped): ${name}`);
            }

        } catch (error) {
            console.error(`❌ Failed to load agentlet module ${name}:`, error);
            throw error;
        }
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
                console.log(`📦 Script loaded: ${url}`);
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
        console.log('🚀 Module Registry initialized');

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

        console.log('🧹 Module Registry cleaned up');
    }
}
