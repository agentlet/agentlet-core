/**
 * Simplified Module Registry for Agentlet Core
 * Manages module registration, activation, and lifecycle
 */

export default class ModuleRegistry {
    constructor(config = {}) {
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
     * @param {Module} module - Module instance to register
     */
    register(module) {
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
     * @param {string} moduleName - Name of module to unregister
     */
    async unregister(moduleName) {
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
     * @param {string} url - URL to check (defaults to current URL)
     * @returns {Module|null} - Matching module or null
     */
    findMatchingModule(url = window.location.href) {
        for (const module of this.modules.values()) {
            if (module.checkPattern && module.checkPattern(url)) {
                return module;
            }
        }
        return null;
    }

    /**
     * Activate a specific module
     * @param {Module} module - Module to activate
     * @param {Object} context - Activation context
     */
    async activateModule(module, context = {}) {
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
                await this.deactivateModule();
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
                this.onModuleChange(module);
            }

        } catch (error) {
            this.metrics.failedActivations++;
            console.error(`❌ Module activation failed: ${module.name}`, error);
            this.emit('module:activationFailed', { module: module.name, error: error.message });
        } finally {
            this._activationInProgress.delete(activationKey);
        }
    }

    /**
     * Deactivate current module
     */
    async deactivateModule() {
        if (!this.activeModule) return;

        const module = this.activeModule;
        try {
            await module.cleanup();
            console.log(`⏸️ Module deactivated: ${module.name}`);
            this.emit('module:deactivated', { module: module.name });
        } catch (error) {
            console.error(`❌ Module deactivation failed: ${module.name}`, error);
        }

        this.activeModule = null;

        // Notify callback
        if (this.onModuleChange) {
            this.onModuleChange(null);
        }
    }

    /**
     * Check for URL changes and activate appropriate module
     */
    checkUrlChange() {
        const currentUrl = window.location.href;
        const urlChanged = currentUrl !== this.lastUrl;
        
        const matchingModule = this.findMatchingModule(currentUrl);
        
        if (matchingModule !== this.activeModule) {
            const context = {
                trigger: urlChanged ? 'urlChange' : 'moduleRegistration',
                oldUrl: this.lastUrl,
                newUrl: currentUrl
            };
            
            if (matchingModule) {
                this.activateModule(matchingModule, context);
                this.emit('application:detected', { module: matchingModule.name, url: currentUrl });
            } else {
                this.deactivateModule();
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
    startUrlMonitoring() {
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

        history.pushState = function(...args) {
            originalPushState.apply(history, args);
            setTimeout(() => this.checkUrlChange(), 100);
        }.bind(this);

        history.replaceState = function(...args) {
            originalReplaceState.apply(history, args);
            setTimeout(() => this.checkUrlChange(), 100);
        }.bind(this);
    }

    /**
     * Set callback for module changes
     * @param {Function} callback - Callback function
     */
    setModuleChangeCallback(callback) {
        this.onModuleChange = callback;
    }

    /**
     * Load agentlets from registry URL
     * @param {string} registryUrl - URL to registry JSON file (optional, uses config default)
     */
    async loadFromRegistry(registryUrl = null) {
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
            
            const response = await fetch(url);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }
            
            const registryData = await response.json();
            
            // Handle both old format (array) and new format (object with agentlets)
            const agentlets = Array.isArray(registryData) 
                ? registryData 
                : registryData.agentlets || [];
            
            if (!Array.isArray(agentlets)) {
                throw new Error('Registry must contain an agentlets array');
            }
            
            console.log(`📦 Found ${agentlets.length} agentlet(s) in registry`);
            
            // Load each agentlet module
            for (const agentletConfig of agentlets) {
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
            this.emit('registry:loadFailed', { url, error: error.message });
        }
    }
    
    /**
     * Load a single agentlet module from configuration
     * @param {Object} agentletConfig - Agentlet configuration {name, url, module}
     */
    async loadAgentletModule(agentletConfig) {
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
            const moduleScript = await this.loadScript(url);
            
            // Get the module class from global scope
            const ModuleClass = window[moduleClass];
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
     * @param {string} url - Script URL
     * @returns {Promise<void>}
     */
    loadScript(url) {
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
    async initialize() {
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
     * Initialize the registry with pre-loaded registry data (to avoid duplicate downloads)
     */
    async initializeWithRegistry(registryData) {
        console.log('🚀 Module Registry initialized');

        // Use pre-loaded registry data instead of downloading again
        if (registryData && registryData.agentlets) {
            await this.loadAgentletsFromData(registryData.agentlets, registryData.baseUrl);
        }

        this.emit('registry:initialized', { totalModules: this.modules.size });

        // Check current URL
        this.checkUrlChange();
    }

    /**
     * Load agentlets from pre-parsed registry data (avoids duplicate downloads)
     */
    async loadAgentletsFromData(agentletsArray, baseUrl) {
        if (!Array.isArray(agentletsArray)) {
            console.warn('📦 Invalid agentlets data - must be an array');
            return;
        }

        console.log(`📦 Found ${agentletsArray.length} agentlet(s) in registry`);

        // Load each agentlet module
        for (const agentletConfig of agentletsArray) {
            try {
                await this.loadAgentletModule(agentletConfig);
            } catch (error) {
                console.error(`📦 Failed to load agentlet ${agentletConfig.name}:`, error);
                this.metrics.registryLoadFailures++;
            }
        }

        console.log(`✅ Registry loaded successfully: ${agentletsArray.length} agentlet(s)`);
        this.metrics.registriesLoaded++;
    }

    /**
     * Get all registered modules
     * @returns {Array} - Array of module names
     */
    getAll() {
        return Array.from(this.modules.keys());
    }

    /**
     * Get module by name
     * @param {string} name - Module name
     * @returns {Module|null} - Module instance or null
     */
    get(name) {
        return this.modules.get(name) || null;
    }

    /**
     * Get registry statistics
     * @returns {Object} - Statistics object
     */
    getStatistics() {
        return {
            ...this.metrics,
            activeModule: this.activeModule?.name || null,
            moduleList: this.getAll()
        };
    }

    /**
     * Emit event to event bus
     * @param {string} event - Event name
     * @param {Object} data - Event data
     */
    emit(event, data) {
        if (this.eventBus && typeof this.eventBus.emit === 'function') {
            this.eventBus.emit(event, data);
        }
    }

    /**
     * Cleanup all modules and stop monitoring
     */
    async cleanup() {
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