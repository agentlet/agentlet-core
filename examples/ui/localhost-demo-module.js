/**
 * LocalhostDemoModule - Example module for localhost:3000
 * Demonstrates dialog functionality with theming
 */

class LocalhostDemoModule extends window.agentlet.Module {
    constructor() {
        super({
            name: 'localhost-demo',
            version: '1.0.0',
            description: 'Demo module for localhost with dialog buttons',
            patterns: ['localhost']
        });
    }

    async initModule() {
        // Module initialized
    }

    async activateModule(context = {}) {
        // Module activated for localhost:3000
    }

    async cleanupModule(context = {}) {
        // Module cleaned up
    }

    getContent() {
        // Use the built-in .agentlet-btn classes (styled by the core
        // stylesheet inside the shadow root) rather than a page-defined
        // class: a host-page <style> can no longer reach content mounted
        // inside the shadow root, see docs/shadow-dom.md.
        return `
            <div style="padding: 15px;">
                <div style="margin: 15px 0;">
                    <button onclick="showLocalhostInfoDialog()" class="agentlet-btn">ℹ️ Info dialog</button>
                    <button onclick="showLocalhostFullscreenDialog()" class="agentlet-btn agentlet-btn-secondary">🖥️ Fullscreen dialog</button>
                </div>
            </div>
        `;
    }
}

// Module will be automatically instantiated and registered by the registry system
// Export the module class for registry loading
if (typeof window !== 'undefined') {
    window.LocalhostDemoModule = LocalhostDemoModule;
}
