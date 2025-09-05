/**
 * Agentlet Core - Enhanced AI-powered bookmarklet system
 * Main application entry point with plugin architecture
 */

import ModuleLoader from './plugin-system/ModuleLoader.js';
import BaseModule from './core/BaseModule.js';
import BaseSubmodule from './core/BaseSubmodule.js';
import ElementSelector from './utils/ElementSelector.js';
import Dialog from './utils/Dialog.js';
import MessageBubble from './utils/MessageBubble.js';
import ScreenCapture from './utils/ScreenCapture.js';
import ScriptInjector from './utils/ScriptInjector.js';
import { LocalStorageEnvironmentVariablesManager } from './utils/EnvManager.js';
import CookieManager from './utils/CookieManager.js';
import StorageManager from './utils/StorageManager.js';
import AuthManager from './utils/AuthManager.js';
import FormExtractor from './utils/FormExtractor.js';
import FormFiller from './utils/FormFiller.js';
import TableExtractor from './utils/TableExtractor.js';
import AIManager from './utils/AIProvider.js';
import PageHighlighter from './utils/PageHighlighter.js';
import PDFProcessor from './utils/PDFProcessor.js';
import ShortcutManager from './utils/ShortcutManager.js';

// Import external libraries
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
        this.isMinimized = false;
        
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
            ...config,
            theme: this.processThemeConfig(config.theme)
        };
        
        // Event system
        this.eventBus = this.createEventBus();
        
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
        this.formFiller = new FormFiller(); // jQuery will be passed during setupGlobalAccess
        
        // Initialize table extractor
        this.tableExtractor = new TableExtractor();
        
        // Initialize AI manager
        this.aiManager = new AIManager(this.envManager);
        
        // Initialize shortcut manager
        this.shortcutManager = new ShortcutManager();

        // Initialize module loader with configuration
        this.moduleLoader = new ModuleLoader({
            eventBus: this.eventBus,
            moduleRegistry: this.config.moduleRegistry,
            registryUrl: this.config.registryUrl
        });
        
        // UI management
        this.ui = {
            container: null,
            content: null,
            header: null,
            actions: null,
            imageOverlay: null
        };
        
        // Performance tracking
        this.performanceMetrics = {
            initTime: 0,
            moduleLoadTime: 0,
            uiRenderTime: 0
        };
        
        // Set up global access (jQuery will be set up later in init())
        this.setupGlobalAccess();
        
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
     * Process theme configuration and merge with defaults
     */
    processThemeConfig(themeConfig) {
        const defaultTheme = {
            // Colors
            primaryColor: '#1E3A8A',
            secondaryColor: '#F97316',
            backgroundColor: '#ffffff',
            contentBackground: '#f8f9fa',
            textColor: '#333333',
            borderColor: '#e0e0e0',
            
            // Header
            headerBackground: '#ffffff',
            headerTextColor: '#333333',
            
            // Actions
            actionButtonBackground: '#f8f9fa',
            actionButtonBorder: '#dee2e6',
            actionButtonHover: '#e9ecef',
            actionButtonText: '#333333',
            
            // Layout
            panelWidth: '320px',
            borderRadius: '0px',
            boxShadow: '-2px 0 10px rgba(0,0,0,0.1)',
            fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
            
            // Spacing
            headerPadding: '15px',
            contentPadding: '15px',
            actionsPadding: '10px 15px',
            
            // Borders
            borderWidth: '2px',
            
            // Animation
            transitionDuration: '0.3s',
            
            // Dialog theming (unified across all dialogs)
            dialogOverlayBackground: 'rgba(0, 0, 0, 0.5)',
            dialogBackground: '#ffffff',
            dialogBorderRadius: '8px',
            dialogBoxShadow: '0 4px 20px rgba(0, 0, 0, 0.15)',
            dialogHeaderBackground: '#ffffff',
            dialogHeaderTextColor: '#333333',
            dialogHeaderTextMargin: '0',
            dialogContentBackground: '#ffffff',
            dialogContentTextColor: '#333333',
            dialogButtonPrimaryBackground: '#1E3A8A',
            dialogButtonPrimaryHover: '#1E40AF',
            dialogButtonSecondaryBackground: '#6B7280',
            dialogButtonSecondaryHover: '#4B5563',
            dialogButtonDangerBackground: '#DC2626',
            dialogButtonDangerHover: '#B91C1C',
            dialogProgressBarBackground: 'linear-gradient(90deg, #1E3A8A, #F97316)',
            dialogProgressBarTrackBackground: '#f0f0f0',

            // Spinner
            spinnerTrackColor: '#f3f3f3',
            spinnerColor: '#667eea',
            
            // Image Overlay Theme Variables
            imageOverlayWidth: '100px',
            imageOverlayHeight: '100px',
            imageOverlayBottom: '20px',
            imageOverlayRight: '20px',
            imageOverlayZIndex: '999999',
            imageOverlayTransition: 'all 0.3s ease',
            imageOverlayHoverScale: '1.05'
        };

        // If theme is just a string (legacy), return defaults
        if (typeof themeConfig === 'string' || !themeConfig) {
            return defaultTheme;
        }

        // Merge user theme with defaults and apply minimum panel width
        const mergedTheme = {
            ...defaultTheme,
            ...themeConfig
        };
        
        // Update panel width based on configuration
        const minimumWidth = this.config?.minimumPanelWidth || 320;
        const currentWidth = parseInt(mergedTheme.panelWidth) || 320;
        mergedTheme.panelWidth = `${Math.max(currentWidth, minimumWidth)}px`;
        
        return mergedTheme;
    }

    /**
     * Create event bus for internal communication
     */
    createEventBus() {
        const listeners = new Map();
        
        return {
            emit: (event, data) => {
                const eventListeners = listeners.get(event) || [];
                eventListeners.forEach(callback => {
                    try {
                        callback(data);
                    } catch (error) {
                        console.error(`Error in event listener for ${event}:`, error);
                    }
                });
                
                if (this.config.debugMode) {
                    console.log(`Event emitted: ${event}`, data);
                }
            },
            
            on: (event, callback) => {
                if (!listeners.has(event)) {
                    listeners.set(event, []);
                }
                listeners.get(event).push(callback);
            },
            
            off: (event, callback) => {
                const eventListeners = listeners.get(event);
                if (eventListeners) {
                    const index = eventListeners.indexOf(callback);
                    if (index > -1) {
                        eventListeners.splice(index, 1);
                    }
                }
            },
            
            // eslint-disable-next-line require-await
            request: async (event, data) => {
                return new Promise((resolve, reject) => {
                    const eventListeners = listeners.get(event) || [];
                    if (eventListeners.length === 0) {
                        reject(new Error(`No listeners for event: ${event}`));
                        return;
                    }
                    
                    try {
                        const result = eventListeners[0](data);
                        if (result instanceof Promise) {
                            result.then(resolve).catch(reject);
                        } else {
                            resolve(result);
                        }
                    } catch (error) {
                        reject(error);
                    }
                });
            }
        };
    }

    /**
     * Create a minimal jQuery fallback for basic DOM operations
     */
    createjQueryFallback() {
        return function(selector) {
            if (typeof selector === 'string') {
                const elements = document.querySelectorAll(selector);
                const result = {
                    0: document.querySelector(selector),
                    length: elements.length,
                    remove: function() {
                        elements.forEach(el => el.remove());
                        return this;
                    },
                    append: function(...appendElements) {
                        const target = document.querySelector(selector);
                        if (target) {
                            appendElements.forEach(el => {
                                if (typeof el === 'string') {
                                    target.insertAdjacentHTML('beforeend', el);
                                } else if (el && el.nodeType) {
                                    target.appendChild(el);
                                }
                            });
                        }
                        return this;
                    },
                    addClass: function(className) {
                        elements.forEach(el => {
                            if (el && el.classList) {
                                el.classList.add(className);
                            }
                        });
                        return this;
                    },
                    removeClass: function(className) {
                        elements.forEach(el => {
                            if (el && el.classList) {
                                el.classList.remove(className);
                            }
                        });
                        return this;
                    },
                    hide: function() {
                        elements.forEach(el => {
                            if (el && el.style) {
                                el.style.display = 'none';
                            }
                        });
                        return this;
                    },
                    show: function() {
                        elements.forEach(el => {
                            if (el && el.style) {
                                el.style.display = '';
                            }
                        });
                        return this;
                    },
                    css: function(property, value) {
                        if (typeof property === 'object') {
                            // Handle object of properties
                            elements.forEach(el => {
                                if (el && el.style) {
                                    Object.keys(property).forEach(key => {
                                        const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                                        el.style.setProperty(cssKey, property[key]);
                                    });
                                }
                            });
                        } else if (value !== undefined) {
                            // Set single property
                            const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
                            elements.forEach(el => {
                                if (el && el.style) {
                                    el.style.setProperty(cssProperty, value);
                                }
                            });
                        }
                        return this;
                    },
                    attr: function(name, value) {
                        if (value !== undefined) {
                            elements.forEach(el => {
                                if (el && el.setAttribute) {
                                    el.setAttribute(name, value);
                                }
                            });
                            return this;
                        } else {
                            const el = elements[0];
                            return el && el.getAttribute ? el.getAttribute(name) : null;
                        }
                    },
                    html: function(htmlContent) {
                        if (htmlContent !== undefined) {
                            elements.forEach(el => {
                                if (el) {
                                    el.innerHTML = htmlContent;
                                }
                            });
                            return this;
                        } else {
                            const el = elements[0];
                            return el ? el.innerHTML : '';
                        }
                    },
                    text: function(textContent) {
                        if (textContent !== undefined) {
                            elements.forEach(el => {
                                if (el) {
                                    el.textContent = textContent;
                                }
                            });
                            return this;
                        } else {
                            const el = elements[0];
                            return el ? el.textContent : '';
                        }
                    },
                    val: function(value) {
                        if (value !== undefined) {
                            elements.forEach(el => {
                                if (el && 'value' in el) {
                                    el.value = value;
                                }
                            });
                            return this;
                        } else {
                            const el = elements[0];
                            return el && 'value' in el ? el.value : '';
                        }
                    },
                    focus: function() {
                        const el = elements[0];
                        if (el && el.focus) {
                            el.focus();
                        }
                        return this;
                    },
                    on: function(event, handler) {
                        elements.forEach(el => {
                            if (el && el.addEventListener) {
                                el.addEventListener(event, handler);
                            }
                        });
                        return this;
                    },
                    off: function(event, handler) {
                        elements.forEach(el => {
                            if (el && el.removeEventListener) {
                                el.removeEventListener(event, handler);
                            }
                        });
                        return this;
                    }
                };
                
                // Add array-like access to elements
                for (let i = 0; i < elements.length; i++) {
                    result[i] = elements[i];
                }
                
                return result;
            } else if (selector && selector.nodeType) {
                // DOM element passed - create a wrapper with all methods
                const result = {
                    0: selector,
                    length: 1,
                    remove: function() {
                        if (selector.remove) {
                            selector.remove();
                        }
                        return this;
                    },
                    append: function(...appendElements) {
                        appendElements.forEach(el => {
                            if (typeof el === 'string') {
                                selector.insertAdjacentHTML('beforeend', el);
                            } else if (el && el.nodeType) {
                                selector.appendChild(el);
                            }
                        });
                        return this;
                    },
                    addClass: function(className) {
                        if (selector.classList) {
                            selector.classList.add(className);
                        }
                        return this;
                    },
                    removeClass: function(className) {
                        if (selector.classList) {
                            selector.classList.remove(className);
                        }
                        return this;
                    },
                    hide: function() {
                        if (selector.style) {
                            selector.style.display = 'none';
                        }
                        return this;
                    },
                    show: function() {
                        if (selector.style) {
                            selector.style.display = '';
                        }
                        return this;
                    },
                    css: function(property, value) {
                        if (typeof property === 'object') {
                            // Handle object of properties
                            if (selector.style) {
                                Object.keys(property).forEach(key => {
                                    const cssKey = key.replace(/([A-Z])/g, '-$1').toLowerCase();
                                    selector.style.setProperty(cssKey, property[key]);
                                });
                            }
                        } else if (value !== undefined) {
                            // Set single property
                            const cssProperty = property.replace(/([A-Z])/g, '-$1').toLowerCase();
                            if (selector.style) {
                                selector.style.setProperty(cssProperty, value);
                            }
                        }
                        return this;
                    },
                    attr: function(name, value) {
                        if (value !== undefined) {
                            if (selector.setAttribute) {
                                selector.setAttribute(name, value);
                            }
                            return this;
                        } else {
                            return selector.getAttribute ? selector.getAttribute(name) : null;
                        }
                    },
                    html: function(htmlContent) {
                        if (htmlContent !== undefined) {
                            selector.innerHTML = htmlContent;
                            return this;
                        } else {
                            return selector.innerHTML || '';
                        }
                    },
                    text: function(textContent) {
                        if (textContent !== undefined) {
                            selector.textContent = textContent;
                            return this;
                        } else {
                            return selector.textContent || '';
                        }
                    },
                    val: function(value) {
                        if (value !== undefined) {
                            if ('value' in selector) {
                                selector.value = value;
                            }
                            return this;
                        } else {
                            return 'value' in selector ? selector.value : '';
                        }
                    },
                    focus: function() {
                        if (selector.focus) {
                            selector.focus();
                        }
                        return this;
                    },
                    on: function(event, handler) {
                        if (selector.addEventListener) {
                            selector.addEventListener(event, handler);
                        }
                        return this;
                    },
                    off: function(event, handler) {
                        if (selector.removeEventListener) {
                            selector.removeEventListener(event, handler);
                        }
                        return this;
                    }
                };
                return result;
            } else if (selector === document) {
                // Handle document object
                return {
                    0: document,
                    length: 1,
                    ready: function(callback) {
                        if (document.readyState === 'loading') {
                            document.addEventListener('DOMContentLoaded', callback);
                        } else {
                            callback();
                        }
                        return this;
                    },
                    on: function(event, handler) {
                        document.addEventListener(event, handler);
                        return this;
                    },
                    off: function(event, handler) {
                        document.removeEventListener(event, handler);
                        return this;
                    }
                };
            }
            return { length: 0 };
        };
    }

    /**
     * Set up jQuery instance - can be called multiple times to reinitialize
     */
    setupjQuery() {
        // Set up jQuery with namespace isolation
        // Load jQuery from global scope or create a minimal fallback
        let agentletJQuery;
        if (typeof window.jQuery !== 'undefined' && window.jQuery.fn?.jquery) { // Check for actual jQuery object
            // Don't use noConflict(true) to preserve bundled jQuery for developers
            // Instead, use the same instance to avoid conflicts
            agentletJQuery = window.jQuery;
            console.log('🔧 Using bundled jQuery version:', window.jQuery.fn.jquery);
        } else {
            agentletJQuery = this.createjQueryFallback();
            console.log('🔧 Using jQuery fallback');
        }
        
        // Update jQuery references
        window.agentlet.$ = agentletJQuery;
        window.agentlet.jQuery = agentletJQuery;
        
        // Update FormFiller with jQuery instance
        if (this.formFiller) {
            this.formFiller.$ = agentletJQuery;
        }
        
    }

    /**
     * Set up XLSX library for Excel export functionality
     */
    setupXLSX() {
        // Make XLSX available globally for TableExtractor
        if (typeof window.XLSX === 'undefined') {
            window.XLSX = XLSX;
            console.log('📊 XLSX library loaded for Excel export functionality');
        }
    }

    /**
     * Set up html2canvas library for screenshot functionality
     */
    setupHTML2Canvas() {
        // Make html2canvas available globally for ScreenCapture
        if (typeof window.html2canvas === 'undefined') {
            window.html2canvas = html2canvas;
            console.log('📸 html2canvas library loaded for screenshot functionality');
        }
    }

    /**
     * Set up PDF.js library for PDF processing functionality
     */
    setupPDFJS() {
        // Make PDF.js available globally for PDFProcessor
        if (typeof window.pdfjsLib === 'undefined') {
            window.pdfjsLib = pdfjsLib;
            
            // Configure worker URL - prioritize explicit config, then derive from registry URL
            let workerSrc = './pdf.worker.min.js'; // fallback
            
            if (this.config.pdfWorkerUrl) {
                // Explicit worker URL provided
                workerSrc = this.config.pdfWorkerUrl;
            } else if (this.config.registryUrl) {
                // Derive worker URL from registry URL
                // e.g., https://example.com/static/agentlets-registry.json -> https://example.com/static/pdf.worker.min.js
                try {
                    const registryUrl = new URL(this.config.registryUrl);
                    registryUrl.pathname = registryUrl.pathname.replace(/[^\/]+$/, 'pdf.worker.min.js');
                    workerSrc = registryUrl.toString();
                } catch (error) {
                    console.warn('Failed to derive PDF worker URL from registry URL:', error);
                }
            }
            
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
            window.pdfjsLib.GlobalWorkerOptions.verbosity = 0;
            
            console.log('📄 PDF.js library loaded for PDF processing functionality');
            console.log('📄 PDF.js worker URL set to:', workerSrc);
            
            // Verify the setting worked
            console.log('📄 PDF.js GlobalWorkerOptions.workerSrc:', window.pdfjsLib.GlobalWorkerOptions.workerSrc);
        }
    }

    /**
     * Configure PDF.js worker URL manually
     * @param {string} workerUrl - URL to the PDF.js worker file
     */
    configurePDFWorker(workerUrl) {
        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
            console.log('📄 PDF.js worker URL manually set to:', workerUrl);
        } else {
            console.warn('📄 PDF.js not loaded yet, cannot set worker URL');
        }
    }
    
    /**
     * Set up hotkeys library for keyboard shortcuts
     */
    setupHotkeys() {
        // Make hotkeys available globally
        if (typeof window.hotkeys === 'undefined') {
            window.hotkeys = hotkeys;
            console.log('⌨️ hotkeys-js library loaded for keyboard shortcuts');
        }
        
        // Initialize shortcut manager with hotkeys
        if (this.shortcutManager) {
            this.shortcutManager.init(hotkeys);
            console.log('⌨️ ShortcutManager initialized with hotkeys-js');
        }
    }

    /**
     * Set up global access for modules and debugging
     */
    setupGlobalAccess() {
        
        // Make AgentletCore globally accessible
        window.agentlet = this;
        
        // Expose base classes for modules
        window.agentlet.BaseModule = BaseModule;
        window.agentlet.BaseSubmodule = BaseSubmodule;
        
        // Expose utility classes for creating new instances
        window.agentlet.ElementSelectorClass = ElementSelector;
        window.agentlet.ScriptInjectorClass = ScriptInjector;
        
        // Expose utilities (jQuery will be set up later)
        window.agentlet.utils = {
            ElementSelector: new ElementSelector(),
            Dialog: new Dialog({ theme: this.config.theme }),
            MessageBubble: new MessageBubble(this.config.theme),
            ScreenCapture: new ScreenCapture(),
            ScriptInjector: new ScriptInjector(),
            PDFProcessor: PDFProcessor,
            shortcuts: this.shortcutManager ? this.shortcutManager.createProxy() : null
        };
        
        // Add PageHighlighter with error handling
        try {
            window.agentlet.utils.PageHighlighter = new PageHighlighter();
            console.log('✅ PageHighlighter instantiated successfully');
        } catch (error) {
            console.error('❌ Failed to instantiate PageHighlighter:', error);
            window.agentlet.utils.PageHighlighter = null;
        }
        
        // Expose environment manager
        window.agentlet.env = this.envManager ? this.envManager.createProxy() : null;
        
        // Expose cookie manager
        window.agentlet.cookies = this.cookieManager.createProxy();
        
        // Expose storage managers
        window.agentlet.storage = {
            local: this.storageManager.createProxy('localStorage'),
            session: this.storageManager.createProxy('sessionStorage'),
            manager: this.storageManager
        };
        
        // Expose authentication manager
        window.agentlet.auth = this.authManager.createProxy();
        
        // Expose form extractor and filler with AI-ready functions
        window.agentlet.forms = {
            // Form extraction
            extract: (element, options) => this.formExtractor.extractFormStructure(element, options),
            exportForAI: (element, options) => this.formExtractor.exportForAI(element, options),
            quickExport: (element) => this.formExtractor.quickExport(element),
            
            // Form filling (NEW)
            fill: (parentElement, selectorValues, options) => this.formFiller.fillForm(parentElement, selectorValues, options),
            fillFromAI: (parentElement, aiFormData, userValues, options) => this.formFiller.fillFromAIData(parentElement, aiFormData, userValues, options),
            fillMultiple: (parentElement, formDataArray, options) => this.formFiller.fillMultipleForms(parentElement, formDataArray, options),
            
            // Direct access to utilities
            extractor: this.formExtractor,
            filler: this.formFiller
        };
        
        // Expose table extractor with Excel export functions
        window.agentlet.tables = this.tableExtractor.createProxy();
        
        // Expose AI capabilities
        window.agentlet.ai = {
            // Main AI functions
            sendPrompt: (prompt, images, options) => this.aiManager.sendPrompt(prompt, images, options),
            sendPromptWithPDF: (prompt, pdfData, options) => this.aiManager.sendPromptWithPDF(prompt, pdfData, options),
            convertPDFToImages: (pdfData, options) => this.aiManager.convertPDFToImages(pdfData, options),
            isAvailable: () => this.aiManager.isAvailable(),
            getStatus: () => this.aiManager.getStatus(),
            validateAPI: () => this.aiManager.validateAPI(),
            
            // Provider management
            setProvider: (providerName) => this.aiManager.setCurrentProvider(providerName),
            getAvailableProviders: () => this.aiManager.getAvailableProviders(),
            refresh: () => this.aiManager.refresh(),
            
            // Direct access to manager
            manager: this.aiManager
        };
        
        // Expose PDF worker configuration
        window.agentlet.configurePDFWorker = (workerUrl) => {
            if (window.pdfjsLib) {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                console.log('📄 PDF.js worker URL manually set to:', workerUrl);
            } else {
                console.warn('📄 PDF.js not loaded yet, cannot set worker URL');
            }
        };
        
        // jQuery will be set up later in init() via setupjQuery()
        
        // Expose initialization status
        window.agentlet.initialized = this.initialized;
        
        // Expose useful APIs for modules
        window.agentlet.modules = {
            get: (name) => this.moduleLoader.modules.get(name),
            getAll: () => this.moduleLoader.getLoadedModules(),
            load: (url, options) => this.moduleLoader.loadModuleFromUrl(url, options),
            unload: (name) => this.moduleLoader.unloadModule(name),
            register: (module, source = 'manual') => this.moduleLoader.registerModule(module, source)
        };
        
        // Also expose moduleLoader directly for advanced use
        window.agentlet.moduleLoader = this.moduleLoader;
        
        window.agentlet.ui = {
            refreshContent: () => this.updateModuleContent(),
            show: () => this.show(),
            hide: () => this.hide(),
            minimize: () => this.minimize(),
            maximize: () => this.maximize(),
            regenerateStyles: () => this.regenerateStyles(),
            resizePanel: (size) => this.resizePanel(size),
            getPanelWidth: () => this.getPanelWidth(),
            setPanelWidth: (width) => this.setPanelWidth(width)
        };
        
        // Expose jQuery refresh method for developers
        window.agentlet.refreshjQuery = () => this.setupjQuery();
        
        // Expose theme for utility classes
        window.agentlet.theme = this.config.theme;
        
        // Development helpers
        if (this.config.debugMode) {
            window.agentlet.debug = {
                getMetrics: () => this.getPerformanceMetrics(),
                getConfig: () => this.config,
                getStatistics: () => this.moduleLoader.getStatistics(),
                clearCache: () => this.moduleLoader.clearCache(),
                eventBus: this.eventBus,
                envManager: this.envManager,
                cookieManager: this.cookieManager,
                storageManager: this.storageManager
            };
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
            
            // Set up jQuery now that bundled libraries may be available
            this.setupjQuery();
            
            // Set up XLSX for Excel export functionality
            this.setupXLSX();
            
            // Set up html2canvas for screenshot functionality
            this.setupHTML2Canvas();
            
            // Set up PDF.js for PDF processing functionality
            this.setupPDFJS();
            
            // Set up hotkeys for keyboard shortcuts
            this.setupHotkeys();
            
            // Set up event listeners
            this.setupEventListeners();
            
            const uiStartTime = performance.now();
            this.setupBaseUI();
            this.performanceMetrics.uiRenderTime = performance.now() - uiStartTime;
            
            // Set up module change callback BEFORE initializing modules
            this.moduleLoader.setModuleChangeCallback((activeModule) => {
                this.onModuleChange(activeModule);
            });
            
            // Initialize module loader and load modules
            const moduleStartTime = performance.now();
            await this.moduleLoader.initialize();
            this.performanceMetrics.moduleLoadTime = performance.now() - moduleStartTime;
            
            // Set up storage change listener
            this.setupLocalStorageListener();
            
            // Load environment variables from storage
            this.loadEnvVarsFromStorage();
            
            // Manual refresh to catch modules that were registered early
            this.updateApplicationDisplay();
            this.updateModuleContent();
            
            // Register default keyboard shortcuts
            if (this.shortcutManager) {
                this.shortcutManager.registerDefaultShortcuts();
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
            console.log(`📦 Module registered: ${data.module}`);
            this.updateApplicationDisplay();
        });
        
        this.eventBus.on('module:activated', (data) => {
            console.log(`🔄 Module activated: ${data.module}`);
            this.updateApplicationDisplay();
        });
        
        this.eventBus.on('module:deactivated', (data) => {
            console.log(`⏸️ Module deactivated: ${data.module}`);
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
        this.restorePanelWidthForModule(activeModule);
        
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
     * Enhanced UI setup with responsive design
     */
    setupBaseUI() {
        // Get jQuery instance
        const $ = window.agentlet.$;
        
        // Remove existing container if present
        $('#agentlet-container').remove();
        
        // Create main container
        const container = document.createElement('div');
        container.id = 'agentlet-container';
        container.className = 'agentlet-panel';
        
        // Create toggle button only if minimizeWithImage is not configured
        let toggleButton = null;
        if (!this.config.minimizeWithImage || typeof this.config.minimizeWithImage !== 'string') {
            toggleButton = this.createToggleButton();
        }
        
        // Create header
        const header = this.createHeader();
        
        // Create content area
        const content = this.createContentArea();
        
        // Create actions area
        const actions = this.createActionsArea();
        
        // Create resize handle if resizable is enabled
        let resizeHandle = null;
        if (this.config.resizablePanel) {
            resizeHandle = this.createResizeHandle(container);
        }
        
        // Assemble UI
        if (resizeHandle) {
            container.appendChild(resizeHandle);
        }
        container.appendChild(header);
        container.appendChild(content);
        container.appendChild(actions);
        
        // Add to document
        if (toggleButton) {
            $(document.body).append(toggleButton, container);
        } else {
            $(document.body).append(container);
        }
        
        // Store UI references
        this.ui.container = container;
        this.ui.content = content;
        this.ui.header = header;
        this.ui.actions = actions;
        
        // Add CSS styles
        this.injectStyles();
        
        // Ensure image overlay is shown if panel is minimized and image is configured
        this.ensureImageOverlay();
        
        // Handle startMinimized option
        if (this.config.startMinimized) {
            this.isMinimized = true;
            
            // Apply minimized state to container
            if (container) {
                container.style.transform = 'translateX(100%)';
            }
            
            // Update toggle button if it exists
            if (toggleButton) {
                toggleButton.innerHTML = '◀';
                toggleButton.style.right = '-2px';
            }
            
            // Show image overlay if configured
            if (this.config.minimizeWithImage && typeof this.config.minimizeWithImage === 'string') {
                this.showImageOverlay();
            }
            
            console.log('🎨 UI setup completed (started minimized)');
        } else {
            console.log('🎨 UI setup completed');
        }
    }

    /**
     * Create toggle button
     */
    createToggleButton() {
        const toggleButton = document.createElement('button');
        toggleButton.innerHTML = '▶';
        toggleButton.id = 'agentlet-toggle';
        toggleButton.className = 'agentlet-toggle';
        
        toggleButton.onclick = (e) => {
            e.stopPropagation();
            this.toggleCollapse();
        };
        
        return toggleButton;
    }

    /**
     * Create resize handle for the panel
     */
    createResizeHandle(container) {
        const resizeHandle = document.createElement('div');
        resizeHandle.className = 'agentlet-resize-handle';
        
        let isResizing = false;
        let startX = 0;
        let startWidth = 0;
        
        const startResize = (e) => {
            isResizing = true;
            startX = e.clientX;
            startWidth = container.offsetWidth;
            
            document.addEventListener('mousemove', handleResize);
            document.addEventListener('mouseup', stopResize);
            
            // Prevent text selection during resize
            document.body.style.userSelect = 'none';
            
            // Disable transitions during resize for smooth dragging
            container.style.transition = 'none';
            
            // Also disable toggle button transitions during resize
            const toggleButton = document.getElementById('agentlet-toggle');
            if (toggleButton) {
                toggleButton.style.transition = 'none';
            }
            
            e.preventDefault();
        };
        
        const handleResize = (e) => {
            if (!isResizing) return;
            
            const diff = startX - e.clientX; // Negative diff means expanding left
            const newWidth = Math.max(this.config.minimumPanelWidth, startWidth + diff);
            
            container.style.width = `${newWidth}px`;
            
            // Update CSS custom property for consistent theming
            document.documentElement.style.setProperty('--agentlet-panel-width', `${newWidth}px`);
            
            // Update toggle button position if it exists
            const toggleButton = document.getElementById('agentlet-toggle');
            if (toggleButton && !this.isMinimized) {
                toggleButton.style.right = `${newWidth}px`;
            }
        };
        
        const stopResize = () => {
            if (!isResizing) return;
            
            isResizing = false;
            document.removeEventListener('mousemove', handleResize);
            document.removeEventListener('mouseup', stopResize);
            
            // Restore text selection
            document.body.style.userSelect = '';
            
            // Restore transitions
            container.style.transition = '';
            
            // Restore toggle button transitions
            const toggleButton = document.getElementById('agentlet-toggle');
            if (toggleButton) {
                toggleButton.style.transition = '';
            }
            
            // Emit resize complete event
            this.eventBus.emit('panel:resizeComplete', { width: container.offsetWidth });
            
            // Save panel width for the current module if env vars are available
            this.savePanelWidthForModule(container.offsetWidth);
        };
        
        resizeHandle.addEventListener('mousedown', startResize);
        
        return resizeHandle;
    }

    /**
     * Create header section
     */
    createHeader() {
        const header = document.createElement('div');
        header.id = 'agentlet-header';
        header.className = 'agentlet-header';
        
        // Application display
        const appDisplay = document.createElement('div');
        appDisplay.id = 'agentlet-app-display';
        appDisplay.className = 'agentlet-app-display';
        appDisplay.innerHTML = '<strong>Agentlet:</strong> <span id="agentlet-app-name">Ready</span>';
        
        header.appendChild(appDisplay);
        
        return header;
    }


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
     * Create content area
     */
    createContentArea() {
        const content = document.createElement('div');
        content.id = 'agentlet-content';
        content.className = 'agentlet-content';
        
        return content;
    }

    /**
     * Create actions area
     */
    createActionsArea() {
        const actions = document.createElement('div');
        actions.id = 'agentlet-actions';
        actions.className = 'agentlet-actions';
        
        // Core action buttons
        const refreshBtn = this.createActionButton('🔄', 'Refresh', () => this.refreshContent());
        
        // Optional action buttons based on configuration
        let settingsBtn = null;
        if (this.config.showSettingsButton) {
            settingsBtn = this.createActionButton('⚙️', 'Settings', () => this.showSettings());
        }
        
        let helpBtn = null;
        if (this.config.showHelpButton) {
            helpBtn = this.createActionButton('❓', 'Help', () => this.showHelp());
        }
        
        // Add environment variables button if enabled and envManager is available
        let envVarsBtn = null;
        if (this.config.showEnvVarsButton && this.envManager) {
            envVarsBtn = this.createActionButton('🔧', 'Environment Variables', () => this.showEnvVarsDialog());
        }
        
        // Add authentication button if enabled
        const authBtn = this.authManager.createLoginButton();
        
        // Create discrete close button
        const closeBtn = this.createDiscreteCloseButton();
        
        // Add buttons to actions area
        actions.appendChild(refreshBtn);
        if (settingsBtn) {
            actions.appendChild(settingsBtn);
        }
        if (helpBtn) {
            actions.appendChild(helpBtn);
        }
        if (envVarsBtn) {
            actions.appendChild(envVarsBtn);
        }
        if (authBtn) {
            actions.appendChild(authBtn);
        }
        actions.appendChild(closeBtn);
        
        return actions;
    }

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
    toggleCollapse() {
        const $ = window.agentlet.$;
        const container = this.ui.container;
        const toggleButton = $('#agentlet-toggle')[0];
        
        if (!this.isMinimized) {
            // Collapse
            container.style.transform = 'translateX(100%)';
            
            // Update toggle button if it exists
            if (toggleButton) {
                toggleButton.innerHTML = '◀';
                toggleButton.style.right = '-2px';
            }
            
            this.isMinimized = true;
            
            // Show image overlay if minimizeWithImage is configured
            if (this.config.minimizeWithImage && typeof this.config.minimizeWithImage === 'string') {
                this.showImageOverlay();
            }
            
            this.eventBus.emit('ui:minimized');
        } else {
            // Expand
            container.style.transform = 'translateX(0)';
            
            // Update toggle button if it exists
            if (toggleButton) {
                toggleButton.innerHTML = '▶';
                toggleButton.style.right = '';
            }
            
            this.isMinimized = false;
            
            // Restore panel width for current module when maximizing
            if (this.moduleLoader.activeModule) {
                this.restorePanelWidthForModule(this.moduleLoader.activeModule);
            }
            
            // Don't hide image overlay - it should always be visible when minimizeWithImage is configured
            // The image overlay will handle the toggle functionality
            
            this.eventBus.emit('ui:maximized');
        }
    }

    /**
     * Show image overlay when minimized
     */
    showImageOverlay() {
        // Only show if minimizeWithImage is configured
        if (!this.config.minimizeWithImage || typeof this.config.minimizeWithImage !== 'string') {
            return;
        }
        
        // Remove existing overlay if present
        this.hideImageOverlay();
        
        // Create image overlay
        const imageOverlay = document.createElement('div');
        imageOverlay.className = 'agentlet-image-overlay';
        imageOverlay.innerHTML = `<img src="${this.config.minimizeWithImage}" alt="Agentlet" />`;
        
        // Add click handler to toggle collapse
        imageOverlay.addEventListener('click', () => {
            this.toggleCollapse();
        });
        
        // Add to document
        const $ = window.agentlet.$;
        $(document.body).append(imageOverlay);
        
        // Store reference
        this.ui.imageOverlay = imageOverlay;
    }

    /**
     * Hide image overlay
     */
    hideImageOverlay() {
        const $ = window.agentlet.$;
        
        if (this.ui.imageOverlay) {
            $(this.ui.imageOverlay).remove();
            this.ui.imageOverlay = null;
        }
    }

    /**
     * Ensure image overlay is shown if minimizeWithImage is configured
     */
    ensureImageOverlay() {
        if (this.config.minimizeWithImage && typeof this.config.minimizeWithImage === 'string') {
            this.showImageOverlay();
        }
    }

    /**
     * Update application display
     */
    updateApplicationDisplay() {
        const $ = window.agentlet.$;
        const appNameElement = $('#agentlet-app-display')[0];
        const moduleCountElement = $('#agentlet-module-count')[0];
        
        // Use provided activeModule parameter, fallback to moduleLoader's activeModule
        const activeModule = this.moduleLoader.activeModule;
        
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

        const activeModule = this.moduleLoader.activeModule;
        
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
                    <p>Available modules: ${this.moduleLoader.modules.size}</p>
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
        if (this.moduleLoader.activeModule) {
            if (this.moduleLoader.activeModule.requiresLocalStorageChangeNotification 
                && typeof this.moduleLoader.activeModule.onLocalStorageChange === 'function') {
                console.log(`📦 Notifying module ${this.moduleLoader.activeModule.name} about localStorage change`);
                this.moduleLoader.activeModule.onLocalStorageChange(key, newValue);
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
        if (this.moduleLoader.activeModule && typeof this.moduleLoader.activeModule.showSettings === 'function') {
            console.log(`📦 Using module settings: ${this.moduleLoader.activeModule.name}`);
            this.moduleLoader.activeModule.showSettings();
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
                    <p><strong>Theme:</strong> ${this.config.theme.primaryColor}</p>
                    <p><strong>Modules loaded:</strong> ${this.moduleLoader.modules.size}</p>
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
                    <p><strong>Current:</strong> ${this.moduleLoader.activeModule?.name || 'None'}</p>
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
        if (this.moduleLoader.activeModule && typeof this.moduleLoader.activeModule.showHelp === 'function') {
            console.log(`📦 Using module help: ${this.moduleLoader.activeModule.name}`);
            this.moduleLoader.activeModule.showHelp();
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
                    <p><strong>Modules loaded:</strong> ${this.moduleLoader.modules.size}</p>
                    <p><strong>Active module:</strong> ${this.moduleLoader.activeModule?.name || 'None'}</p>
                    
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
                        statistics: this.moduleLoader.getStatistics()
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
                <p><strong>Modules loaded:</strong> ${this.moduleLoader.modules.size}</p>
                <p><strong>Active module:</strong> ${this.moduleLoader.activeModule?.name || 'None'}</p>
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
        const $ = window.agentlet.$;
        // Simple modal implementation
        const modal = document.createElement('div');
        modal.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 1000000;
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
        $(document.body).append(modal);
        
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
     * Inject CSS styles
     */
    injectStyles() {
        const $ = window.agentlet.$;
        $('#agentlet-core-styles').remove();
        
        const theme = this.config.theme;
        const style = document.createElement('style');
        style.id = 'agentlet-core-styles';
        style.textContent = `
            /* CSS Custom Properties for Theme */
            :root {
                --agentlet-primary-color: ${theme.primaryColor};
                --agentlet-secondary-color: ${theme.secondaryColor};
                --agentlet-background-color: ${theme.backgroundColor};
                --agentlet-content-background: ${theme.contentBackground};
                --agentlet-text-color: ${theme.textColor};
                --agentlet-border-color: ${theme.borderColor};
                --agentlet-header-background: ${theme.headerBackground};
                --agentlet-header-text-color: ${theme.headerTextColor};
                --agentlet-action-button-background: ${theme.actionButtonBackground};
                --agentlet-action-button-border: ${theme.actionButtonBorder};
                --agentlet-action-button-hover: ${theme.actionButtonHover};
                --agentlet-action-button-text: ${theme.actionButtonText};
                --agentlet-panel-width: ${theme.panelWidth};
                --agentlet-border-radius: ${theme.borderRadius};
                --agentlet-box-shadow: ${theme.boxShadow};
                --agentlet-font-family: ${theme.fontFamily};
                --agentlet-header-padding: ${theme.headerPadding};
                --agentlet-content-padding: ${theme.contentPadding};
                --agentlet-actions-padding: ${theme.actionsPadding};
                --agentlet-border-width: ${theme.borderWidth};
                --agentlet-transition-duration: ${theme.transitionDuration};
                
                /* Dialog Theme Variables */
                --agentlet-dialog-overlay-background: ${theme.dialogOverlayBackground};
                --agentlet-dialog-background: ${theme.dialogBackground};
                --agentlet-dialog-border-radius: ${theme.dialogBorderRadius};
                --agentlet-dialog-box-shadow: ${theme.dialogBoxShadow};
                --agentlet-dialog-header-background: ${theme.dialogHeaderBackground};
                --agentlet-dialog-header-text-color: ${theme.dialogHeaderTextColor};
                --agentlet-dialog-content-background: ${theme.dialogContentBackground};
                --agentlet-dialog-content-text-color: ${theme.dialogContentTextColor};
                --agentlet-dialog-button-primary-background: ${theme.dialogButtonPrimaryBackground};
                --agentlet-dialog-button-primary-hover: ${theme.dialogButtonPrimaryHover};
                --agentlet-dialog-button-secondary-background: ${theme.dialogButtonSecondaryBackground};
                --agentlet-dialog-button-secondary-hover: ${theme.dialogButtonSecondaryHover};
                --agentlet-dialog-button-danger-background: ${theme.dialogButtonDangerBackground};
                --agentlet-dialog-button-danger-hover: ${theme.dialogButtonDangerHover};
                --agentlet-dialog-progress-bar-background: ${theme.dialogProgressBarBackground};
                --agentlet-dialog-progress-bar-track-background: ${theme.dialogProgressBarTrackBackground};
                
                /* WaitDialog Theme Variables */
                --agentlet-wait-dialog-header-pulse-background: linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%);
                --agentlet-wait-dialog-header-pulse-animation: waitPulse 2s ease-in-out infinite;
                --agentlet-wait-dialog-button-border-color: #ddd;
                --agentlet-wait-dialog-button-hover-background: #f8f9fa;
                --agentlet-wait-dialog-button-hover-border-color: #bbb;
                
                /* Spinner Theme Variables */
                --agentlet-spinner-track-color: #f3f3f3;
                --agentlet-spinner-color: #667eea;
                
                /* InfoDialog Theme Variables */
                --agentlet-info-dialog-overlay-background: rgba(0, 0, 0, 0.5);
                --agentlet-info-dialog-background: white;
                --agentlet-info-dialog-border-radius: 8px;
                --agentlet-info-dialog-box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                --agentlet-info-dialog-header-background: var(--agentlet-dialog-header-background);
                --agentlet-info-dialog-header-text-color: var(--agentlet-dialog-header-text-color);
                --agentlet-info-dialog-content-background: white;
                --agentlet-info-dialog-content-text-color: #333;
                --agentlet-info-dialog-content-padding: 20px;
                --agentlet-info-dialog-message-color: #333;
                --agentlet-info-dialog-message-font-size: 14px;
                --agentlet-info-dialog-message-line-height: 1.5;
                --agentlet-info-dialog-button-gap: 10px;
                --agentlet-info-dialog-button-padding: 8px 16px;
                --agentlet-info-dialog-button-border-radius: 4px;
                --agentlet-info-dialog-button-font-size: 14px;
                --agentlet-info-dialog-button-transition: all 0.2s ease;
                --agentlet-info-dialog-button-min-width: 80px;
                --agentlet-info-dialog-button-gap-inner: 6px;
                --agentlet-info-dialog-button-icon-font-size: 12px;
                --agentlet-info-dialog-button-focus-outline: 2px solid #007bff;
                --agentlet-info-dialog-button-focus-outline-offset: 2px;
                
                /* InputDialog Theme Variables */
                --agentlet-input-dialog-overlay-background: rgba(0, 0, 0, 0.5);
                --agentlet-input-dialog-background: white;
                --agentlet-input-dialog-border-radius: 8px;
                --agentlet-input-dialog-box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
                --agentlet-input-dialog-header-background: var(--agentlet-dialog-header-background);
                --agentlet-input-dialog-header-text-color: var(--agentlet-dialog-header-text-color);
                --agentlet-input-dialog-content-background: white;
                --agentlet-input-dialog-content-text-color: #333;
                --agentlet-input-dialog-content-padding: 20px;
                --agentlet-input-dialog-message-color: #333;
                --agentlet-input-dialog-message-font-size: 14px;
                --agentlet-input-dialog-message-line-height: 1.4;
                --agentlet-input-dialog-message-margin-bottom: 16px;
                --agentlet-input-dialog-input-border: 2px solid #e0e0e0;
                --agentlet-input-dialog-input-border-radius: 4px;
                --agentlet-input-dialog-input-padding: 10px 12px;
                --agentlet-input-dialog-input-font-size: 14px;
                --agentlet-input-dialog-input-transition: border-color 0.2s ease;
                --agentlet-input-dialog-input-margin-bottom: 20px;
                --agentlet-input-dialog-button-gap: 10px;
                --agentlet-input-dialog-button-padding: 8px 16px;
                --agentlet-input-dialog-button-border-radius: 4px;
                --agentlet-input-dialog-button-font-size: 14px;
                --agentlet-input-dialog-button-transition: all 0.2s ease;
                --agentlet-input-dialog-button-min-width: 80px;
                
                /* ProgressBar Theme Variables */
                --agentlet-progress-dialog-overlay-background: rgba(0, 0, 0, 0.5);
                --agentlet-progress-dialog-background: white;
                --agentlet-progress-dialog-border-radius: 8px;
                --agentlet-progress-dialog-box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
                --agentlet-progress-dialog-header-background: var(--agentlet-dialog-header-background);
                --agentlet-progress-dialog-header-text-color: var(--agentlet-dialog-header-text-color);
                --agentlet-progress-dialog-content-background: white;
                --agentlet-progress-dialog-content-text-color: #333;
                --agentlet-progress-dialog-content-padding: 20px;
                --agentlet-progress-message-color: #333;
                --agentlet-progress-message-font-size: 14px;
                --agentlet-progress-message-text-align: center;
                --agentlet-progress-message-min-height: 20px;
                --agentlet-progress-message-margin-bottom: 16px;
                --agentlet-progress-bar-container-height: 8px;
                --agentlet-progress-bar-container-border-radius: 4px;
                --agentlet-progress-bar-container-margin-bottom: 12px;
                --agentlet-progress-bar-border-radius: 4px;
                --agentlet-progress-bar-transition: width 0.3s ease;
                --agentlet-progress-info-font-size: 12px;
                --agentlet-progress-info-color: #666;
                --agentlet-progress-info-margin-bottom: 12px;
                --agentlet-progress-actions-margin-top: 16px;
                --agentlet-progress-actions-gap: 8px;
                
                /* Image Overlay Theme Variables */
                --agentlet-image-overlay-width: ${theme.imageOverlayWidth};
                --agentlet-image-overlay-height: ${theme.imageOverlayHeight};
                --agentlet-image-overlay-bottom: ${theme.imageOverlayBottom};
                --agentlet-image-overlay-right: ${theme.imageOverlayRight};
                --agentlet-image-overlay-z-index: ${theme.imageOverlayZIndex};
                --agentlet-image-overlay-transition: ${theme.imageOverlayTransition};
                --agentlet-image-overlay-hover-scale: ${theme.imageOverlayHoverScale};
            }

            /* Main Panel */
            .agentlet-panel {
                position: fixed;
                top: 0;
                height: 100vh;
                z-index: 999999;
                background: var(--agentlet-background-color);
                font-family: var(--agentlet-font-family);
                transition: all var(--agentlet-transition-duration) ease;
                user-select: auto;
                display: flex;
                flex-direction: column;
                width: var(--agentlet-panel-width);
                max-width: 90vw;
                border-radius: var(--agentlet-border-radius);
            }

            .agentlet-panel {
                right: 0;
                border-left: var(--agentlet-border-width) solid var(--agentlet-border-color);
                box-shadow: var(--agentlet-box-shadow);
            }

            /* Toggle Button */
            .agentlet-toggle {
                position: fixed;
                top: 50%;
                right: var(--agentlet-panel-width);
                background: var(--agentlet-secondary-color);
                border: var(--agentlet-border-width) solid var(--agentlet-border-color);
                border-radius: 5px 0px 0px 5px;
                box-shadow: -2px 0 5px rgba(0,0,0,0.1);
                font-size: 12px;
                cursor: pointer;
                color: #FFF;
                padding: 8px 4px;
                margin: 0px;
                width: 20px;
                height: 40px;
                line-height: 1;
                transition: all var(--agentlet-transition-duration) ease;
                z-index: 1000000;
            }

            /* Resize Handle */
            .agentlet-resize-handle {
                position: absolute;
                left: 0;
                top: 0;
                width: 4px;
                height: 100%;
                cursor: ew-resize;
                background: transparent;
                z-index: 1000001;
            }

            .agentlet-resize-handle:hover {
                background: var(--agentlet-primary-color);
                opacity: 0.3;
            }

            .agentlet-resize-handle:active {
                background: var(--agentlet-primary-color);
                opacity: 0.5;
            }

            /* Header */
            .agentlet-header {
                padding: var(--agentlet-header-padding);
                border-bottom: 1px solid var(--agentlet-border-color);
                background: var(--agentlet-header-background);
                color: var(--agentlet-header-text-color);
                flex-shrink: 0;
                cursor: default;
            }

            .agentlet-app-display {
                font-size: 14px;
                text-align: center;
                font-weight: 500;
            }

            #agentlet-app-name {
                
            }

            /* Content Area */
            .agentlet-content {
                flex: 1;
                overflow-y: auto;
                padding: var(--agentlet-content-padding);
                background: var(--agentlet-content-background);
            }

            /* Actions Area */
            .agentlet-actions {
                padding: var(--agentlet-actions-padding);
                border-top: 1px solid var(--agentlet-border-color);
                background: var(--agentlet-background-color);
                flex-shrink: 0;
            }

            /* Action Buttons */
            .agentlet-action-btn {
                background: var(--agentlet-action-button-background);
                border: 1px solid var(--agentlet-action-button-border);
                border-radius: 4px;
                padding: 6px 8px;
                margin-right: 8px;
                cursor: pointer;
                font-size: 12px;
                color: var(--agentlet-action-button-text);
                transition: all var(--agentlet-transition-duration) ease;
            }

            .agentlet-action-btn:hover {
                background: var(--agentlet-action-button-hover);
                border-color: var(--agentlet-action-button-border);
            }

            .agentlet-action-btn--close {
                margin-left: 5px;
                display: inline-flex;
                align-items: center;
                justify-content: center;
                min-width: 32px;
                height: 32px;
                font-size: 14px;
            }

            /* Module Content Styles */
            .agentlet-module-content {
                margin-bottom: 15px;
                padding: 12px;
                border: 1px solid #dee2e6;
                border-radius: 6px;
                background: white;
            }
            
            .agentlet-module-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 10px;
                padding-bottom: 8px;
                border-bottom: 1px solid #e9ecef;
            }
            
            .agentlet-module-header h3 {
                margin: 0;
                font-size: 14px;
                color: #495057;
            }
            
            .agentlet-module-version {
                font-size: 11px;
                color: #6c757d;
                background: #f8f9fa;
                padding: 2px 6px;
                border-radius: 10px;
            }
            
            .agentlet-btn {
                background: #007bff;
                color: white;
                border: none;
                padding: 6px 12px;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                margin: 2px;
                transition: background-color 0.2s ease;
            }
            
            .agentlet-btn:hover {
                background: #0056b3;
            }
            
            .agentlet-btn-secondary {
                background: #6c757d;
            }
            
            .agentlet-btn-secondary:hover {
                background: #545b62;
            }
            
            .agentlet-btn-sm {
                padding: 4px 8px;
                font-size: 11px;
            }
            
            .agentlet-submodule-content {
                margin-top: 10px;
                padding: 8px;
                background: #f8f9fa;
                border-radius: 4px;
                border-left: 3px solid #007bff;
            }
            
            .agentlet-submodule-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                margin-bottom: 6px;
            }
            
            .agentlet-submodule-header h4 {
                margin: 0;
                font-size: 12px;
                color: #495057;
            }
            
            .agentlet-submodule-status.active {
                color: #28a745;
                font-weight: bold;
            }
            
            .agentlet-submodule-status.inactive {
                color: #6c757d;
            }
            
            .agentlet-welcome {
                text-align: center;
                padding: 20px;
                color: #6c757d;
            }
            
            .agentlet-error {
                background: #f8d7da;
                color: #721c24;
                padding: 10px;
                border-radius: 4px;
                border: 1px solid #f5c6cb;
            }
            
            /* Unified Dialog Styles - Applied to all utility dialogs */
            .agentlet-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: var(--agentlet-dialog-overlay-background);
                z-index: 999999;
                display: flex;
                align-items: center;
                justify-content: center;
                font-family: var(--agentlet-font-family);
            }
            
            .agentlet-dialog-container {
                background: var(--agentlet-dialog-background);
                border-radius: var(--agentlet-dialog-border-radius);
                box-shadow: var(--agentlet-dialog-box-shadow);
                max-width: 90vw;
                max-height: 90vh;
                overflow: hidden;
                animation: agentlet-dialog-fadein 0.3s ease;
            }
            
            .agentlet-dialog-header {
                background: var(--agentlet-dialog-header-background);
                color: var(--agentlet-dialog-header-text-color);
                padding: 16px 20px;
                display: flex;
                align-items: center;
                gap: 10px;
                font-weight: 600;
                font-size: 16px;
            }
            
            .agentlet-dialog-content {
                background: var(--agentlet-dialog-content-background);
                color: var(--agentlet-dialog-content-text-color);
                padding: 20px;
                font-size: 14px;
                line-height: 1.5;
            }
            
            .agentlet-dialog-actions {
                background: var(--agentlet-dialog-content-background);
                padding: 16px 20px;
                border-top: 1px solid var(--agentlet-border-color);
                display: flex;
                gap: 8px;
                justify-content: flex-end;
            }
            
            .agentlet-dialog-btn {
                padding: 8px 16px;
                border: none;
                border-radius: 4px;
                cursor: pointer;
                font-size: 12px;
                font-weight: 500;
                transition: all var(--agentlet-transition-duration) ease;
                min-width: 80px;
            }
            
            .agentlet-dialog-btn-primary {
                background: var(--agentlet-dialog-button-primary-background);
                color: white;
            }
            
            .agentlet-dialog-btn-primary:hover {
                background: var(--agentlet-dialog-button-primary-hover);
            }
            
            .agentlet-dialog-btn-secondary {
                background: var(--agentlet-dialog-button-secondary-background);
                color: white;
            }
            
            .agentlet-dialog-btn-secondary:hover {
                background: var(--agentlet-dialog-button-secondary-hover);
            }
            
            .agentlet-dialog-btn-danger {
                background: var(--agentlet-dialog-button-danger-background);
                color: white;
            }
            
            .agentlet-dialog-btn-danger:hover {
                background: var(--agentlet-dialog-button-danger-hover);
            }
            
            .agentlet-progress-bar-themed {
                background: var(--agentlet-dialog-progress-bar-background);
            }
            
            .agentlet-progress-track-themed {
                background: var(--agentlet-dialog-progress-bar-track-background);
            }
            
            /* WaitDialog Styles */
            .agentlet-wait-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: var(--agentlet-dialog-overlay-background);
                z-index: 1000002;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .agentlet-wait-dialog {
                background: var(--agentlet-dialog-background);
                border-radius: 12px;
                box-shadow: var(--agentlet-dialog-box-shadow);
                padding: 0;
                min-width: 400px;
                max-width: 90vw;
                font-family: var(--agentlet-font-family);
                z-index: 1000003;
                animation: waitDialogFadeIn var(--agentlet-transition-duration) ease-out;
                overflow: hidden;
                text-align: center;
            }
            
            .agentlet-wait-dialog-header {
                background: var(--agentlet-dialog-header-background);
                color: var(--agentlet-dialog-header-text-color);
                padding: 20px 24px;
                border-radius: 12px 12px 0 0;
                font-weight: 600;
                font-size: 18px;
                display: flex;
                align-items: center;
                justify-content: center;
                gap: 12px;
                position: relative;
            }
            
            .agentlet-wait-dialog-header-pulse {
                position: absolute;
                top: 0;
                left: 0;
                right: 0;
                bottom: 0;
                background: var(--agentlet-wait-dialog-header-pulse-background);
                animation: var(--agentlet-wait-dialog-header-pulse-animation);
                border-radius: 12px 12px 0 0;
            }
            
            .agentlet-wait-dialog-icon {
                font-size: 24px;
                line-height: 1;
                z-index: 1;
                position: relative;
            }
            
            .agentlet-wait-dialog-title {
                z-index: 1;
                position: relative;
            }
            
            .agentlet-wait-dialog-content {
                padding: 32px 24px;
                display: flex;
                flex-direction: column;
                align-items: center;
                gap: 20px;
            }
            
            .agentlet-wait-spinner-container {
                display: flex;
                justify-content: center;
                align-items: center;
            }
            
            .agentlet-wait-spinner {
                width: 40px;
                height: 40px;
                border: 4px solid var(--agentlet-spinner-track-color);
                border-top: 4px solid var(--agentlet-spinner-color);
                border-radius: 50%;
                animation: waitSpin 1s linear infinite;
            }
            
            .agentlet-wait-message {
                color: var(--agentlet-dialog-content-text-color);
                font-size: 16px;
                line-height: 1.5;
                text-align: center;
                max-width: 350px;
            }
            
            .agentlet-wait-cancel-button {
                padding: 10px 20px;
                border: 2px solid var(--agentlet-wait-dialog-button-border-color);
                background: var(--agentlet-dialog-background);
                color: #666;
                border-radius: 6px;
                cursor: pointer;
                font-size: 14px;
                font-weight: 500;
                transition: all 0.2s ease;
                margin-top: 10px;
            }
            
            .agentlet-wait-cancel-button:hover {
                background: var(--agentlet-wait-dialog-button-hover-background);
                border-color: var(--agentlet-wait-dialog-button-hover-border-color);
            }
            
            @keyframes waitDialogFadeIn {
                from {
                    opacity: 0;
                    transform: scale(0.9) translateY(-20px);
                }
                to {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
            }
            
            @keyframes waitSpin {
                0% { transform: rotate(0deg); }
                100% { transform: rotate(360deg); }
            }
            
            @keyframes waitPulse {
                0%, 100% { opacity: 0.3; }
                50% { opacity: 0.6; }
            }
            
            /* InfoDialog Styles */
            .agentlet-info-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: var(--agentlet-info-dialog-overlay-background);
                z-index: 1000002;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .agentlet-info-dialog {
                background: var(--agentlet-info-dialog-background);
                border-radius: var(--agentlet-info-dialog-border-radius);
                box-shadow: var(--agentlet-info-dialog-box-shadow);
                padding: 0;
                min-width: 400px;
                max-width: 90vw;
                max-height: 80vh;
                font-family: var(--agentlet-font-family);
                z-index: 1000003;
                animation: dialogFadeIn 0.2s ease-out;
                overflow: hidden;
            }
            
            .agentlet-info-dialog-header {
                background: var(--agentlet-info-dialog-header-background);
                color: var(--agentlet-info-dialog-header-text-color);
                padding: 16px 20px;
                border-radius: var(--agentlet-info-dialog-border-radius) var(--agentlet-info-dialog-border-radius) 0 0;
                font-weight: 600;
                font-size: 16px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .agentlet-info-dialog-content {
                padding: var(--agentlet-info-dialog-content-padding);
                overflow-y: auto;
                max-height: 60vh;
            }
            
            .agentlet-info-dialog-message {
                margin: 0 0 20px 0;
                color: var(--agentlet-info-dialog-message-color);
                font-size: var(--agentlet-info-dialog-message-font-size);
                line-height: var(--agentlet-info-dialog-message-line-height);
                word-wrap: break-word;
            }
            
            .agentlet-info-dialog-buttons {
                display: flex;
                gap: var(--agentlet-info-dialog-button-gap);
                justify-content: flex-end;
                flex-wrap: wrap;
            }
            
            .agentlet-info-btn {
                padding: var(--agentlet-info-dialog-button-padding);
                border: 1px solid #dee2e6;
                background: #f8f9fa;
                color: #333;
                border-radius: var(--agentlet-info-dialog-button-border-radius);
                cursor: pointer;
                font-size: var(--agentlet-info-dialog-button-font-size);
                transition: var(--agentlet-info-dialog-button-transition);
                display: flex;
                align-items: center;
                gap: var(--agentlet-info-dialog-button-gap-inner);
                opacity: 1;
                min-width: var(--agentlet-info-dialog-button-min-width);
                justify-content: center;
            }
            
            .agentlet-info-btn:hover {
                background: #e9ecef;
            }
            
            .agentlet-info-btn:focus {
                outline: var(--agentlet-info-dialog-button-focus-outline);
                outline-offset: var(--agentlet-info-dialog-button-focus-outline-offset);
            }
            
            .agentlet-info-btn-primary {
                background: var(--agentlet-dialog-button-primary-background);
                color: white;
                border: none;
            }
            
            .agentlet-info-btn-primary:hover {
                background: var(--agentlet-dialog-button-primary-hover);
            }
            
            .agentlet-info-btn-secondary {
                background: var(--agentlet-dialog-button-secondary-background);
                color: white;
                border: none;
            }
            
            .agentlet-info-btn-secondary:hover {
                background: var(--agentlet-dialog-button-secondary-hover);
            }
            
            .agentlet-info-btn-danger {
                background: var(--agentlet-dialog-button-danger-background);
                color: white;
                border: none;
            }
            
            .agentlet-info-btn-danger:hover {
                background: var(--agentlet-dialog-button-danger-hover);
            }
            
            .agentlet-info-btn-icon {
                font-size: var(--agentlet-info-dialog-button-icon-font-size);
            }
            
            .agentlet-info-btn:disabled {
                opacity: 0.6;
                cursor: not-allowed;
            }
            
            /* InputDialog Styles */
            .agentlet-input-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: var(--agentlet-input-dialog-overlay-background);
                z-index: 1000002;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .agentlet-input-dialog {
                background: var(--agentlet-input-dialog-background);
                border-radius: var(--agentlet-input-dialog-border-radius);
                box-shadow: var(--agentlet-input-dialog-box-shadow);
                padding: 0;
                min-width: 400px;
                max-width: 90vw;
                font-family: var(--agentlet-font-family);
                z-index: 1000003;
                animation: dialogFadeIn 0.2s ease-out;
            }
            
            .agentlet-input-dialog-header {
                background: var(--agentlet-input-dialog-header-background);
                color: var(--agentlet-input-dialog-header-text-color);
                padding: 16px 20px;
                border-radius: var(--agentlet-input-dialog-border-radius) var(--agentlet-input-dialog-border-radius) 0 0;
                font-weight: 600;
                font-size: 16px;
            }
            
            .agentlet-input-dialog-content {
                padding: var(--agentlet-input-dialog-content-padding);
            }
            
            .agentlet-input-dialog-message {
                margin: 0 0 var(--agentlet-input-dialog-message-margin-bottom) 0;
                color: var(--agentlet-input-dialog-message-color);
                font-size: var(--agentlet-input-dialog-message-font-size);
                line-height: var(--agentlet-input-dialog-message-line-height);
            }
            
            .agentlet-input-dialog-input {
                width: 100%;
                padding: var(--agentlet-input-dialog-input-padding);
                border: var(--agentlet-input-dialog-input-border);
                border-radius: var(--agentlet-input-dialog-input-border-radius);
                font-size: var(--agentlet-input-dialog-input-font-size);
                font-family: inherit;
                margin-bottom: var(--agentlet-input-dialog-input-margin-bottom);
                transition: var(--agentlet-input-dialog-input-transition);
                box-sizing: border-box;
                line-height: 1.5;
            }
            
            .agentlet-input-dialog-input:focus {
                outline: none;
                border-color: var(--agentlet-primary-color);
            }
            
            .agentlet-input-dialog-textarea {
                resize: vertical;
                min-height: 6em;
            }
            
            .agentlet-input-dialog-textarea:not(.agentlet-input-dialog-textarea--resizable) {
                resize: none;
            }
            
            .agentlet-input-dialog-buttons {
                display: flex;
                gap: var(--agentlet-input-dialog-button-gap);
                justify-content: flex-end;
            }
            
            .agentlet-input-btn {
                padding: var(--agentlet-input-dialog-button-padding);
                border: 1px solid #dee2e6;
                background: #f8f9fa;
                color: #333;
                border-radius: var(--agentlet-input-dialog-button-border-radius);
                cursor: pointer;
                font-size: var(--agentlet-input-dialog-button-font-size);
                transition: var(--agentlet-input-dialog-button-transition);
                min-width: var(--agentlet-input-dialog-button-min-width);
            }
            
            .agentlet-input-btn:hover {
                background: #e9ecef;
            }
            
            .agentlet-input-btn-primary {
                background: var(--agentlet-dialog-button-primary-background);
                color: white;
                border: none;
            }
            
            .agentlet-input-btn-primary:hover {
                background: var(--agentlet-dialog-button-primary-hover);
            }
            
            .agentlet-input-btn-secondary {
                background: var(--agentlet-dialog-button-secondary-background);
                color: white;
                border: none;
            }
            
            .agentlet-input-btn-secondary:hover {
                background: var(--agentlet-dialog-button-secondary-hover);
            }
            
            /* ProgressBar Styles */
            .agentlet-progress-dialog-overlay {
                position: fixed;
                top: 0;
                left: 0;
                width: 100vw;
                height: 100vh;
                background: var(--agentlet-progress-dialog-overlay-background);
                z-index: 1000002;
                display: flex;
                align-items: center;
                justify-content: center;
            }
            
            .agentlet-progress-dialog {
                background: var(--agentlet-progress-dialog-background);
                border-radius: var(--agentlet-progress-dialog-border-radius);
                box-shadow: var(--agentlet-progress-dialog-box-shadow);
                padding: 0;
                min-width: 400px;
                max-width: 90vw;
                font-family: var(--agentlet-font-family);
                z-index: 1000003;
                animation: dialogFadeIn 0.2s ease-out;
                overflow: hidden;
            }
            
            .agentlet-progress-dialog-header {
                background: var(--agentlet-progress-dialog-header-background);
                color: var(--agentlet-progress-dialog-header-text-color);
                padding: 16px 20px;
                border-radius: var(--agentlet-progress-dialog-border-radius) var(--agentlet-progress-dialog-border-radius) 0 0;
                font-weight: 600;
                font-size: 16px;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .agentlet-progress-dialog-content {
                padding: var(--agentlet-progress-dialog-content-padding);
            }
            
            .agentlet-progress-message {
                color: var(--agentlet-progress-message-color);
                font-size: var(--agentlet-progress-message-font-size);
                text-align: var(--agentlet-progress-message-text-align);
                min-height: var(--agentlet-progress-message-min-height);
                margin-bottom: var(--agentlet-progress-message-margin-bottom);
            }
            
            .agentlet-progress-bar-container {
                width: 100%;
                height: var(--agentlet-progress-bar-container-height);
                border-radius: var(--agentlet-progress-bar-container-border-radius);
                overflow: hidden;
                margin-bottom: var(--agentlet-progress-bar-container-margin-bottom);
                position: relative;
            }
            
            .agentlet-progress-bar {
                width: 0%;
                height: 100%;
                border-radius: var(--agentlet-progress-bar-border-radius);
                transition: var(--agentlet-progress-bar-transition);
                position: relative;
            }
            
            .agentlet-progress-info {
                display: flex;
                justify-content: space-between;
                align-items: center;
                font-size: var(--agentlet-progress-info-font-size);
                color: var(--agentlet-progress-info-color);
                margin-bottom: var(--agentlet-progress-info-margin-bottom);
            }
            
            .agentlet-progress-percentage {
                font-weight: 600;
            }
            
            .agentlet-progress-eta {
                font-style: italic;
            }
            
            .agentlet-progress-step {
                text-align: center;
                font-weight: 500;
            }
            
            .agentlet-progress-actions {
                margin-top: var(--agentlet-progress-actions-margin-top);
                display: flex;
                gap: var(--agentlet-progress-actions-gap);
                justify-content: flex-end;
            }
            
            @keyframes dialogFadeIn {
                from {
                    opacity: 0;
                    transform: scale(0.9) translateY(-10px);
                }
                to {
                    opacity: 1;
                    transform: scale(1) translateY(0);
                }
            }
            
            @keyframes agentlet-progress-animate {
                0% { background-position: 0% 50%; }
                100% { background-position: 200% 50%; }
            }
            
            @keyframes agentlet-dialog-fadein {
                from { opacity: 0; transform: scale(0.9); }
                to { opacity: 1; transform: scale(1); }
            }
            
            /* Image Overlay Styles */
            .agentlet-image-overlay {
                position: fixed;
                bottom: var(--agentlet-image-overlay-bottom);
                right: var(--agentlet-image-overlay-right);
                width: var(--agentlet-image-overlay-width);
                height: var(--agentlet-image-overlay-height);
                z-index: var(--agentlet-image-overlay-z-index);
                cursor: pointer;
                transition: var(--agentlet-image-overlay-transition);
                overflow: hidden;
            }
            
            .agentlet-image-overlay:hover {
                transform: scale(var(--agentlet-image-overlay-hover-scale));
            }
            
            .agentlet-image-overlay img {
                width: 100%;
                height: 100%;
                object-fit: contain;
                display: block;
            }
            
            /* Background scroll blocking when dialogs are open */
            body.agentlet-dialog-open {
                overflow: hidden !important;
                position: fixed !important;
                width: 100% !important;
                height: 100% !important;
            }
            
            /* Ensure dialog overlays and content remain scrollable */
            .agentlet-dialog-overlay,
            .agentlet-fullscreen-dialog,
            .agentlet-info-dialog {
                overflow-y: auto !important;
            }
            
            .agentlet-dialog-content,
            .agentlet-fullscreen-content {
                overflow-y: auto !important;
                max-height: calc(100vh - 120px) !important;
            }
        `;
        
        $(document.head).append(style);
    }

    /**
     * Regenerate styles with updated theme
     */
    regenerateStyles() {
        this.injectStyles();
        this.eventBus.emit('ui:stylesRegenerated');
        console.log('🎨 Styles regenerated with updated theme');
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics() {
        return {
            core: this.performanceMetrics,
            moduleLoader: this.moduleLoader.getLoadingMetrics(),
            modules: Array.from(this.moduleLoader.modules.values()).map(module => ({
                name: module.name,
                metrics: module.performanceMetrics || {}
            }))
        };
    }

    /**
     * UI control methods
     */
    show() {
        if (this.ui.container) {
            this.ui.container.style.display = 'flex';
        }
    }

    hide() {
        if (this.ui.container) {
            this.ui.container.style.display = 'none';
        }
    }

    minimize() {
        if (!this.isMinimized) {
            this.toggleCollapse();
        }
    }

    maximize() {
        if (this.isMinimized) {
            this.toggleCollapse();
        }
    }

    /**
     * Resize panel to a preset size or custom width
     * @param {string|number} size - 'small', 'medium', 'large', or width in pixels
     */
    resizePanel(size) {
        if (!this.config.resizablePanel) {
            console.warn('Panel resizing is disabled');
            return;
        }

        let targetWidth;
        
        if (typeof size === 'string') {
            switch (size.toLowerCase()) {
                case 'small':
                    targetWidth = this.config.minimumPanelWidth;
                    break;
                case 'medium':
                    targetWidth = Math.max(480, this.config.minimumPanelWidth);
                    break;
                case 'large':
                    targetWidth = Math.max(640, this.config.minimumPanelWidth);
                    break;
                default:
                    console.warn(`Unknown panel size: ${size}. Use 'small', 'medium', 'large', or a numeric width.`);
                    return;
            }
        } else if (typeof size === 'number') {
            targetWidth = Math.max(size, this.config.minimumPanelWidth);
        } else {
            console.warn('Invalid size parameter. Use "small", "medium", "large", or a numeric width.');
            return;
        }

        this.setPanelWidth(targetWidth);
    }

    /**
     * Set panel width to a specific value
     * @param {number} width - Width in pixels
     */
    setPanelWidth(width) {
        if (!this.config.resizablePanel) {
            console.warn('Panel resizing is disabled');
            return;
        }

        if (typeof width !== 'number' || width < this.config.minimumPanelWidth) {
            console.warn(`Invalid width. Must be a number >= ${this.config.minimumPanelWidth}`);
            return;
        }

        const container = this.ui.container;
        if (!container) {
            console.warn('Panel container not found');
            return;
        }

        container.style.width = `${width}px`;
        
        // Update CSS custom property for consistent theming
        document.documentElement.style.setProperty('--agentlet-panel-width', `${width}px`);
        
        // Update toggle button position if it exists
        const toggleButton = document.getElementById('agentlet-toggle');
        if (toggleButton && !this.isMinimized) {
            toggleButton.style.right = `${width}px`;
        }
        
        // Emit single resize complete event
        this.eventBus.emit('panel:resizeComplete', { width });
        
        // Save panel width for the current module if env vars are available
        this.savePanelWidthForModule(width);
        
        console.log(`Panel resized to ${width}px`);
    }

    /**
     * Get current panel width
     * @returns {number} Current panel width in pixels
     */
    getPanelWidth() {
        const container = this.ui.container;
        if (!container) {
            return parseInt(this.config.theme.panelWidth) || this.config.minimumPanelWidth;
        }
        return container.offsetWidth;
    }

    /**
     * Save panel width for the current module in environment variables
     * @param {number} width - Width in pixels to save
     */
    savePanelWidthForModule(width) {
        if (!this.envManager || !this.moduleLoader.activeModule) {
            return;
        }

        const moduleName = this.moduleLoader.activeModule.name;
        if (!moduleName) {
            return;
        }

        const envKey = `panel_width_${moduleName}`;
        this.envManager.set(envKey, width.toString());
        console.log(`Saved panel width ${width}px for module '${moduleName}'`);
    }

    /**
     * Restore panel width for a specific module from environment variables
     * @param {Object} activeModule - The module to restore width for
     */
    restorePanelWidthForModule(activeModule) {
        if (!this.envManager || !activeModule || !activeModule.name) {
            return;
        }

        // Skip restoration only if currently minimized (not just if it started minimized)
        if (this.isMinimized) {
            return;
        }

        const moduleName = activeModule.name;
        const envKey = `panel_width_${moduleName}`;
        const savedWidth = this.envManager.get(envKey);

        if (savedWidth) {
            const width = parseInt(savedWidth);
            if (!isNaN(width) && width >= this.config.minimumPanelWidth) {
                // Use setTimeout to ensure UI is ready
                setTimeout(() => {
                    this.setPanelWidth(width);
                    console.log(`Restored panel width ${width}px for module '${moduleName}'`);
                }, 50);
            }
        }
    }

    /**
     * Cleanup method
     */
    async cleanup() {
        try {
            // Cleanup active module
            if (this.moduleLoader.activeModule) {
                await this.moduleLoader.activeModule.cleanup();
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
            const $ = window.agentlet.$;
            const container = this.ui.container;
            
            if (container) $(container).remove();
            $('#agentlet-toggle').remove();
            $('#agentlet-core-styles').remove();
            
            // Remove image overlay if present
            this.hideImageOverlay();
            
            // Reset initialization flag and clear module state for clean reload
            this.initialized = false;
            if (this.moduleLoader) {
                // Cleanup active module and clear registry to force re-registration
                this.moduleLoader.activeModule = null;
                this.moduleLoader.modules.clear();
            }
            
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
                    return value.substring(0, 60) + '…'; // Regular truncate with ellipsis
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

    /**
     * Load environment variables from storage
     */
    loadEnvVarsFromStorage() {
        if (!this.envManager) {
            return; // Environment variables disabled
        }
        
        const storedVars = this.storageManager.get('agentlet-env-vars');
        if (storedVars) {
            try {
                const vars = JSON.parse(storedVars);
                Object.entries(vars).forEach(([key, value]) => {
                    this.envManager.set(key, value);
                });
                this.refreshEnvVarsDialog();
                console.log('🔧 Environment variables loaded from storage');
            } catch (error) {
                console.error('Error loading environment variables from storage:', error);
            }
        }
    }
}

export default AgentletCore;

// Named exports for better library usage
export { AgentletCore };
export { default as BaseModule } from './core/BaseModule.js';
export { default as BaseSubmodule } from './core/BaseSubmodule.js';
export { default as ModuleLoader } from './plugin-system/ModuleLoader.js';

// Export utility classes for external use
export { default as ElementSelector } from './utils/ElementSelector.js';
export { default as Dialog } from './utils/Dialog.js';
export { default as MessageBubble } from './utils/MessageBubble.js';
export { default as ScreenCapture } from './utils/ScreenCapture.js';
export { default as ScriptInjector } from './utils/ScriptInjector.js';
export { default as EnvManager, BaseEnvironmentVariablesManager, LocalStorageEnvironmentVariablesManager } from './utils/EnvManager.js';
export { default as CookieManager } from './utils/CookieManager.js';
export { default as StorageManager } from './utils/StorageManager.js';
export { default as AuthManager } from './utils/AuthManager.js';
export { default as FormExtractor } from './utils/FormExtractor.js';
export { default as FormFiller } from './utils/FormFiller.js';
export { default as TableExtractor } from './utils/TableExtractor.js';
export { default as PDFProcessor } from './utils/PDFProcessor.js';
export { default as ShortcutManager } from './utils/ShortcutManager.js';
