/**
 * Agentlet Core - Enhanced AI-powered bookmarklet system
 * Main application entry point with plugin architecture
 */

import ModuleRegistry from './core/ModuleRegistry.js';
import ModuleManager from './core/ModuleManager.js';
// import Module from './core/Module.js';
// import ElementSelector from './utils/ui/ElementSelector.js';
import Dialog from './utils/ui/Dialog.js';
// import MessageBubble from './utils/ui/MessageBubble.js';
// import ScreenCapture from './utils/ui/ScreenCapture.js';
// import ScriptInjector from './utils/system/ScriptInjector.js';
import { LocalStorageEnvironmentVariablesManager } from './utils/config-persistence/EnvManager.js';
import CookieManager from './utils/config-persistence/CookieManager.js';
import StorageManager from './utils/config-persistence/StorageManager.js';
import { Z_INDEX } from './utils/ui/ZIndex.js';
import AuthManager from './utils/system/AuthManager.js';
import FormExtractor from './utils/data-processing/FormExtractor.js';
import FormFiller from './utils/data-processing/FormFiller.js';
import TableExtractor from './utils/data-processing/TableExtractor.js';
import AIManager from './utils/ai/AIProvider.js';
// import PageHighlighter from './utils/ui/PageHighlighter.js';
// import PDFProcessor from './utils/ai/PDFProcessor.js';
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
import hotkeys from 'hotkeys-js';
// `pdfjs-dist` is intentionally NOT statically imported here (unlike the
// libraries above): evaluating it touches browser globals (`DOMMatrix`, ...)
// as a side effect of the module body itself, before any of its exports are
// even used. A static `import * as pdfjsLib from 'pdfjs-dist'` therefore
// crashes a plain `require('agentlet-core')`/`import('agentlet-core')` under
// Node (SSR, tooling, tests) with `ReferenceError: DOMMatrix is not defined`,
// even though nothing browser-specific has happened yet - only
// `new AgentletCore().init()` (which requires a browser) actually needs
// PDF.js. It's loaded lazily via `await import('pdfjs-dist')` inside init()
// instead, right before `librarySetup.initializeAll(...)`. In the single-file
// esbuild bundles (no code splitting - see tools/build.js) this compiles to a
// lazily-evaluated module inlined in the same output file: pdf.js ships in
// dist/ exactly as before, its code just isn't executed until init() runs.

import type {
    AgentletAPI,
    AgentletCoreConfig,
    AgentletModule,
    AgentletPerformanceReport,
    AgentletTheme,
    AIManagerAPI,
    AuthManagerAPI,
    CookiesAPI,
    EnvAPI,
    EventBusAPI,
    FormExtractorAPI,
    FormFillerAPI,
    ModuleActivationContext,
    ModuleManagerAPI,
    ModuleMountContext,
    ModuleMountTrigger,
    StorageManagerAPI,
    TableExtractorAPI,
    ThemeManagerAPI,
    UIAPI
} from './types/public-api';

/**
 * `_beforeMount()`/`_afterUnmount()` are internal `Module` lifecycle hooks
 * (see `src/core/Module.ts`) intentionally left off the public
 * `AgentletModule` type in `src/types/public-api.d.ts` - duck-typed modules
 * that don't extend `Module` never have them either, hence the
 * `typeof x === 'function'` guards below (unchanged from the original JS).
 */
type ModuleWithInternalMountHooks = AgentletModule & {
    _beforeMount?(container: HTMLElement, context: ModuleMountContext): void;
    _afterUnmount?(): void;
};

/**
 * `showEnvVarsDialog()` below stashes two short-lived callbacks on `window`
 * for the inline `onclick="addEnvVar()"`/`onclick="removeEnvVar('key')"`
 * handlers in the dialog's HTML (see `generateEnvVarsListHTML()`), then
 * removes them again once the dialog closes. These are internal
 * implementation details of that one dialog, not part of the public
 * `window.agentlet` surface documented in `AgentletAPI`, so they are
 * declared here instead of in `src/types/public-api.d.ts`.
 */
