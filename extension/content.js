/**
 * Agentlet Core - Content Script
 * Bridges between the extension and injected Agentlet Core
 */

// Import ScriptInjector utility (will be injected into page context)
const SCRIPT_INJECTOR_CODE = `
// ScriptInjector utility for robust script injection
class ScriptInjector {
    constructor() {
        this.isExtensionEnvironment = typeof chrome !== 'undefined' && chrome.scripting;
        this.isContentScript = typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage;
        this.pendingInjections = new Map();
        this.injectionCounter = 0;
    }

    async inject(options) {
        const { code, file, func, args = [] } = options;
        
        if (!code && !file && !func) {
            throw new Error('ScriptInjector: Must provide code, file, or func parameter');
        }

        try {
            if (this.isContentScript) {
                return await this._injectViaContentScript(options);
            }
            return await this._injectViaDOMManipulation(options);
        } catch (error) {
            console.error('ScriptInjector: Injection failed:', error);
            throw error;
        }
    }

    async _injectViaContentScript(options) {
        const injectionId = 'injection_' + (++this.injectionCounter);
        
        return new Promise((resolve, reject) => {
            const timeout = setTimeout(() => {
                this.pendingInjections.delete(injectionId);
                reject(new Error('ScriptInjector: Content script injection timeout'));
            }, 10000);

            this.pendingInjections.set(injectionId, { resolve, reject, timeout });

            chrome.runtime.sendMessage({
                type: 'INJECT_SCRIPT',
                injectionId,
                options: { ...options, tabId: undefined }
            }, (response) => {
                if (chrome.runtime.lastError) {
                    this._resolveInjection(injectionId, null, chrome.runtime.lastError);
                } else {
                    this._resolveInjection(injectionId, response);
                }
            });
        });
    }

    async _injectViaDOMManipulation(options) {
        const { code, file, func, args } = options;
        
        return new Promise((resolve, reject) => {
            try {
                const script = document.createElement('script');
                script.type = 'text/javascript';
                
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
                    reject(new Error('ScriptInjector: DOM injection failed - ' + (error.message || 'Unknown error')));
                };

                if (func) {
                    script.textContent = '(' + func.toString() + ')(' + args.map(arg => JSON.stringify(arg)).join(',') + ');';
                } else if (file) {
                    script.src = file;
                } else if (code) {
                    script.textContent = code;
                }

                script.setAttribute('data-agentlet-injected', 'true');
                script.setAttribute('data-injection-timestamp', Date.now().toString());

                (document.head || document.documentElement).appendChild(script);
                
                if (!file) {
                    setTimeout(() => {
                        cleanup();
                        resolve();
                    }, 0);
                }
                
            } catch (error) {
                reject(new Error('ScriptInjector: DOM injection setup failed - ' + error.message));
            }
        });
    }

    _resolveInjection(injectionId, result, error = null) {
        const pending = this.pendingInjections.get(injectionId);
        if (!pending) return;

        clearTimeout(pending.timeout);
        this.pendingInjections.delete(injectionId);

        if (error) {
            pending.reject(new Error('ScriptInjector: ' + (error.message || error)));
        } else {
            pending.resolve(result);
        }
    }

    async injectModule(options) {
        const { moduleCode, moduleUrl, validateSecurity = true } = options;

        if (validateSecurity) {
            this._validateModuleSecurity(moduleCode, moduleUrl);
        }

        const wrappedCode = '(function() { \"use strict\"; console.log(\"Loading module: ' + moduleUrl + '\"); try { ' + moduleCode + '; console.log(\"Module loaded successfully: ' + moduleUrl + '\"); } catch (error) { console.error(\"Module loading failed: ' + moduleUrl + '\", error); throw error; } })(); //# sourceURL=' + moduleUrl;

        return await this.inject({
            code: wrappedCode,
            target: 'main'
        });
    }

    _validateModuleSecurity(moduleCode, moduleUrl) {
        const dangerousPatterns = [
            /eval\\s*\\(/,
            /Function\\s*\\(/,
            /innerHTML\\s*=/,
            /outerHTML\\s*=/,
            /document\\.write/,
            /document\\.writeln/,
            /<script[^>]*>/i,
            /javascript:/i,
            /data:text\\/html/i,
            /vbscript:/i
        ];

        for (const pattern of dangerousPatterns) {
            if (pattern.test(moduleCode)) {
                throw new Error('ScriptInjector: Potentially dangerous pattern detected in module ' + moduleUrl + ': ' + pattern);
            }
        }
    }

    cleanup() {
        for (const [injectionId, pending] of this.pendingInjections) {
            clearTimeout(pending.timeout);
            pending.reject(new Error('ScriptInjector: Cleanup - operation cancelled'));
        }
        this.pendingInjections.clear();
    }
}

window.ScriptInjector = ScriptInjector;
`;

