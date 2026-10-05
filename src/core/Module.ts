/**
 * Simplified Module class for Agentlet Core
 * Provides clean, focused module development experience
 */
import type {
    ModuleConfig,
    ModuleMatchMode,
    ModuleActivationContext,
    ModuleMetadata,
    ModuleMountContext,
    ModulePatternMatcher,
    EventBusAPI
} from '../types/public-api';
import { matchesHostPattern, warnSubstringHostPattern } from './hostMatching.js';

/** A single local event-listener callback, matching `AgentletModule.on`/`off`. */
type ModuleEventListener = (data: unknown) => void;

/** Regex-special characters (other than `*`, handled separately by `globPatternToRegExp()`) that must be escaped when turning a glob-style string pattern into a `RegExp`. */
const GLOB_REGEXP_SPECIAL_CHARS = /[.+?^${}()|[\]\\]/g;

/**
 * Turns a string pattern containing at least one `*` into a `RegExp` where
 * `*` matches any run of characters (`.*`) and every other regex-special
 * character is escaped so it is matched literally. The result is used
 * unanchored (via `RegExp.test()`), consistent with the existing
 * substring (`url.includes()`) semantics for plain string patterns.
 */
function globPatternToRegExp(pattern: string): RegExp {
    const escaped = pattern
        .replace(GLOB_REGEXP_SPECIAL_CHARS, '\\$&')
        .split('*')
        .join('.*');
    return new RegExp(escaped);
}

/** Minimal HTML escape for text interpolated into the default `getContent()` markup. */
function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * Values the scaffold templates wrote as `matchMode` before the option
 * existed (it was ignored). They keep meaning "default matching", silently.
 */
const LEGACY_MATCH_MODES: readonly string[] = ['includes', 'exact', 'regex'];

/**
 * Resolves the `matchMode` option. Only `'host'` changes behaviour. Because
 * projects scaffolded by earlier versions pass `matchMode: 'includes'`,
 * which was ignored, unknown values must not throw: they fall back to
 * substring matching. A value that is neither valid nor one of those legacy
 * ones is most likely a typo for `'host'`, so it is reported (not gated by
 * debug mode: it is a configuration error and affects what the module matches).
 */
