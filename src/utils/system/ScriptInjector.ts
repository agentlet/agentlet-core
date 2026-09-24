/**
 * Robust Script Injection Utility
 * Provides secure and reliable script injection using chrome.scripting.executeScript when available,
 * falling back to DOM injection for non-extension environments
 */
import type { ScriptInjectOptions, ScriptInjectorAPI } from '../../types/public-api';

/**
 * Minimal shape of the `chrome.scripting`/`chrome.runtime` extension APIs
 * this file reads. Deliberately not the full `@types/chrome` surface -
 * only the members actually used below. Accessed through `getChromeGlobal()`
 * (via `globalThis`) rather than the bare `chrome` identifier, since a bare
 * reference has no ambient type declaration under strict tsc even though
 * eslint.config.js declares `chrome` as a known global for lint purposes.
 */
interface ChromeScriptingExecuteOptions {
    target: { tabId?: number; allFrames?: boolean };
    world: 'MAIN' | 'ISOLATED';
    func?: (...args: unknown[]) => unknown;
    args?: unknown[];
    files?: string[];
    function?: (...args: unknown[]) => unknown;
}

interface ChromeScripting {
    executeScript(options: ChromeScriptingExecuteOptions): Promise<Array<{ result?: unknown }>>;
}

interface ChromeRuntime {
    sendMessage(message: unknown, callback: (response: unknown) => void): void;
    lastError?: { message?: string } | null;
}

interface ChromeGlobal {
    scripting?: ChromeScripting;
    runtime?: ChromeRuntime;
}

function getChromeGlobal(): ChromeGlobal | undefined {
    return (globalThis as unknown as { chrome?: ChromeGlobal }).chrome;
}

/** Mirrors the constructor's/statics' original `typeof chrome !== 'undefined' && chrome.scripting` check. */
function detectExtensionEnvironment(): boolean {
    const chromeGlobal = getChromeGlobal();
    return typeof chromeGlobal !== 'undefined' && !!chromeGlobal.scripting;
}

/** Mirrors the constructor's/statics' original `typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage` check. */
function detectContentScriptEnvironment(): boolean {
    const chromeGlobal = getChromeGlobal();
    return typeof chromeGlobal !== 'undefined' && !!chromeGlobal.runtime && !!chromeGlobal.runtime.sendMessage;
}

/**
 * Best-effort extraction of a `.message` string from an unknown error-like
 * value, without assuming an `Error` instance - mirrors the original code's
 * untyped `error.message` access, which worked whether `error` was an
 * `Error`, a `chrome.runtime.lastError`-shaped object, a plain string, or
 * something else entirely.
 */
function extractMessage(error: unknown): unknown {
    return (error && typeof error === 'object' && 'message' in error)
        ? (error as { message?: unknown }).message
        : undefined;
}

interface PendingInjection {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
}

class ScriptInjector implements ScriptInjectorAPI {
    isExtensionEnvironment: boolean;
    isContentScript: boolean;
    pendingInjections: Map<string, PendingInjection>;
    injectionCounter: number;

    constructor() {
        this.isExtensionEnvironment = detectExtensionEnvironment();
        this.isContentScript = detectContentScriptEnvironment();
        this.pendingInjections = new Map();
        this.injectionCounter = 0;
    }

