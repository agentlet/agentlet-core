{{#if (eq libraryLoading 'bundled')}}
{{#each externalLibs}}
{{#if (eq this 'html2canvas')}}
import html2canvas from 'html2canvas';
window.html2canvas = html2canvas;
{{/if}}
{{#if (eq this 'xlsx')}}
import * as XLSX from 'xlsx';
window.XLSX = XLSX;
{{/if}}
{{#if (eq this 'pdfjs-dist')}}
import * as pdfjsLib from 'pdfjs-dist';
window.pdfjsLib = pdfjsLib;
{{/if}}
{{#if (eq this 'hotkeys-js')}}
import hotkeys from 'hotkeys-js';
window.hotkeys = hotkeys;
{{/if}}
{{/each}}
{{/if}}

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