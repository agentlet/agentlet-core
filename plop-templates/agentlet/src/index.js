import jQuery from 'jquery';
window.jQuery = jQuery;
window.agentlet?.refreshjQuery?.(); // Update agentlet jQuery reference
import html2canvas from 'html2canvas';
window.html2canvas = html2canvas;
import * as XLSX from 'xlsx';
window.XLSX = XLSX;
import * as pdfjsLib from 'pdfjs-dist';
window.pdfjsLib = pdfjsLib;

import AgentletCore from 'agentlet-core';

(function() {
    'use strict';
    
    // Check if Agentlet is already loaded to prevent double-initialization
    if (window.agentlet && window.agentlet.initialized) {
        console.log('🤖 Agentlet Core already loaded and initialized');
        return;
    }

    var agentletConfig = {};
    agentletConfig.registryUrl = 'http://localhost:8080/agentlets-registry.json';
    agentletConfig.pdfWorkerUrl = 'http://localhost:8080/pdf.worker.min.js';
    agentletConfig.envVarsButton = true;
    
    // Auto-initialize Agentlet Core
    const agentlet = new AgentletCore(agentletConfig);

    // Start initialization
    agentlet.init().then(() => {
        // Configure PDF worker after initialization
        if (window.agentlet && window.agentlet.configurePDFWorker) {
            window.agentlet.configurePDFWorker('http://localhost:8080/pdf.worker.min.js');
        }
    }).catch(error => {
        console.error('Failed to start Agentlet Core:', error);
    });
})();