declare global {
    interface Window {
        removeEnvVar?: (key: string) => void;
        addEnvVar?: () => void;
    }
}

/**
 * Main Agentlet Core application class
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging -- merged below with fields populated by GlobalAPI.setupGlobalAccess(); see the comment on that interface declaration.
class AgentletCore {
    initialized: boolean;
    /**
     * Note: deliberately `AgentletCoreConfig & {...}` here, not
     * `Omit<AgentletCoreConfig, 'minimumPanelWidth'> & {...}` as
     * `UIManagerCore`/`PanelManagerCore` spell it. `AgentletCoreConfig` has a
     * `[key: string]: unknown` index signature, and `Omit`/`Pick` against a
     * type with an index signature re-indexes every picked property through
     * that signature, widening properties like `debugMode` to `unknown`
     * instead of `boolean | undefined` (a known TypeScript limitation) - only
     * unobservable in `UIManagerCore`/`PanelManagerCore` because they only
     * ever use those properties in truthy/typeof checks, never pass them to a
     * strictly-typed parameter. Plain intersection avoids the re-indexing and
     * keeps each property's real type, while still being assignable to
     * `UIManagerCore`/`PanelManagerCore`'s `config` (a supertype here).
     */
    config: AgentletCoreConfig & {
        /** Always populated by the constructor's `config.minimumPanelWidth || 320` default. */
        minimumPanelWidth: number;
    };
    eventBus: EventBusAPI;
    envManager: EnvAPI | null;
    cookieManager: CookiesAPI;
    storageManager: StorageManagerAPI;
    authManager: AuthManagerAPI;
    formExtractor: FormExtractorAPI;
    formFiller: FormFillerAPI;
    tableExtractor: TableExtractorAPI;
    aiManager: AIManagerAPI;
    /**
     * Typed as the concrete class (not the narrower, agentlet-author-facing
     * `ShortcutManagerAPI` from public-api.d.ts) for the same reason
     * `librarySetup` below is: `init()` (see `LibrarySetup.initializeAll()`)
     * calls `shortcutManager.init()`, framework-internal wiring
     * `ShortcutManagerAPI` intentionally omits.
     */
    shortcutManager: ShortcutManager | null;
    /**
     * Definite assignment assertion (`!`): preserves a pre-existing
     * evaluation-order quirk. `librarySetup` is assigned further down the
     * constructor than `tableExtractor`/`aiManager`/`shortcutManager`, all
     * three of which receive it as a constructor argument - so at that point
     * `this.librarySetup` is actually still `undefined`, and each of those
     * constructors' own `= null` default parameter kicks in instead (passing
     * `undefined` explicitly triggers a default parameter the same as
     * omitting the argument). TypeScript's "used before being assigned"
     * check (correctly) flags this ordering; the assertion preserves the
     * exact original statement order rather than the object it warns about.
     *
     * Typed as the concrete class (not the narrower, agentlet-author-facing
     * `LibrarySetupAPI` from public-api.d.ts) because `init()` calls
     * `initializeAll()`, framework-internal wiring `LibrarySetupAPI`
     * intentionally omits.
     */
    librarySetup!: LibrarySetup;
    isMinimized: boolean;
    themeManager: ThemeManagerAPI;
    /**
     * Typed as the concrete class (not the narrower, `@internal`-documented
     * `StyleInjectorAPI` from public-api.d.ts) because `UIManagerCore`
     * requires a `setRoot()` method that `StyleInjectorAPI` intentionally
     * omits from the public surface.
     */
    styleInjector: StyleInjector;
    uiManager: UIManager;
    panelManager: PanelManager;
    globalAPI: GlobalAPI;
    moduleRegistry: ModuleRegistry;
    moduleManager: ModuleManagerAPI;
    /**
     * The module currently mounted in the content area (via the mount/unmount
     * API), or null. Tracked here so updateModuleContent() can unmount it
     * before mounting a different module, and cleanup() can unmount it on
     * teardown.
     */
    mountedModule: AgentletModule | null;
    performanceMetrics: { initTime: number; moduleLoadTime: number; uiRenderTime: number };
    /** Only set while the environment-variables dialog is open. */
    currentEnvVarsDialog?: { close: () => void } | null;

    constructor(config: AgentletCoreConfig = {}) {
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
            showRefreshButton: config.showRefreshButton || false, // Show refresh content button
            showSettingsButton: config.showSettingsButton !== false, // Show settings button
            showHelpButton: config.showHelpButton !== false, // Show help button
            envManager: config.envManager, // Custom EnvironmentVariablesManager instance or null to disable
            resizablePanel: config.resizablePanel !== false, // Enable panel resizing
            minimumPanelWidth: config.minimumPanelWidth || 320, // Minimum panel width in pixels
            quickCommandDialogShortcut: config.quickCommandDialogShortcut || false, // Enable Ctrl/Cmd+; quick command dialog
            quickCommandCallback: config.quickCommandCallback || null, // Custom callback for quick command dialog
            shadowDom: config.shadowDom !== false, // Mount the panel UI inside an open shadow root (isolates host page/agentlet CSS)
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
        //
        // AIManager's constructor requires a non-null EnvAPI, but
        // this.envManager can be null (envManager: null in config disables
        // it) - AIManager never actually guards against that internally
        // (see src/utils/ai/AIProvider.ts's initializeProviders(), which
        // unconditionally calls envManager.get(...)), so constructing with
        // envManager: null already throws today. This cast preserves the
        // exact existing call/crash rather than papering over it.
        this.aiManager = new AIManager(this.envManager as EnvAPI, this.librarySetup);

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
            imageOverlay: null,
            root: null, // ShadowRoot (shadowDom: true) or document.body (shadowDom: false), set by UIManager.ensureRoot()
            host: null, // #agentlet-host element (shadowDom: true only)
            // Query helpers that work whether the UI lives in a shadow root or directly in the page,
            // so callers never need to know which mode is active.
            query: (selector: string): Element | null => {
                const root = this.ui.root || document;
                return typeof root.querySelector === 'function' ? root.querySelector(selector) : null;
            },
            queryAll: (selector: string): NodeListOf<Element> => {
                const root = this.ui.root || document;
                return typeof root.querySelectorAll === 'function' ? root.querySelectorAll(selector) : ([] as unknown as NodeListOf<Element>);
            }
            // The full UIAPI shape (show/hide/minimize/maximize/regenerateStyles/
            // resizePanel/getPanelWidth/setPanelWidth/refreshContent) is completed
            // synchronously a few lines down by globalAPI.setupGlobalAccess() via
            // Object.assign(window.agentlet.ui, {...}) - see the `ui` merged
            // interface declaration below this class.
        } as UIAPI;

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

        // The module currently mounted in the content area (via the mount/unmount
        // API), or null. Tracked here so updateModuleContent() can unmount it
        // before mounting a different module, and cleanup() can unmount it on
        // teardown.
        this.mountedModule = null;

        // UI management (delegated to UIManager)

        // Performance tracking
        this.performanceMetrics = {
            initTime: 0,
            moduleLoadTime: 0,
            uiRenderTime: 0
        };

        // Set up global access - will be finalized after UI is created
        this.globalAPI.setupGlobalAccess();

        console.log('AgentletCore 📎 initialized with config:', this.config);
    }

    /**
     * Initialize environment manager based on configuration
     * @returns Environment manager instance or null if disabled
     */
    initializeEnvManager(): EnvAPI | null {
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
     * Main initialization method
     */
    async init(): Promise<void> {
        if (this.initialized) {
            console.warn('AgentletCore already initialized');
            return;
        }

        const startTime = performance.now();

        try {
            console.log('🚀 Initializing Agentlet Core 📎...');

            // Load PDF.js lazily (see the comment on the removed static
            // import above) right before it's handed to librarySetup - this
            // is the earliest point evaluating pdf.js's module body is safe,
            // and the latest point at which window.pdfjsLib must be set for
            // existing consumers (PDFProcessor, ai.convertPDFToImages,
            // ai.sendPromptWithPDF, the scaffold template) to see it in the
            // same place they always have: available once init() resolves.
            const pdfjsLib = await import('pdfjs-dist');

            // Set up all libraries
            this.librarySetup.initializeAll(
                { XLSX, html2canvas, pdfjsLib, hotkeys },
                this.shortcutManager
            );

            // Set up event listeners
            this.setupEventListeners();

            const uiStartTime = performance.now();

            // Ensure the UI mount root (shadow root, or document.body) exists before
            // injecting styles or creating UI elements, so styles land in the right place.
            this.uiManager.ensureRoot();

            // Inject styles first before creating UI elements
            this.styleInjector.injectStyles();

            this.setupBaseUI(); // Call our delegation method to maintain compatibility

            // Finalize global access with the actual UI references
            this.finalizeGlobalAccess();

            this.performanceMetrics.uiRenderTime = performance.now() - uiStartTime;

            // Initialize module registry (will load from registryUrl via script injection if configured)
            const moduleStartTime = performance.now();
            await this.moduleRegistry.initialize();
            this.performanceMetrics.moduleLoadTime = performance.now() - moduleStartTime;

            // Set up module change callback AFTER modules are loaded and UI is ready
            this.moduleRegistry.setModuleChangeCallback((activeModule, context) => {
                this.onModuleChange(activeModule, context).catch(error => {
                    console.error('Error handling module change:', error);
                });
            });

            // Trigger initial content update for any active modules after DOM is ready
            const activeModule = this.moduleRegistry.activeModule;
            if (activeModule) {
                console.log('🔄 Initial content update for active module:', activeModule.name);
                console.log('🖥️ Content element at trigger time:', this.ui.content ? 'exists' : 'null');
                // Use requestAnimationFrame to ensure DOM is fully ready
                window.requestAnimationFrame(() => {
                    console.log('🖥️ Content element in requestAnimationFrame:', this.ui.content ? 'exists' : 'null');
                    this.onModuleChange(activeModule).catch(error => {
                        console.error('Error handling initial module change:', error);
                    });
                });
            }

            // Set up storage change listener
            this.setupLocalStorageListener();

            // Load environment variables from storage
            if (this.envManager) {
                // loadFromStorage() belongs to LocalStorageEnvironmentVariablesManager
                // (src/utils/config-persistence/EnvManager.ts), not the public EnvAPI
                // a custom envManager only needs to implement - calling it
                // unconditionally here is pre-existing behavior (it throws for a
                // custom envManager that doesn't define it), preserved as-is.
                (this.envManager as EnvAPI & { loadFromStorage(): void }).loadFromStorage();
            }

            // Manual refresh to catch modules that were registered early
            this.updateApplicationDisplay();
            await this.updateModuleContent('init');

            // Register default keyboard shortcuts
            if (this.shortcutManager) {
                await this.shortcutManager.registerDefaultShortcuts(
                    this.config
                );
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
            // Preserves the original unguarded `error.message` access (TS types a
            // catch binding as `unknown`, requiring this cast): if something
            // other than an `Error` is thrown, `.message` is `undefined` and
            // that is what gets emitted - a pre-existing quirk, not "fixed" here.
            this.eventBus.emit('core:initializationFailed', { error: (error as Error).message });
            throw error;
        }
    }

    /**
     * Set up event listeners for core events
     */
    setupEventListeners(): void {
        // Module events
        this.eventBus.on('module:registered', (_data) => {
            // Update display without duplicate logging (ModuleRegistry already logs)
            this.updateApplicationDisplay();
        });

        this.eventBus.on('module:activated', (_data) => {
            // Update display without duplicate logging (ModuleRegistry already logs)
            this.updateApplicationDisplay();
        });

        this.eventBus.on('module:deactivated', (_data) => {
            // Update display without duplicate logging (ModuleRegistry already logs)
            this.updateApplicationDisplay();
        });

        this.eventBus.on('application:detected', (data) => {
            const detected = data as { module: string; url: string };
            console.log(`🎯 Application detected: ${detected.module} for ${detected.url}`);
        });

        this.eventBus.on('application:notDetected', (data) => {
            const notDetected = data as { url: string };
            console.log(`❓ No application detected for: ${notDetected.url}`);
        });

        // Error handling
        this.eventBus.on('module:registrationFailed', (data) => {
            const failure = data as { module: string; error: string };
            console.error(`❌ Module registration failed: ${failure.module} - ${failure.error}`);
            this.showError(`Failed to load module: ${failure.module}`);
        });

        // URL change events
        this.eventBus.on('url:changed', (data) => {
            const urlChange = data as { oldUrl: string; newUrl: string };
            console.log(`🔄 URL changed: ${urlChange.oldUrl} → ${urlChange.newUrl}`);
            this.updateApplicationDisplay();
        });
    }

    /**
     * Handle module change
     * @param activeModule
     * @param context - Forwarded by ModuleRegistry; used to tell a urlChange-driven change (same module, new URL) from an actual module switch
     */
    async onModuleChange(activeModule: AgentletModule | null, context: ModuleActivationContext = {}): Promise<void> {
        console.log('onModuleChange', activeModule);
        // TODO: check if issue with activeModule not being yet the moduleLoader.activeModule
        this.updateApplicationDisplay();
        await this.updateModuleContent(context.trigger === 'urlChange' ? 'urlChange' : 'moduleChange');

        // Restore panel width for the module if env vars are available
        this.panelManager.restorePanelWidthForModule(activeModule);

        // Set up submodule change callback for the active module
        if (activeModule && typeof activeModule.setSubmoduleChangeCallback === 'function') {
            activeModule.setSubmoduleChangeCallback(() => {
                this.updateApplicationDisplay();
                this.updateModuleContent('refresh').catch(error => {
                    console.error('Error updating module content after submodule change:', error);
                });
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
    createDiscreteCloseButton(): HTMLButtonElement {
        const closeButton = document.createElement('button');
        closeButton.className = 'agentlet-action-btn';
        closeButton.id = 'agentlet-close-btn';
        closeButton.innerHTML = '╳';
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
    createActionButton(icon: string, title: string, onClick: (event: MouseEvent) => void): HTMLButtonElement {
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
    updateApplicationDisplay(): void {
        const appNameElement = this.ui.query('#agentlet-app-display');
        const _moduleCountElement = this.ui.query('#agentlet-module-count');

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
     * Update module content: unmounts the previously mounted module (if any),
     * then mounts (or renders) the active module's content into the panel.
     * @param trigger - Why this update is happening ('init', 'moduleChange', 'urlChange', 'refresh', ...), forwarded to `Module.mount()`/`unmount()` via the mount context
     */
    async updateModuleContent(trigger: ModuleMountTrigger = 'refresh'): Promise<void> {
        const content = this.ui.content;
        if (!content) {
            console.warn('⚠️ updateModuleContent called but UI content element not ready');
            return;
        }

        // Unmount the previously mounted module, guarded so a module that was
        // already unmounted elsewhere (e.g. via its own cleanup(), triggered by
        // ModuleRegistry.deactivateModule()) is never unmounted twice.
        const previouslyMounted: ModuleWithInternalMountHooks | null = this.mountedModule;
        this.mountedModule = null;
        if (previouslyMounted && previouslyMounted.mounted) {
            try {
                await previouslyMounted.unmount(content);
            } catch (error) {
                console.error('Error unmounting module content:', error);
            }
            if (typeof previouslyMounted._afterUnmount === 'function') {
                previouslyMounted._afterUnmount();
            }
        }

        // Clear existing content
        content.innerHTML = '';

        const activeModule = this.moduleRegistry.activeModule;

        if (activeModule) {
            try {
                if (typeof activeModule.mount === 'function') {
                    // Full mount/unmount API (every module extending the Module
                    // base class has this, including modules that only override
                    // getContent() - they go through the default mount()).
                    const context: ModuleMountContext = {
                        root: this.ui.root as ShadowRoot | HTMLElement,
                        theme: this.themeManager.getTheme(),
                        eventBus: this.eventBus,
                        api: window.agentlet,
                        trigger
                    };
                    const moduleWithHooks = activeModule as ModuleWithInternalMountHooks;
                    if (typeof moduleWithHooks._beforeMount === 'function') {
                        moduleWithHooks._beforeMount(content, context);
                    }
                    await activeModule.mount(content, context);
                    this.mountedModule = activeModule;
                } else if (typeof activeModule.getContent === 'function') {
                    // Duck-typed module (doesn't extend Module, so it has no mount/unmount)
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
    setupLocalStorageListener(): void {
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
    handleLocalStorageChange(key: string | null, newValue: string | null): void {
        console.log(`📦 localStorage changed: ${key} = ${newValue}`);

        this.eventBus.emit('localStorage:changed', { key, newValue });

        // Update application display and module content
        this.updateApplicationDisplay();
        this.updateModuleContent('refresh').catch(error => {
            console.error('Error updating module content after localStorage change:', error);
        });

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
    async refreshContent(): Promise<void> {
        console.log('🔄 Refreshing content');
        this.updateApplicationDisplay();
        await this.updateModuleContent('refresh');
    }

    showSettings(): void {
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
                    this.refreshContent().catch(error => {
                        console.error('Error refreshing content:', error);
                    });
                    Dialog.success('Settings refreshed!', 'Updated');
                }
            });
        } else {
            // Fallback to simple modal
            this.showModal('Settings', 'Settings UI coming soon...');
        }
    }

    showHelp(): void {
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
                    <p>Create modules that extend <code>Module</code> and implement:</p>
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
                            Dialog.success('Debug info copied to console!', 'Copied');
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
    showModal(title: string, content: string): void {
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
        // Mount inside the UI root (shadow root in shadowDom mode, otherwise
        // document.body) so this fallback modal is styled/scoped consistently
        // with the rest of the panel; falls back to document.body if called
        // before the root exists.
        (this.ui.root || document.body).appendChild(modal);

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
    showError(message: string): void {
        console.error('❌', message);
        // Could show a toast notification or update UI
        this.eventBus.emit('ui:error', { message });
    }

    /**
     * Regenerate styles with updated theme
     */
    regenerateStyles(): void {
        this.styleInjector.regenerateStyles();
        this.eventBus.emit('ui:stylesRegenerated');
    }

    /**
     * Change the active theme and notify the rest of the framework.
     *
     * This is the entry point a theme change actually goes through: it
     * merges `newThemeConfig` into the theme defaults via
     * `ThemeManager.updateTheme()`, re-injects the panel's CSS
     * (`regenerateStyles()`) so the change is visible immediately, keeps
     * `this.theme`/`window.agentlet.theme` (the same object, populated by
     * `GlobalAPI.setupGlobalAccess()`) in sync, and emits `theme:changed`
     * on the event bus.
     *
     * `ModuleMountContext.theme` passed to `mount()` is only a point-in-time
     * snapshot taken when the module was mounted; it does not update on its
     * own. A module that needs to react to a *later* theme change (e.g. one
     * rendered with a UI framework) should subscribe to `theme:changed` via
     * `context.eventBus` in `mount()` and unsubscribe in `unmount()` - see
     * `docs/module-mount-api.md`.
     *
     * @returns The fully merged theme now in effect.
     */
    setTheme(newThemeConfig: string | Partial<AgentletTheme>): AgentletTheme {
        const previousTheme = this.themeManager.getTheme();
        const theme = this.themeManager.updateTheme(newThemeConfig);

        this.regenerateStyles();
        this.theme = theme;

        this.eventBus.emit('theme:changed', { theme, previousTheme });

        return theme;
    }

    /**
     * Show the UI (delegate to UIManager)
     */
    show(): void {
        if (this.uiManager) {
            this.uiManager.show();
        }
    }

    /**
     * Hide the UI (delegate to UIManager)
     */
    hide(): void {
        if (this.uiManager) {
            this.uiManager.hide();
        }
    }

    /**
     * Minimize the UI (delegate to UIManager)
     */
    minimize(): void {
        if (this.uiManager) {
            this.uiManager.minimize();
        }
    }

    /**
     * Maximize the UI (delegate to UIManager)
     */
    maximize(): void {
        if (this.uiManager) {
            this.uiManager.maximize();
        }
    }

    /**
     * Setup base UI (delegate to UIManager) - kept for compatibility
     */
    setupBaseUI(): void {
        if (this.uiManager) {
            return this.uiManager.setupBaseUI();
        }
    }

    /**
     * Finalize global access with actual UI references after UI creation
     */
    finalizeGlobalAccess(): void {
        // Ensure window.agentlet.ui exists and merge with actual DOM references
        if (window.agentlet && window.agentlet.ui) {
            // Merge the actual DOM references created by UIManager
            Object.assign(window.agentlet.ui, this.ui);
        }
    }

    /**
     * Get performance metrics
     */
    getPerformanceMetrics(): AgentletPerformanceReport {
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
    async cleanup(): Promise<void> {
        try {
            // Cleanup module registry (deactivates the active module, which
            // unmounts it via Module.cleanup() if it was still mounted)
            if (this.moduleRegistry) {
                await this.moduleRegistry.cleanup();
            }

            // The module registry cleanup above already unmounted the module
            // that was mounted, if any - just clear our own reference to it.
            this.mountedModule = null;

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
            const toggleButton = this.ui.query('#agentlet-toggle');
            if (toggleButton) toggleButton.remove();

            // Remove the shadow host (also takes any UI styles injected into it with it).
            // In non-shadow mode this.ui.host is null and there is nothing extra to remove here.
            if (this.ui.host) {
                this.ui.host.remove();
            }

            const coreStyles = document.getElementById('agentlet-core-styles');
            if (coreStyles) coreStyles.remove();
            const themeStyles = document.getElementById('agentlet-core-theme');
            if (themeStyles) themeStyles.remove();

            // Reset the UI mount root/host so a subsequent init() creates a fresh one
            this.ui.root = null;
            this.ui.host = null;

            // Remove image overlay if present
            // (pre-existing bug fix: hideImageOverlay() only ever existed on
            // UIManager, so this call always threw and silently aborted the
            // rest of cleanup() - noticed while testing shadow DOM cleanup)
            if (this.uiManager) {
                this.uiManager.hideImageOverlay();
            }

            // Reset initialization flag
            this.initialized = false;

            // Clear module loading flags to allow re-registration
            //
            // `Reflect.deleteProperty()` is used instead of the `delete`
            // operator for these three: TypeScript only allows `delete` on an
            // operand typed as optional, but `window.agentlet` is declared
            // non-optional (nearly everything in the codebase reads it
            // without a null check) and `window.AgentletDesignerLoaded` isn't
            // declared on `Window` at all (set by an external
            // agentlet-designer script, never read here). Both have the exact
            // same runtime effect as `delete`.
            Reflect.deleteProperty(window, 'AgentletDesignerLoaded');

            // Clear global access
            Reflect.deleteProperty(window, 'agentlet');

            this.eventBus.emit('core:cleanup');
            console.log('🧹 Agentlet Core 📎 cleaned up');

        } catch (error) {
            console.error('Error during cleanup:', error);
        }
    }

    /**
     * Show environment variables dialog
     */
    showEnvVarsDialog(): void {
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
        //
        // this.envManager is read fresh at each of the three sites below
        // (here, and inside window.removeEnvVar/addEnvVar further down),
        // exactly as the original did, rather than being captured once into
        // a local - the cast is only to satisfy TypeScript's non-null
        // narrowing, which (correctly) does not persist through the
        // window.removeEnvVar/addEnvVar closures defined later in this
        // method.
        const storageType = (this.envManager as EnvAPI).name();

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
        window.removeEnvVar = (key: string): void => {
            (this.envManager as EnvAPI).remove(key);
            this.refreshEnvVarsDialog();
        };

        window.addEnvVar = (): void => {
            // These inputs live inside the fullscreen Dialog content, itself
            // mounted in the UI root (shadow root in shadowDom mode), hence
            // this.ui.query() rather than document.getElementById(). Queried
            // fresh at each use (not cached in a local), same as the original.
            const key = (this.ui.query('#env-var-key') as HTMLInputElement).value.trim();
            const value = (this.ui.query('#env-var-value') as HTMLInputElement).value.trim();

            if (key) {
                (this.envManager as EnvAPI).set(key, value);
                (this.ui.query('#env-var-key') as HTMLInputElement).value = '';
                (this.ui.query('#env-var-value') as HTMLInputElement).value = '';
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
            //
            // See the comment in cleanup() above for why
            // Reflect.deleteProperty() is used instead of the `delete`
            // operator here. `clearEnvVars` is never actually assigned
            // anywhere (pre-existing dead code, kept as-is).
            Reflect.deleteProperty(window, 'removeEnvVar');
            Reflect.deleteProperty(window, 'addEnvVar');
            Reflect.deleteProperty(window, 'clearEnvVars');
            this.currentEnvVarsDialog = null;
        });
    }

    /**
     * Generate HTML for environment variables list (including the add form)
     */
    generateEnvVarsListHTML(): string {
        // Unconditional access, same as the original: this method is only
        // ever reached (via showEnvVarsDialog()'s own guard) when envManager
        // is set, but refreshEnvVarsDialog() calls it without re-checking -
        // preserved as-is rather than adding a new defensive fallback.
        const currentVars = (this.envManager as EnvAPI).getAll();

        const formatValue = (value: string): string => {
            if (typeof value === 'string') {
                // Check if value contains mostly asterisks (hidden/masked value)
                const asteriskCount = (value.match(/\*/g) || []).length;
                if (asteriskCount > value.length * 0.7) { // If more than 70% are asterisks, treat as hidden
                    return '*'.repeat(60); // Force exactly 60 asterisks
                } else if (value.length > 60) {
                    return `${value.substring(0, 60)}…`; // Regular truncate with ellipsis
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
    refreshEnvVarsDialog(): void {
        console.log('🔧 Refreshing environment variables dialog content');

        // Try to update the content in place first (the container lives inside
        // the Dialog content, itself mounted in the UI root)
        const envVarsContainer = this.ui.query('.env-vars-list');
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

/**
 * Members assigned by `GlobalAPI.setupGlobalAccess()` onto this same
 * instance (`window.agentlet === this`, wired synchronously at the end of
 * the constructor above) rather than by `AgentletCore`'s own constructor.
 * Declaration merging (not a class-field re-declaration) - see
 * `src/core/Module.ts` for the identical pattern and its rationale. `ui`
 * is included here too: the constructor only populates its DOM-reference
 * subset (cast to `UIAPI` above), and `setupGlobalAccess()` completes the
 * shape via `Object.assign(window.agentlet.ui, {show, hide, ...})` a few
 * statements later in the same constructor.
 */
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging, @typescript-eslint/no-empty-object-type -- intentional, see the comment above; fields are populated by GlobalAPI.setupGlobalAccess(), called synchronously at the end of the constructor. The empty body is required here (as opposed to a `type` alias), since only an `interface` declaration merges with the `class AgentletCore` above.
interface AgentletCore extends Pick<AgentletAPI,
    | 'Module' | 'ElementSelectorClass' | 'ScriptInjectorClass' | 'utils' | 'env' | 'cookies'
    | 'storage' | 'auth' | 'forms' | 'tables' | 'ai' | 'configurePDFWorker' | 'modules' | 'ui'
    | 'theme' | 'debug'
> {}

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
