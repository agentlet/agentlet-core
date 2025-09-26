/**
 * Simplified Module class for Agentlet Core
 * Provides clean, focused module development experience
 */
export default class Module {
    constructor(config = {}) {
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
     * @param {string} url - URL to check
     * @returns {boolean} - Whether module matches
     */
    checkPattern(url) {
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
    async init() {
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
            this.emit('module:initFailed', { module: this.name, error: error.message });
            throw error;
        }
    }

    /**
     * Module activation - called when URL matches patterns
     * Override this method in your module
     */
    async activate(context = {}) {
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
            this.emit('module:activationFailed', { module: this.name, error: error.message });
            throw error;
        }
    }

    /**
     * Module cleanup - called when module is deactivated or destroyed
     * Override this method in your module
     */
    async cleanup(context = {}) {
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
            this.emit('module:cleanupFailed', { module: this.name, error: error.message });
        }
    }

    // Template methods for module developers to override
    async initModule() {
        // Override in your module
    }

    async activateModule(_context = {}) {
        // Override in your module
    }

    async cleanupModule(_context = {}) {
        // Override in your module
    }

    /**
     * Get module content for display in agentlet panel
     * Override this method in your module
     */
    getContent() {
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
    getMetadata() {
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
    on(event, callback) {
        if (!this.eventListeners.has(event)) {
            this.eventListeners.set(event, []);
        }
        this.eventListeners.get(event).push(callback);
    }

    off(event, callback) {
        if (this.eventListeners.has(event)) {
            const listeners = this.eventListeners.get(event);
            const index = listeners.indexOf(callback);
            if (index > -1) {
                listeners.splice(index, 1);
            }
        }
    }

    emit(event, data) {
        // Emit to local listeners
        if (this.eventListeners.has(event)) {
            this.eventListeners.get(event).forEach(callback => {
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

    removeAllEventListeners() {
        this.eventListeners.clear();
    }

    // CSS management - simplified
    injectStyles(css) {
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

    removeAllStyles() {
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
    log(message, ...args) {
        console.log(`[${this.name}]`, message, ...args);
    }

    error(message, ...args) {
        console.error(`[${this.name}]`, message, ...args);
    }

    warn(message, ...args) {
        console.warn(`[${this.name}]`, message, ...args);
    }

    /**
     * Internal event handler setup (called only once)
     * @private
     */
    _setupInternalEventHandlers() {
        // This method is called only once to set up any internal event handlers
        // Subclasses can override this if they need one-time event setup
        // Base implementation does nothing - override in subclasses as needed
    }
}