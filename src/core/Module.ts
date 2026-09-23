/**
 * Simplified Module class for Agentlet Core
 * Provides clean, focused module development experience
 */
import type {
    ModuleConfig,
    ModuleActivationContext,
    ModuleMetadata,
    ModulePatternMatcher,
    EventBusAPI
} from '../types/public-api';

/** A single local event-listener callback, matching `AgentletModule.on`/`off`. */
type ModuleEventListener = (data: unknown) => void;

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- see the `interface Module` block below the class for why this merge is safe.
class Module {
    // Core properties
    name: string;
    version: string;
    description: string;

    // Pattern matching - simplified
    patterns: ModulePatternMatcher[];

    // State management
    isActive: boolean;

    // Event system - simplified
    eventListeners: Map<string, ModuleEventListener[]>;
    eventBus?: EventBusAPI;

    // CSS injection
    injectedStyles: Set<string>;
    styleElement: HTMLStyleElement | null;

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

        // State management
        this.isActive = false;

        // Event system - simplified
        this.eventListeners = new Map();
        this.eventBus = config.eventBus;

        // CSS injection
        this.injectedStyles = new Set();
        this.styleElement = null;

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
     * Check if this module should be active for the given URL
     * @param url - URL to check
     * @returns Whether module matches
     */
    checkPattern(url: string): boolean {
        if (!url || !this.patterns) return false;

        return this.patterns.some(pattern => {
            if (typeof pattern === 'string') {
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
     * Get module content for display in agentlet panel
     * Override this method in your module
     */
    getContent(): string {
        return `
            <div class="agentlet-module-content">
                <h3>${this.name}</h3>
                <p>${this.description || `Active for: ${  window.location.href}`}</p>
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
            document.head.appendChild(this.styleElement);
        }

        this.styleElement.textContent += css;
        this.injectedStyles.add(css);
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
