/**
 * Enhanced Module Loader for Agentlet Core
 * Provides dynamic module loading, plugin management, and dependency resolution
 */

import ScriptInjector from '../utils/ScriptInjector.js';

export default class ModuleLoader {
    constructor(config = {}) {
        this.modules = new Map();
        this.activeModule = null;
        this.lastUrl = window.location.href;
        this.onModuleChange = null;
        
        // Plugin system configuration
        this.moduleRegistry = config.moduleRegistry || [];
        this.registryUrl = config.registryUrl;
        
        this.loadedModules = new Set();
        
        // Event system
        this.eventBus = config.eventBus || this.createEventBus();
        
        // Performance tracking
        this.loadingMetrics = {
            totalModulesLoaded: 0,
            averageLoadTime: 0,
            failedLoads: 0
        };
    }

    /**
     * Create a simple event bus if none provided
     */
    createEventBus() {
        const listeners = new Map();
        
        return {
            emit: (event, data) => {
                const eventListeners = listeners.get(event) || [];
                eventListeners.forEach(callback => {
                    try {
                        callback(data);
                    } catch (error) {
                        console.error(`Error in event listener for ${event}:`, error);
                    }
                });
            },
            
            on: (event, callback) => {
                if (!listeners.has(event)) {
                    listeners.set(event, []);
                }
                listeners.get(event).push(callback);
            },
            
            // eslint-disable-next-line require-await
            request: async (event, data) => {
                return new Promise((resolve, reject) => {
                    const eventListeners = listeners.get(event) || [];
                    if (eventListeners.length === 0) {
                        reject(new Error(`No listeners for event: ${event}`));
                        return;
                    }
                    
                    // Use the first listener for request/response pattern
                    try {
                        const result = eventListeners[0](data);
                        if (result instanceof Promise) {
                            result.then(resolve).catch(reject);
                        } else {
                            resolve(result);
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        };
    }

    /**
     * Register a module (local or remote)
     */
    async registerModule(module, source = 'local') {
        const startTime = performance.now();
        
        try {
            // Validate module
            if (!this.validateModule(module)) {
                return false;
            }
            
            // Register the module
            this.modules.set(module.name, module);
            this.loadedModules.add(module.name);
            
            // Set up event bus connection
            if (module.eventBus !== this.eventBus) {
                module.eventBus = this.eventBus;
            }
            
            // Update loading metrics
            const loadTime = performance.now() - startTime;
            this.updateLoadingMetrics(loadTime, true);
            
            this.eventBus.emit('module:registered', {
                module: module.name,
                source,
                loadTime,
                metadata: module.getMetadata()
            });
            
            console.log(`Registered module: ${module.name} from ${source} in ${loadTime.toFixed(2)}ms`);
            
            // Automatically check if this newly registered module should be activated
            await this.checkAndActivateNewModule(module);
            
        } catch (error) {
            this.updateLoadingMetrics(0, false);
            this.eventBus.emit('module:registrationFailed', {
                module: module.name || 'unknown',
                source,
                error: error.message
            });
            throw error;
        }
    }

    /**
     * Check if newly registered module should be activated for current URL
     */
    async checkAndActivateNewModule(module) {
        try {
            const currentUrl = window.location.href;
            
            // Check if this module matches the current URL
            if (typeof module.checkPattern === 'function' && module.checkPattern(currentUrl)) {
                console.log(`🎯 Newly registered module ${module?.name || 'unknown'} matches current URL: ${currentUrl}`);
                
                // Clean up current module if different
                if (this.activeModule && this.activeModule !== module && typeof this.activeModule.cleanup === 'function') {
                    console.log(`🧹 Cleaning up previous active module: ${this.activeModule?.name || 'unknown'}`);
                    await this.activeModule.cleanup();
                    if (this.activeModule) {
                        this.eventBus.emit('module:deactivated', {
                            module: this.activeModule.name
                        });
                    }
                }
                
                // Activate the new module
                this.activeModule = module;
                console.log('Activating module:', this.activeModule);
                
                // Initialize module using its lifecycle system
                await module.init();

                if (module) {
                    this.eventBus.emit('module:activated', {
                        module: module.name
                    });
                }
                
                // Notify about module change
                if (this.onModuleChange) {
                    this.onModuleChange(module);
                }
                
                console.log(`✅ Automatically activated module: ${module?.name || 'unknown'}`);
            } else {
                console.log(`ℹ️ Module ${module?.name || 'unknown'} does not match current URL: ${currentUrl}`);
            }
        } catch (error) {
            console.error(`Error checking/activating new module ${module?.name || 'unknown'}:`, error);
        }
    }

    /**
     * Load module from URL with comprehensive error handling and caching
     */
    async loadModuleFromUrl(moduleUrl, moduleClass, options = {}) {
        const startTime = performance.now();
        
        try {
            // Create loading promise
            const loadingPromise = this.performModuleLoad(moduleUrl, moduleClass, options);
            
            try {
                const module = await loadingPromise;
                
                // Register the module
                await this.registerModule(module, moduleUrl);
                
                const loadTime = performance.now() - startTime;
                console.log(`Successfully loaded module from ${moduleUrl} in ${loadTime.toFixed(2)}ms`);
                
                return module;
                
            } finally {
                // Cleanup if needed
            }
            
        } catch (error) {
            console.error(`Failed to load module from ${moduleUrl}:`, error);
            throw error;
        }
    }

    /**
     * Perform the actual module loading with retries and timeout
     */
    async performModuleLoad(moduleUrl, moduleClass, options = {}) {        
        const retryAttempts = options.retryAttempts || 3;
        const timeout = options.timeout || 10000;
        
        for (let attempt = 1; attempt <= retryAttempts; attempt++) {
            try {
                console.log(`Loading module ${moduleUrl} (attempt ${attempt}/${retryAttempts})`);

                // Fetch the module code first to understand its structure
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), timeout);
                
                try {
                    const response = await fetch(moduleUrl, {
                        signal: controller.signal,
                        headers: {
                            'Accept': 'application/javascript, text/javascript'
                        }
                    });
                    if (!response.ok) {
                        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
                    }
                    
                    const moduleCode = await response.text();
                    // Use ScriptInjector to inject the module
                    const scriptInjector = new ScriptInjector();
                    // Inject the module code
                    await scriptInjector.inject({
                        code: moduleCode,
                        target: 'main'
                    });
                    // Create module instance using the fetched code
                    const moduleInstance = this.createModuleInstance(moduleCode, moduleClass, moduleUrl);
                    
                    return moduleInstance;
                    
                } finally {
                    clearTimeout(timeoutId);
                }
                
            } catch (error) {
                console.warn(`Module load attempt ${attempt} failed:`, error.message);
                
                if (attempt === retryAttempts) {
                    throw new Error(`Failed to load module after ${retryAttempts} attempts: ${error.message}`);
                }
                
                // Wait before retry
                await this.delay(1000 * attempt);
            }
        }
    }

    /**
     * Get the module instance that was created by the injected IIFE
     */
    createModuleInstance(moduleCode, moduleClass, source) {
        try {
            // The IIFE has already executed and created the module instance
            // We can directly access it using the moduleClass name
            console.log(`Looking for module instance: window.${moduleClass}`);
            
            const moduleInstance = window[moduleClass];
            
            if (!moduleInstance) {
                throw new Error(`Module instance '${moduleClass}' not found in global scope after injection`);
            }
            
            // Validate it's a proper module
            if (typeof moduleInstance !== 'object' || !moduleInstance.name || 
                typeof moduleInstance.checkPattern !== 'function' ||
                typeof moduleInstance.init !== 'function') {
                throw new Error(`Module instance '${moduleClass}' is not a valid module (missing required properties)`);
            }
            
            // Update the module's source and eventBus if needed
            if (moduleInstance.source === undefined) {
                moduleInstance.source = source;
            }
            if (moduleInstance.eventBus === undefined) {
                moduleInstance.eventBus = this.eventBus;
            }
            
            console.log(`Module instance found: ${moduleClass}`, moduleInstance);
            return moduleInstance;
            
        } catch (error) {
            throw new Error(`Failed to get module instance '${moduleClass}': ${error.message}`);
        }
    }

    /**
     * Get BaseModule class
     */
    getBaseModule() {
        // Try to get BaseModule from global scope or import
        if (typeof window !== 'undefined' && window.agentlet && window.agentlet.BaseModule) {
            return window.agentlet.BaseModule;
        }
        
        // Fallback mock for basic functionality (simplified lifecycle)
        return class BaseModule {
            constructor(config = {}) {
                this.name = config.name || 'UnknownModule';
                this.version = config.version || '1.0.0';
                this.patterns = config.patterns || [];
                this.eventBus = config.eventBus;
                this.isActive = false;
                this.performanceMetrics = {};
                
                // Simplified lifecycle hooks
                this.hooks = {
                    init: config.init || this.initModule.bind(this),
                    activate: config.activate || this.activateModule.bind(this),
                    cleanup: config.cleanup || this.cleanupModule.bind(this)
                };
            }
            
            // eslint-disable-next-line require-await
            async initModule() {
                console.log(`Mock module ${this.name} initialized`);
            }
            
            // eslint-disable-next-line require-await
            async activateModule(context = {}) {
                console.log(`Mock module ${this.name} activated`, context);
            }
            
            // eslint-disable-next-line require-await
            async cleanupModule(context = {}) {
                console.log(`Mock module ${this.name} cleaned up`, context);
            }
            
            checkPattern(url) { 
                return this.patterns.some(pattern => url.includes(pattern));
            }
            // eslint-disable-next-line require-await
            async init() {
                this.isActive = true;
                console.log(`Mock BaseModule ${this.name} initialized`);
            }
            // eslint-disable-next-line require-await
            async cleanup() {
                this.isActive = false;
                console.log(`Mock BaseModule ${this.name} cleaned up`);
            }
            getMetadata() { 
                return { 
                    name: this.name, 
                    version: this.version,
                    isActive: this.isActive,
                    patterns: this.patterns
                }; 
            }
            getContent() {
                return `<div>Basic module content for ${this.name}</div>`;
            }
            // eslint-disable-next-line require-await
            async updatedURL(url) {
                console.log(`${this.name} module: URL updated to ${url}`);
            }
        };
    }

    /**
     * Get BaseSubmodule class
     */
    getBaseSubmodule() {
        return class BaseSubmodule {
            constructor(config) {
                this.name = config.name || 'UnknownSubmodule';
                this.version = config.version || '1.0.0';
                this.patterns = config.patterns || [];
            }
            
            checkPattern() { return false; }
            async init() {}
            async cleanup() {}
        };
    }

    /**
     * Validate module instance
     */
    validateModule(module) {
        if (!module || typeof module !== 'object') {
            throw new Error('Module must be an object');
        }
        
        if (!module.name || typeof module.name !== 'string') {
            throw new Error('Module must have a name property');
        }
        
        if (this.modules.has(module.name)) {
            console.error(`Module ${module.name} is already registered`);
            return false;
        }
        
        if (typeof module.checkPattern !== 'function') {
            throw new Error('Module must have a checkPattern method');
        }
        
        if (typeof module.init !== 'function') {
            throw new Error('Module must have an init method');
        }

        return true;
    }

    

    

    

    /**
     * Update loading metrics
     */
    updateLoadingMetrics(loadTime, success) {
        if (success) {
            this.loadingMetrics.totalModulesLoaded++;
            this.loadingMetrics.averageLoadTime = 
                (this.loadingMetrics.averageLoadTime + loadTime) / 2;
        } else {
            this.loadingMetrics.failedLoads++;
        }
    }

    /**
     * Set module change callback
     */
    setModuleChangeCallback(callback) {
        this.onModuleChange = callback;
    }

    /**
     * Enhanced application detection with caching
     */
    // eslint-disable-next-line require-await
    async detectApplication() {
        const currentUrl = window.location.href;
        
        for (const [name, module] of this.modules) {
            try {
                if (typeof module.checkPattern === 'function' && module.checkPattern(currentUrl)) {
                    console.log(`Detected application: ${name} for URL: ${currentUrl}`);
                    
                    this.eventBus.emit('application:detected', {
                        module: name,
                        url: currentUrl
                    });
                    
                    return module;
                }
            } catch (error) {
                console.error(`Error checking pattern for module ${name}:`, error);
            }
        }
        
        console.log('No specific application detected for URL:', currentUrl);
        this.eventBus.emit('application:notDetected', { url: currentUrl });
        return null;
    }

    /**
     * Enhanced initialization
     */
    async initialize() {
        console.log('Initializing ModuleLoader...');
        
        try {
            // Load registry from URL
            if (this.registryUrl) {
                await this.loadRegistryFromUrl();
            }

            // Load modules from registry
            await this.loadRegistryModules();
            
            // Detect current application
            this.activeModule = await this.detectApplication();
            
            if (this.activeModule) {
                // Initialize module using its lifecycle system
                await this.activeModule.init();
                if (this.activeModule) {
                    this.eventBus.emit('module:activated', {
                        module: this.activeModule.name
                    });
                }
            } else {
                console.log('No specific module initialized');
            }

            // Notify about module change
            if (this.onModuleChange) {
                this.onModuleChange(this.activeModule);
            }

            // Set up URL change detection
            this.setupUrlChangeDetection();
            
            console.log('ModuleLoader initialization completed');
            
        } catch (error) {
            console.error('Failed to initialize ModuleLoader:', error);
            this.eventBus.emit('moduleLoader:initializationFailed', { error: error.message });
        }
    }

    /**
     * Load registry from URL
    /**
     * Load registry from URL
     */
    async loadRegistryFromUrl() {
        const response = await fetch(this.registryUrl);
        const registry = await response.json();
        this.moduleRegistry = registry;
    }

    /**
     * Load modules from registry
     */
    async loadRegistryModules() {
        if (!this.moduleRegistry || this.moduleRegistry.length === 0) {
            return;
        }
        
        console.log(`Loading ${this.moduleRegistry.length} modules from registry...`);
        
        const loadPromises = this.moduleRegistry.map(async (moduleInfo) => {
            try {
                await this.loadModuleFromUrl(moduleInfo.url, moduleInfo.module, moduleInfo.options);
                return { success: true, module: moduleInfo.name };
            } catch (error) {
                console.error(`Failed to load registry module ${moduleInfo.name}:`, error);
                return { success: false, module: moduleInfo.name, error: error.message };
            }
        });
        
        const results = await Promise.allSettled(loadPromises);
        const successful = results.filter(r => r.status === 'fulfilled' && r.value.success).length;
        
        console.log(`Loaded ${successful}/${this.moduleRegistry.length} registry modules`);
    }

    /**
     * Enhanced URL change detection
     */
    setupUrlChangeDetection() {
        const handleUrlChange = this.handleUrlChange.bind(this);
        let lastUrl = location.href;
    
        // 1. popstate (back/forward navigation)
        window.addEventListener('popstate', () => {
            handleUrlChange();
        });
    
        // 2. pushState
        const originalPushState = history.pushState;
        history.pushState = (...args) => {
            const result = originalPushState.apply(history, args);
            handleUrlChange();
            return result;
        };
    
        // 3. replaceState
        const originalReplaceState = history.replaceState;
        history.replaceState = (...args) => {
            const result = originalReplaceState.apply(history, args);
            handleUrlChange();
            return result;
        };
    
        // 4. MutationObserver (fallback for cases that hooks don't catch)
        const observer = new MutationObserver(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                handleUrlChange();
            }
        });
    
        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
        
        console.log('URL change detection set up');
    }

    /**
     * Enhanced URL change handling
     */
    async handleUrlChange() {
        const currentUrl = window.location.href;
        
        // Only handle if URL actually changed
        if (currentUrl === this.lastUrl) {
            return;
        }

        console.log(`URL changed from ${this.lastUrl} to ${currentUrl}`);
        const oldUrl = this.lastUrl;
        this.lastUrl = currentUrl;

        this.eventBus.emit('url:changed', { oldUrl, newUrl: currentUrl });

        try {
            // Clean up current module if it exists
            if (this.activeModule && typeof this.activeModule.cleanup === 'function') {
                await this.activeModule.cleanup();
                if (this.activeModule) {
                    this.eventBus.emit('module:deactivated', {
                        module: this.activeModule.name
                    });
                }
            }

            // Detect new application
            const newModule = await this.detectApplication();
            
            if (newModule !== this.activeModule) {
                // Update active module
                this.activeModule = newModule;
                
                if (this.activeModule) {
                    // Initialize module using its lifecycle system
                    await this.activeModule.init();
                    if (this.activeModule) {
                        this.eventBus.emit('module:activated', {
                            module: this.activeModule.name
                        });
                    }
                }

                // Notify about module change
                if (this.onModuleChange) {
                    this.onModuleChange(this.activeModule);
                }
            }

            // Call updatedURL on all modules that support it
            for (const [name, module] of this.modules) {
                if (typeof module.updatedURL === 'function') {
                    try {
                        await module.updatedURL(currentUrl);
                    } catch (error) {
                        console.error(`Error updating URL for module ${name}:`, error);
                    }
                }
            }
            
        } catch (error) {
            console.error('Error handling URL change:', error);
            this.eventBus.emit('url:changeHandlingFailed', {
                oldUrl,
                newUrl: currentUrl,
                error: error.message
            });
        }
    }

    /**
     * Get all loaded modules
     */
    getLoadedModules() {
        return Array.from(this.modules.values()).map(module => module.getMetadata());
    }

    /**
     * Get loading metrics
     */
    getLoadingMetrics() {
        return { ...this.loadingMetrics };
    }

    

    /**
     * Unload module
     */
    async unloadModule(moduleName) {
        const module = this.modules.get(moduleName);
        if (!module) {
            throw new Error(`Module ${moduleName} not found`);
        }
        
        try {
            // Cleanup if active
            if (this.activeModule === module) {
                await module.cleanup();
                this.activeModule = null;
            }
            
            // Remove from registry
            this.modules.delete(moduleName);
            this.loadedModules.delete(moduleName);
            
            // Clear from cache
            for (const [key, cachedModule] of this.moduleCache.entries()) {
                if (cachedModule === module) {
                    this.moduleCache.delete(key);
                }
            }
            
            this.eventBus.emit('module:unloaded', { module: moduleName });
            console.log(`Module ${moduleName} unloaded`);
            
        } catch (error) {
            console.error(`Error unloading module ${moduleName}:`, error);
            throw error;
        }
    }

    /**
     * Utility: delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Get module loader statistics
     */
    getStatistics() {
        return {
            totalModules: this.modules.size,
            activeModule: this.activeModule?.name || null,
            loadingMetrics: this.getLoadingMetrics(),
            registrySize: this.moduleRegistry.length,
        };
    }
}