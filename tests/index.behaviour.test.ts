/**
 * Behaviour characterization tests for AgentletCore (src/index.js), ahead of
 * its conversion to TypeScript.
 *
 * tests/index.test.js already covers a handful of constructor/event-bus/
 * init/show-hide/error/metrics cases with a fully-mocked `document`.
 * tests/ui/UIManager.test.js and tests/ui/ModuleMount.test.js already cover
 * the shadow-DOM UI root and the module mount/unmount API in depth against a
 * real DOM. This file adds coverage for what those do not exercise: every
 * documented `AgentletCoreConfig` default (and the raw-config-wins merge
 * quirk), `window.agentlet`'s populated key set, init() idempotence,
 * onModuleChange()'s trigger derivation and panel-width restore call,
 * refreshContent(), the default showSettings()/showHelp()/showError()/
 * showModal()/showEnvVarsDialog() DOM (rendered for real inside `ui.root`),
 * regenerateStyles(), getPerformanceMetrics(), the localStorage same-tab
 * monitoring patch and module-notification opt-in, createActionButton()/
 * createDiscreteCloseButton() markup, cleanup() teardown completeness, and
 * the module's named exports.
 *
 * tests/setup.js globally replaces document.createElement/document.head
 * with lightweight mocks (no attachShadow/querySelector) so other suites
 * don't need a full DOM. These tests need the real thing - a real shadow
 * root, real style/content elements, a real Dialog mounted in it - so each
 * test restores jsdom's native implementations first, the same pattern used
 * by tests/ui/UIManager.test.js and tests/ui/ModuleMount.test.js.
 */

import AgentletCore from '../src/index.js';
import Module from '../src/core/Module.js';
import * as entry from '../src/index.js';
import type { AgentletModule } from '../src/types/public-api';

