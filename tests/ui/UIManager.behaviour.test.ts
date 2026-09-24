/**
 * Behaviour characterization tests for UIManager, ahead of its conversion
 * to TypeScript.
 *
 * tests/ui/UIManager.test.js already drives UIManager indirectly through a
 * real `AgentletCore` instance (ensureRoot() in both shadowDom modes,
 * ui.query()/queryAll(), toggleCollapse(), cleanup teardown, Dialog mount
 * location). This file drives `UIManager` directly against a small fake
 * "core" object - typed with the minimal interface the real conversion
 * will introduce (`UIManagerCore`, declared below) - and adds coverage for
 * paths the AgentletCore-level suite does not exercise: ensureRoot()
 * idempotence and its leftover-host cleanup, setupBaseUI()'s exact DOM
 * structure (ids/classes, one full snapshot), header/content area
 * structure, the actions area's button set and ordering, the resize
 * handle's pointer-drag behaviour, show()/hide()/minimize()/maximize()
 * no-op guards, and the image overlay show/hide/ensure trio.
 *
 * tests/setup.js globally mocks document.createElement/document.head with
 * lightweight doubles; these tests restore jsdom's real implementations so
 * real elements/shadow roots behave like they do in a browser.
 */

import { UIManager } from '../../src/ui/UIManager.js';
import type { AgentletCoreConfig, EventBusAPI, EnvAPI, AgentletModule } from '../../src/types/public-api';

/**
 * Minimal shape of the `AgentletCore` instance `UIManager` needs - every
 * member it reads or calls on `this.core`, mirroring the pattern used by
 * `PanelManagerCore` in `src/ui/PanelManager.ts`. This is what the real
 * conversion introduces as `UIManagerCore`.
 */
interface UIManagerCore {
    config: Omit<AgentletCoreConfig, 'minimumPanelWidth'> & { minimumPanelWidth: number };
    ui: {
        host: HTMLElement | null;
        root: ShadowRoot | HTMLElement | null;
        container: HTMLElement | null;
        content: HTMLElement | null;
        header: HTMLElement | null;
        actions: HTMLElement | null;
        imageOverlay: HTMLElement | null;
        query(selector: string): Element | null;
        queryAll(selector: string): NodeListOf<Element>;
    };
    styleInjector: { setRoot(root: ShadowRoot | HTMLElement | null): void };
    isMinimized: boolean;
    eventBus: EventBusAPI;
    authManager: { createLoginButton(): HTMLButtonElement | null };
    envManager: EnvAPI | null;
    moduleRegistry: { activeModule: AgentletModule | null };
    panelManager: {
        savePanelWidthForModule(width: number): void;
        restorePanelWidthForModule(activeModule: AgentletModule | null): void;
    };
    refreshContent(): Promise<void>;
    showSettings(): void;
    showHelp(): void;
    showEnvVarsDialog(): void;
    createActionButton(icon: string, title: string, onClick: (event: MouseEvent) => void): HTMLButtonElement;
    createDiscreteCloseButton(): HTMLButtonElement;
}

/** `UIManager.js` is untyped plain JS pre-conversion. */
interface UIManagerTestInstance {
    core: UIManagerCore;
    ui: UIManagerCore['ui'];
    ensureRoot(): ShadowRoot | HTMLElement;
    setupBaseUI(): void;
    createToggleButton(): HTMLButtonElement;
    createHeader(): HTMLElement;
    createContentArea(): HTMLElement;
    createActionsArea(): HTMLElement;
    createResizeHandle(container: HTMLElement): HTMLElement;
    show(): void;
    hide(): void;
    minimize(): void;
    maximize(): void;
    toggleCollapse(): void;
    showImageOverlay(): void;
    hideImageOverlay(): void;
    ensureImageOverlay(): void;
}

const UIManagerCtor = UIManager as unknown as new (core: UIManagerCore) => UIManagerTestInstance;

