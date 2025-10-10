/**
 * Agentlets Registry - JavaScript format for {{name}}
 * Generated from plop template
 */

(function() {
    'use strict';

    // Registry data
    const registry = {
{{#if (eq libraryLoading 'registry')}}
        "libraries": {
            "xlsx": "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js",
            "html2canvas": "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
            "pdfjs": "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js",
            "hotkeys": "https://cdnjs.cloudflare.com/ajax/libs/hotkeys-js/3.10.1/hotkeys.min.js"
        },
{{/if}}
        "agentlets": [
            {
                "name": "{{name}}",
                "version": "1.0.0",
                "url": "./module-bundle.js",
                "module": "{{camelCase name}}AgentletModule",
                "patterns": ["*"],
                "description": "A powerful Agentlet module for enhanced web automation and data extraction"
            }
        ]
    };

    // Dispatch the registry data via custom event
    try {
        const event = new CustomEvent('agentletRegistryLoaded', {
            detail: registry,
            bubbles: false,
            cancelable: false
        });

        // Small delay to ensure the event listener is set up
        setTimeout(() => {
            window.dispatchEvent(event);
            console.log('📦 {{name}} registry data dispatched via agentletRegistryLoaded event');
        }, 10);

    } catch (error) {
        console.error('📦 Failed to dispatch registry event:', error);

        // Fallback: set global variable
        window.AGENTLET_REGISTRY_DATA = registry;
        console.warn('📦 Fallback: Registry data set as global variable');
    }

})();