/**
 * Starts agentlet core in the page. The extension injects this file right
 * after agentlet-core.js (which defines the AgentletCore global) in the same
 * world as the page, so that window.agentlet behaves as it does for the
 * bookmarklet. It keeps the pending init() promise on window.__agentletReady
 * so the extension can wait for it before injecting bundled modules.
 */
(function () {
    'use strict';

    if (window.agentlet || window.__agentletReady) {
        return;
    }

    var Core = window.AgentletCore && window.AgentletCore.default;
    if (typeof Core !== 'function') {
        console.error('Agentlet core extension: the AgentletCore global is missing');
        return;
    }

    var config = window.agentletConfig || {};
    window.__agentletReady = new Core(config).init();
})();
