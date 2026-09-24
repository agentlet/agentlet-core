/**
 * Centralized Module Manager - Single source of truth for module registration
 * Eliminates duplicate registration points
 */

import type {
    AgentletModule,
    ModuleActivationContext,
    ModuleManagerAPI,
    ModuleStatistics
} from '../types/public-api';
import type ModuleRegistry from './ModuleRegistry.js';

export default class ModuleManager implements ModuleManagerAPI {
    moduleRegistry: ModuleRegistry;
    modules: Map<string, AgentletModule>;
    activeModule: AgentletModule | null;
    _isInitialized: boolean;

    // Track registration sources to prevent duplicates
    _registrationSources: Map<string, string>; // module name -> source

    constructor(moduleRegistry: ModuleRegistry) {
        this.moduleRegistry = moduleRegistry;
        this.modules = new Map();
        this.activeModule = null;
        this._isInitialized = false;

        // Track registration sources to prevent duplicates
        this._registrationSources = new Map();
    }

    /**
     * Single registration point - all module registration goes through here
     * @param module - Module to register
     * @param source - Registration source for debugging
     */
    register(module: AgentletModule, source = 'unknown'): void {
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
     * @param moduleName - Name of module to unregister
     */
    async unregister(moduleName: string): Promise<boolean> {
        this.modules.delete(moduleName);
        this._registrationSources.delete(moduleName);
        return await this.moduleRegistry.unregister(moduleName);
    }

    /**
     * Get a registered module
     * @param moduleName - Name of module to get
     */
    get(moduleName: string): AgentletModule | undefined {
        return this.modules.get(moduleName);
    }

    /**
     * Get all registered module names
     */
    getAll(): string[] {
        return Array.from(this.modules.keys());
    }

    /**
     * Activate a module through the registry
     * @param module - Module to activate
     * @param context - Activation context
     */
    async activate(module: AgentletModule, context: ModuleActivationContext = {}): Promise<void> {
        return await this.moduleRegistry.activateModule(module, context);
    }

    /**
     * Get statistics including registration sources
     */
    getStatistics(): ModuleStatistics & { registrationSources: Record<string, string> } {
        const stats = this.moduleRegistry.getStatistics() as ModuleStatistics & { registrationSources: Record<string, string> };

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
    initialize(): void {
        if (this._isInitialized) {
            console.warn('ModuleManager already initialized');
            return;
        }

        this._isInitialized = true;
        console.log('📦 ModuleManager initialized');
    }
}
