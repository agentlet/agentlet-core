/**
 * Global API Manager
 * Handles setup of global access for modules and debugging
 */

import Module from './Module.js';
import ElementSelector from '../utils/ui/ElementSelector.js';
import ScriptInjector from '../utils/system/ScriptInjector.js';
import Dialog from '../utils/ui/Dialog.js';
import MessageBubble from '../utils/ui/MessageBubble.js';
import ScreenCapture from '../utils/ui/ScreenCapture.js';
import PDFProcessor from '../utils/ai/PDFProcessor.js';
import PageHighlighter from '../utils/ui/PageHighlighter.js';
import { Z_INDEX, createZIndexConstants, detectMaxZIndex, suggestAgentletZIndexBase, analyzeZIndexDistribution } from '../utils/ui/ZIndex.js';

export class GlobalAPI {
    constructor(agentletCore) {
        this.core = agentletCore;
    }

    /**
     * Set up global access for modules and debugging
     */
    setupGlobalAccess() {
        // Make AgentletCore globally accessible
        window.agentlet = this.core;
        
        // Expose base class for modules
        window.agentlet.Module = Module;
        
        // Expose utility classes for creating new instances
        window.agentlet.ElementSelectorClass = ElementSelector;
        window.agentlet.ScriptInjectorClass = ScriptInjector;
        
        // Expose utilities
        window.agentlet.utils = {
            ElementSelector: new ElementSelector(),
            Dialog: new Dialog({ theme: this.core.themeManager.getTheme() }),
            MessageBubble: new MessageBubble(this.core.themeManager.getTheme()),
            ScreenCapture: new ScreenCapture(this.core.librarySetup),
            ScriptInjector: new ScriptInjector(),
            PDFProcessor: new PDFProcessor(this.core.librarySetup),
            shortcuts: this.core.shortcutManager ? this.core.shortcutManager.createProxy() : null,
            // Z-Index utilities for agentlet development
            zIndex: {
                detect: detectMaxZIndex,
                suggest: suggestAgentletZIndexBase,
                analyze: analyzeZIndexDistribution,
                constants: Z_INDEX,
                createConstants: createZIndexConstants
            }
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
        window.agentlet.env = this.core.envManager ? this.core.envManager.createProxy() : null;
        
        // Expose cookie manager
        window.agentlet.cookies = this.core.cookieManager.createProxy();
        
        // Expose storage managers
        window.agentlet.storage = {
            local: this.core.storageManager.createProxy('localStorage'),
            session: this.core.storageManager.createProxy('sessionStorage'),
            manager: this.core.storageManager
        };
        
        // Expose authentication manager
        window.agentlet.auth = this.core.authManager.createProxy();
        
        // Expose form extractor and filler with AI-ready functions
        window.agentlet.forms = {
            // Form extraction
            extract: (element, options) => this.core.formExtractor.extractFormStructure(element, options),
            exportForAI: (element, options) => this.core.formExtractor.exportForAI(element, options),
            quickExport: (element) => this.core.formExtractor.quickExport(element),
            
            // Form filling (NEW)
            fill: (parentElement, selectorValues, options) => this.core.formFiller.fillForm(parentElement, selectorValues, options),
            fillFromAI: (parentElement, aiFormData, userValues, options) => this.core.formFiller.fillFromAIData(parentElement, aiFormData, userValues, options),
            fillMultiple: (parentElement, formDataArray, options) => this.core.formFiller.fillMultipleForms(parentElement, formDataArray, options),
            
            // Direct access to utilities
            extractor: this.core.formExtractor,
            filler: this.core.formFiller
        };
        
        // Expose table extractor with Excel export functions
        window.agentlet.tables = this.core.tableExtractor.createProxy();
        
        // Expose AI capabilities
        window.agentlet.ai = {
            // Main AI functions
            sendPrompt: (prompt, images, options) => this.core.aiManager.sendPrompt(prompt, images, options),
            sendPromptWithPDF: (prompt, pdfData, options) => this.core.aiManager.sendPromptWithPDF(prompt, pdfData, options),
            convertPDFToImages: (pdfData, options) => this.core.aiManager.convertPDFToImages(pdfData, options),
            isAvailable: () => this.core.aiManager.isAvailable(),
            getStatus: () => this.core.aiManager.getStatus(),
            validateAPI: () => this.core.aiManager.validateAPI(),
            
            // Provider management
            setProvider: (providerName) => this.core.aiManager.setCurrentProvider(providerName),
            getAvailableProviders: () => this.core.aiManager.getAvailableProviders(),
            refresh: () => this.core.aiManager.refresh(),
            
            // Direct access to manager
            manager: this.core.aiManager
        };
        
        // Expose PDF worker configuration
        window.agentlet.configurePDFWorker = (workerUrl) => this.core.librarySetup.configurePDFWorker(workerUrl);
        
        // jQuery removed - using native DOM methods
        
        // Expose initialization status
        window.agentlet.initialized = this.core.initialized;
        
        // Expose useful APIs for modules via ModuleManager
        window.agentlet.modules = {
            get: (name) => this.core.moduleManager ? this.core.moduleManager.get(name) : this.core.moduleRegistry.get(name),
            getAll: () => this.core.moduleManager ? this.core.moduleManager.getAll() : this.core.moduleRegistry.getAll(),
            register: (module) => {
                if (this.core.moduleManager) {
                    this.core.moduleManager.register(module, 'global-api');
                } else {
                    this.core.moduleRegistry.register(module);
                }
            },
            unregister: (name) => this.core.moduleManager ? this.core.moduleManager.unregister(name) : this.core.moduleRegistry.unregister(name)
        };

        // Expose ModuleManager directly for advanced use
        window.agentlet.moduleManager = this.core.moduleManager;
        
        // Also expose moduleRegistry directly for advanced use
        window.agentlet.moduleRegistry = this.core.moduleRegistry;
        
        window.agentlet.ui = {
            refreshContent: () => this.core.updateModuleContent(),
            show: () => this.core.uiManager.show(),
            hide: () => this.core.uiManager.hide(),
            minimize: () => this.core.uiManager.minimize(),
            maximize: () => this.core.uiManager.maximize(),
            regenerateStyles: () => this.core.regenerateStyles(),
            resizePanel: (size) => this.core.panelManager.resizePanel(size),
            getPanelWidth: () => this.core.panelManager.getPanelWidth(),
            setPanelWidth: (width) => this.core.panelManager.setPanelWidth(width)
        };
        
        // jQuery removed - no longer needed
        
        // Expose theme for utility classes
        window.agentlet.theme = this.core.themeManager.getTheme();
        
        // Development helpers
        if (this.core.config.debugMode) {
            window.agentlet.debug = {
                getMetrics: () => this.core.getPerformanceMetrics(),
                getConfig: () => this.core.config,
                getStatistics: () => this.core.moduleRegistry.getStatistics(),
                eventBus: this.core.eventBus,
                envManager: this.core.envManager,
                cookieManager: this.core.cookieManager,
                storageManager: this.core.storageManager
            };
        }
    }
}