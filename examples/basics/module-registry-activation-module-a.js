/**
 * ModuleRegistryActivationModuleA - eager registry entry for the
 * module-registry-activation example.
 *
 * Registered automatically at init() (not `lazy`). Its pattern matches the
 * whole example page, so it becomes the active module first.
 */
class ModuleRegistryActivationModuleA extends window.agentlet.Module {
    constructor() {
        super({
            name: 'registry-module-a',
            version: '1.0.0',
            description: 'Eager registry module A',
            patterns: ['localhost']
        });
    }

    async initModule() {}
    async activateModule() {}
    async cleanupModule() {}

    getContent() {
        return `
            <div style="padding: 15px;">
                <p>Module A is active.</p>
            </div>
        `;
    }
}

if (typeof window !== 'undefined') {
    window.ModuleRegistryActivationModuleA = ModuleRegistryActivationModuleA;
}
