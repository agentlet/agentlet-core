/**
 * Robust Script Injection Utility
 * Provides secure and reliable script injection using chrome.scripting.executeScript when available,
 * falling back to DOM injection for non-extension environments
 */

class ScriptInjector {
    constructor() {
        this.isExtensionEnvironment = typeof chrome !== 'undefined' && chrome.scripting;
        this.isContentScript = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
        this.pendingInjections = new Map();
        this.injectionCounter = 0;
    }

    /**
     * Inject JavaScript code into the current page or specified tab
     * @param {Object} options - Injection options
     * @param {string} options.code - JavaScript code to inject
     * @param {string} [options.file] - File path to inject (alternative to code)
     * @param {number} [options.tabId] - Tab ID for extension environment
     * @param {string} [options.target='main'] - Target world ('main' or 'isolated')
     * @param {boolean} [options.allFrames=false] - Inject into all frames
     * @param {Object} [options.func] - Function to inject with args
     * @param {Array} [options.args] - Arguments for function injection
     * @returns {Promise} - Resolves with injection result
     */
    async inject(options) {
        const {
            code,
            file,
            tabId,
            _target = 'main',
            _allFrames = false,
            func,
            _args = []
        } = options;

        // Validate input
        if (!code && !file && !func) {
            throw new Error('ScriptInjector: Must provide code, file, or func parameter');
        }

        try {
            // Use chrome.scripting.executeScript in extension background/popup context
            if (this.isExtensionEnvironment && tabId) {
                return await this._injectViaExtensionAPI(options);
            }
            
            // Use runtime messaging in content script context
            if (this.isContentScript && !tabId) {
                return await this._injectViaContentScript(options);
            }
            
            // Fall back to DOM injection in regular web page context
            return await this._injectViaDOMManipulation(options);
            
        } catch (error) {
            console.error('ScriptInjector: Injection failed:', error);
            throw error;
        }
    }

    /**
     * Inject script using Chrome Extension API (from background/popup)
     */
    async _injectViaExtensionAPI(options) {
        const { code, file, tabId, target, allFrames, func, args } = options;
        
        const executeOptions = {
            target: { 
                tabId: tabId,
                allFrames: allFrames 
            },
            world: target === 'isolated' ? 'ISOLATED' : 'MAIN'
        };

        if (func) {
            executeOptions.func = func;
            executeOptions.args = args;
        } else if (file) {
            executeOptions.files = [file];
        } else if (code) {
            // eslint-disable-next-line no-new-func
            executeOptions.function = new Function(code);
        }

        const results = await chrome.scripting.executeScript(executeOptions);
        return results[0]?.result;
    }

    /**
     * Inject script via content script messaging to background
     */
    // eslint-disable-next-line require-await
    async _injectViaContentScript(options) {
        const injectionId = `injection_${++this.injectionCounter}`;
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingInjections.delete(injectionId);
                reject(new Error('ScriptInjector: Content script injection timeout'));
            }, 10000);

            this.pendingInjections.set(injectionId, { resolve, reject, timeout });

            // Send injection request to background script
            chrome.runtime.sendMessage({
                type: 'INJECT_SCRIPT',
                injectionId,
                options: {
                    ...options,
                    tabId: undefined // Will be determined by background script
                }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    this._resolveInjection(injectionId, null, chrome.runtime.lastError);
                } else {
                    this._resolveInjection(injectionId, response);
                }
            });
        });
    }

    /**
     * Inject script using DOM manipulation (fallback)
     */
    // eslint-disable-next-line require-await
    async _injectViaDOMManipulation(options) {
        const { code, file, func, args } = options;
        
        return new Promise((resolve, reject) => {
            try {
                const script = document.createElement('script');
                script.type = 'text/javascript';
                
                // Set up cleanup and result handling
                const cleanup = () => {
                    if (script.parentNode) {
                        script.parentNode.removeChild(script);
                    }
                };

                script.onload = () => {
                    cleanup();
                    resolve();
                };

                script.onerror = (error) => {
                    cleanup();
                    reject(new Error(`ScriptInjector: DOM injection failed - ${error.message || 'Unknown error'}`));
                };

                if (func) {
                    // Execute function with arguments
                    script.textContent = `(${func.toString()})(${args.map(arg => JSON.stringify(arg)).join(',')});`;
                } else if (file) {
                    script.src = file;
                } else if (code) {
                    script.textContent = code;
                }

                // Add security attributes
                script.setAttribute('data-agentlet-injected', 'true');
                script.setAttribute('data-injection-timestamp', Date.now().toString());

                (document.head || document.documentElement).appendChild(script);
                
                // For inline scripts, resolve immediately
                if (!file) {
                    setTimeout(() => {
                        cleanup();
                        resolve();
                    }, 0);
                }
                
            } catch (error) {
                reject(new Error(`ScriptInjector: DOM injection setup failed - ${error.message}`));
            }
        });
    }

    /**
     * Resolve pending injection
     */
    _resolveInjection(injectionId, result, error = null) {
        const pending = this.pendingInjections.get(injectionId);
        if (!pending) return;

        clearTimeout(pending.timeout);
        this.pendingInjections.delete(injectionId);

        if (error) {
            pending.reject(new Error(`ScriptInjector: ${error.message || error}`));
        } else {
            pending.resolve(result);
        }
    }

    /**
     * Inject a module
     * @param {Object} options - Module injection options
     * @param {string} options.moduleCode - Module source code
     * @param {string} options.moduleUrl - Module URL/identifier
     * @param {number} [options.tabId] - Tab ID for extension context
     */
    async injectModule(options) {
        const { moduleCode, moduleUrl, tabId } = options;

        // Wrap module code in IIFE for isolation
        const wrappedCode = `
(function() {
    'use strict';
    console.log('Loading module: ${moduleUrl}');
    try {
        ${moduleCode}
        console.log('Module loaded successfully: ${moduleUrl}');
    } catch (error) {
        console.error('Module loading failed: ${moduleUrl}', error);
        throw error;
    }
})();
//# sourceURL=${moduleUrl}
`;

        return await this.inject({
            code: wrappedCode,
            tabId,
            target: 'main'
        });
    }


    /**
     * Clean up resources
     */
    cleanup() {
        // Resolve any pending injections with timeout error
        for (const [_injectionId, pending] of this.pendingInjections) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('ScriptInjector: Cleanup - operation cancelled'));
        }
        this.pendingInjections.clear();
    }

    /**
     * Check if extension environment is available
     */
    static isExtensionEnvironment() {
        return typeof chrome !== 'undefined' && chrome.scripting;
    }

    /**
     * Check if content script environment is available  
     */
    static isContentScriptEnvironment() {
        return typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
    }

    /**
     * Create a function injection helper
     */
    static createFunctionInjection(func, ...args) {
        return {
            func: func,
            args: args
        };
    }
}

// Export for ES modules
export default ScriptInjector;

// Also export for global scope for compatibility
if (typeof window !== 'undefined') {
    window.ScriptInjector = ScriptInjector;
}