function createFakeCore(overrides: Partial<UIManagerCore['config']> = {}): UIManagerCore {
    const core: UIManagerCore = {
        config: {
            shadowDom: true,
            minimumPanelWidth: 320,
            ...overrides
        },
        ui: {
            host: null,
            root: null,
            container: null,
            content: null,
            header: null,
            actions: null,
            imageOverlay: null,
            query(selector: string): Element | null {
                const root = core.ui.root ?? document;
                return typeof (root as Document | ShadowRoot).querySelector === 'function'
                    ? (root as Document | ShadowRoot).querySelector(selector)
                    : null;
            },
            queryAll(selector: string): NodeListOf<Element> {
                const root = (core.ui.root ?? document) as Document | ShadowRoot;
                return root.querySelectorAll(selector);
            }
        },
        styleInjector: { setRoot: jest.fn() },
        isMinimized: false,
        eventBus: { emit: jest.fn() } as unknown as EventBusAPI,
        authManager: { createLoginButton: jest.fn(() => null) },
        envManager: null,
        moduleRegistry: { activeModule: null },
        panelManager: {
            savePanelWidthForModule: jest.fn(),
            restorePanelWidthForModule: jest.fn()
        },
        refreshContent: jest.fn(() => Promise.resolve()),
        showSettings: jest.fn(),
        showHelp: jest.fn(),
        showEnvVarsDialog: jest.fn(),
        createActionButton: jest.fn((icon: string, title: string, onClick: (event: MouseEvent) => void) => {
            const btn = document.createElement('button');
            btn.title = title;
            btn.textContent = icon;
            btn.addEventListener('click', onClick);
            return btn;
        }),
        createDiscreteCloseButton: jest.fn(() => document.createElement('button'))
    };
    return core;
}

