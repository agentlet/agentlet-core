// html2canvas, xlsx, pdfjs-dist and hotkeys-js are NOT imported here: this
// project's own agentlet-core dependency already bundles all four and
// exposes them as window.html2canvas/window.XLSX/window.pdfjsLib/window.hotkeys
// once agentlet.init() resolves below (see src/libraries/LibrarySetup.js in
// agentlet-core). Importing them again here would bundle a second copy of
// each into this project's own dist/*-bundle.js. The one exception is the
// PDF.js *worker* file, which still needs to be copied into this project's
// dist/ folder - see the "Include the PDF.js worker file?" scaffold prompt
// (--libs=pdfjs-dist) and the CopyPlugin entry it adds to webpack.config.js.

import AgentletCore from 'agentlet-core';

(function() {
    'use strict';
    
    // Check if Agentlet is already loaded to prevent double-initialization
    if (window.agentlet && window.agentlet.initialized) {
        console.log('🤖 Agentlet Core already loaded and initialized');
        return;
    }

    var agentletConfig = {};
{{#if (eq libraryLoading 'registry')}}
    agentletConfig.registryUrl = '{{registryUrl}}';
    agentletConfig.loadingMode = 'registry';
{{else}}
    // Bundled mode: load registry for module script loading but skip auto-registration
    agentletConfig.registryUrl = './agentlets-registry.js';
    agentletConfig.loadingMode = 'bundled';
    agentletConfig.skipRegistryModuleRegistration = true; // Prevent dual registration
{{/if}}
    agentletConfig.envVarsButton = true;
    
    // Auto-initialize Agentlet Core
    const agentlet = new AgentletCore(agentletConfig);

    // Start initialization
    agentlet.init().then(() => {
        // Configure PDF worker after initialization
        if (window.agentlet && window.agentlet.configurePDFWorker) {
            window.agentlet.configurePDFWorker('http://localhost:8080/pdf.worker.min.mjs');
        }
        
        // Register local module through ModuleManager to prevent duplicates
        if (typeof window.{{camelCase name}}AgentletModule !== 'undefined') {
            const localModule = new window.{{camelCase name}}AgentletModule();
            // Use ModuleManager instead of direct moduleRegistry registration
            if (agentlet.moduleManager) {
                agentlet.moduleManager.register(localModule, 'local-template');
            } else {
                // Fallback for older agentlet-core versions
                agentlet.moduleRegistry.register(localModule);
            }
            console.log('🤖 Local agentlet module registered:', localModule.name);
        }
    }).catch(error => {
        console.error('Failed to start Agentlet Core:', error);
    });
})();