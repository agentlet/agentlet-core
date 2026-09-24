/**
 * Unit tests for PanelManager, driven directly against a small fake "core"
 * object typed as the real `PanelManagerCore` (exported, type-only, from
 * `src/ui/PanelManager.ts`), following the pattern used by
 * `tests/ui/UIManager.behaviour.test.ts` for `UIManagerCore`.
 *
 * Regression coverage for the "minimized" bug: `PanelManager` used to read
 * `this.core.uiManager.isMinimized`, a member `UIManager` has never had (the
 * minimized flag lives on `AgentletCore.isMinimized`, forwarded here as
 * `core.isMinimized`). Because the old expression was always `undefined`:
 *   - `setPanelWidth()`'s `!this.core.uiManager.isMinimized` was always
 *     `true`, so the toggle button was repositioned even while the panel was
 *     minimized.
 *   - `restorePanelWidthForModule()`'s `if (this.core.uiManager.isMinimized)
 *     return;` never returned, so a module switch while minimized still
 *     scheduled a width restore 50ms later.
 * The two tests marked "(bug case)" below fail against the pre-fix source
 * (verified by running this file against the unfixed `PanelManager.ts`
 * before applying the fix) and pass once `PanelManager` reads
 * `core.isMinimized` directly.
 */

import { PanelManager } from '../../src/ui/PanelManager.js';
import type { PanelManagerCore } from '../../src/ui/PanelManager.js';
import type { UIManagerUIState } from '../../src/ui/UIManager.js';
import type { EventBusAPI, EnvAPI, AgentletModule } from '../../src/types/public-api';

/** Minimal `UIManagerUIState`, satisfying the full interface `PanelManagerCore.uiManager.ui` requires. */
function createFakeUiState(container: HTMLElement | null): UIManagerUIState {
    return {
        host: null,
        root: null,
        container,
        content: null,
        header: null,
        actions: null,
        imageOverlay: null,
        query: jest.fn(() => null),
        queryAll: jest.fn(() => document.querySelectorAll('.non-existent-marker'))
    };
}

function createFakeEnvManager(): jest.Mocked<Pick<EnvAPI, 'get' | 'set'>> {
    return {
        get: jest.fn<string | undefined, Parameters<EnvAPI['get']>>(() => undefined),
        set: jest.fn<void, Parameters<EnvAPI['set']>>()
    };
}

interface FakeCoreOptions {
    resizablePanel?: boolean;
    minimumPanelWidth?: number;
    /** Only consulted by `getPanelWidth()` when there is no container. */
    theme?: Partial<import('../../src/types/public-api').AgentletTheme>;
    container?: HTMLElement | null;
    toggleButton?: HTMLElement | null;
    isMinimized?: boolean;
    envManager?: EnvAPI | null;
    activeModule?: AgentletModule | null;
}

function createFakeCore(options: FakeCoreOptions = {}): PanelManagerCore {
    const {
        resizablePanel = true,
        minimumPanelWidth = 320,
        theme,
        container = document.createElement('div'),
        toggleButton = null,
        isMinimized = false,
        envManager = null,
        activeModule = null
    } = options;

    return {
        config: {
            resizablePanel,
            minimumPanelWidth,
            theme
        },
        eventBus: { emit: jest.fn() } as unknown as EventBusAPI,
        envManager,
        moduleRegistry: { activeModule },
        isMinimized,
        uiManager: { ui: createFakeUiState(container) },
        ui: {
            query: jest.fn((selector: string) => (selector === '#agentlet-toggle' ? toggleButton : null))
        }
    };
}

function makeModule(name: string): AgentletModule {
    return { name } as unknown as AgentletModule;
}

