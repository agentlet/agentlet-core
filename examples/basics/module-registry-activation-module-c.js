/**
 * ModuleRegistryActivationModuleC - `lazy: true` registry entry for the
 * module-registry-activation example.
 *
 * Declared in the registry with `lazy: true`, so it is NOT fetched during
 * init(); it is only loaded when the page calls
 * `window.agentlet.moduleRegistry.loadModule(entry)`. Its pattern also
 * matches the page, demonstrating that loadModule() registers it without
 * activating it even though it would otherwise match the current URL.
 */
class ModuleRegistryActivationModuleC extends window.agentlet.Module {
    constructor() {
        super({
            name: 'registry-module-c',
            version: '1.0.0',
            description: 'Lazy registry module C, loaded on demand',
            patterns: ['localhost']
        });
    }

    async initModule() {}
    async activateModule() {}
    async cleanupModule() {}

    getContent() {
        return `
            <div style="padding: 15px;">
                <p>Module C is active (loaded on demand, then activated by hand).</p>
            </div>
        `;
    }
}

if (typeof window !== 'undefined') {
    window.ModuleRegistryActivationModuleC = ModuleRegistryActivationModuleC;
}