    /**
     * Inject JavaScript code into the current page or specified tab
     * @param options - Injection options
     * @param options.code - JavaScript code to inject
     * @param [options.file] - File path to inject (alternative to code)
     * @param [options.tabId] - Tab ID for extension environment
     * @param [options.target='main'] - Target world ('main' or 'isolated')
     * @param [options.allFrames=false] - Inject into all frames
     * @param [options.func] - Function to inject with args
     * @param [options.args] - Arguments for function injection
     * @returns Resolves with injection result
     */
    async inject(options: ScriptInjectOptions): Promise<unknown> {
        const {
            code,
            file,
            tabId,
            func
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
    async _injectViaExtensionAPI(options: ScriptInjectOptions): Promise<unknown> {
        const { code, file, tabId, target, allFrames, func, args } = options;

        const executeOptions: ChromeScriptingExecuteOptions = {
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
            executeOptions.function = new Function(code) as (...args: unknown[]) => unknown;
        }

        const chromeGlobal = getChromeGlobal();
        const results = await chromeGlobal!.scripting!.executeScript(executeOptions);
        return results[0]?.result;
    }

    /**
     * Inject script via content script messaging to background
     */
    // eslint-disable-next-line require-await
    async _injectViaContentScript(options: ScriptInjectOptions): Promise<unknown> {
        const injectionId = `injection_${++this.injectionCounter}`;

        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingInjections.delete(injectionId);
                reject(new Error('ScriptInjector: Content script injection timeout'));
            }, 10000);

            this.pendingInjections.set(injectionId, { resolve, reject, timeout });

            // Send injection request to background script
            const chromeGlobal = getChromeGlobal();
            chromeGlobal!.runtime!.sendMessage({
                type: 'INJECT_SCRIPT',
                injectionId,
                options: {
                    ...options,
                    tabId: undefined // Will be determined by background script
                }
            }, (response) => {
                if (chromeGlobal!.runtime!.lastError) {
                    this._resolveInjection(injectionId, null, chromeGlobal!.runtime!.lastError);
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
    async _injectViaDOMManipulation(options: ScriptInjectOptions): Promise<unknown> {
        const { code, file, func, args } = options;

        return new Promise((resolve, reject) => {
            try {
                const script = document.createElement('script');
                script.type = 'text/javascript';

                // Set up cleanup and result handling
                const cleanup = (): void => {
                    if (script.parentNode) {
                        script.parentNode.removeChild(script);
                    }
                };

                script.onload = (): void => {
                    cleanup();
                    resolve(undefined);
                };

                script.onerror = (error): void => {
                    cleanup();
                    reject(new Error(`ScriptInjector: DOM injection failed - ${extractMessage(error) || 'Unknown error'}`));
                };

                if (func) {
                    // Execute function with arguments. `args` is optional on
                    // ScriptInjectOptions but the original code assumed it was
                    // always provided alongside `func` (no default/guard) -
                    // preserved here via `!` rather than adding a fallback.
                    script.textContent = `(${func.toString()})(${args!.map(arg => JSON.stringify(arg)).join(',')});`;
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
                        resolve(undefined);
                    }, 0);
                }

            } catch (error) {
                reject(new Error(`ScriptInjector: DOM injection setup failed - ${(error as Error).message}`));
            }
        });
    }

    /**
     * Resolve pending injection
     */
    _resolveInjection(injectionId: string, result: unknown, error: unknown = null): void {
        const pending = this.pendingInjections.get(injectionId);
        if (!pending) return;

        clearTimeout(pending.timeout);
        this.pendingInjections.delete(injectionId);

        if (error) {
            pending.reject(new Error(`ScriptInjector: ${extractMessage(error) || error}`));
        } else {
            pending.resolve(result);
        }
    }

    /**
     * Inject a module
     * @param options - Module injection options
     * @param options.moduleCode - Module source code
     * @param options.moduleUrl - Module URL/identifier
     * @param [options.tabId] - Tab ID for extension context
     */
    async injectModule(options: { moduleCode?: string; moduleUrl?: string; tabId?: number }): Promise<unknown> {
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
    cleanup(): void {
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
    static isExtensionEnvironment(): boolean {
        return detectExtensionEnvironment();
    }

    /**
     * Check if content script environment is available
     */
    static isContentScriptEnvironment(): boolean {
        return detectContentScriptEnvironment();
    }

    /**
     * Create a function injection helper
     */
    static createFunctionInjection(
        func: (...args: unknown[]) => unknown,
        ...args: unknown[]
    ): { func: (...args: unknown[]) => unknown; args: unknown[] } {
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
    (window as unknown as { ScriptInjector: typeof ScriptInjector }).ScriptInjector = ScriptInjector;
}