describe('PanelManager', () => {
    // tests/setup.js globally mocks document.createElement with a lightweight
    // double whose `style` is a plain `{}` (no real CSSStyleDeclaration, so
    // unset properties read back as `undefined` instead of `''`). Restore
    // jsdom's real implementation so elements created here behave like they
    // do in a browser, same as tests/ui/UIManager.behaviour.test.ts.
    beforeEach(() => {
        delete (document as unknown as { createElement?: unknown }).createElement;
    });

    describe('setPanelWidth()', () => {
        test('resizes the container, updates the CSS var, emits resizeComplete, and saves the width', () => {
            const container = document.createElement('div');
            const core = createFakeCore({ container });
            const manager = new PanelManager(core);

            manager.setPanelWidth(450);

            expect(container.style.width).toBe('450px');
            expect(document.documentElement.style.getPropertyValue('--agentlet-panel-width')).toBe('450px');
            expect(core.eventBus.emit).toHaveBeenCalledWith('panel:resizeComplete', { width: 450 });
        });

        test('moves the toggle button when the panel is not minimized', () => {
            const container = document.createElement('div');
            const toggleButton = document.createElement('button');
            toggleButton.style.right = '0px';
            const core = createFakeCore({ container, toggleButton, isMinimized: false });
            const manager = new PanelManager(core);

            manager.setPanelWidth(500);

            expect(toggleButton.style.right).toBe('500px');
        });

        test('(bug case) leaves the toggle button untouched when core.isMinimized is true', () => {
            const container = document.createElement('div');
            const toggleButton = document.createElement('button');
            toggleButton.style.right = '123px';
            const core = createFakeCore({ container, toggleButton, isMinimized: true });
            const manager = new PanelManager(core);

            manager.setPanelWidth(500);

            // The container still resizes; only the toggle button's position is left alone.
            expect(container.style.width).toBe('500px');
            expect(toggleButton.style.right).toBe('123px');
        });

        test('warns and does nothing when panel resizing is disabled', () => {
            const container = document.createElement('div');
            const core = createFakeCore({ container, resizablePanel: false });
            const manager = new PanelManager(core);

            manager.setPanelWidth(500);

            expect(container.style.width).toBe('');
            expect(core.eventBus.emit).not.toHaveBeenCalled();
        });

        test('warns and does nothing for a width below the configured minimum', () => {
            const container = document.createElement('div');
            const core = createFakeCore({ container, minimumPanelWidth: 320 });
            const manager = new PanelManager(core);

            manager.setPanelWidth(100);

            expect(container.style.width).toBe('');
            expect(core.eventBus.emit).not.toHaveBeenCalled();
        });

        test('warns and does nothing for a non-numeric width', () => {
            const container = document.createElement('div');
            const core = createFakeCore({ container });
            const manager = new PanelManager(core);

            // @ts-expect-error exercising the runtime guard against a caller passing a non-number
            manager.setPanelWidth('500');

            expect(container.style.width).toBe('');
            expect(core.eventBus.emit).not.toHaveBeenCalled();
        });

        test('warns and does nothing when the panel container is not found', () => {
            const core = createFakeCore({ container: null });
            const manager = new PanelManager(core);

            expect(() => manager.setPanelWidth(500)).not.toThrow();
            expect(core.eventBus.emit).not.toHaveBeenCalled();
        });
    });

    describe('savePanelWidthForModule()', () => {
        test('saves the width under a per-module key when envManager and an active module are present', () => {
            const envManager = createFakeEnvManager();
            const core = createFakeCore({
                envManager: envManager as unknown as EnvAPI,
                activeModule: makeModule('demo-module')
            });
            const manager = new PanelManager(core);

            manager.savePanelWidthForModule(600);

            expect(envManager.set).toHaveBeenCalledWith('panel_width_demo-module', '600');
        });

        test('does nothing without an envManager', () => {
            const core = createFakeCore({ envManager: null, activeModule: makeModule('demo-module') });
            const manager = new PanelManager(core);

            expect(() => manager.savePanelWidthForModule(600)).not.toThrow();
        });

        test('does nothing without an active module', () => {
            const envManager = createFakeEnvManager();
            const core = createFakeCore({ envManager: envManager as unknown as EnvAPI, activeModule: null });
            const manager = new PanelManager(core);

            manager.savePanelWidthForModule(600);

            expect(envManager.set).not.toHaveBeenCalled();
        });

        test('does nothing when the active module has no name', () => {
            const envManager = createFakeEnvManager();
            const core = createFakeCore({
                envManager: envManager as unknown as EnvAPI,
                activeModule: { name: '' } as unknown as AgentletModule
            });
            const manager = new PanelManager(core);

            manager.savePanelWidthForModule(600);

            expect(envManager.set).not.toHaveBeenCalled();
        });
    });

    describe('restorePanelWidthForModule()', () => {
        beforeEach(() => {
            jest.useFakeTimers();
        });

        afterEach(() => {
            jest.useRealTimers();
        });

        test('restores the saved width after the 50ms timer when not minimized', () => {
            const container = document.createElement('div');
            const envManager = createFakeEnvManager();
            envManager.get.mockReturnValue('700');
            const core = createFakeCore({
                container,
                envManager: envManager as unknown as EnvAPI,
                isMinimized: false
            });
            const manager = new PanelManager(core);

            manager.restorePanelWidthForModule(makeModule('demo-module'));

            expect(container.style.width).toBe('');
            jest.advanceTimersByTime(50);

            expect(container.style.width).toBe('700px');
        });

        test('(bug case) does nothing when the panel is minimized', () => {
            const container = document.createElement('div');
            const envManager = createFakeEnvManager();
            envManager.get.mockReturnValue('700');
            const core = createFakeCore({
                container,
                envManager: envManager as unknown as EnvAPI,
                isMinimized: true
            });
            const manager = new PanelManager(core);

            manager.restorePanelWidthForModule(makeModule('demo-module'));
            jest.advanceTimersByTime(50);

            expect(container.style.width).toBe('');
            expect(jest.getTimerCount()).toBe(0);
        });

        test('does nothing without an envManager', () => {
            const core = createFakeCore({ envManager: null });
            const manager = new PanelManager(core);

            manager.restorePanelWidthForModule(makeModule('demo-module'));
            jest.advanceTimersByTime(50);

            expect(jest.getTimerCount()).toBe(0);
        });

        test('does nothing without an active module', () => {
            const envManager = createFakeEnvManager();
            const core = createFakeCore({ envManager: envManager as unknown as EnvAPI });
            const manager = new PanelManager(core);

            manager.restorePanelWidthForModule(null);

            expect(envManager.get).not.toHaveBeenCalled();
        });

        test('does nothing for a saved width below the configured minimum', () => {
            const container = document.createElement('div');
            const envManager = createFakeEnvManager();
            envManager.get.mockReturnValue('100');
            const core = createFakeCore({
                container,
                envManager: envManager as unknown as EnvAPI,
                minimumPanelWidth: 320
            });
            const manager = new PanelManager(core);

            manager.restorePanelWidthForModule(makeModule('demo-module'));
            jest.advanceTimersByTime(50);

            expect(container.style.width).toBe('');
        });

        test('does nothing for a non-numeric saved value', () => {
            const container = document.createElement('div');
            const envManager = createFakeEnvManager();
            envManager.get.mockReturnValue('not-a-number');
            const core = createFakeCore({
                container,
                envManager: envManager as unknown as EnvAPI
            });
            const manager = new PanelManager(core);

            manager.restorePanelWidthForModule(makeModule('demo-module'));
            jest.advanceTimersByTime(50);

            expect(container.style.width).toBe('');
        });
    });

    describe('getPanelWidth()', () => {
        test('returns the container offsetWidth when the container exists', () => {
            const container = document.createElement('div');
            Object.defineProperty(container, 'offsetWidth', { value: 555, configurable: true });
            const core = createFakeCore({ container });
            const manager = new PanelManager(core);

            expect(manager.getPanelWidth()).toBe(555);
        });

        test('falls back to the configured minimum width when there is no container', () => {
            // An empty/invalid theme.panelWidth makes parseInt() return NaN, which falls
            // through the `||` to minimumPanelWidth (the same path taken when config.theme
            // parses to 0).
            const core = createFakeCore({
                container: null,
                minimumPanelWidth: 320,
                theme: { panelWidth: '' }
            });
            const manager = new PanelManager(core);

            expect(manager.getPanelWidth()).toBe(320);
        });
    });
});
