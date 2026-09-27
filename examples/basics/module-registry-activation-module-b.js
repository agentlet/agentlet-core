/**
 * ModuleRegistryActivationModuleB - eager registry entry for the
 * module-registry-activation example.
 *
 * Registered automatically at init() alongside module A (also `lazy: false`),
 * with the same pattern - so it never auto-activates on its own (module A,
 * registered first, wins that race). It is meant to be activated by hand
 * with `window.agentlet.moduleRegistry.activateModule()`, the way a
 * "launcher" module would activate another module the visitor picked.
 */
class ModuleRegistryActivationModuleB extends window.agentlet.Module {
    constructor() {
        super({
            name: 'registry-module-b',
            version: '1.0.0',
            description: 'Eager registry module B, activated manually',
            patterns: ['localhost']
        });
    }

    async initModule() {}
    async activateModule() {}
    async cleanupModule() {}

    getContent() {
        return `
            <div style="padding: 15px;">
                <p>Module B is active (activated by hand).</p>
            </div>
        `;
    }
}

if (typeof window !== 'undefined') {
    window.ModuleRegistryActivationModuleB = ModuleRegistryActivationModuleB;
}