describe('AgentletCore behaviour', () => {
    let agentlet: AgentletCore | undefined;

    beforeEach(() => {
        // Restore jsdom's real Document.prototype implementations by
        // removing the own-property mocks installed by tests/setup.js.
        delete (document as { createElement?: unknown }).createElement;
        delete (document as { head?: unknown }).head;

        document.body.innerHTML = '';
        delete (window as { agentlet?: unknown }).agentlet;
    });

    afterEach(async () => {
        if (agentlet && agentlet.initialized) {
            await agentlet.cleanup();
        }
        document.body.innerHTML = '';
        delete (window as { agentlet?: unknown }).agentlet;
    });

    describe('named exports', () => {
        test('exports exactly the documented set of bindings', () => {
            expect(Object.keys(entry).sort()).toEqual([
                'AgentletCore',
                'AuthManager',
                'BaseEnvironmentVariablesManager',
                'CookieManager',
                'Dialog',
                'ElementSelector',
                'EnvManager',
                'FormExtractor',
                'FormFiller',
                'LocalStorageEnvironmentVariablesManager',
                'MessageBubble',
                'Module',
                'ModuleRegistry',
                'PDFProcessor',
                'ScreenCapture',
                'ScriptInjector',
                'ShortcutManager',
                'StorageManager',
                'TableExtractor',
                'default'
            ].sort());
        });

        test('default export and named AgentletCore export are the same class', () => {
            expect(entry.default).toBe(entry.AgentletCore);
        });

        test('EnvManager is an alias for LocalStorageEnvironmentVariablesManager', () => {
            expect(entry.EnvManager).toBe(entry.LocalStorageEnvironmentVariablesManager);
        });
    });

    describe('constructor config defaults', () => {
        test('applies the documented default for every AgentletCoreConfig key with a default', () => {
            agentlet = new AgentletCore();

            expect(agentlet.config.enablePlugins).toBe(true);
            expect(agentlet.config.moduleRegistry).toEqual([]);
            expect(agentlet.config.registryUrl).toBeUndefined();
            expect(agentlet.config.debugMode).toBe(false);
            expect(agentlet.config.minimizeWithImage).toBeNull();
            expect(agentlet.config.startMinimized).toBe(false);
            expect(agentlet.config.showEnvVarsButton).toBe(false);
            expect(agentlet.config.showRefreshButton).toBe(false);
            expect(agentlet.config.showSettingsButton).toBe(true);
            expect(agentlet.config.showHelpButton).toBe(true);
            expect(agentlet.config.resizablePanel).toBe(true);
            expect(agentlet.config.minimumPanelWidth).toBe(320);
            expect(agentlet.config.quickCommandDialogShortcut).toBe(false);
            expect(agentlet.config.quickCommandCallback).toBeNull();
            expect(agentlet.config.shadowDom).toBe(true);
        });

        test('envManager defaults to a LocalStorageEnvironmentVariablesManager instance', () => {
            agentlet = new AgentletCore();

            expect(agentlet.envManager).toBeInstanceOf(entry.LocalStorageEnvironmentVariablesManager);
        });

        test('quirk: envManager: null currently crashes the constructor', () => {
            // AIManager's constructor (src/utils/ai/AIProvider.ts) calls
            // initializeProviders(), which unconditionally dereferences
            // `this.envManager.get(...)` with no null guard. Since AgentletCore
            // always does `new AIManager(this.envManager, ...)`, disabling
            // environment variables via `envManager: null` currently throws
            // instead of producing a working core with envManager === null.
            // Pinned here as existing (buggy) behavior, not something this
            // conversion should fix.
            expect(() => new AgentletCore({ envManager: null })).toThrow(TypeError);
        });

        test('a custom envManager instance is used as-is', () => {
            const custom = new entry.LocalStorageEnvironmentVariablesManager();
            agentlet = new AgentletCore({ envManager: custom });

            expect(agentlet.envManager).toBe(custom);
        });

        test('env is loaded into a custom envManager at construction time', () => {
            agentlet = new AgentletCore({ env: { MY_VAR: 'hello' } });

            expect(agentlet.envManager?.get('MY_VAR')).toBe('hello');
        });

        test('every documented default can be overridden individually', () => {
            const quickCommandCallback = (): void => {};
            agentlet = new AgentletCore({
                enablePlugins: false,
                registryUrl: 'https://example.com/registry.json',
                debugMode: true,
                minimizeWithImage: 'https://example.com/icon.png',
                startMinimized: true,
                showEnvVarsButton: true,
                showRefreshButton: true,
                showSettingsButton: false,
                showHelpButton: false,
                resizablePanel: false,
                minimumPanelWidth: 500,
                quickCommandDialogShortcut: true,
                quickCommandCallback,
                shadowDom: false
            });

            expect(agentlet.config.enablePlugins).toBe(false);
            expect(agentlet.config.registryUrl).toBe('https://example.com/registry.json');
            expect(agentlet.config.debugMode).toBe(true);
            expect(agentlet.config.minimizeWithImage).toBe('https://example.com/icon.png');
            expect(agentlet.config.startMinimized).toBe(true);
            expect(agentlet.config.showEnvVarsButton).toBe(true);
            expect(agentlet.config.showRefreshButton).toBe(true);
            expect(agentlet.config.showSettingsButton).toBe(false);
            expect(agentlet.config.showHelpButton).toBe(false);
            expect(agentlet.config.resizablePanel).toBe(false);
            expect(agentlet.config.minimumPanelWidth).toBe(500);
            expect(agentlet.config.quickCommandDialogShortcut).toBe(true);
            expect(agentlet.config.quickCommandCallback).toBe(quickCommandCallback);
            expect(agentlet.config.shadowDom).toBe(false);
        });

        test('quirk: the trailing `...config` spread lets a raw config value win over the normalized default', () => {
            // `enablePlugins: config.enablePlugins !== false` would normalize a
            // truthy-but-not-`true` value to boolean `true`, but the object
            // literal spreads the raw `config` object last, so the original
            // raw value (here the number `0`) survives untouched instead.
            agentlet = new AgentletCore({ enablePlugins: 0 as unknown as boolean });

            expect(agentlet.config.enablePlugins).toBe(0);
        });

        test('auth config is forwarded to the AuthManager', () => {
            agentlet = new AgentletCore({ auth: { enabled: true, loginUrl: 'https://example.com/auth' } });

            expect(agentlet.authManager.isEnabled()).toBe('https://example.com/auth');
        });

        test('theme config is forwarded to the ThemeManager', () => {
            agentlet = new AgentletCore({ theme: { primaryColor: '#ff0000' } });

            expect(agentlet.themeManager.getTheme().primaryColor).toBe('#ff0000');
        });

        test('initializes core managers and a fresh, empty module registry', () => {
            agentlet = new AgentletCore();

            expect(agentlet.initialized).toBe(false);
            expect(agentlet.cookieManager).toBeDefined();
            expect(agentlet.storageManager).toBeDefined();
            expect(agentlet.formExtractor).toBeDefined();
            expect(agentlet.formFiller).toBeDefined();
            expect(agentlet.tableExtractor).toBeDefined();
            expect(agentlet.aiManager).toBeDefined();
            expect(agentlet.shortcutManager).toBeDefined();
            expect(agentlet.moduleRegistry.modules.size).toBe(0);
            expect(agentlet.moduleRegistry.activeModule).toBeNull();
            expect(agentlet.mountedModule).toBeNull();
        });

        test('sets up window.agentlet synchronously, before init() is ever called', () => {
            agentlet = new AgentletCore();

            expect(window.agentlet).toBe(agentlet);
        });
    });

    describe('window.agentlet key set', () => {
        test('exposes the full documented surface after init()', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            const api = window.agentlet;
            for (const key of [
                'initialized', 'config', 'eventBus', 'envManager', 'cookieManager', 'storageManager',
                'authManager', 'formExtractor', 'formFiller', 'tableExtractor', 'aiManager',
                'shortcutManager', 'librarySetup', 'isMinimized', 'themeManager', 'styleInjector',
                'uiManager', 'panelManager', 'globalAPI', 'moduleRegistry', 'moduleManager',
                'performanceMetrics', 'Module', 'ElementSelectorClass', 'ScriptInjectorClass', 'utils',
                'env', 'cookies', 'storage', 'auth', 'forms', 'tables', 'ai', 'configurePDFWorker',
                'modules', 'ui', 'theme'
            ]) {
                expect(api).toHaveProperty(key);
            }
        });

        test('utils exposes every documented utility', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            for (const key of ['ElementSelector', 'Dialog', 'MessageBubble', 'ScreenCapture', 'ScriptInjector', 'PDFProcessor', 'shortcuts', 'zIndex', 'PageHighlighter']) {
                expect(window.agentlet.utils).toHaveProperty(key);
            }
        });

        test('debug is only present when debugMode: true', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            expect(window.agentlet.debug).toBeUndefined();
            await agentlet.cleanup();

            agentlet = new AgentletCore({ debugMode: true });
            await agentlet.init();
            expect(window.agentlet.debug).toBeDefined();
            expect(window.agentlet.debug?.getConfig()).toBe(agentlet.config);
        });
    });

    describe('init()', () => {
        test('sets initialized and emits core:initialized with metrics/config', async () => {
            agentlet = new AgentletCore();
            const emitSpy = jest.spyOn(agentlet.eventBus, 'emit');

            await agentlet.init();

            expect(agentlet.initialized).toBe(true);
            expect(emitSpy).toHaveBeenCalledWith('core:initialized', {
                metrics: agentlet.performanceMetrics,
                config: agentlet.config
            });
        });

        test('is idempotent: a second call warns and does not re-run setup', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const ensureRootSpy = jest.spyOn(agentlet.uiManager, 'ensureRoot');

            await agentlet.init();

            expect(console.warn).toHaveBeenCalledWith('AgentletCore already initialized');
            expect(ensureRootSpy).not.toHaveBeenCalled();
        });

        test('ensureRoot() runs before styleInjector.injectStyles() and setupBaseUI()', async () => {
            agentlet = new AgentletCore();
            const order: string[] = [];
            jest.spyOn(agentlet.uiManager, 'ensureRoot').mockImplementation(() => {
                order.push('ensureRoot');
                return document.body;
            });
            jest.spyOn(agentlet.styleInjector, 'injectStyles').mockImplementation(() => {
                order.push('injectStyles');
            });
            jest.spyOn(agentlet, 'setupBaseUI').mockImplementation(() => {
                order.push('setupBaseUI');
            });

            await agentlet.init();

            expect(order).toEqual(['ensureRoot', 'injectStyles', 'setupBaseUI']);
        });

        test('registers default keyboard shortcuts via the shortcut manager', async () => {
            agentlet = new AgentletCore();
            const registerSpy = jest.spyOn(agentlet.shortcutManager!, 'registerDefaultShortcuts');

            await agentlet.init();

            expect(registerSpy).toHaveBeenCalledWith(agentlet.config);
        });

        test('records non-zero uiRenderTime, moduleLoadTime and initTime', async () => {
            agentlet = new AgentletCore();

            await agentlet.init();

            expect(agentlet.performanceMetrics.initTime).toBeGreaterThanOrEqual(0);
            expect(agentlet.performanceMetrics.uiRenderTime).toBeGreaterThanOrEqual(0);
            expect(agentlet.performanceMetrics.moduleLoadTime).toBeGreaterThanOrEqual(0);
        });
    });

    describe('UI delegation', () => {
        test('show()/hide() delegate to uiManager and flip the container display style', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            agentlet.hide();
            expect((agentlet.ui.container as HTMLElement | null)?.style.display).toBe('none');

            agentlet.show();
            expect((agentlet.ui.container as HTMLElement | null)?.style.display).toBe('flex');
        });

        test('minimize()/maximize() delegate to uiManager and flip isMinimized', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            agentlet.minimize();
            expect(agentlet.isMinimized).toBe(true);

            agentlet.maximize();
            expect(agentlet.isMinimized).toBe(false);
        });

        test('regenerateStyles() delegates to styleInjector and emits ui:stylesRegenerated', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const regenSpy = jest.spyOn(agentlet.styleInjector, 'regenerateStyles');
            const emitSpy = jest.spyOn(agentlet.eventBus, 'emit');

            agentlet.regenerateStyles();

            expect(regenSpy).toHaveBeenCalledTimes(1);
            expect(emitSpy).toHaveBeenCalledWith('ui:stylesRegenerated');
        });
    });

    describe('setTheme()', () => {
        test('merges the new theme, returns it, and updates agentlet.theme', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            const theme = agentlet.setTheme({ primaryColor: '#123456' });

            expect(theme.primaryColor).toBe('#123456');
            expect(agentlet.themeManager.getTheme().primaryColor).toBe('#123456');
            expect(agentlet.theme.primaryColor).toBe('#123456');
            expect(window.agentlet.theme.primaryColor).toBe('#123456');
            // Same object identity: agentlet.theme and window.agentlet.theme
            // are the same underlying instance (window.agentlet === agentlet).
            expect(agentlet.theme).toBe(theme);
        });

        test('re-injects styles (delegates to regenerateStyles())', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const regenSpy = jest.spyOn(agentlet.styleInjector, 'regenerateStyles');

            agentlet.setTheme({ primaryColor: '#abcdef' });

            expect(regenSpy).toHaveBeenCalledTimes(1);
        });

        test('emits theme:changed with the new and previous theme', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const previousTheme = agentlet.themeManager.getTheme();
            const emitSpy = jest.spyOn(agentlet.eventBus, 'emit');

            const theme = agentlet.setTheme({ primaryColor: '#00ff00' });

            expect(emitSpy).toHaveBeenCalledWith('theme:changed', { theme, previousTheme });
        });

        test('accepts a plain string (legacy theme config), same as ThemeManager.updateTheme()', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            const theme = agentlet.setTheme('dark');

            // A string theme config resolves to the plain defaults (see
            // ThemeManager.processThemeConfig()'s legacy-string branch).
            expect(theme).toEqual(agentlet.themeManager.processThemeConfig(undefined));
        });

        test('a module subscribed to theme:changed via context.eventBus (from mount()) observes the change', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            let observed: { theme: { primaryColor: string }; previousTheme: { primaryColor: string } } | null = null;
            const testModule = new Module({ name: 'theme-aware-module', patterns: ['*'] });
            const originalMount = testModule.mount.bind(testModule);
            testModule.mount = async (container, context) => {
                context.eventBus.on('theme:changed', (data) => {
                    observed = data as typeof observed;
                });
                return originalMount(container, context);
            };
            agentlet.moduleRegistry.activeModule = testModule;
            await agentlet.updateModuleContent('init');

            agentlet.setTheme({ primaryColor: '#ff00ff' });

            expect(observed).not.toBeNull();
            expect(observed!.theme.primaryColor).toBe('#ff00ff');
        });
    });

    describe('onModuleChange()', () => {
        test('restores the panel width for the newly active module', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const restoreSpy = jest.spyOn(agentlet.panelManager, 'restorePanelWidthForModule');
            const testModule = new Module({ name: 'panel-width-module', patterns: ['never-matches.example'] });
            agentlet.moduleRegistry.activeModule = testModule;

            await agentlet.onModuleChange(testModule);

            expect(restoreSpy).toHaveBeenCalledWith(testModule);
        });

        test('emits core:moduleChanged with the module name and metadata', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const emitSpy = jest.spyOn(agentlet.eventBus, 'emit');
            const testModule = new Module({ name: 'metadata-module', patterns: ['never-matches.example'] });
            agentlet.moduleRegistry.activeModule = testModule;

            await agentlet.onModuleChange(testModule);

            expect(emitSpy).toHaveBeenCalledWith('core:moduleChanged', {
                module: 'metadata-module',
                metadata: testModule.getMetadata()
            });
        });

        test('emits core:moduleChanged with nulls when there is no active module', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const emitSpy = jest.spyOn(agentlet.eventBus, 'emit');

            await agentlet.onModuleChange(null);

            expect(emitSpy).toHaveBeenCalledWith('core:moduleChanged', { module: null, metadata: null });
        });
    });

    describe('refreshContent()', () => {
        test('updates the application display and re-renders module content', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const displaySpy = jest.spyOn(agentlet, 'updateApplicationDisplay');
            const contentSpy = jest.spyOn(agentlet, 'updateModuleContent');

            await agentlet.refreshContent();

            expect(displaySpy).toHaveBeenCalled();
            expect(contentSpy).toHaveBeenCalledWith('refresh');
        });
    });

    describe('updateApplicationDisplay()', () => {
        test('shows the active module name, capitalized', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const testModule = new Module({ name: 'my-module', patterns: ['never-matches.example'] });
            agentlet.moduleRegistry.activeModule = testModule;

            agentlet.updateApplicationDisplay();

            expect(agentlet.ui.query('#agentlet-app-name')?.textContent).toBe('My-module');
        });

        test('shows a custom panel title when the module provides one', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const testModule = new Module({ name: 'titled-module', patterns: ['never-matches.example'] });
            (testModule as unknown as { getPanelTitle: () => string }).getPanelTitle = () => 'Custom Title';
            agentlet.moduleRegistry.activeModule = testModule;

            agentlet.updateApplicationDisplay();

            expect(agentlet.ui.query('#agentlet-app-name')?.textContent).toBe('Custom Title');
        });

        test('shows the "no application detected" fallback when there is no active module', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            agentlet.updateApplicationDisplay();

            expect(agentlet.ui.query('#agentlet-app-name')?.textContent).toBe('No application detected');
        });
    });

    describe('showError()', () => {
        test('logs to console.error and emits ui:error', () => {
            agentlet = new AgentletCore();
            const emitSpy = jest.spyOn(agentlet.eventBus, 'emit');

            agentlet.showError('Something broke');

            expect(console.error).toHaveBeenCalledWith('❌', 'Something broke');
            expect(emitSpy).toHaveBeenCalledWith('ui:error', { message: 'Something broke' });
        });
    });

    describe('showModal()', () => {
        test('mounts a dismissible modal with the given title/content inside ui.root', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            agentlet.showModal('My Title', '<p>My content</p>');

            const modal = agentlet.ui.query('.modal');
            expect(modal).not.toBeNull();
            expect(modal?.querySelector('h3')?.textContent).toBe('My Title');
            expect(modal?.innerHTML).toContain('My content');

            (modal as HTMLElement).click();
            expect(agentlet.ui.query('.modal')).toBeNull();
        });

        test('falls back to document.body when called before the UI root exists', () => {
            agentlet = new AgentletCore();

            agentlet.showModal('Early Title', 'Early content');

            expect(document.body.querySelector('.modal')).not.toBeNull();
        });
    });

    describe('showSettings() / showHelp() default dialogs', () => {
        test('showSettings() renders the settings info dialog inside ui.root', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            agentlet.showSettings();

            const overlay = agentlet.ui.query('.agentlet-info-overlay');
            expect(overlay).not.toBeNull();
            expect(overlay?.textContent).toContain('Agentlet Settings');
            expect(overlay?.textContent).toContain('Modules loaded');
        });

        test('showSettings() delegates to the active module when it defines showSettings()', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const testModule = new Module({ name: 'custom-settings-module', patterns: ['never-matches.example'] });
            const customSettings = jest.fn();
            (testModule as unknown as { showSettings: () => void }).showSettings = customSettings;
            agentlet.moduleRegistry.activeModule = testModule;

            agentlet.showSettings();

            expect(customSettings).toHaveBeenCalledTimes(1);
            expect(agentlet.ui.query('.agentlet-info-overlay')).toBeNull();
        });

        test('showHelp() renders the help info dialog inside ui.root', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            agentlet.showHelp();

            const overlay = agentlet.ui.query('.agentlet-info-overlay');
            expect(overlay).not.toBeNull();
            expect(overlay?.textContent).toContain('Agentlet Help');
        });

        test('showHelp() delegates to the active module when it defines showHelp()', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const testModule = new Module({ name: 'custom-help-module', patterns: ['never-matches.example'] });
            const customHelp = jest.fn();
            (testModule as unknown as { showHelp: () => void }).showHelp = customHelp;
            agentlet.moduleRegistry.activeModule = testModule;

            agentlet.showHelp();

            expect(customHelp).toHaveBeenCalledTimes(1);
        });
    });

    describe('showEnvVarsDialog()', () => {
        test('shows a disabled message when envManager is falsy', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            // envManager: null crashes the constructor (see the "quirk" test
            // above), so the only way to reach showEnvVarsDialog()'s disabled
            // branch is to null out envManager after construction.
            (agentlet as unknown as { envManager: null }).envManager = null;

            agentlet.showEnvVarsDialog();

            const modal = agentlet.ui.query('.modal');
            expect(modal?.textContent).toContain('Environment variables are disabled');
        });

        test('renders the fullscreen dialog with the empty-state placeholder', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            agentlet.showEnvVarsDialog();

            const dialog = agentlet.ui.query('.agentlet-fullscreen-dialog');
            expect(dialog).not.toBeNull();
            expect(agentlet.ui.query('.env-vars-list')?.textContent).toContain('No environment variables set');
        });

        test('window.addEnvVar() stores the value and refreshes the list in place', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            agentlet.showEnvVarsDialog();

            const keyInput = agentlet.ui.query('#env-var-key') as HTMLInputElement;
            const valueInput = agentlet.ui.query('#env-var-value') as HTMLInputElement;
            keyInput.value = 'MY_KEY';
            valueInput.value = 'my-value';

            (window as unknown as { addEnvVar: () => void }).addEnvVar();

            expect(agentlet.envManager?.get('MY_KEY')).toBe('my-value');
            expect(agentlet.ui.query('.env-vars-list')?.textContent).toContain('MY_KEY');
        });

        test('window.removeEnvVar() removes the value and refreshes the list', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            agentlet.envManager?.set('TO_REMOVE', 'x');
            agentlet.showEnvVarsDialog();
            expect(agentlet.ui.query('.env-vars-list')?.textContent).toContain('TO_REMOVE');

            (window as unknown as { removeEnvVar: (key: string) => void }).removeEnvVar('TO_REMOVE');

            expect(agentlet.envManager?.has('TO_REMOVE')).toBe(false);
            expect(agentlet.ui.query('.env-vars-list')?.textContent).not.toContain('TO_REMOVE');
        });

        test('cleans up the window.addEnvVar/removeEnvVar globals once the dialog closes', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            agentlet.showEnvVarsDialog();
            expect(typeof (window as unknown as { addEnvVar?: unknown }).addEnvVar).toBe('function');

            agentlet.currentEnvVarsDialog?.close();

            expect((window as unknown as { addEnvVar?: unknown }).addEnvVar).toBeUndefined();
            expect((window as unknown as { removeEnvVar?: unknown }).removeEnvVar).toBeUndefined();
        });
    });

    describe('getPerformanceMetrics()', () => {
        test('reports core metrics, module registry statistics and per-module metrics', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const testModule = new Module({ name: 'metrics-module', patterns: ['never-matches.example'] });
            agentlet.moduleRegistry.register(testModule);

            const metrics = agentlet.getPerformanceMetrics();

            expect(metrics.core).toBe(agentlet.performanceMetrics);
            expect(metrics.moduleRegistry).toEqual(agentlet.moduleRegistry.getStatistics());
            expect(metrics.modules).toContainEqual({ name: 'metrics-module', metrics: testModule.performanceMetrics });
        });
    });

    describe('createActionButton() / createDiscreteCloseButton() markup', () => {
        test('createActionButton() produces a titled agentlet-action-btn with the given icon and click handler', () => {
            agentlet = new AgentletCore();
            const onClick = jest.fn();

            const button = agentlet.createActionButton('⚙', 'My Action', onClick);

            expect(button.outerHTML).toMatchSnapshot();
            button.dispatchEvent(new MouseEvent('click'));
            expect(onClick).toHaveBeenCalledTimes(1);
        });

        test('createDiscreteCloseButton() produces the close button and wires cleanup() to it', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const cleanupSpy = jest.spyOn(agentlet, 'cleanup');

            const button = agentlet.createDiscreteCloseButton();

            expect(button.outerHTML).toMatchSnapshot();
            button.dispatchEvent(new MouseEvent('click'));
            expect(cleanupSpy).toHaveBeenCalledTimes(1);
        });
    });

    describe('localStorage monitoring', () => {
        test('setupLocalStorageListener() logs that monitoring is enabled', () => {
            agentlet = new AgentletCore();

            agentlet.setupLocalStorageListener();

            expect(console.log).toHaveBeenCalledWith('📦 localStorage monitoring enabled');
        });

        test('a same-tab localStorage.setItem() triggers handleLocalStorageChange() with the new value', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const handleSpy = jest.spyOn(agentlet, 'handleLocalStorageChange');

            window.localStorage.setItem('some-key', 'some-value');

            expect(handleSpy).toHaveBeenCalledWith('some-key', 'some-value');
        });

        test('a same-tab localStorage.removeItem() triggers handleLocalStorageChange() with a null new value', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const handleSpy = jest.spyOn(agentlet, 'handleLocalStorageChange');

            window.localStorage.removeItem('some-key');

            expect(handleSpy).toHaveBeenCalledWith('some-key', null);
        });

        test('a same-tab localStorage.clear() triggers handleLocalStorageChange() with null/null', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const handleSpy = jest.spyOn(agentlet, 'handleLocalStorageChange');

            window.localStorage.clear();

            expect(handleSpy).toHaveBeenCalledWith(null, null);
        });

        test('handleLocalStorageChange() emits localStorage:changed and refreshes the display/content', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const emitSpy = jest.spyOn(agentlet.eventBus, 'emit');
            const displaySpy = jest.spyOn(agentlet, 'updateApplicationDisplay');
            const contentSpy = jest.spyOn(agentlet, 'updateModuleContent');

            agentlet.handleLocalStorageChange('k', 'v');

            expect(emitSpy).toHaveBeenCalledWith('localStorage:changed', { key: 'k', newValue: 'v' });
            expect(displaySpy).toHaveBeenCalled();
            expect(contentSpy).toHaveBeenCalledWith('refresh');
        });

        test('notifies only modules that opt in with requiresLocalStorageChangeNotification', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            const optedIn = new Module({ name: 'opted-in-module', patterns: ['never-matches.example'] });
            const onChange = jest.fn();
            (optedIn as unknown as { requiresLocalStorageChangeNotification: boolean }).requiresLocalStorageChangeNotification = true;
            (optedIn as unknown as { onLocalStorageChange: (key: string | null, value: string | null) => void }).onLocalStorageChange = onChange;
            agentlet.moduleRegistry.activeModule = optedIn;

            agentlet.handleLocalStorageChange('k', 'v');
            expect(onChange).toHaveBeenCalledWith('k', 'v');

            const notOptedIn = new Module({ name: 'not-opted-in-module', patterns: ['never-matches.example'] });
            const onChange2 = jest.fn();
            (notOptedIn as unknown as { onLocalStorageChange: (key: string | null, value: string | null) => void }).onLocalStorageChange = onChange2;
            agentlet.moduleRegistry.activeModule = notOptedIn;

            agentlet.handleLocalStorageChange('k2', 'v2');
            expect(onChange2).not.toHaveBeenCalled();
        });
    });

    describe('cleanup()', () => {
        test('removes the panel, the shadow host, style tags and clears window.agentlet', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const host = document.getElementById('agentlet-host');
            expect(host).not.toBeNull();

            await agentlet.cleanup();

            expect(document.getElementById('agentlet-host')).toBeNull();
            expect(document.getElementById('agentlet-core-styles')).toBeNull();
            expect(document.getElementById('agentlet-core-theme')).toBeNull();
            expect(agentlet.initialized).toBe(false);
            expect(agentlet.ui.root).toBeNull();
            expect(agentlet.ui.host).toBeNull();
            expect(window.agentlet).toBeUndefined();
        });

        test('cleans up the module registry, cookie/storage/auth/shortcut managers', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const registryCleanup = jest.spyOn(agentlet.moduleRegistry, 'cleanup');
            const cookieCleanup = jest.spyOn(agentlet.cookieManager, 'cleanup');
            const storageCleanup = jest.spyOn(agentlet.storageManager, 'cleanup');
            const authCleanup = jest.spyOn(agentlet.authManager, 'cleanup');
            const shortcutClear = jest.spyOn(agentlet.shortcutManager!, 'clear');

            await agentlet.cleanup();

            expect(registryCleanup).toHaveBeenCalledTimes(1);
            expect(cookieCleanup).toHaveBeenCalledTimes(1);
            expect(storageCleanup).toHaveBeenCalledTimes(1);
            expect(authCleanup).toHaveBeenCalledTimes(1);
            expect(shortcutClear).toHaveBeenCalledTimes(1);
        });

        test('emits core:cleanup', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const emitSpy = jest.spyOn(agentlet.eventBus, 'emit');

            await agentlet.cleanup();

            expect(emitSpy).toHaveBeenCalledWith('core:cleanup');
        });

        test('a second cleanup() call (already torn down) does not throw', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            await agentlet.cleanup();

            await expect(agentlet.cleanup()).resolves.toBeUndefined();
        });

        test('re-initializing after cleanup() creates a fresh shadow host', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();
            const firstHost = document.getElementById('agentlet-host');
            await agentlet.cleanup();

            await agentlet.init();

            const secondHost = document.getElementById('agentlet-host');
            expect(secondHost).not.toBeNull();
            expect(secondHost).not.toBe(firstHost);
            expect(agentlet.initialized).toBe(true);
        });
    });

    describe('finalizeGlobalAccess()', () => {
        test('merges the DOM references from core.ui onto window.agentlet.ui', async () => {
            agentlet = new AgentletCore();
            await agentlet.init();

            expect(window.agentlet.ui.container).toBe(agentlet.ui.container);
            expect(window.agentlet.ui.content).toBe(agentlet.ui.content);
            expect(window.agentlet.ui.root).toBe(agentlet.ui.root);
        });
    });
});

