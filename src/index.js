/**
 * Agentlet Core - Enhanced AI-powered bookmarklet system
 * Main application entry point with plugin architecture
 */

import ModuleRegistry from './core/ModuleRegistry.js';
import ModuleManager from './core/ModuleManager.js';
import Module from './core/Module.js';
import ElementSelector from './utils/ui/ElementSelector.js';
import Dialog from './utils/ui/Dialog.js';
import MessageBubble from './utils/ui/MessageBubble.js';
import ScreenCapture from './utils/ui/ScreenCapture.js';
import ScriptInjector from './utils/system/ScriptInjector.js';
import { LocalStorageEnvironmentVariablesManager } from './utils/config-persistence/EnvManager.js';
import CookieManager from './utils/config-persistence/CookieManager.js';
import StorageManager from './utils/config-persistence/StorageManager.js';
import { Z_INDEX, createZIndexConstants, detectMaxZIndex, suggestAgentletZIndexBase, analyzeZIndexDistribution } from './utils/ui/ZIndex.js';
import AuthManager from './utils/system/AuthManager.js';
import FormExtractor from './utils/data-processing/FormExtractor.js';
import FormFiller from './utils/data-processing/FormFiller.js';
import TableExtractor from './utils/data-processing/TableExtractor.js';
import AIManager from './utils/ai/AIProvider.js';
import PageHighlighter from './utils/ui/PageHighlighter.js';
import PDFProcessor from './utils/ai/PDFProcessor.js';
import ShortcutManager from './utils/ui/ShortcutManager.js';
import { LibrarySetup } from './libraries/LibrarySetup.js';
import { ThemeManager } from './core/ThemeManager.js';
import { EventBus } from './core/EventBus.js';
import { StyleInjector } from './ui/StyleInjector.js';
import { UIManager } from './ui/UIManager.js';
import { PanelManager } from './ui/PanelManager.js';
import { GlobalAPI } from './core/GlobalAPI.js';

// Import external libraries (jQuery removed)
import * as XLSX from 'xlsx';
import html2canvas from 'html2canvas';
import * as pdfjsLib from 'pdfjs-dist';
import hotkeys from 'hotkeys-js';

/**
 * Main Agentlet Core application class
 */
class AgentletCore {
    constructor(config = {}) {
        this.initialized = false;
        
        // Configuration
        this.config = {
            enablePlugins: config.enablePlugins !== false,
            moduleRegistry: config.moduleRegistry || [],
            registryUrl: config.registryUrl,
            debugMode: config.debugMode || false,
            minimizeWithImage: config.minimizeWithImage || null, // URL of image to show when minimized
            startMinimized: config.startMinimized || false, // Start in minimized state
            showEnvVarsButton: config.showEnvVarsButton || false, // Show environment variables button
            showSettingsButton: config.showSettingsButton !== false, // Show settings button
            showHelpButton: config.showHelpButton !== false, // Show help button
            envManager: config.envManager, // Custom EnvironmentVariablesManager instance or null to disable
            resizablePanel: config.resizablePanel !== false, // Enable panel resizing
            minimumPanelWidth: config.minimumPanelWidth || 320, // Minimum panel width in pixels
            ...config
        };
        
        // Event system
        this.eventBus = new EventBus(this.config.debugMode);
        
        // Initialize environment manager
        this.envManager = this.initializeEnvManager();

        // Load environment variables from config if provided
        if (config.env && this.envManager) {
            this.envManager.loadFromObject(config.env, true);
        }

        // Initialize cookie manager
        this.cookieManager = new CookieManager();

        // Initialize storage manager
        this.storageManager = new StorageManager();

        // Initialize authentication manager
        this.authManager = new AuthManager(config.auth || {});

        // Initialize form extractor and filler
        this.formExtractor = new FormExtractor();
        this.formFiller = new FormFiller(); // Uses native DOM methods
        
        // Initialize table extractor
        this.tableExtractor = new TableExtractor(this.librarySetup);
        
        // Initialize AI manager
        this.aiManager = new AIManager(this.envManager, this.librarySetup);
        
        // Initialize shortcut manager
        this.shortcutManager = new ShortcutManager(this.librarySetup);

        // Initialize library setup
        this.librarySetup = new LibrarySetup(this.config);

        // UI references (must be initialized before UIManager)
        this.ui = {
            container: null,
            content: null,
            header: null,
            actions: null,
            imageOverlay: null
        };
        
        // UI state (synchronized with UIManager)
        this.isMinimized = false;

        // Initialize theme manager
        this.themeManager = new ThemeManager(this.config);

        // Initialize style injector
        this.styleInjector = new StyleInjector(this.themeManager);

        // Initialize UI manager
        this.uiManager = new UIManager(this);

        // Initialize panel manager
        this.panelManager = new PanelManager(this);

        // Initialize global API manager
        this.globalAPI = new GlobalAPI(this);

        // Initialize module registry with configuration
        this.moduleRegistry = new ModuleRegistry({
            eventBus: this.eventBus,
            registryUrl: this.config.registryUrl,
            skipRegistryModuleRegistration: this.config.skipRegistryModuleRegistration
        });

        // Initialize centralized module manager
        this.moduleManager = new ModuleManager(this.moduleRegistry);
        this.moduleManager.initialize();
        
        // UI management (delegated to UIManager)
        
        // Performance tracking
        this.performanceMetrics = {
            initTime: 0,
            moduleLoadTime: 0,
            uiRenderTime: 0
        };
        
        // Set up global access (preserve UI references)
        const originalUIReferences = this.ui; // Backup DOM references
        this.globalAPI.setupGlobalAccess();
        // Merge original DOM references with the API methods added by setupGlobalAccess
        Object.assign(window.agentlet.ui, originalUIReferences);
        
        console.log('AgentletCore 📎 initialized with config:', this.config);
    }

