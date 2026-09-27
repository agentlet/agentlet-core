/**
 * Agentlets Registry for the module-registry-activation example.
 *
 * Declares two eager modules (A and B, same pattern - see the "no
 * activation revert" demo) and one `lazy: true` module (C, loaded on
 * demand). Dispatches synchronously: ModuleRegistry.loadRegistryScript()
 * attaches its `agentletRegistryLoaded` listener before injecting this
 * script, so the listener is always in place by the time this (dynamically
 * loaded) script runs - a delay here is unnecessary and, on a busy page,
 * can push the dispatch past the loader's 10-second timeout.
 */
(function() {
    'use strict';

    const registry = {
        agentlets: [
            {
                name: 'registry-module-a',
                url: './module-registry-activation-module-a.js',
                module: 'ModuleRegistryActivationModuleA'
            },
            {
                name: 'registry-module-b',
                url: './module-registry-activation-module-b.js',
                module: 'ModuleRegistryActivationModuleB'
            },
            {
                name: 'registry-module-c',
                url: './module-registry-activation-module-c.js',
                module: 'ModuleRegistryActivationModuleC',
                lazy: true
            }
        ]
    };

    window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', { detail: registry }));
})();
