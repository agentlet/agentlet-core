/**
 * Agentlet Core - Background Service Worker
 * Handles extension lifecycle, tab management, and cross-tab communication
 */

class AgentletBackground {
    constructor() {
        this.tabStates = new Map();
        this.moduleRegistry = new Map();
        this.setupEventListeners();
        this.loadDefaultModules();
    }

    /**
     * Set up Chrome extension event listeners
     */
    setupEventListeners() {
        // Extension installation/startup
        chrome.runtime.onInstalled.addListener((details) => {
            this.handleInstallation(details);
        });

        chrome.runtime.onStartup.addListener(() => {
            console.log('Agentlet Core extension started');
        });

        // Tab events
        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            this.handleTabUpdate(tabId, changeInfo, tab);
        });

        chrome.tabs.onRemoved.addListener((tabId) => {
            this.handleTabRemoved(tabId);
        });

        // Action (popup) events
        chrome.action.onClicked.addListener((tab) => {
            this.toggleAgentletCore(tab);
        });

        // Command events (keyboard shortcuts)
        chrome.commands.onCommand.addListener((command, tab) => {
            this.handleCommand(command, tab);
        });

        // Message handling
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Keep message channel open for async responses
        });

        // Context menu events (if needed)
        chrome.contextMenus.onClicked.addListener((info, tab) => {
            this.handleContextMenu(info, tab);
        });

        // Storage events
        chrome.storage.onChanged.addListener((changes, namespace) => {
            this.handleStorageChanged(changes, namespace);
        });
    }

    /**
     * Handle extension installation
     */
    async handleInstallation(details) {
        console.log('Agentlet Core installed:', details.reason);

        if (details.reason === 'install') {
            // First-time installation
            await this.initializeDefaultSettings();
            await this.createContextMenus();
            
            // Note: Welcome page disabled to prevent access errors
            // chrome.tabs.create({
            //     url: chrome.runtime.getURL('welcome.html')
            // });
        } else if (details.reason === 'update') {
            // Extension update
            await this.handleUpdate(details.previousVersion);
        }
    }

    /**
     * Initialize default settings
     */
    async initializeDefaultSettings() {
        const defaultSettings = {
            enabled: true,
            autoActivate: true,
            uiPosition: 'right',
            theme: 'default',
            debugMode: false,
            moduleRegistry: [
                {
                    name: 'simple-test',
                    url: chrome.runtime.getURL('modules/simple-test-module.js'),
                    enabled: true,
                    builtin: true
                }
            ],
            trustedDomains: [],
            keyboardShortcuts: {
                toggle: 'Ctrl+Shift+A',
                activate: 'Ctrl+Shift+I'
            }
        };

        await chrome.storage.sync.set({ agentletSettings: defaultSettings });
        console.log('Default settings initialized');
    }

    /**
     * Create context menus
     */
    async createContextMenus() {
        chrome.contextMenus.removeAll(() => {
            chrome.contextMenus.create({
                id: 'agentlet-toggle',
                title: 'Toggle Agentlet Core',
                contexts: ['page', 'selection']
            });

            chrome.contextMenus.create({
                id: 'agentlet-analyze',
                title: 'Analyze with AI',
                contexts: ['page', 'selection']
            });

            chrome.contextMenus.create({
                type: 'separator',
                id: 'agentlet-separator',
                contexts: ['page']
            });

            chrome.contextMenus.create({
                id: 'agentlet-settings',
                title: 'Agentlet Settings',
                contexts: ['page']
            });
        });
    }

    /**
     * Handle tab updates
     */
    async handleTabUpdate(tabId, changeInfo, tab) {
        if (changeInfo.status === 'complete' && tab.url) {
            // Update tab state
            this.tabStates.set(tabId, {
                url: tab.url,
                title: tab.title,
                timestamp: Date.now(),
                agentletActive: false
            });

            // Check if auto-activate is enabled
            const settings = await this.getSettings();
            if (settings.enabled && settings.autoActivate) {
                await this.checkAndActivateModules(tab);
            }
        }
    }

    /**
     * Handle tab removal
     */
    handleTabRemoved(tabId) {
        this.tabStates.delete(tabId);
    }

    /**
     * Check and activate appropriate modules for a tab
     */
    async checkAndActivateModules(tab) {
        try {
            // Get available modules
            const settings = await this.getSettings();
            const enabledModules = settings.moduleRegistry.filter(m => m.enabled);

            if (enabledModules.length > 0) {
                // Send module information to content script
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'INIT_AGENTLET',
                    config: {
                        modules: enabledModules,
                        settings: settings,
                        extensionId: chrome.runtime.id
                    }
                });
            }
        } catch (error) {
            console.log('Tab not ready for Agentlet injection yet:', error.message);
        }
    }

    /**
     * Toggle Agentlet Core on a tab
     */
    async toggleAgentletCore(tab) {
        try {
            const tabState = this.tabStates.get(tab.id);
            const isActive = tabState?.agentletActive || false;

            if (isActive) {
                // Deactivate
                await chrome.tabs.sendMessage(tab.id, {
                    type: 'DEACTIVATE_AGENTLET'
                });
                
                if (tabState) {
                    tabState.agentletActive = false;
                }
            } else {
                // Activate
                await this.injectAgentletCore(tab);
            }
        } catch (error) {
            console.error('Failed to toggle Agentlet Core:', error);
            // Try injection if message failed
            await this.injectAgentletCore(tab);
        }
    }

    /**
     * Inject Agentlet Core into a tab
     */
    async injectAgentletCore(tab) {
        try {
            // Inject the core script
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['agentlet-core.js']
            });

            // Get settings and send initialization message
            const settings = await this.getSettings();
            const enabledModules = settings.moduleRegistry.filter(m => m.enabled);

            await chrome.tabs.sendMessage(tab.id, {
                type: 'INIT_AGENTLET',
                config: {
                    modules: enabledModules,
                    settings: settings,
                    extensionId: chrome.runtime.id
                }
            });

            // Update tab state
            const tabState = this.tabStates.get(tab.id) || {};
            tabState.agentletActive = true;
            this.tabStates.set(tab.id, tabState);

            console.log('Agentlet Core injected into tab:', tab.id);
        } catch (error) {
            console.error('Failed to inject Agentlet Core:', error);
        }
    }

    /**
     * Handle keyboard commands
     */
    async handleCommand(command, tab) {
        switch (command) {
            case 'toggle-agentlet':
                await this.toggleAgentletCore(tab);
                break;
            case 'activate-ai-assistant':
                await this.activateAIAssistant(tab);
                break;
        }
    }

    /**
     * Activate AI assistant
     */
    async activateAIAssistant(tab) {
        try {
            await chrome.tabs.sendMessage(tab.id, {
                type: 'ACTIVATE_AI_ASSISTANT'
            });
        } catch (error) {
            console.error('Failed to activate AI assistant:', error);
            // Try to inject first
            await this.injectAgentletCore(tab);
            setTimeout(async () => {
                try {
                    await chrome.tabs.sendMessage(tab.id, {
                        type: 'ACTIVATE_AI_ASSISTANT'
                    });
                } catch (e) {
                    console.error('Failed to activate AI assistant after injection:', e);
                }
            }, 1000);
        }
    }

    /**
     * Handle messages from content scripts and popup
     */
    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'GET_SETTINGS':
                    const settings = await this.getSettings();
                    sendResponse({ success: true, data: settings });
                    break;

                case 'UPDATE_SETTINGS':
                    await this.updateSettings(message.settings);
                    sendResponse({ success: true });
                    break;

                case 'GET_TAB_STATE':
                    const tabState = this.tabStates.get(sender.tab?.id);
                    sendResponse({ success: true, data: tabState });
                    break;

                case 'UPDATE_TAB_STATE':
                    this.updateTabState(sender.tab?.id, message.state);
                    sendResponse({ success: true });
                    break;

                case 'LOAD_MODULE':
                    const moduleResult = await this.loadModule(message.moduleUrl, sender.tab?.id);
                    sendResponse(moduleResult);
                    break;

                case 'GET_MODULE_REGISTRY':
                    const registry = await this.getModuleRegistry();
                    sendResponse({ success: true, data: registry });
                    break;

                case 'LOG_EVENT':
                    this.logEvent(message.event, sender.tab?.id);
                    sendResponse({ success: true });
                    break;

                case 'TOGGLE_AGENTLET':
                    const tab = await this.getTabById(message.tabId);
                    if (tab) {
                        await this.toggleAgentletCore(tab);
                        sendResponse({ success: true });
                    } else {
                        sendResponse({ success: false, error: 'Tab not found' });
                    }
                    break;

                case 'INJECT_SCRIPT':
                    const injectionResult = await this.handleScriptInjection(message, sender);
                    sendResponse(injectionResult);
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('Error handling message:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    /**
     * Handle context menu clicks
     */
    async handleContextMenu(info, tab) {
        switch (info.menuItemId) {
            case 'agentlet-toggle':
                await this.toggleAgentletCore(tab);
                break;
            case 'agentlet-analyze':
                await this.analyzeSelection(info, tab);
                break;
            case 'agentlet-settings':
                await chrome.tabs.create({
                    url: chrome.runtime.getURL('options.html')
                });
                break;
        }
    }

    /**
     * Analyze selected content with AI
     */
    async analyzeSelection(info, tab) {
        try {
            await chrome.tabs.sendMessage(tab.id, {
                type: 'ANALYZE_SELECTION',
                data: {
                    selectionText: info.selectionText,
                    pageUrl: info.pageUrl
                }
            });
        } catch (error) {
            console.error('Failed to analyze selection:', error);
        }
    }

    /**
     * Handle storage changes
     */
    handleStorageChanged(changes, namespace) {
        if (namespace === 'sync' && changes.agentletSettings) {
            console.log('Agentlet settings changed');
            // Notify all active tabs about settings change
            this.broadcastToAllTabs({
                type: 'SETTINGS_CHANGED',
                settings: changes.agentletSettings.newValue
            });
        }
    }

    /**
     * Broadcast message to all tabs with Agentlet active
     */
    async broadcastToAllTabs(message) {
        const activeTabs = Array.from(this.tabStates.entries())
            .filter(([_, state]) => state.agentletActive)
            .map(([tabId, _]) => tabId);

        for (const tabId of activeTabs) {
            try {
                await chrome.tabs.sendMessage(tabId, message);
            } catch (error) {
                // Tab might be closed or not responsive
                this.tabStates.delete(tabId);
            }
        }
    }

    /**
     * Get current settings
     */
    async getSettings() {
        const result = await chrome.storage.sync.get(['agentletSettings']);
        return result.agentletSettings || {};
    }

    /**
     * Update settings
     */
    async updateSettings(newSettings) {
        const currentSettings = await this.getSettings();
        const updatedSettings = { ...currentSettings, ...newSettings };
        await chrome.storage.sync.set({ agentletSettings: updatedSettings });
        return updatedSettings;
    }

    /**
     * Update tab state
     */
    updateTabState(tabId, stateUpdate) {
        if (tabId) {
            const currentState = this.tabStates.get(tabId) || {};
            this.tabStates.set(tabId, { ...currentState, ...stateUpdate });
        }
    }

    /**
     * Get tab by ID
     */
    async getTabById(tabId) {
        try {
            return await chrome.tabs.get(tabId);
        } catch (error) {
            console.error('Failed to get tab:', error);
            return null;
        }
    }

    /**
     * Load default modules
     */
    async loadDefaultModules() {
        // Register built-in modules
        this.moduleRegistry.set('simple-test', {
            name: 'simple-test',
            url: chrome.runtime.getURL('modules/simple-test-module.js'),
            builtin: true,
            patterns: ['localhost', '127.0.0.1', 'file://']
        });
    }

    /**
     * Load a module
     */
    async loadModule(moduleUrl, tabId) {
        try {
            // Fetch module content
            const response = await fetch(moduleUrl);
            if (!response.ok) {
                throw new Error(`Failed to fetch module: ${response.status}`);
            }

            const moduleCode = await response.text();
            
            // Send module to content script for loading
            await chrome.tabs.sendMessage(tabId, {
                type: 'LOAD_MODULE',
                moduleCode: moduleCode,
                moduleUrl: moduleUrl
            });

            return { success: true };
        } catch (error) {
            console.error('Failed to load module:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get module registry
     */
    async getModuleRegistry() {
        const settings = await this.getSettings();
        return settings.moduleRegistry || [];
    }

    /**
     * Log events for analytics/debugging
     */
    logEvent(event, tabId) {
        console.log('Agentlet Event:', event, 'Tab:', tabId);
        // Could extend this to send to analytics service
    }

    /**
     * Handle extension updates
     */
    async handleUpdate(previousVersion) {
        console.log(`Agentlet Core updated from ${previousVersion} to ${chrome.runtime.getManifest().version}`);
        
        // Perform any necessary migration
        const settings = await this.getSettings();
        
        // Example: Add new default modules or settings
        if (!settings.moduleRegistry) {
            settings.moduleRegistry = [];
        }
        
        await this.updateSettings(settings);
    }

    /**
     * Handle script injection requests from content scripts
     */
    async handleScriptInjection(message, sender) {
        try {
            const { injectionId, options } = message;
            const tabId = sender.tab?.id;

            if (!tabId) {
                throw new Error('No tab ID available for script injection');
            }

            // Import ScriptInjector if not already loaded
            if (!this.scriptInjector) {
                // Create a simple injection wrapper since we can't import the full class in background
                this.scriptInjector = {
                    async inject(opts) {
                        const executeOptions = {
                            target: { 
                                tabId: opts.tabId,
                                allFrames: opts.allFrames || false 
                            },
                            world: opts.target === 'isolated' ? 'ISOLATED' : 'MAIN'
                        };

                        if (opts.func) {
                            executeOptions.func = opts.func;
                            executeOptions.args = opts.args || [];
                        } else if (opts.file) {
                            executeOptions.files = [opts.file];
                        } else if (opts.code) {
                            // For code injection, we need to create a function that executes the code
                            executeOptions.func = new Function(opts.code);
                        }

                        const results = await chrome.scripting.executeScript(executeOptions);
                        return results[0]?.result;
                    }
                };
            }

            // Execute script injection
            const result = await this.scriptInjector.inject({
                ...options,
                tabId
            });

            return {
                success: true,
                injectionId,
                result
            };

        } catch (error) {
            console.error('Script injection failed:', error);
            return {
                success: false,
                injectionId: message.injectionId,
                error: error.message
            };
        }
    }
}

// Initialize background service
new AgentletBackground();