class AgentletContentScript {
    constructor() {
        this.agentletLoaded = false;
        this.messageQueue = [];
        this.scriptInjector = null;
        this.scriptInjectorInitialized = false;
        this.setupMessageListener();
        this.checkForExistingAgentlet();
    }

    /**
     * Initialize ScriptInjector in page context (lazy-loaded when needed)
     */
    async ensureScriptInjectorInitialized() {
        if (this.scriptInjectorInitialized) {
            return true;
        }

        try {
            // Use chrome.scripting.executeScript to inject ScriptInjector
            const response = await chrome.runtime.sendMessage({
                type: 'INJECT_SCRIPT',
                injectionId: `script_injector_init_${Date.now()}`,
                options: {
                    code: SCRIPT_INJECTOR_CODE,
                    target: 'main'
                }
            });
            
            if (response && response.success) {
                console.log('ScriptInjector initialized in page context via chrome.scripting');
                this.scriptInjectorInitialized = true;
                return true;
            } else {
                console.warn('ScriptInjector initialization via chrome.scripting failed');
                return false;
            }
        } catch (error) {
            console.error('Failed to initialize ScriptInjector via chrome.scripting:', error);
            return false;
        }
    }

    /**
     * Set up message listener for background script communication
     */
    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open
        });
    }

    /**
     * Check if Agentlet Core is already loaded
     */
    checkForExistingAgentlet() {
        if (window.agentlet) {
            this.agentletLoaded = true;
            this.notifyBackgroundOfState();
        }
    }

    /**
     * Handle messages from background script
     */
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'INIT_AGENTLET':
                    await this.initializeAgentlet(message.config);
                    sendResponse({ success: true });
                    break;

                case 'DEACTIVATE_AGENTLET':
                    await this.deactivateAgentlet();
                    sendResponse({ success: true });
                    break;

                case 'ACTIVATE_AI_ASSISTANT':
                    await this.activateAIAssistant();
                    sendResponse({ success: true });
                    break;

                case 'ANALYZE_SELECTION':
                    await this.analyzeSelection(message.data);
                    sendResponse({ success: true });
                    break;

                case 'LOAD_MODULE':
                    await this.loadModule(message.moduleCode, message.moduleUrl);
                    sendResponse({ success: true });
                    break;

                case 'SETTINGS_CHANGED':
                    await this.handleSettingsChanged(message.settings);
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Content script error:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * Initialize Agentlet Core
     */
    async initializeAgentlet(config) {
        if (this.agentletLoaded) {
            console.log('Agentlet Core already loaded');
            return;
        }

        try {
            // Set global configuration
            window.agentletConfig = {
                enableUI: true,
                enablePlugins: true,
                moduleRegistry: config.modules || [],
                trustedDomains: config.settings.trustedDomains || [],
                uiPosition: config.settings.uiPosition || 'right',
                theme: config.settings.theme || 'default',
                debugMode: config.settings.debugMode || false,
                extensionMode: true,
                extensionId: config.extensionId
            };

            // Wait for Agentlet Core to initialize
            await this.waitForAgentletCore();

            this.agentletLoaded = true;
            this.notifyBackgroundOfState();

            // Process queued messages
            this.processMessageQueue();

            console.log('Agentlet Core initialized via extension');
        } catch (error) {
            console.error('Failed to initialize Agentlet Core:', error);
            throw error;
        }
    }

    /**
     * Wait for Agentlet Core to be available
     */
    async waitForAgentletCore(timeout = 10000) {
        const start = Date.now();
        
        while (!window.agentlet && Date.now() - start < timeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!window.agentlet) {
            throw new Error('Agentlet Core failed to load within timeout');
        }

        // Wait for initialization to complete
        while (!window.agentlet.initialized && Date.now() - start < timeout) {
            await new Promise(resolve => setTimeout(resolve, 100));
        }

        if (!window.agentlet.initialized) {
            throw new Error('Agentlet Core failed to initialize within timeout');
        }
    }

    /**
     * Deactivate Agentlet Core
     */
    async deactivateAgentlet() {
        if (window.agentlet && typeof window.agentlet.cleanup === 'function') {
            await window.agentlet.cleanup();
            this.agentletLoaded = false;
            this.notifyBackgroundOfState();
            console.log('Agentlet Core deactivated');
        }
    }

    /**
     * Activate AI assistant
     */
    async activateAIAssistant() {
        if (!this.agentletLoaded) {
            this.queueMessage({ type: 'ACTIVATE_AI_ASSISTANT' });
            return;
        }

        if (window.agentlet?.utils?.InputDialog) {
            window.agentlet.utils.InputDialog.promptAI(
                'What would you like me to help you with?',
                '',
                (result) => {
                    if (result) {
                        this.processAIRequest(result);
                    }
                }
            );
        }
    }

    /**
     * Process AI request
     */
    async processAIRequest(prompt) {
        if (window.agentlet?.utils?.WaitDialog) {
            const WaitDialog = window.agentlet.utils.WaitDialog;
            const InfoDialog = window.agentlet.utils.InfoDialog;

            WaitDialog.showAIProcessing('Processing your request...', true, () => {
                console.log('AI request cancelled');
            });

            // Simulate AI processing (replace with actual AI service call)
            setTimeout(() => {
                WaitDialog.hide();
                InfoDialog.success(
                    `I'd be happy to help with: "${prompt}"\n\nThis is a demonstration. In a real implementation, this would connect to an AI service to process your request.`,
                    'AI Assistant Response'
                );
            }, 3000);
        }
    }

    /**
     * Analyze selected text
     */
    async analyzeSelection(data) {
        if (!this.agentletLoaded) {
            this.queueMessage({ type: 'ANALYZE_SELECTION', data });
            return;
        }

        if (window.agentlet?.utils?.WaitDialog && window.agentlet?.utils?.InfoDialog) {
            const WaitDialog = window.agentlet.utils.WaitDialog;
            const InfoDialog = window.agentlet.utils.InfoDialog;

            WaitDialog.showAnalyzing('Analyzing selected content...', false);

            // Simulate analysis (replace with actual AI analysis)
            setTimeout(() => {
                WaitDialog.hide();
                
                const analysis = this.performTextAnalysis(data.selectionText);
                
                InfoDialog.show({
                    title: 'Content Analysis',
                    message: `
                        <h4>Analysis Results</h4>
                        <p><strong>Selected Text:</strong> "${data.selectionText.substring(0, 100)}${data.selectionText.length > 100 ? '...' : ''}"</p>
                        <p><strong>Word Count:</strong> ${analysis.wordCount}</p>
                        <p><strong>Character Count:</strong> ${analysis.charCount}</p>
                        <p><strong>Estimated Reading Time:</strong> ${analysis.readingTime} minutes</p>
                        <p><strong>Detected Language:</strong> ${analysis.language}</p>
                        <p><strong>Sentiment:</strong> ${analysis.sentiment}</p>
                    `,
                    allowHtml: true,
                    icon: '🔍',
                    buttons: [
                        { text: 'Close', value: 'close', primary: true }
                    ]
                });
            }, 2000);
        }
    }

    /**
     * Perform basic text analysis
     */
    performTextAnalysis(text) {
        const words = text.split(/\s+/).length;
        const chars = text.length;
        const readingTime = Math.ceil(words / 200); // Average reading speed
        
        // Simple language detection (very basic)
        const language = /[а-яё]/i.test(text) ? 'Russian' : 
                        /[àâäéèêëîïôöùûüÿç]/i.test(text) ? 'French' :
                        /[äöüß]/i.test(text) ? 'German' : 'English';
        
        // Simple sentiment analysis (very basic)
        const positiveWords = ['good', 'great', 'excellent', 'amazing', 'wonderful', 'fantastic'];
        const negativeWords = ['bad', 'terrible', 'awful', 'horrible', 'disappointing'];
        
        const lowerText = text.toLowerCase();
        const positiveCount = positiveWords.filter(word => lowerText.includes(word)).length;
        const negativeCount = negativeWords.filter(word => lowerText.includes(word)).length;
        
        let sentiment = 'Neutral';
        if (positiveCount > negativeCount) sentiment = 'Positive';
        if (negativeCount > positiveCount) sentiment = 'Negative';
        
        return {
            wordCount: words,
            charCount: chars,
            readingTime: readingTime,
            language: language,
            sentiment: sentiment
        };
    }

    /**
     * Load a module using robust script injection
     */
    async loadModule(moduleCode, moduleUrl) {
        if (!this.agentletLoaded) {
            this.queueMessage({ type: 'LOAD_MODULE', moduleCode, moduleUrl });
            return;
        }

        try {
            // Try to use ScriptInjector via chrome.scripting first
            const response = await chrome.runtime.sendMessage({
                type: 'INJECT_SCRIPT',
                injectionId: `module_${Date.now()}`,
                options: {
                    code: `
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
                    `,
                    target: 'main'
                }
            });
            
            if (response && response.success) {
                console.log('Module loaded successfully via chrome.scripting:', moduleUrl);
                return;
            }
        } catch (error) {
            console.error('Failed to load module via chrome.scripting:', error);
        }

        // Fallback to direct injection
        try {
            const script = document.createElement('script');
            script.textContent = moduleCode;
            script.setAttribute('data-agentlet-module', moduleUrl);
            document.head.appendChild(script);
            console.log('Module loaded via DOM fallback:', moduleUrl);
        } catch (fallbackError) {
            console.error('Module loading failed completely:', fallbackError);
            throw fallbackError;
        }
    }


    /**
     * Handle settings changes
     */
    async handleSettingsChanged(newSettings) {
        if (!this.agentletLoaded) {
            return;
        }

        // Update Agentlet Core configuration
        if (window.agentlet) {
            // Apply theme changes
            if (newSettings.theme && window.agentlet.config) {
                window.agentlet.config.theme = newSettings.theme;
            }

            // Apply UI position changes
            if (newSettings.uiPosition && window.agentlet.config) {
                window.agentlet.config.uiPosition = newSettings.uiPosition;
                // Trigger UI refresh
                if (window.agentlet.ui?.refreshContent) {
                    window.agentlet.ui.refreshContent();
                }
            }

            console.log('Agentlet settings updated');
        }
    }

    /**
     * Queue message for later processing
     */
    queueMessage(message) {
        this.messageQueue.push(message);
    }

    /**
     * Process queued messages
     */
    async processMessageQueue() {
        while (this.messageQueue.length > 0) {
            const message = this.messageQueue.shift();
            try {
                await this.handleMessage(message, null, () => {});
            } catch (error) {
                console.error('Error processing queued message:', error);
            }
        }
    }

    /**
     * Notify background script of current state
     */
    notifyBackgroundOfState() {
        chrome.runtime.sendMessage({
            type: 'UPDATE_TAB_STATE',
            state: {
                agentletActive: this.agentletLoaded,
                timestamp: Date.now()
            }
        }).catch(error => {
            // Extension context might be invalidated
            console.log('Could not notify background script:', error.message);
        });
    }

    /**
     * Send event to background for logging
     */
    logEvent(eventType, data = {}) {
        chrome.runtime.sendMessage({
            type: 'LOG_EVENT',
            event: {
                type: eventType,
                data: data,
                timestamp: Date.now(),
                url: window.location.href
            }
        }).catch(error => {
            console.log('Could not log event:', error.message);
        });
    }
}

// Initialize content script
const agentletContentScript = new AgentletContentScript();

// Export for potential use by injected scripts
window.agentletExtension = agentletContentScript;