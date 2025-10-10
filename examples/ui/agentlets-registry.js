/**
 * Agentlets Registry - JavaScript format for examples
 * Converted from JSON to avoid CORS issues
 */

(function() {
    'use strict';

    // Registry data
    const registry = {
        "libraries": {},
        "agentlets": [
            {
                "name": "localhost-demo",
                "version": "1.0.0",
                "url": "./localhost-demo-module.js",
                "module": "LocalhostDemoModule",
                "patterns": ["localhost:3000"],
                "description": "Demo module for localhost:3000 with dialog buttons"
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
            console.log('📦 Example registry data dispatched via agentletRegistryLoaded event');
        }, 10);

    } catch (error) {
        console.error('📦 Failed to dispatch registry event:', error);

        // Fallback: set global variable
        window.AGENTLET_REGISTRY_DATA = registry;
        console.warn('📦 Fallback: Registry data set as global variable');
    }

})();