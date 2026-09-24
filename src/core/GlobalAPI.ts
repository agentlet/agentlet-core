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
import type {
    AgentletAPI,
    AgentletUtils,
    ElementSelectorConstructor,
    ScriptInjectorConstructor,
    PageHighlighterAPI
} from '../types/public-api';

export class GlobalAPI {
    core: AgentletAPI;

    constructor(agentletCore: AgentletAPI) {
        this.core = agentletCore;
    }

    /**
     * Set up global access for modules and debugging
     */
    setupGlobalAccess(): void {
        // Make AgentletCore globally accessible
        window.agentlet = this.core;

        // Expose base class for modules
        window.agentlet.Module = Module;

        // Expose utility classes for creating new instances
        //
        // ElementSelector/ScriptInjector (and the still-`.js` utility classes
        // instantiated into `utils` below) predate this file's conversion and
        // are out of scope for it. Without JSDoc types, tsc infers their
        // shape/constructor signatures loosely from usage (e.g. an untyped
        // `attributes: {}` field, or a `constructor(librarySetup = null)`
        // whose inferred parameter type is just `null`), which doesn't line
        // up with the richer hand-written declarations in public-api.d.ts -
        // drift that predates this file being typed at all and is invisible
        // until something typed (this file) crosses the boundary into them.
        // Fixing that drift belongs to converting those classes themselves,
        // not to this conversion, so the casts below (`unknown`/`never`,
        // never `any`) bridge the boundary without changing any runtime call.
        window.agentlet.ElementSelectorClass = ElementSelector as unknown as ElementSelectorConstructor;
        window.agentlet.ScriptInjectorClass = ScriptInjector as unknown as ScriptInjectorConstructor;

        // MessageBubble's real (inferred) constructor takes no parameters -
        // the theme argument below is pre-existing dead code, silently
        // dropped by JS at runtime; only the cast is new here.
        const MessageBubbleFlexible = MessageBubble as unknown as new (theme?: unknown) => MessageBubble;

        // Expose utilities
        const utils = {
            ElementSelector: new ElementSelector(),
            Dialog: new Dialog({ theme: this.core.themeManager.getTheme() }),
            MessageBubble: new MessageBubbleFlexible(this.core.themeManager.getTheme()),
            // `librarySetup` below: same drift as above, real constructor
            // parameter inferred as `null | undefined` only.
            ScreenCapture: new ScreenCapture(this.core.librarySetup as never),
            ScriptInjector: new ScriptInjector(),
            PDFProcessor: new PDFProcessor(this.core.librarySetup as never),
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
        window.agentlet.utils = utils as unknown as AgentletUtils;

        // Point Dialog/MessageBubble at the UI root immediately if it already
        // exists (defensive: setupGlobalAccess() normally runs from the
        // AgentletCore constructor, before UIManager.ensureRoot() creates the
        // root, in which case UIManager.ensureRoot() does this wiring itself
        // once the root is created).
        if (this.core.ui && this.core.ui.root) {
            window.agentlet.utils.Dialog.setRoot(this.core.ui.root);
            window.agentlet.utils.MessageBubble.setRoot(this.core.ui.root);
        }

        // Add PageHighlighter with error handling
        try {
            window.agentlet.utils.PageHighlighter = new PageHighlighter() as unknown as PageHighlighterAPI;
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

        // Merge onto the existing this.core.ui object (rather than replacing it)
        // so window.agentlet.ui stays the exact same object as core.ui - notably
        // preserving the root/host/query/queryAll references UI code relies on.
        Object.assign(window.agentlet.ui, {
            refreshContent: () => this.core.updateModuleContent(),
            show: () => this.core.uiManager.show(),
            hide: () => this.core.uiManager.hide(),
            minimize: () => this.core.uiManager.minimize(),
            maximize: () => this.core.uiManager.maximize(),
            regenerateStyles: () => this.core.regenerateStyles(),
            resizePanel: (size: 'small' | 'medium' | 'large' | number) => this.core.panelManager.resizePanel(size),
            getPanelWidth: () => this.core.panelManager.getPanelWidth(),
            setPanelWidth: (width: number) => this.core.panelManager.setPanelWidth(width)
        });

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
