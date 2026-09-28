/**
 * ModuleRegistryActivationModuleC - `lazy: true` registry entry for the
 * module-registry-activation example.
 *
 * Declared in the registry with `lazy: true`, so it is NOT fetched during
 * init(), and - until loaded - it does not exist in `moduleRegistry.modules`
 * at all, so it is also invisible to automatic URL-based module detection,
 * even though its pattern ('localhost') matches this page. It is only
 * loaded (and only then becomes a normal, detectable module again) when the
 * page calls `window.agentlet.moduleRegistry.loadModule(entry)`; loading it
 * still does not activate it, so a manual `activateModule()` call is what
 * demonstrates it working, not the load itself.
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
