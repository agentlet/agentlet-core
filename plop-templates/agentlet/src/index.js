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

    // Folder this core bundle was served from, e.g. http://localhost:8080/.
    // Relative URLs below resolve against it rather than against the host
    // page, so the bookmarklet works on any origin. document.currentScript
    // is only set while this script first runs, so it is read right away.
    var currentScript = document.currentScript;
    var bundleBaseUrl = new URL('.', (currentScript && currentScript.src) || window.location.href).href;
    function resolveFromBundle(url) {
        return new URL(url, bundleBaseUrl).href;
    }

    var agentletConfig = {};
{{#if (eq libraryLoading 'registry')}}
    agentletConfig.registryUrl = resolveFromBundle('{{registryUrl}}');
    agentletConfig.loadingMode = 'registry';
{{else}}
    agentletConfig.registryUrl = resolveFromBundle('./agentlets-registry.js');
    agentletConfig.loadingMode = 'bundled';
{{/if}}
    // The registry loads module-bundle.js (resolved next to the registry)
    // and registers the class its entry names, so nothing here depends on
    // this agentlet's name.
    agentletConfig.envVarsButton = true;
    
    // Auto-initialize Agentlet Core
    const agentlet = new AgentletCore(agentletConfig);

    // Start initialization
    agentlet.init().then(() => {
        // Configure PDF worker after initialization
        if (window.agentlet && window.agentlet.configurePDFWorker) {
            window.agentlet.configurePDFWorker(resolveFromBundle('./pdf.worker.min.mjs'));
        }
    }).catch(error => {
        console.error('Failed to start Agentlet Core:', error);
    });
})();