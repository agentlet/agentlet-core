/**
 * LocalhostDemoModule - Example module for localhost:3000
 * Demonstrates dialog functionality with theming
 */

class LocalhostDemoModule extends window.agentlet.Module {
    constructor() {
        super({
            name: 'localhost-demo',
            version: '1.0.0',
            description: 'Demo module for localhost:3000 with dialog buttons',
            patterns: ['localhost:3000']
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
        return `
            <div style="padding: 15px;">
                <div style="margin: 15px 0;">
                    <button onclick="showLocalhostInfoDialog()" class="panel-action-btn">ℹ️ Info dialog</button>
                    <button onclick="showLocalhostFullscreenDialog()" class="panel-action-btn secondary">🖥️ Fullscreen dialog</button>
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