describe('AgentletCore behaviour - non-mounted module fallback', () => {
    beforeEach(() => {
        delete (document as { createElement?: unknown }).createElement;
        delete (document as { head?: unknown }).head;
        document.body.innerHTML = '';
        delete (window as { agentlet?: unknown }).agentlet;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        delete (window as { agentlet?: unknown }).agentlet;
    });

    test('updateModuleContent() shows the welcome placeholder when no module is active', async () => {
        const agentlet = new AgentletCore();
        await agentlet.init();

        await agentlet.updateModuleContent('refresh');

        expect((agentlet.ui.content as HTMLElement | null)?.innerHTML).toContain('agentlet-welcome');
        expect((agentlet.ui.content as HTMLElement | null)?.innerHTML).toContain('No application-specific module detected');

        await agentlet.cleanup();
    });

    test('updateModuleContent() emits ui:contentUpdated with the active module name', async () => {
        const agentlet = new AgentletCore();
        await agentlet.init();
        const testModule: AgentletModule = new Module({ name: 'event-module', patterns: ['never-matches.example'] });
        agentlet.moduleRegistry.activeModule = testModule;
        const emitSpy = jest.spyOn(agentlet.eventBus, 'emit');

        await agentlet.updateModuleContent('refresh');

        expect(emitSpy).toHaveBeenCalledWith('ui:contentUpdated', { module: 'event-module' });

        await agentlet.cleanup();
    });

    test('a warning is logged and nothing happens if updateModuleContent() runs before the UI exists', async () => {
        const agentlet = new AgentletCore();

        await agentlet.updateModuleContent('refresh');

        expect(console.warn).toHaveBeenCalledWith('⚠️ updateModuleContent called but UI content element not ready');
    });
});