    /**
     * Initialize environment manager based on configuration
     * @returns {BaseEnvironmentVariablesManager|null} Environment manager instance or null if disabled
     */
    initializeEnvManager() {
        // If explicitly set to null, disable environment variables
        if (this.config.envManager === null) {
            console.log('🔧 Environment variables disabled');
            return null;
        }
        
        // If a custom instance is provided, use it
        if (this.config.envManager && typeof this.config.envManager === 'object') {
            console.log('🔧 Using custom EnvironmentVariablesManager instance');
            return this.config.envManager;
        }
        
        // Use default LocalStorageEnvironmentVariablesManager
        console.log('🔧 Using default LocalStorageEnvironmentVariablesManager');
        return new LocalStorageEnvironmentVariablesManager();
    }

    /**
     * Load and parse the agentlets registry (single download for both libraries and modules)
     */
    async loadRegistry() {
        try {
            console.log(`📚 Loading agentlets registry from: ${this.config.registryUrl}`);

            const response = await fetch(this.config.registryUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const registryData = await response.json();

            // Extract base URL from registry URL for relative library paths
            let baseUrl;
            try {
                // Handle absolute URLs
                const registryUrl = new URL(this.config.registryUrl);
                baseUrl = registryUrl.origin + registryUrl.pathname.replace(/[^\/]+$/, '');
            } catch (error) {
                // Handle relative URLs - use current page location as base
                const currentLocation = window.location.href;
                const registryUrl = new URL(this.config.registryUrl, currentLocation);
                baseUrl = registryUrl.origin + registryUrl.pathname.replace(/[^\/]+$/, '');
            }

            // Add base URL to registry data
            registryData.baseUrl = baseUrl;

            console.log('📚 Registry loaded successfully');
            console.log('📚 Available libraries:', Object.keys(registryData.libraries || {}));
            return registryData;

        } catch (error) {
            console.error('📚 Failed to load registry:', error);
            console.warn('📚 External libraries and modules may not load correctly');
            return null;
        }
    }

    /**
     * Main initialization method
     */
    async init() {
        if (this.initialized) {
            console.warn('AgentletCore already initialized');
            return;
        }
        
        const startTime = performance.now();
        
        try {
            console.log('🚀 Initializing Agentlet Core 📎...');
            
            // Load registry if registryUrl is provided
            let registryData = null;
            if (this.config.registryUrl) {
                registryData = await this.loadRegistry();
            }

            // Initialize library system with registry data (if any)
            if (registryData && registryData.libraries) {
                this.librarySetup.initializeRegistryLoader(registryData);
            }
            
            // Set up all libraries
            this.librarySetup.initializeAll(
                { XLSX, html2canvas, pdfjsLib, hotkeys },
                this.shortcutManager
            );
            
            // Set up event listeners
            this.setupEventListeners();
            
            const uiStartTime = performance.now();

            // Inject styles first before creating UI elements
            this.styleInjector.injectStyles();

            this.setupBaseUI(); // Call our delegation method to maintain compatibility
            this.performanceMetrics.uiRenderTime = performance.now() - uiStartTime;

            // Set up module change callback AFTER UI is ready but BEFORE modules are initialized
            this.moduleRegistry.setModuleChangeCallback((activeModule) => {
                this.onModuleChange(activeModule);
            });

            // Initialize module registry with shared registry data
            const moduleStartTime = performance.now();
            if (registryData) {
                await this.moduleRegistry.initializeWithRegistry(registryData);
            } else {
                await this.moduleRegistry.initialize();
            }
            this.performanceMetrics.moduleLoadTime = performance.now() - moduleStartTime;

            // Set up storage change listener
            this.setupLocalStorageListener();
            
            // Load environment variables from storage
            if (this.envManager) {
                this.envManager.loadFromStorage();
            }
            
            // Manual refresh to catch modules that were registered early
            this.updateApplicationDisplay();
            this.updateModuleContent();
            
            // Register default keyboard shortcuts
            if (this.shortcutManager) {
                await this.shortcutManager.registerDefaultShortcuts();
            }
            
            this.performanceMetrics.initTime = performance.now() - startTime;
            this.initialized = true;
            
            this.eventBus.emit('core:initialized', {
                metrics: this.performanceMetrics,
                config: this.config
            });
            
            console.log(`✅ Agentlet Core 📎 initialized successfully in ${this.performanceMetrics.initTime.toFixed(2)}ms`);
            console.log(`📊 Performance: UI=${this.performanceMetrics.uiRenderTime.toFixed(2)}ms, Modules=${this.performanceMetrics.moduleLoadTime.toFixed(2)}ms`);
            
        } catch (error) {
            console.error('❌ Failed to initialize Agentlet Core:', error);
            this.eventBus.emit('core:initializationFailed', { error: error.message });
            throw error;
        }
    }

    /**
     * Set up event listeners for core events
     */
    setupEventListeners() {
        // Module events
        this.eventBus.on('module:registered', (data) => {
            // Update display without duplicate logging (ModuleRegistry already logs)
            this.updateApplicationDisplay();
        });

        this.eventBus.on('module:activated', (data) => {
            // Update display without duplicate logging (ModuleRegistry already logs)
            this.updateApplicationDisplay();
        });

        this.eventBus.on('module:deactivated', (data) => {
            // Update display without duplicate logging (ModuleRegistry already logs)
            this.updateApplicationDisplay();
        });
        
        this.eventBus.on('application:detected', (data) => {
            console.log(`🎯 Application detected: ${data.module} for ${data.url}`);
        });
        
        this.eventBus.on('application:notDetected', (data) => {
            console.log(`❓ No application detected for: ${data.url}`);
        });
        
        // Error handling
        this.eventBus.on('module:registrationFailed', (data) => {
            console.error(`❌ Module registration failed: ${data.module} - ${data.error}`);
            this.showError(`Failed to load module: ${data.module}`);
        });
        
        // URL change events
        this.eventBus.on('url:changed', (data) => {
            console.log(`🔄 URL changed: ${data.oldUrl} → ${data.newUrl}`);
            this.updateApplicationDisplay();
        });
    }

    /**
     * Handle module change
     */
    onModuleChange(activeModule) {
        console.log('onModuleChange', activeModule);
        // TODO: check if issue with activeModule not being yet the moduleLoader.activeModule
        this.updateApplicationDisplay();
        this.updateModuleContent();
        
        // Restore panel width for the module if env vars are available
        this.panelManager.restorePanelWidthForModule(activeModule);
        
        // Set up submodule change callback for the active module
        if (activeModule && typeof activeModule.setSubmoduleChangeCallback === 'function') {
            activeModule.setSubmoduleChangeCallback(() => {
                this.updateApplicationDisplay();
                this.updateModuleContent();
            });
        }
        
        this.eventBus.emit('core:moduleChanged', {
            module: activeModule?.name || null,
            metadata: activeModule?.getMetadata() || null
        });
    }



    /**
     * Create resize handle for the panel
     */



    /**
     * Create discrete close button for actions area
     */
    createDiscreteCloseButton() {
        const closeButton = document.createElement('button');
        closeButton.className = 'agentlet-action-btn agentlet-action-btn--close';
        closeButton.id = 'agentlet-close-btn';
        closeButton.innerHTML = '×';
        closeButton.title = 'Close Agentlet';
        
        // Click handler to cleanup and close
        closeButton.addEventListener('click', () => {
            this.cleanup();
        });
        
        return closeButton;
    }


    /**
     * Create actions area
     */

    /**
     * Create action button
     */
    createActionButton(icon, title, onClick) {
        const button = document.createElement('button');
        button.className = 'agentlet-action-btn';
        button.title = title;
        button.innerHTML = icon;
        button.onclick = onClick;
        
        return button;
    }


    /**
     * Toggle UI collapse/expand
     */

    /**
     * Show image overlay when minimized
     */

    /**
     * Hide image overlay
     */

    /**
     * Ensure image overlay is shown if minimizeWithImage is configured
     */

    /**
     * Update application display
     */
    updateApplicationDisplay() {
        const appNameElement = document.getElementById('agentlet-app-display');
        const moduleCountElement = document.getElementById('agentlet-module-count');
        
        // Use provided activeModule parameter, fallback to moduleLoader's activeModule
        const activeModule = this.moduleRegistry.activeModule;
        
        if (appNameElement && activeModule) {
            // Check if module has a custom title
            if (activeModule.getPanelTitle && typeof activeModule.getPanelTitle === 'function') {
                const customTitle = activeModule.getPanelTitle();
                if (customTitle) {
                    appNameElement.innerHTML = `<strong>Agentlet:</strong> <span id="agentlet-app-name">${customTitle}</span>`;
                } else {
                    // Fallback to default behavior
                    const appName = activeModule.name;
                    const displayText = appName.charAt(0).toUpperCase() + appName.slice(1);            
                    appNameElement.innerHTML = `<strong>Agentlet:</strong> <span id="agentlet-app-name">${displayText}</span>`;
                }
            } else {
                // Default behavior
                const appName = activeModule.name;
                const displayText = appName.charAt(0).toUpperCase() + appName.slice(1);            
                appNameElement.innerHTML = `<strong>Agentlet:</strong> <span id="agentlet-app-name">${displayText}</span>`;
            }
        } else if (appNameElement) {
            appNameElement.innerHTML = '<strong>Agentlet:</strong> <span id="agentlet-app-name">No application detected</span>';
        }
        
        // Status indicator removed for cleaner interface
    }

    /**
     * Update module content
     */
    updateModuleContent() {
        const content = this.ui.content;
        if (!content) return;

        // Clear existing content
        content.innerHTML = '';

        const activeModule = this.moduleRegistry.activeModule;

        if (activeModule) {
            try {
                // Use the module's getContent method
                if (typeof activeModule.getContent === 'function') {
                    const moduleContent = activeModule.getContent();
                    content.innerHTML = moduleContent;
                } else {
                    // Fallback content
                    content.innerHTML = `
                        <div class="agentlet-module-placeholder">
                            <h3>${activeModule.name}</h3>
                            <p>Module loaded for: ${window.location.href}</p>
                        </div>
                    `;
                }
            } catch (error) {
                console.error('Error rendering module content:', error);
                content.innerHTML = `
                    <div class="agentlet-error">
                        <h3>Content Error</h3>
                        <p>Failed to render module content</p>
                    </div>
                `;
            }
        } else {
            // No active module
            content.innerHTML = `
                <div class="agentlet-welcome">
                    <h3>Agentlet</h3>
                    <p>No application-specific module detected for this page.</p>
                    <p>Available modules: ${this.moduleRegistry.modules.size}</p>
                </div>
            `;
        }
        
        this.eventBus.emit('ui:contentUpdated', {
            module: activeModule?.name || null
        });
    }

    /**
     * Enhanced localStorage monitoring
     */
    setupLocalStorageListener() {
        // Listen for storage events (changes from other tabs/windows)
        window.addEventListener('storage', (event) => {
            this.handleLocalStorageChange(event.key, event.newValue);
        });
        
        // Override localStorage methods for same-tab detection
        const originalSetItem = localStorage.setItem;
        const originalRemoveItem = localStorage.removeItem;
        const originalClear = localStorage.clear;
        
        localStorage.setItem = (key, value) => {
            originalSetItem.call(localStorage, key, value);
            this.handleLocalStorageChange(key, value);
        };
        
        localStorage.removeItem = (key) => {
            originalRemoveItem.call(localStorage, key);
            this.handleLocalStorageChange(key, null);
        };
        
        localStorage.clear = () => {
            originalClear.call(localStorage);
            this.handleLocalStorageChange(null, null);
        };
        
        console.log('📦 localStorage monitoring enabled');
    }

    /**
     * Handle localStorage changes
     */
    handleLocalStorageChange(key, newValue) {
        console.log(`📦 localStorage changed: ${key} = ${newValue}`);
        
        this.eventBus.emit('localStorage:changed', { key, newValue });
        
        // Update application display and module content
        this.updateApplicationDisplay();
        this.updateModuleContent();
        
        // Notify active module if it requested notifications
        if (this.moduleRegistry.activeModule) {
            if (this.moduleRegistry.activeModule.requiresLocalStorageChangeNotification 
                && typeof this.moduleRegistry.activeModule.onLocalStorageChange === 'function') {
                console.log(`📦 Notifying module ${this.moduleRegistry.activeModule.name} about localStorage change`);
                this.moduleRegistry.activeModule.onLocalStorageChange(key, newValue);
            }
        }
    }

    /**
     * Action handlers
     */
    refreshContent() {
        console.log('🔄 Refreshing content');
        this.updateApplicationDisplay();
        this.updateModuleContent();
    }

    showSettings() {
        console.log('⚙️ Settings requested');
        
        // Check if active module has custom settings handler
        if (this.moduleRegistry.activeModule && typeof this.moduleRegistry.activeModule.showSettings === 'function') {
            console.log(`📦 Using module settings: ${this.moduleRegistry.activeModule.name}`);
            this.moduleRegistry.activeModule.showSettings();
            return;
        }
        
        // Default settings implementation
        const Dialog = window.agentlet?.utils?.Dialog;
        if (Dialog) {
            Dialog.show('info', {
                title: 'Agentlet Settings',
                icon: '',
                message: `
                    <h4>Configuration</h4>
                    <p><strong>Theme:</strong> ${this.themeManager.getTheme().primaryColor}</p>
                    <p><strong>Modules loaded:</strong> ${this.moduleRegistry.modules.size}</p>
                    <p><strong>Debug mode:</strong> ${this.config.debugMode ? 'Enabled' : 'Disabled'}</p>
                    
                    <h4>Performance</h4>
                    <p><strong>Init time:</strong> ${this.performanceMetrics.initTime.toFixed(2)}ms</p>
                    <p><strong>UI render time:</strong> ${this.performanceMetrics.uiRenderTime.toFixed(2)}ms</p>
                    <p><strong>Module load time:</strong> ${this.performanceMetrics.moduleLoadTime.toFixed(2)}ms</p>
                    
                    <h4>AI Configuration</h4>
                    <p><strong>Status:</strong> ${this.aiManager.isAvailable() ? '✅ Available' : '❌ Not configured'}</p>
                    <p><strong>Current provider:</strong> ${this.aiManager.getStatus().currentProvider || 'None'}</p>
                    <p><strong>Available providers:</strong> ${this.aiManager.getAvailableProviders().join(', ') || 'None'}</p>
                    
                    <h4>Active Module</h4>
                    <p><strong>Current:</strong> ${this.moduleRegistry.activeModule?.name || 'None'}</p>
                    <p><strong>URL:</strong> ${window.location.href}</p>
                `,
                allowHtml: true,
                buttons: [
                    { text: 'Close', value: 'close', secondary: true },
                    { text: 'Refresh', value: 'refresh', primary: true, icon: '🔄' }
                ]
            }, (result) => {
                if (result === 'refresh') {
                    this.refreshContent();
                    InfoDialog.success('Settings refreshed!', 'Updated');
                }
            });
        } else {
            // Fallback to simple modal
            this.showModal('Settings', 'Settings UI coming soon...');
        }
    }

    showHelp() {
        console.log('❓ Help requested');
        
        // Check if active module has custom help handler
        if (this.moduleRegistry.activeModule && typeof this.moduleRegistry.activeModule.showHelp === 'function') {
            console.log(`📦 Using module help: ${this.moduleRegistry.activeModule.name}`);
            this.moduleRegistry.activeModule.showHelp();
            return;
        }
        
        // Default help implementation
        const Dialog = window.agentlet?.utils?.Dialog;
        if (Dialog) {
            Dialog.show('info', {
                title: 'Agentlet Help',
                icon: '',
                message: `
                    <h4>About Agentlet</h4>
                    <p><strong>Version:</strong> 1.0.0</p>
                    <p><strong>Modules loaded:</strong> ${this.moduleRegistry.modules.size}</p>
                    <p><strong>Active module:</strong> ${this.moduleRegistry.activeModule?.name || 'None'}</p>
                    
                    <h4>Core Features</h4>
                    <ul>
                        <li>🎯 <strong>Module System:</strong> Dynamic loading and activation</li>
                        <li>🎨 <strong>Theming:</strong> Customizable appearance</li>
                        <li>📊 <strong>Performance:</strong> Real-time metrics</li>
                        <li>🔧 <strong>Debugging:</strong> Developer tools</li>
                    </ul>
                    
                    <h4>Debug Commands (Console)</h4>
                    <ul>
                        <li><code>agentlet.debug.getMetrics()</code> - Performance metrics</li>
                        <li><code>agentlet.debug.getStatistics()</code> - Module statistics</li>
                        <li><code>agentlet.modules.getAll()</code> - List all modules</li>
                        <li><code>agentlet.ui.regenerateStyles()</code> - Update theme</li>
                    </ul>
                    
                    <h4>Module Development</h4>
                    <p>Create modules that extend <code>BaseModule</code> and implement:</p>
                    <ul>
                        <li><code>checkPattern(url)</code> - URL matching</li>
                        <li><code>init()</code> - Module initialization</li>
                        <li><code>getContent()</code> - UI content</li>
                        <li><code>cleanup()</code> - Module cleanup</li>
                        <li><code>showSettings()</code> - Custom settings dialog</li>
                        <li><code>showHelp()</code> - Custom help dialog</li>
                    </ul>
                `,
                allowHtml: true,
                buttons: [
                    { text: 'Close', value: 'close', secondary: true },
                    { text: 'Debug Info', value: 'debug', primary: true, icon: '🔧' }
                ]
            }, (result) => {
                if (result === 'debug') {
                    // Show debug information
                    const debugInfo = {
                        metrics: this.getPerformanceMetrics(),
                        config: this.config,
                        statistics: this.moduleRegistry.getStatistics()
                    };
                    
                    Dialog.show('info', {
                        title: 'Debug Information',
                        message: `
                            <h4>Performance Metrics</h4>
                            <pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 11px; overflow-x: auto;">${JSON.stringify(debugInfo.metrics, null, 2)}</pre>
                            
                            <h4>Configuration</h4>
                            <pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 11px; overflow-x: auto;">${JSON.stringify(debugInfo.config, null, 2)}</pre>
                            
                            <h4>Module Statistics</h4>
                            <pre style="background: #f8f9fa; padding: 10px; border-radius: 4px; font-size: 11px; overflow-x: auto;">${JSON.stringify(debugInfo.statistics, null, 2)}</pre>
                        `,
                        icon: '🔧',
                        allowHtml: true,
                        buttons: [
                            { text: 'Close', value: 'close', secondary: true },
                            { text: 'Copy to Console', value: 'copy', primary: true, icon: '📋' }
                        ]
                    }, (debugResult) => {
                        if (debugResult === 'copy') {
                            console.log('Agentlet Debug Info 📎:', debugInfo);
                            InfoDialog.success('Debug info copied to console!', 'Copied');
                        }
                    });
                }
            });
        } else {
            // Fallback to simple modal
            const helpContent = `
                <h3>Agentlet 📎 help</h3>
                <p><strong>Version:</strong> 1.0.0</p>
                <p><strong>Modules loaded:</strong> ${this.moduleRegistry.modules.size}</p>
                <p><strong>Active module:</strong> ${this.moduleRegistry.activeModule?.name || 'None'}</p>
                <hr>
                <p><strong>Debug commands (console):</strong></p>
                <ul>
                    <li><code>agentlet.debug.getMetrics()</code> - Performance metrics</li>
                    <li><code>agentlet.debug.getStatistics()</code> - Module statistics</li>
                    <li><code>agentlet.modules.getAll()</code> - List all modules</li>
                </ul>
            `;
            this.showModal('Help', helpContent);
        }
    }

    /**
     * Show modal dialog
     */
    showModal(title, content) {
        // Simple modal implementation
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: ${Z_INDEX.MODAL_BACKDROP};
            display: flex;
            align-items: center;
            justify-content: center;
        `;
        
        const dialog = document.createElement('div');
        dialog.style.cssText = `
            background: white;
            padding: 20px;
            border-radius: 8px;
            max-width: 400px;
            max-height: 600px;
            overflow-y: auto;
            position: relative;
        `;
        
        dialog.innerHTML = `
            <h3 style="margin-top: 0;">${title}</h3>
            <div>${content}</div>
            <button onclick="this.closest('.modal').remove()" style="
                position: absolute;
                top: 10px;
                right: 10px;
                background: none;
                border: none;
                font-size: 18px;
                cursor: pointer;
            ">×</button>
            <button onclick="this.closest('.modal').remove()" style="
                margin-top: 15px;
                padding: 8px 16px;
                background: #007bff;
                color: white;
                border: none;
                border-radius: 4px;
                cursor: pointer;
            ">Close</button>
        `;
        
        modal.className = 'modal';
        modal.appendChild(dialog);
        document.body.appendChild(modal);
        
        // Close on background click
        modal.onclick = (e) => {
            if (e.target === modal) {
                modal.remove();
            }
        };
    }

    /**
     * Show error message
     */
    showError(message) {
        console.error('❌', message);
        // Could show a toast notification or update UI
        this.eventBus.emit('ui:error', { message });
    }

    /**
     * Regenerate styles with updated theme
     */
    regenerateStyles() {
        this.styleInjector.regenerateStyles();
        this.eventBus.emit('ui:stylesRegenerated');
    }

    /**
     * Show the UI (delegate to UIManager)
     */
    show() {
        if (this.uiManager) {
            this.uiManager.show();
        }
    }

    /**
     * Hide the UI (delegate to UIManager)
     */
    hide() {
        if (this.uiManager) {
            this.uiManager.hide();
        }
    }

    /**
     * Minimize the UI (delegate to UIManager)
     */
    minimize() {
        if (this.uiManager) {
            this.uiManager.minimize();
        }
    }

    /**
     * Maximize the UI (delegate to UIManager)
     */
    maximize() {
        if (this.uiManager) {
            this.uiManager.maximize();
        }
    }

    /**
     * Setup base UI (delegate to UIManager) - kept for compatibility
     */
    setupBaseUI() {
        if (this.uiManager) {
            return this.uiManager.setupBaseUI();
        }
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return {
            core: this.performanceMetrics,
            moduleRegistry: this.moduleRegistry.getStatistics(),
            modules: Array.from(this.moduleRegistry.modules.values()).map(module => ({
                name: module.name,
                metrics: module.performanceMetrics || {}
            }))
        };
    }




    /**
     * Cleanup method
     */
    async cleanup() {
        try {
            // Cleanup module registry
            if (this.moduleRegistry) {
                await this.moduleRegistry.cleanup();
            }
            
            // Cleanup managers
            if (this.cookieManager) {
                this.cookieManager.cleanup();
            }
            
            if (this.storageManager) {
                this.storageManager.cleanup();
            }
            
            // Cleanup authentication manager
            if (this.authManager) {
                this.authManager.cleanup();
            }
            
            // Cleanup shortcut manager
            if (this.shortcutManager) {
                this.shortcutManager.clear();
            }
            
            // Remove UI
            const container = this.ui.container;
            
            if (container) container.remove();
            const toggleButton = document.getElementById('agentlet-toggle');
            if (toggleButton) toggleButton.remove();
            const coreStyles = document.getElementById('agentlet-core-styles');
            if (coreStyles) coreStyles.remove();
            
            // Remove image overlay if present
            this.hideImageOverlay();
            
            // Reset initialization flag
            this.initialized = false;
            
            // Clear module loading flags to allow re-registration
            delete window.AgentletDesignerLoaded;
            
            // Clear global access
            delete window.agentlet;
            
            this.eventBus.emit('core:cleanup');
            console.log('🧹 Agentlet Core 📎 cleaned up');
            
        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    /**
     * Show environment variables dialog
     */
    showEnvVarsDialog() {
        console.log('🔧 Environment variables dialog requested');
        
        if (!this.envManager) {
            console.warn('Environment variables manager not available');
            this.showModal('Environment Variables', 'Environment variables are disabled');
            return;
        }
        
        const Dialog = window.agentlet?.utils?.Dialog;
        if (!Dialog) {
            this.showModal('Environment Variables', 'Environment variables UI not available');
            return;
        }
        
        const varsList = this.generateEnvVarsListHTML();
        
        // Get storage type for header using the mandatory name() method
        const storageType = this.envManager.name();
        
        const content = `
            <div class="env-vars-container">
                <div class="env-vars-list">
                    ${varsList}
                </div>
                <div class="storage-info" style="text-align: center; padding: 10px; color: #666; font-size: 12px;">
                    stored in ${storageType}
                </div>
            </div>
            
            <style>
                .env-vars-container { 
                    width: 100%;
                    max-width: none;
                    margin: 0;
                    padding: 0;
                    height: 100%;
                    display: flex;
                    flex-direction: column;
                }
                .env-vars-list { 
                    max-height: 50vh; 
                    overflow-y: auto; 
                    margin: 0px; 
                    flex: 1;
                }
                .env-var-item { 
                    display: grid;
                    grid-template-columns: 1fr 2fr auto;
                    gap: 15px;
                    align-items: center; 
                    padding: 12px 16px; 
                    border: 1px solid #e0e0e0; 
                    margin: 8px 0; 
                    border-radius: 8px; 
                    background: white;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                    transition: box-shadow 0.2s, transform 0.2s;
                    font-size: 13px;
                }
                .env-var-item:hover {
                    box-shadow: 0 4px 8px rgba(0,0,0,0.15);
                    transform: translateY(-1px);
                }
                .env-var-item strong {
                    font-weight: 600;
                    color: #2563eb;
                    font-size: 12px;
                }
                .env-var-remove { 
                    background: #dc3545; 
                    color: white; 
                    border: none; 
                    border-radius: 8px; 
                    width: 32px; 
                    height: 32px; 
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 16px;
                    font-weight: bold;
                    transition: all 0.2s;
                    box-shadow: 0 2px 4px rgba(220, 53, 69, 0.3);
                }
                .env-var-remove:hover {
                    background: #c82333;
                    transform: scale(1.1);
                    box-shadow: 0 4px 8px rgba(220, 53, 69, 0.4);
                }
                .env-var-form { 
                    display: grid;
                    grid-template-columns: 1fr 1fr auto;
                    gap: 20px; 
                    margin: 25px 0; 
                    padding: 25px;
                    background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
                    border-radius: 12px;
                    border: 1px solid #dee2e6;
                    box-shadow: 0 2px 4px rgba(0,0,0,0.1);
                }
                .env-var-input { 
                    padding: 12px 16px; 
                    border: 2px solid #ddd; 
                    border-radius: 8px; 
                    font-size: 13px;
                    font-family: inherit;
                    transition: all 0.2s;
                    background: white;
                }
                .env-var-input:focus {
                    outline: none;
                    border-color: #0066cc;
                    box-shadow: 0 0 0 3px rgba(0, 102, 204, 0.15);
                    transform: translateY(-1px);
                }
                .env-var-input::placeholder {
                    color: #999;
                    font-style: italic;
                }
                .env-var-add { 
                    background: linear-gradient(135deg, #0066cc 0%, #004999 100%); 
                    color: white; 
                    border: none; 
                    padding: 12px 24px; 
                    border-radius: 8px;
                    font-size: 13px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: all 0.2s;
                    box-shadow: 0 2px 4px rgba(0, 102, 204, 0.3);
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                }
                .env-var-add:hover {
                    background: linear-gradient(135deg, #0052a3 0%, #003d7a 100%);
                    transform: translateY(-2px);
                    box-shadow: 0 4px 8px rgba(0, 102, 204, 0.4);
                }
                .env-var-add:active {
                    transform: translateY(0);
                    box-shadow: 0 2px 4px rgba(0, 102, 204, 0.3);
                }
                h4 {
                    color: #2563eb;
                    margin: 20px 0 12px 0;
                    font-size: 16px;
                    font-weight: 700;
                    border-bottom: 2px solid #e5e7eb;
                    padding-bottom: 6px;
                    display: flex;
                    align-items: center;
                    gap: 8px;
                }
                h4:first-child {
                    margin-top: 0;
                }
                h4::before {
                    content: '📋';
                    font-size: 14px;
                }
                h4:nth-of-type(2)::before {
                    content: '➕';
                }
                .storage-info {
                    font-size: 11px;
                    font-weight: 400;
                    color: #666;
                    font-style: italic;
                    margin-left: auto;
                }
                .env-vars-empty {
                    text-align: center;
                    padding: 40px 20px;
                    color: #666;
                    font-style: italic;
                    background: white;
                    border-radius: 8px;
                    border: 2px dashed #ddd;
                }
                .env-vars-empty::before {
                    content: '📝';
                    font-size: 48px;
                    display: block;
                    margin-bottom: 10px;
                }
            </style>
        `;
        
        // Add global functions for the dialog
        window.removeEnvVar = (key) => {
            this.envManager.remove(key);
            this.refreshEnvVarsDialog();
        };
        
        window.addEnvVar = () => {
            const key = document.getElementById('env-var-key').value.trim();
            const value = document.getElementById('env-var-value').value.trim();
            
            if (key) {
                this.envManager.set(key, value);
                document.getElementById('env-var-key').value = '';
                document.getElementById('env-var-value').value = '';
                this.refreshEnvVarsDialog();
            }
        };
        
        // Store dialog reference for refresh - create a wrapper with close method
        this.currentEnvVarsDialog = {
            close: () => {
                if (Dialog.isActive) {
                    Dialog.hide();
                }
            }
        };
        
        Dialog.fullscreen({
            title: 'Environment variables',
            message: content,
            icon: '',
            allowHtml: true,
            showHeaderCloseButton: false,
            buttons: [
                { text: 'Close', value: 'close', primary: true }
            ]
        }, (_result) => {
            // Clean up global functions
            delete window.removeEnvVar;
            delete window.addEnvVar;
            delete window.clearEnvVars;
            this.currentEnvVarsDialog = null;
        });
    }

    /**
     * Generate HTML for environment variables list (including the add form)
     */
    generateEnvVarsListHTML() {
        const currentVars = this.envManager.getAll();
        
        const formatValue = (value) => {
            if (typeof value === 'string') {
                // Check if value contains mostly asterisks (hidden/masked value)
                const asteriskCount = (value.match(/\*/g) || []).length;
                if (asteriskCount > value.length * 0.7) { // If more than 70% are asterisks, treat as hidden
                    return '*'.repeat(60); // Force exactly 60 asterisks
                } else if (value.length > 60) {
                    return `${value.substring(0, 60)  }…`; // Regular truncate with ellipsis
                }
            }
            return value;
        };
        
        // Start with the add/update form
        let html = `
            <div class="env-var-item" style="display: flex; align-items: center; padding: 8px 20px; border-bottom: 2px solid #ddd; background: #f8f9fa;">
                <div style="flex: 1; margin-right: 10px; display: flex; gap: 10px;">
                    <input type="text" id="env-var-key" placeholder="Variable name" style="flex: 1; padding: 6px; border: 1px solid #ccc; border-radius: 3px; font-size: 14px;">
                    <input type="text" id="env-var-value" placeholder="Variable value" style="flex: 1; padding: 6px; border: 1px solid #ccc; border-radius: 3px; font-size: 14px;">
                </div>
                <button onclick="addEnvVar()" style="background: #28a745; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                    Add/Update
                </button>
            </div>
        `;
        
        // Add existing variables
        if (Object.entries(currentVars).length === 0) {
            html += `<div class="env-vars-empty" style="text-align: center; padding: 20px; color: #666;">
                No environment variables set
            </div>`;
        } else {
            html += Object.entries(currentVars).map(([key, value]) => `
                <div class="env-var-item" style="display: flex; align-items: center; padding: 8px 20px; border-bottom: 1px solid #e0e0e0;">
                    <div style="flex: 1; margin-right: 10px;">
                        <strong style="color: #333; display: block; margin-bottom: 2px;">${key}</strong>
                        <span style="color: #666; font-size: 14px; word-break: break-all;">${formatValue(value)}</span>
                    </div>
                    <button onclick="removeEnvVar('${key}')" 
                            style="background: #dc3545; color: white; border: none; padding: 4px 8px; border-radius: 3px; cursor: pointer; font-size: 12px;">
                        Delete
                    </button>
                </div>
            `).join('');
        }
        
        return html;
    }

    /**
     * Refresh environment variables dialog by updating content in place
     */
    refreshEnvVarsDialog() {
        console.log('🔧 Refreshing environment variables dialog content');
        
        // Try to update the content in place first
        const envVarsContainer = document.querySelector('.env-vars-list');
        if (envVarsContainer) {
            console.log('🔧 Updating environment variables list in place');
            envVarsContainer.innerHTML = this.generateEnvVarsListHTML();
            return;
        }
        
        // Fallback to full dialog refresh if container not found
        console.log('🔧 Container not found, falling back to full dialog refresh');
        if (this.currentEnvVarsDialog && typeof this.currentEnvVarsDialog.close === 'function') {
            this.currentEnvVarsDialog.close();
            setTimeout(() => {
                this.showEnvVarsDialog();
            }, 100);
        }
    }

}

export default AgentletCore;

// Named exports for better library usage
export { AgentletCore };
export { default as Module } from './core/Module.js';
export { default as ModuleRegistry } from './core/ModuleRegistry.js';

// Export utility classes for external use
export { default as ElementSelector } from './utils/ui/ElementSelector.js';
export { default as Dialog } from './utils/ui/Dialog.js';
export { default as MessageBubble } from './utils/ui/MessageBubble.js';
export { default as ScreenCapture } from './utils/ui/ScreenCapture.js';
export { default as ScriptInjector } from './utils/system/ScriptInjector.js';
export { default as EnvManager, BaseEnvironmentVariablesManager, LocalStorageEnvironmentVariablesManager } from './utils/config-persistence/EnvManager.js';
export { default as CookieManager } from './utils/config-persistence/CookieManager.js';
export { default as StorageManager } from './utils/config-persistence/StorageManager.js';
export { default as AuthManager } from './utils/system/AuthManager.js';
export { default as FormExtractor } from './utils/data-processing/FormExtractor.js';
export { default as FormFiller } from './utils/data-processing/FormFiller.js';
export { default as TableExtractor } from './utils/data-processing/TableExtractor.js';
export { default as PDFProcessor } from './utils/ai/PDFProcessor.js';
export { default as ShortcutManager } from './utils/ui/ShortcutManager.js';