function resolveMatchMode(value: unknown, moduleName: string): ModuleMatchMode {
    if (value === undefined || value === 'substring') {
        return 'substring';
    }
    if (value === 'host') {
        return 'host';
    }
    if (typeof value !== 'string' || !LEGACY_MATCH_MODES.includes(value)) {
        console.warn(
            `[${moduleName}] Unknown matchMode ${JSON.stringify(value)}; expected 'substring' or 'host'. ` +
            'Falling back to substring matching.'
        );
    }
    return 'substring';
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the `interface Module` block below the class for why this merge is safe.
class Module {
    // Core properties
    name: string;
    version: string;
    description: string;

    // Pattern matching - simplified
    patterns: ModulePatternMatcher[];
    /** How plain string patterns are matched: `'substring'` (default in 2.x) or `'host'`. */
    matchMode: ModuleMatchMode;

    // State management
    isActive: boolean;

    // Event system - simplified
    eventListeners: Map<string, ModuleEventListener[]>;
    eventBus?: EventBusAPI;

    // CSS injection
    injectedStyles: Set<string>;
    styleElement: HTMLStyleElement | null;

    // Mount state (Module mount/unmount API)
    /** `true` between a successful `mount()` call and the matching `unmount()`. Set/cleared by the core via `_beforeMount()`/`_afterUnmount()`. */
    mounted: boolean;
    /** The container passed to the most recent `mount()` call, or `null` when not mounted. */
    mountedContainer: HTMLElement | null;
    /** The UI root (`ShadowRoot`/`HTMLElement`) captured from the last `mount()` context, used by `injectStyles()`. */
    private _mountRoot: ShadowRoot | HTMLElement | null;

    // Performance tracking - basic
    performanceMetrics: { initTime: number; activateTime: number; cleanupTime: number };

    // Prevent duplicate operations
    _initialized: boolean;
    _activationCount: number;
    _eventHandlersSetup: boolean;

    constructor(config: ModuleConfig = {} as ModuleConfig) {
        // Core properties
        this.name = config.name;
        this.version = config.version || '1.0.0';
        this.description = config.description || '';

        // Pattern matching - simplified
        this.patterns = Array.isArray(config.patterns) ? config.patterns : [config.patterns].filter(Boolean);
        this.matchMode = resolveMatchMode(config.matchMode, config.name);

        // State management
        this.isActive = false;

        // Event system - simplified
        this.eventListeners = new Map();
        this.eventBus = config.eventBus;

        // CSS injection
        this.injectedStyles = new Set();
        this.styleElement = null;

        // Mount state
        this.mounted = false;
        this.mountedContainer = null;
        this._mountRoot = null;

        // Performance tracking - basic
        this.performanceMetrics = {
            initTime: 0,
            activateTime: 0,
            cleanupTime: 0
        };

        // Prevent duplicate operations
        this._initialized = false;
        this._activationCount = 0;
        this._eventHandlersSetup = false;

        // Validate required config
        if (!this.name) {
            throw new Error('Module name is required');
        }
        if (!this.patterns || this.patterns.length === 0) {
            throw new Error('Module patterns are required');
        }
    }

    /**
     * Check if this module should be active for the given URL.
     *
     * String patterns match by substring (`url.includes(pattern)`), with two
     * exceptions: `'*'` alone is a wildcard matching any non-empty URL, and
     * a string containing `*` elsewhere is treated as a simple glob where
     * `*` matches any run of characters - still unanchored, consistent with
     * the substring semantics (e.g. `'localhost:*' + '/admin'` matches
     * `'http://localhost:3000/admin'`). Every other regex-special character
     * in a glob pattern is escaped and matched literally. A string with no
     * `*` at all matches by plain substring.
     *
     * With `matchMode: 'host'`, plain string patterns instead match the
     * parsed URL host (see `matchesHostPattern()` in `./hostMatching.ts`):
     * the pattern host or any subdomain of it, case-insensitive, with an
     * optional `scheme://`, `:port` and `/path-prefix`. `'*'` alone still
     * matches any non-empty URL; other `*` globs are not supported in host
     * mode and never match.
     *
     * Object patterns (`{ type: 'includes' | 'exact' | 'regex', value }`)
     * are unaffected by `matchMode` and by any of the above.
     * @param url - URL to check
     * @returns Whether module matches
     */
    checkPattern(url: string): boolean {
        if (!url || !this.patterns) return false;

        return this.patterns.some(pattern => {
            if (typeof pattern === 'string') {
                if (pattern === '*') {
                    return true;
                }
                if (this.matchMode === 'host') {
                    return matchesHostPattern(pattern, url);
                }
                warnSubstringHostPattern(this.name, pattern);
                if (pattern.includes('*')) {
                    return globPatternToRegExp(pattern).test(url);
                }
                return url.includes(pattern);
            }

            if (pattern && typeof pattern === 'object') {
                const { type, value } = pattern;

                switch (type) {
                case 'includes':
                    return url.includes(value);
                case 'exact':
                    return url === value;
                case 'regex':
                    return new RegExp(value).test(url);
                default:
                    return url.includes(value);
                }
            }

            return false;
        });
    }

    /**
     * Module initialization - called once when module is first loaded
     * Override this method in your module
     */
    async init(): Promise<void> {
        // Prevent double initialization
        if (this._initialized) {
            console.warn(`Module ${this.name} already initialized, skipping`);
            return;
        }

        const startTime = performance.now();

        try {
            this._initialized = true;
            await this.initModule();
            this.performanceMetrics.initTime = performance.now() - startTime;
            this.emit('module:initialized', { module: this.name });
        } catch (error) {
            console.error(`Module ${this.name} initialization failed:`, error);
            this._initialized = false; // Reset on failure
            this.emit('module:initFailed', { module: this.name, error: (error as Error).message });
            throw error;
        }
    }

    /**
     * Module activation - called when URL matches patterns
     * Override this method in your module
     */
    async activate(context: ModuleActivationContext = {}): Promise<void> {
        // Track and warn about multiple activations
        this._activationCount++;

        if (this._activationCount > 1) {
            console.warn(`Module ${this.name} activated multiple times (count: ${this._activationCount})`);
            // Don't skip - let it continue but log the issue
        }

        const startTime = performance.now();

        try {
            this.isActive = true;

            // Setup event handlers only once
            if (!this._eventHandlersSetup) {
                this._setupInternalEventHandlers();
                this._eventHandlersSetup = true;
            }

            await this.activateModule(context);
            this.performanceMetrics.activateTime = performance.now() - startTime;
            this.emit('module:activated', { module: this.name, context });
        } catch (error) {
            console.error(`Module ${this.name} activation failed:`, error);
            this.emit('module:activationFailed', { module: this.name, error: (error as Error).message });
            throw error;
        }
    }

    /**
     * Module cleanup - called when module is deactivated or destroyed
     * Override this method in your module
     */
    async cleanup(context: ModuleActivationContext = {}): Promise<void> {
        const startTime = performance.now();

        try {
            this.isActive = false;

            // Unmount before running cleanupModule() so subclasses can rely on the
            // container already having been torn down. Guarded by `mounted` so a
            // module unmounted earlier (e.g. by the core when switching the active
            // module) is never unmounted twice.
            if (this.mounted && this.mountedContainer) {
                try {
                    await this.unmount(this.mountedContainer);
                } catch (error) {
                    this.error('Error unmounting module content during cleanup:', error);
                }
                this._afterUnmount();
            }

            await this.cleanupModule(context);
            this.removeAllStyles();
            this.removeAllEventListeners();

            // Reset activation count on cleanup
            this._activationCount = 0;
            this._eventHandlersSetup = false;

            this.performanceMetrics.cleanupTime = performance.now() - startTime;
            this.emit('module:cleaned', { module: this.name, context });
        } catch (error) {
            console.error(`Module ${this.name} cleanup failed:`, error);
            this.emit('module:cleanupFailed', { module: this.name, error: (error as Error).message });
        }
    }

    // Template methods for module developers to override
    //
    // Not declared `async`: `init()`/`activate()`/`cleanup()` above always
    // `await` these, which works identically whether an override returns a
    // plain value or a Promise, so the return type matches what
    // `AgentletModule` in src/types/public-api.d.ts declares subclasses
    // may implement (sync `void` or `Promise<void>`) rather than forcing
    // `Promise<void>`. `async function(): Promise<void>` and a plain
    // function implicitly returning `undefined` are both valid `void`
    // implementations of this base (no-op) stub either way.
    initModule(): Promise<void> | void {
        // Override in your module
    }

    activateModule(_context: ModuleActivationContext = {}): Promise<void> | void {
        // Override in your module
    }

    cleanupModule(_context: ModuleActivationContext = {}): Promise<void> | void {
        // Override in your module
    }

    /**
     * Called by the core immediately before invoking `mount()`, including when a
     * subclass fully replaces `mount()`'s body, so mount state and the UI root
     * used by `injectStyles()` are tracked regardless of what the override does.
     * Not meant to be called by module authors.
     * @private
     */
    _beforeMount(container: HTMLElement, context: ModuleMountContext): void {
        this.mounted = true;
        this.mountedContainer = container;
        this._mountRoot = context?.root ?? null;
        this._applyDeclaredStyles();
    }

    /**
     * Injects the CSS returned by an optional `getStyles()` into the UI root,
     * once per activation: `cleanup()` clears `injectedStyles` through
     * `removeAllStyles()`, so the next mount after a re-activation injects
     * it again, while re-mounts in between (URL change, refresh) do not
     * append a second copy.
     * @private
     */
    private _applyDeclaredStyles(): void {
        if (typeof this.getStyles !== 'function') {
            return;
        }
        try {
            const css = this.getStyles();
            if (css && !this.injectedStyles.has(css)) {
                this.injectStyles(css);
            }
        } catch (error) {
            this.error('getStyles() failed:', error);
        }
    }

    /**
     * Called by the core immediately after `unmount()` settles (resolves or
     * throws) to clear mount state. Not meant to be called by module authors.
     * @private
     */
    _afterUnmount(): void {
        this.mounted = false;
        this.mountedContainer = null;
        this._mountRoot = null;
    }

    /**
     * Render this module's content into `container`. Called by the core when
     * this module becomes the active module (on init, module switch, URL
     * change, or a manual refresh - see `context.trigger`).
     *
     * Override this method for imperative DOM mounting (e.g. mounting a React
     * or Lit root). `this.mounted`/`this.mountedContainer` are kept up to
     * date by the core regardless of whether this method is overridden (the
     * core calls the internal `_beforeMount()`/`_afterUnmount()` steps around
     * `mount()`/`unmount()`), so an override can rely on `this.mounted` to
     * decide whether to update an already-mounted root in place instead of
     * re-rendering. The default implementation renders `getContent()`, so
     * modules that only define `getContent()` need no `mount()`.
     */
    async mount(container: HTMLElement, context: ModuleMountContext): Promise<void> {
        this._beforeMount(container, context);
        container.innerHTML = this.getContent();
    }

    /**
     * Tear down what `mount()` set up (e.g. unmount a framework root added by
     * an override). Called by the core before a different module mounts, and
     * by `cleanup()` if this module is still mounted.
     *
     * The core clears the container's content itself after this resolves, so
     * the default implementation is a no-op.
     */
    async unmount(_container: HTMLElement): Promise<void> {
        // Override in your module
    }

    /**
     * Get module content for display in agentlet panel
     * Override this method in your module
     */
    getContent(): string {
        return `
            <div class="agentlet-module-content">
                <h3>${escapeHtml(String(this.name))}</h3>
                <p>${this.description || `Active for: ${escapeHtml(window.location.href)}`}</p>
            </div>
        `;
    }

    /**
     * Get module metadata
     */
    getMetadata(): ModuleMetadata {
        return {
            name: this.name,
            version: this.version,
            description: this.description,
            patterns: this.patterns,
            isActive: this.isActive,
            performanceMetrics: this.performanceMetrics
        };
    }

    // Event system - simplified
    on(event: string, callback: ModuleEventListener): void {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event)!.push(callback);
    }

    off(event: string, callback: ModuleEventListener): void {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event)!;
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit(event: string, data?: unknown): void {
        // Emit to local listeners
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event)!.forEach(callback => {
                try {
                    callback(data);
                } catch (error) {
                    console.error(`Event listener error for ${event}:`, error);
                }
            });
        }

        // Emit to global event bus if available
        if (this.eventBus && typeof this.eventBus.emit === 'function') {
            this.eventBus.emit(event, data);
        }
    }

    removeAllEventListeners(): void {
        this.eventListeners.clear();
    }

    // CSS management - simplified
    injectStyles(css: string): void {
        if (!css) return;

        if (!this.styleElement) {
            this.styleElement = document.createElement('style');
            this.styleElement.type = 'text/css';
            this.styleElement.setAttribute('data-module', this.name);
            this._resolveStyleRoot().appendChild(this.styleElement);
        }

        this.styleElement.textContent += css;
        this.injectedStyles.add(css);
    }

    /**
     * Resolves where `injectStyles()` appends its `<style>` element: the root
     * captured from the most recent `mount()` call when it is a real UI root
     * (a `ShadowRoot`, or any `HTMLElement` other than `document.body`),
     * else `window.agentlet.ui.root` under the same rule, else
     * `document.head`. `document.body` (the UI root in `shadowDom: false`
     * mode) is treated the same as "no root known" so styles keep landing in
     * the historical `<head>` spot rather than the end of `<body>`.
     * @private
     */
    private _resolveStyleRoot(): ShadowRoot | HTMLElement {
        const candidates: Array<ShadowRoot | HTMLElement | null> = [
            this._mountRoot,
            window.agentlet?.ui?.root ?? null
        ];

        for (const candidate of candidates) {
            if (candidate && candidate !== document.body) {
                return candidate;
            }
        }

        return document.head;
    }

    removeAllStyles(): void {
        if (this.styleElement) {
            if (this.styleElement.remove) {
                this.styleElement.remove();
            } else if (this.styleElement.parentNode) {
                this.styleElement.parentNode.removeChild(this.styleElement);
            }
            this.styleElement = null;
        }
        this.injectedStyles.clear();
    }

    // Utility methods
    //
    // Unlike the informational console.log calls that go through logger.log()
    // elsewhere in this codebase (see src/utils/system/Logger.ts), log()
    // here calls console.log directly, same as error()/warn()
    // right below it: this is a public convenience API for AGENTLET
    // AUTHORS to log their own module's messages (this.log(...) inside
    // their own module code), not internal framework chatter - gating it
    // behind the host AgentletCore's debugMode would silence a module
    // author's own, deliberate console.log() calls based on a setting they
    // don't control.
    log(message: unknown, ...args: unknown[]): void {
        console.log(`[${this.name}]`, message, ...args);
    }

    error(message: unknown, ...args: unknown[]): void {
        console.error(`[${this.name}]`, message, ...args);
    }

    warn(message: unknown, ...args: unknown[]): void {
        console.warn(`[${this.name}]`, message, ...args);
    }

    /**
     * Internal event handler setup (called only once)
     * @private
     */
    _setupInternalEventHandlers(): void {
        // This method is called only once to set up any internal event handlers
        // Subclasses can override this if they need one-time event setup
        // Base implementation does nothing - override in subclasses as needed
    }
}

/**
 * Declaration merging (not a class-field re-declaration): adds the
 * duck-typed hooks the core checks for with `typeof x === 'function'`
 * (see src/index.js) plus `isInitialized` (set externally by
 * ModuleRegistry) to Module's *type* only.
 *
 * These are intentionally NOT declared as class fields: a declared field
 * would either be stripped or, depending on the transpiler and its class
 * field semantics, be initialised to `undefined` as an own property, which
 * would shadow a subclass prototype method of the same name. An interface
 * merge is erased at compile time by tsc, esbuild and babel alike, so it
 * adds the types with zero runtime footprint.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- intentional, see the comment above; only optional members are added, no fields or state.
interface Module {
    getPanelTitle?(): string;
    showSettings?(): void;
    showHelp?(): void;
    setSubmoduleChangeCallback?(callback: () => void): void;
    requiresLocalStorageChangeNotification?: boolean;
    onLocalStorageChange?(key: string | null, newValue: string | null): void;
    getStyles?(): string;
    /** Set by `ModuleRegistry` after the first successful `init()`; not initialized in the constructor. */
    isInitialized?: boolean;
}

export default Module;