describe('UIManager behaviour characterization', () => {
    beforeEach(() => {
        delete (document as unknown as { createElement?: unknown }).createElement;
        delete (document as unknown as { head?: unknown }).head;
        document.body.innerHTML = '';
        delete (window as unknown as { agentlet?: unknown }).agentlet;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        delete (window as unknown as { agentlet?: unknown }).agentlet;
    });

    describe('ensureRoot()', () => {
        test('shadowDom: true creates #agentlet-host with an open shadow root and wires styleInjector', () => {
            const core = createFakeCore({ shadowDom: true });
            const manager = new UIManagerCtor(core);

            const root = manager.ensureRoot();

            const host = document.getElementById('agentlet-host');
            expect(host).not.toBeNull();
            expect(host?.shadowRoot).toBe(root);
            expect(core.ui.host).toBe(host);
            expect(core.ui.root).toBe(root);
            expect(core.styleInjector.setRoot).toHaveBeenCalledWith(root);
        });

        test('shadowDom: false uses document.body directly and does not create a host', () => {
            const core = createFakeCore({ shadowDom: false });
            const manager = new UIManagerCtor(core);

            const root = manager.ensureRoot();

            expect(root).toBe(document.body);
            expect(core.ui.host).toBeNull();
            expect(document.getElementById('agentlet-host')).toBeNull();
        });

        test('is idempotent: a second call returns the same root without creating another host or re-calling styleInjector.setRoot', () => {
            const core = createFakeCore({ shadowDom: true });
            const manager = new UIManagerCtor(core);

            const first = manager.ensureRoot();
            const second = manager.ensureRoot();

            expect(second).toBe(first);
            expect(document.querySelectorAll('#agentlet-host').length).toBe(1);
            expect(core.styleInjector.setRoot).toHaveBeenCalledTimes(1);
        });

        test('removes a leftover #agentlet-host element from a previous cycle before creating a new one', () => {
            const leftover = document.createElement('div');
            leftover.id = 'agentlet-host';
            document.body.appendChild(leftover);

            const core = createFakeCore({ shadowDom: true });
            const manager = new UIManagerCtor(core);

            const root = manager.ensureRoot();

            expect(document.querySelectorAll('#agentlet-host').length).toBe(1);
            expect(document.getElementById('agentlet-host')).not.toBe(leftover);
            expect(core.ui.root).toBe(root);
        });

        test('points window.agentlet.utils.Dialog/MessageBubble at the new root when window.agentlet.utils exists', () => {
            const setRootDialog = jest.fn();
            const setRootBubble = jest.fn();
            (window as unknown as { agentlet: { utils: { Dialog: { setRoot: typeof setRootDialog }; MessageBubble: { setRoot: typeof setRootBubble } } } }).agentlet = {
                utils: { Dialog: { setRoot: setRootDialog }, MessageBubble: { setRoot: setRootBubble } }
            };

            const core = createFakeCore({ shadowDom: true });
            const manager = new UIManagerCtor(core);
            const root = manager.ensureRoot();

            expect(setRootDialog).toHaveBeenCalledWith(root);
            expect(setRootBubble).toHaveBeenCalledWith(root);
        });
    });

    describe('setupBaseUI() DOM structure', () => {
        test('builds the expected ids/classes and matches a full structural snapshot', () => {
            const core = createFakeCore({ shadowDom: false });
            const manager = new UIManagerCtor(core);

            manager.setupBaseUI();

            const container = document.getElementById('agentlet-container') as HTMLElement;
            expect(container).not.toBeNull();
            expect(container.className).toBe('agentlet-panel');
            expect(document.getElementById('agentlet-toggle')?.className).toBe('agentlet-toggle');
            expect(document.getElementById('agentlet-header')?.className).toBe('agentlet-header');
            expect(document.getElementById('agentlet-content')?.className).toBe('agentlet-content');
            expect(document.getElementById('agentlet-actions')?.className).toBe('agentlet-actions');
            expect(container.outerHTML).toMatchSnapshot();

            expect(core.ui.container).toBe(container);
            expect(core.ui.content).toBe(document.getElementById('agentlet-content'));
            expect(core.ui.header).toBe(document.getElementById('agentlet-header'));
            expect(core.ui.actions).toBe(document.getElementById('agentlet-actions'));
        });

        test('removes an existing #agentlet-container before creating a new one, but NOT a previously created toggle button (quirk: repeated calls duplicate the toggle)', () => {
            const core = createFakeCore({ shadowDom: false });
            const manager = new UIManagerCtor(core);

            manager.setupBaseUI();
            manager.setupBaseUI();

            expect(document.querySelectorAll('#agentlet-container').length).toBe(1);
            // Pre-existing quirk, not fixed here: only #agentlet-container is
            // looked up and removed before rebuilding; the toggle button has no
            // equivalent guard, so a second setupBaseUI() call appends another one.
            expect(document.querySelectorAll('#agentlet-toggle').length).toBe(2);
        });

        test('omits the toggle button when minimizeWithImage is configured as a string', () => {
            const core = createFakeCore({ shadowDom: false, minimizeWithImage: 'https://example.com/icon.png' });
            const manager = new UIManagerCtor(core);

            manager.setupBaseUI();

            expect(document.getElementById('agentlet-toggle')).toBeNull();
            expect(document.querySelector('.agentlet-image-overlay')).not.toBeNull();
        });

        test('startMinimized applies the collapsed transform and toggle glyph up front', () => {
            const core = createFakeCore({ shadowDom: false, startMinimized: true });
            const manager = new UIManagerCtor(core);

            manager.setupBaseUI();

            const container = document.getElementById('agentlet-container') as HTMLElement;
            expect(container.style.transform).toBe('translateX(100%)');
            const toggle = document.getElementById('agentlet-toggle') as HTMLElement;
            expect(toggle.innerHTML).toBe('◀');
            expect(toggle.style.right).toBe('-2px');
            expect(core.isMinimized).toBe(true);
        });
    });

    describe('createHeader() / createContentArea()', () => {
        test('createHeader() builds the app-display header structure', () => {
            const core = createFakeCore();
            const manager = new UIManagerCtor(core);

            const header = manager.createHeader();

            expect(header.id).toBe('agentlet-header');
            expect(header.className).toBe('agentlet-header');
            const display = header.querySelector('#agentlet-app-display');
            expect(display?.className).toBe('agentlet-app-display');
            expect(header.querySelector('#agentlet-app-name')?.textContent).toBe('Ready');
        });

        test('createContentArea() builds an empty content container', () => {
            const core = createFakeCore();
            const manager = new UIManagerCtor(core);

            const content = manager.createContentArea();

            expect(content.id).toBe('agentlet-content');
            expect(content.className).toBe('agentlet-content');
            expect(content.childElementCount).toBe(0);
        });
    });

    describe('createActionsArea()', () => {
        test('includes only the buttons enabled by config, plus the always-present close button', () => {
            const core = createFakeCore({
                showRefreshButton: true,
                showSettingsButton: false,
                showHelpButton: true,
                showEnvVarsButton: false
            });
            const manager = new UIManagerCtor(core);

            const actions = manager.createActionsArea();

            const left = actions.querySelector('.agentlet-actions-left') as HTMLElement;
            const right = actions.querySelector('.agentlet-actions-right') as HTMLElement;
            expect(left.children.length).toBe(3); // refresh + help + close
            expect(right.children.length).toBe(0); // authManager.createLoginButton() stubbed to null
            expect(core.createActionButton).toHaveBeenCalledWith('\u{1F504}', 'Refresh', expect.any(Function));
            expect(core.createActionButton).toHaveBeenCalledWith('❓', 'Help', expect.any(Function));
            expect(core.createActionButton).not.toHaveBeenCalledWith('⚙️', 'Settings', expect.any(Function));
        });

        test('includes the env-vars button only when both showEnvVarsButton and envManager are set', () => {
            const core = createFakeCore({ showEnvVarsButton: true });
            core.envManager = { name: () => 'stub' } as unknown as EnvAPI;
            const manager = new UIManagerCtor(core);

            const actions = manager.createActionsArea();

            expect(core.createActionButton).toHaveBeenCalledWith('\u{1F527}', 'Environment Variables', expect.any(Function));
            expect((actions.querySelector('.agentlet-actions-left') as HTMLElement).children.length).toBe(2); // envVars + close
        });

        test('places the auth login button in the right-side actions when authManager provides one', () => {
            const core = createFakeCore();
            const authButton = document.createElement('button');
            core.authManager.createLoginButton = jest.fn(() => authButton);
            const manager = new UIManagerCtor(core);

            const actions = manager.createActionsArea();

            const right = actions.querySelector('.agentlet-actions-right') as HTMLElement;
            expect(right.contains(authButton)).toBe(true);
        });

        test('refresh button click delegates to core.refreshContent()', () => {
            const core = createFakeCore({ showRefreshButton: true });
            const manager = new UIManagerCtor(core);

            const actions = manager.createActionsArea();
            const refreshBtn = (actions.querySelector('.agentlet-actions-left') as HTMLElement).children[0] as HTMLButtonElement;
            refreshBtn.click();

            expect(core.refreshContent).toHaveBeenCalled();
        });
    });

    describe('createResizeHandle() pointer drag', () => {
        function setupResizable(startWidth = 400): { core: UIManagerCore; manager: UIManagerTestInstance; container: HTMLElement; toggle: HTMLElement } {
            const core = createFakeCore({ shadowDom: false, resizablePanel: true, minimumPanelWidth: 320 });
            const manager = new UIManagerCtor(core);
            manager.setupBaseUI();

            const container = document.getElementById('agentlet-container') as HTMLElement;
            Object.defineProperty(container, 'offsetWidth', { value: startWidth, configurable: true });
            return { core, manager, container, toggle: document.getElementById('agentlet-toggle') as HTMLElement };
        }

        test('mousedown then mousemove resizes the container width, clamped to minimumPanelWidth', () => {
            const { container } = setupResizable(400);
            const handle = document.querySelector('.agentlet-resize-handle') as HTMLElement;

            handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 500, bubbles: true, cancelable: true }));
            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 700 })); // diff = -200 -> width would drop below min

            expect(container.style.width).toBe('320px');

            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 400 })); // diff = +100 -> 500px
            expect(container.style.width).toBe('500px');

            document.dispatchEvent(new MouseEvent('mouseup'));
        });

        test('mouseup restores transitions/user-select and emits panel:resizeComplete + saves width', () => {
            const { core, container } = setupResizable(400);
            const handle = document.querySelector('.agentlet-resize-handle') as HTMLElement;

            handle.dispatchEvent(new MouseEvent('mousedown', { clientX: 500, bubbles: true, cancelable: true }));
            expect(container.style.transition).toBe('none');
            expect(document.body.style.userSelect).toBe('none');

            document.dispatchEvent(new MouseEvent('mousemove', { clientX: 450 }));
            document.dispatchEvent(new MouseEvent('mouseup'));

            expect(container.style.transition).toBe('');
            expect(document.body.style.userSelect).toBe('');
            expect(core.eventBus.emit).toHaveBeenCalledWith('panel:resizeComplete', { width: container.offsetWidth });
            expect(core.panelManager.savePanelWidthForModule).toHaveBeenCalledWith(container.offsetWidth);
        });

    });

    describe('show()/hide()/minimize()/maximize()', () => {
        test('show() and hide() toggle container display', () => {
            const core = createFakeCore();
            const manager = new UIManagerCtor(core);
            core.ui.container = document.createElement('div');

            manager.hide();
            expect(core.ui.container.style.display).toBe('none');

            manager.show();
            expect(core.ui.container.style.display).toBe('flex');
        });

        test('minimize() is a no-op when already minimized (does not toggle back)', () => {
            const core = createFakeCore({ shadowDom: false });
            const manager = new UIManagerCtor(core);
            manager.setupBaseUI();
            core.isMinimized = true;

            manager.minimize();

            expect(core.isMinimized).toBe(true);
        });

        test('maximize() is a no-op when not minimized', () => {
            const core = createFakeCore({ shadowDom: false });
            const manager = new UIManagerCtor(core);
            manager.setupBaseUI();
            core.isMinimized = false;

            manager.maximize();

            expect(core.isMinimized).toBe(false);
        });
    });

    describe('toggleCollapse()', () => {
        test('is a no-op when there is no container', () => {
            const core = createFakeCore();
            const manager = new UIManagerCtor(core);

            expect(() => manager.toggleCollapse()).not.toThrow();
            expect(core.isMinimized).toBe(false);
        });

        test('collapsing sets transform/toggle glyph, isMinimized, and emits ui:minimized', () => {
            const core = createFakeCore({ shadowDom: false });
            const manager = new UIManagerCtor(core);
            manager.setupBaseUI();

            manager.toggleCollapse();

            const container = document.getElementById('agentlet-container') as HTMLElement;
            const toggle = document.getElementById('agentlet-toggle') as HTMLElement;
            expect(container.style.transform).toBe('translateX(100%)');
            expect(toggle.innerHTML).toBe('◀');
            expect(toggle.style.right).toBe('-2px');
            expect(core.isMinimized).toBe(true);
            expect(core.eventBus.emit).toHaveBeenCalledWith('ui:minimized');
        });

        test('expanding restores transform/toggle glyph, isMinimized, restores panel width for the active module, and emits ui:maximized', () => {
            const core = createFakeCore({ shadowDom: false });
            const activeModule = { name: 'demo' } as unknown as AgentletModule;
            core.moduleRegistry.activeModule = activeModule;
            const manager = new UIManagerCtor(core);
            manager.setupBaseUI();

            manager.toggleCollapse(); // collapse
            manager.toggleCollapse(); // expand

            const container = document.getElementById('agentlet-container') as HTMLElement;
            const toggle = document.getElementById('agentlet-toggle') as HTMLElement;
            expect(container.style.transform).toBe('translateX(0)');
            expect(toggle.innerHTML).toBe('▶');
            expect(toggle.style.right).toBe('');
            expect(core.isMinimized).toBe(false);
            expect(core.panelManager.restorePanelWidthForModule).toHaveBeenCalledWith(activeModule);
            expect(core.eventBus.emit).toHaveBeenCalledWith('ui:maximized');
        });
    });

    describe('image overlay show/hide/ensure', () => {
        test('showImageOverlay() no-ops when minimizeWithImage is not configured', () => {
            const core = createFakeCore({ shadowDom: false });
            const manager = new UIManagerCtor(core);
            manager.ensureRoot();

            manager.showImageOverlay();

            expect(document.querySelector('.agentlet-image-overlay')).toBeNull();
        });

        test('showImageOverlay() creates an overlay with the configured image and toggles collapse on click', () => {
            const core = createFakeCore({ shadowDom: false, minimizeWithImage: 'https://example.com/icon.png' });
            const manager = new UIManagerCtor(core);
            manager.setupBaseUI();
            // setupBaseUI() already ensures the overlay via ensureImageOverlay(); clear and re-verify explicitly.
            manager.hideImageOverlay();

            manager.showImageOverlay();

            const overlay = document.querySelector('.agentlet-image-overlay') as HTMLElement;
            expect(overlay).not.toBeNull();
            expect(overlay.querySelector('img')?.getAttribute('src')).toBe('https://example.com/icon.png');
            expect(core.ui.imageOverlay).toBe(overlay);

            (overlay as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
            expect(core.isMinimized).toBe(true);
        });

        test('showImageOverlay() replaces rather than duplicates an existing overlay', () => {
            const core = createFakeCore({ shadowDom: false, minimizeWithImage: 'https://example.com/icon.png' });
            const manager = new UIManagerCtor(core);
            manager.ensureRoot();

            manager.showImageOverlay();
            manager.showImageOverlay();

            expect(document.querySelectorAll('.agentlet-image-overlay').length).toBe(1);
        });

        test('hideImageOverlay() is safe to call when no overlay exists, and ensureImageOverlay() no-ops when unconfigured', () => {
            const core = createFakeCore({ shadowDom: false });
            const manager = new UIManagerCtor(core);
            manager.ensureRoot();

            expect(() => manager.hideImageOverlay()).not.toThrow();
            expect(core.ui.imageOverlay).toBeNull();

            manager.ensureImageOverlay();
            expect(document.querySelector('.agentlet-image-overlay')).toBeNull();
        });
    });
});
