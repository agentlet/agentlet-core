/**
 * Agentlets Registry - Event-based JavaScript format
 * This file replaces the previous JSON-based registry format
 * It uses script injection and custom events to bypass CORS issues
 */

(function() {
    'use strict';

    // Registry data structure (same as before, but in JavaScript)
    const registry = {
        "agentlets": [
            {
                "name": "hello-world",
                "url": "https://cdn.example.com/agentlets/hello-world.js",
                "module": "HelloWorldModule",
                "description": "Simple hello world agentlet for testing",
                "version": "1.0.0",
                "patterns": ["example.com", "test.com"]
            },
            {
                "name": "form-assistant",
                "url": "https://cdn.example.com/agentlets/form-assistant.js",
                "module": "FormAssistantModule",
                "description": "AI-powered form filling assistant",
                "version": "2.1.0",
                "patterns": [
                    { "type": "regex", "value": ".*\\.form-site\\.com.*" },
                    { "type": "includes", "value": "forms" }
                ]
            },
            {
                "name": "data-extractor",
                "url": "https://cdn.example.com/agentlets/data-extractor.js",
                "module": "DataExtractorModule",
                "description": "Extract and export data from web pages",
                "version": "1.5.2",
                "patterns": [
                    { "type": "exact", "value": "https://data-site.com/dashboard" }
                ]
            }
        ],

        "libraries": {
            "chart.js": {
                "url": "https://cdn.jsdelivr.net/npm/chart.js@3.9.1/dist/chart.min.js",
                "version": "3.9.1",
                "description": "Chart rendering library"
            },
            "moment.js": {
                "url": "https://cdn.jsdelivr.net/npm/moment@2.29.4/moment.min.js",
                "version": "2.29.4",
                "description": "Date manipulation library"
            }
        },

        "meta": {
            "version": "1.0.0",
            "lastUpdated": "2024-01-10T10:00:00Z",
            "description": "Example agentlets registry",
            "baseUrl": "https://cdn.example.com/agentlets/"
        }
    };

    // Dispatch the registry data via custom event
    // This bypasses CORS issues that occur with fetch()
    try {
        const event = new CustomEvent('agentletRegistryLoaded', {
            detail: registry,
            bubbles: false,
            cancelable: false
        });

        // Dispatch synchronously. ModuleRegistry.loadRegistryScript() attaches
        // its listener before this script is injected, so the listener is
        // always in place by the time this (dynamically loaded) script runs -
        // a delay here is unnecessary and, on a busy page, can push the
        // dispatch past the loader's 10-second timeout.
        window.dispatchEvent(event);
        console.log('📦 Registry data dispatched via agentletRegistryLoaded event');

    } catch (error) {
        console.error('📦 Failed to dispatch registry event:', error);

        // Fallback: set global variable (less elegant but works)
        window.AGENTLET_REGISTRY_DATA = registry;
        console.warn('📦 Fallback: Registry data set as global variable');
    }

})();