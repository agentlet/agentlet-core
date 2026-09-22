/**
 * Light Bookmarklet Template for Packaged Mode
 * This template creates a minimal bookmarklet that sequentially loads:
 * 1. Core bundle (with packaged mode enabled)
 * 2. Module bundle (once core is loaded)
 */

(function() {
    'use strict';

    // Prevent double loading
    if (window.agentletLoading || window.agentlet) {
        console.log('📎 Agentlet already loaded or loading');
        return;
    }

    window.agentletLoading = true;

    // Get base URL from configuration or use default
    const config = window.agentletConfig || {};
    const baseUrl = config.baseUrl || 'https://cdn.example.com/agentlet-core/';
    const coreUrl = config.coreUrl || (baseUrl + 'agentlet-core-packaged.js');

    console.log('📎 Loading Agentlet Core in packaged mode...');

    // Inject core bundle
    const coreScript = document.createElement('script');
    coreScript.src = coreUrl;
    coreScript.crossOrigin = 'anonymous';

    coreScript.onload = function() {
        console.log('✅ Agentlet Core loaded successfully');
        window.agentletLoading = false;

        // Core will handle module loading automatically in packaged mode
    };

    coreScript.onerror = function() {
        console.error('❌ Failed to load Agentlet Core from:', coreUrl);
        window.agentletLoading = false;

        // Show user-friendly error
        const errorDiv = document.createElement('div');
        errorDiv.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            background: #dc3545;
            color: white;
            padding: 15px;
            border-radius: 8px;
            z-index: 999999;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            font-size: 14px;
            max-width: 300px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.3);
        `;
        errorDiv.innerHTML = `
            <div style="font-weight: bold; margin-bottom: 8px;">📎 Agentlet Loading Failed</div>
            <div>Could not load from: ${coreUrl}</div>
            <div style="margin-top: 8px; font-size: 12px; opacity: 0.9;">
                Check console for details or verify the URL is accessible.
            </div>
        `;

        document.body.appendChild(errorDiv);

        // Auto-remove error after 10 seconds
        setTimeout(() => {
            if (errorDiv.parentNode) {
                errorDiv.parentNode.removeChild(errorDiv);
            }
        }, 10000);
    };

    document.head.appendChild(coreScript);
})();