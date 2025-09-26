/**
 * Centralized Module Manager - Single source of truth for module registration
 * Eliminates duplicate registration points
 */

export default class ModuleManager {
    constructor(moduleRegistry) {
        this.moduleRegistry = moduleRegistry;
        this.modules = new Map();
        this.activeModule = null;
        this._isInitialized = false;

        // Track registration sources to prevent duplicates
        this._registrationSources = new Map(); // module name -> source
    }

    /**
     * Single registration point - all module registration goes through here
     * @param {Module} module - Module to register
     * @param {string} source - Registration source for debugging
     */
    register(module, source = 'unknown') {
        if (!module || !module.name) {
            throw new Error('Invalid module: name is required');
        }

        // Enhanced duplicate detection - check if exact same instance already registered
        if (this.modules.has(module.name)) {
            const existing = this.modules.get(module.name);
            if (existing === module) {
                console.warn(`ModuleManager: Module ${module.name} already registered with same instance from ${this._registrationSources.get(module.name)}, ignoring registration from ${source}`);
                return; // Don't re-register the exact same instance
            }
            console.warn(`ModuleManager: Module ${module.name} already registered with different instance, replacing...`);
        }

        // Track registration source
        const existingSource = this._registrationSources.get(module.name);
        if (existingSource && existingSource !== source) {
            console.warn(`Module ${module.name} already registered from ${existingSource}, now registering from ${source}`);
        }

        this._registrationSources.set(module.name, source);

        // Delegate to ModuleRegistry (which now has guards)
        this.moduleRegistry.register(module);

        // Keep local reference
        this.modules.set(module.name, module);

        console.log(`📦 ModuleManager: ${module.name} registered from ${source}`);
    }

    /**
     * Unregister a module
     * @param {string} moduleName - Name of module to unregister
     */
    async unregister(moduleName) {
        this.modules.delete(moduleName);
        this._registrationSources.delete(moduleName);
        return await this.moduleRegistry.unregister(moduleName);
    }

    /**
     * Get a registered module
     * @param {string} moduleName - Name of module to get
     */
    get(moduleName) {
        return this.modules.get(moduleName);
    }

    /**
     * Get all registered module names
     */
    getAll() {
        return Array.from(this.modules.keys());
    }

    /**
     * Activate a module through the registry
     * @param {Module} module - Module to activate
     * @param {Object} context - Activation context
     */
    async activate(module, context = {}) {
        return await this.moduleRegistry.activateModule(module, context);
    }

    /**
     * Get statistics including registration sources
     */
    getStatistics() {
        const stats = this.moduleRegistry.getStatistics();

        // Add source tracking info
        stats.registrationSources = {};
        for (const [moduleName, source] of this._registrationSources.entries()) {
            stats.registrationSources[moduleName] = source;
        }

        return stats;
    }

    /**
     * Initialize the module manager
     */
    initialize() {
        if (this._isInitialized) {
            console.warn('ModuleManager already initialized');
            return;
        }

        this._isInitialized = true;
        console.log('📦 ModuleManager initialized');
    }
}