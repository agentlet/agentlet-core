/**
 * HTML injection regression tests: values that come from the page, a module,
 * the user, the environment or an identity provider must be rendered as text,
 * never parsed as markup. Each test uses a payload that would create an
 * element (or an event handler attribute) if it reached an HTML parser.
 *
 * Like tests/index.behaviour.test.ts, these need jsdom's real DOM, so each
 * test restores the native `document.createElement`/`document.head` that
 * tests/setup.js replaces with mocks.
 */

import hotkeys from 'hotkeys-js';
import AgentletCore from '../../src/index.js';
import Module from '../../src/core/Module.js';
import AuthManager from '../../src/utils/system/AuthManager.js';
import ShortcutManager from '../../src/utils/ui/ShortcutManager.js';
import type { AgentletModule } from '../../src/types/public-api';

const PAYLOAD = '"><img src=x onerror=alert(1)>';

/** True when anything under `root` is an element the payload would have created. */
function hasInjectedElement(root: ParentNode): boolean {
    return root.querySelector('img') !== null || root.querySelector('[onerror]') !== null;
}

describe('HTML injection hardening', () => {
    let agentlet: AgentletCore | undefined;

    beforeEach(() => {
        delete (document as { createElement?: unknown }).createElement;
        delete (document as { head?: unknown }).head;
        document.body.innerHTML = '';
        delete (window as { agentlet?: unknown }).agentlet;
        jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(async () => {
        if (agentlet && agentlet.initialized) {
            await agentlet.cleanup();
        }
        agentlet = undefined;
        document.body.innerHTML = '';
        delete (window as { agentlet?: unknown }).agentlet;
        jest.restoreAllMocks();
    });

    async function createCore(config: ConstructorParameters<typeof AgentletCore>[0] = {}): Promise<AgentletCore> {
        const core = new AgentletCore(config);
        await core.init();
        agentlet = core;
        return core;
    }

    describe('panel title', () => {
        test('a module panel title is rendered as text', async () => {
            const core = await createCore();
            const mod = new Module({ name: 'titled', patterns: ['never-matches.example'] });
            (mod as unknown as { getPanelTitle: () => string }).getPanelTitle = () => PAYLOAD;
            core.moduleRegistry.activeModule = mod;

            core.updateApplicationDisplay();

            const display = core.ui.query('#agentlet-app-display') as HTMLElement;
            expect(core.ui.query('#agentlet-app-name')?.textContent).toBe(PAYLOAD);
            expect(hasInjectedElement(display)).toBe(false);
            expect(display.querySelectorAll('*')).toHaveLength(2);
        });

        test('a module name is rendered as text', async () => {
            const core = await createCore();
            const mod = new Module({ name: PAYLOAD, patterns: ['never-matches.example'] });
            core.moduleRegistry.activeModule = mod;

            core.updateApplicationDisplay();

            const display = core.ui.query('#agentlet-app-display') as HTMLElement;
            expect(core.ui.query('#agentlet-app-name')?.textContent).toBe(PAYLOAD.charAt(0).toUpperCase() + PAYLOAD.slice(1));
            expect(hasInjectedElement(display)).toBe(false);
        });
    });

    describe('module content', () => {
        test('the placeholder for a module without content escapes the module name and the page URL', async () => {
            const core = await createCore();
            // Not a Module subclass and without getContent()/mount(): hits the placeholder branch
            const duck = { name: PAYLOAD, patterns: [], cleanup: () => Promise.resolve() } as unknown as AgentletModule;
            core.moduleRegistry.activeModule = duck;
            // A query string whose value is a literal HTML entity: unescaped it would render as "<b>"
            window.history.pushState({}, '', '/?x=&lt;b&gt;&amp;');

            await core.updateModuleContent('refresh');

            const content = core.ui.content as HTMLElement;
            expect(hasInjectedElement(content)).toBe(false);
            expect(content.querySelector('h3')?.textContent).toBe(PAYLOAD);
            expect(content.querySelector('p')?.textContent).toBe(`Module loaded for: ${window.location.href}`);
            expect(content.querySelector('p')?.textContent).toContain('&lt;b&gt;&amp;');
            expect(content.querySelector('b')).toBeNull();
            window.history.pushState({}, '', '/');
        });

        test('getContent() of a duck-typed module is still rendered as HTML (documented contract)', async () => {
            const core = await createCore();
            const duck = { name: 'duck', patterns: [], cleanup: () => Promise.resolve(), getContent: () => '<p class="mine">Hello</p>' } as unknown as AgentletModule;
            core.moduleRegistry.activeModule = duck;

            await core.updateModuleContent('refresh');

            expect(core.ui.content?.querySelector('p.mine')?.textContent).toBe('Hello');
        });
    });

    describe('settings and help dialogs', () => {
        test('the settings dialog escapes the active module name and the page URL', async () => {
            const core = await createCore();
            core.moduleRegistry.activeModule = { name: PAYLOAD, patterns: [], cleanup: () => Promise.resolve() } as unknown as AgentletModule;
            window.history.pushState({}, '', '/?x=&lt;b&gt;');

            core.showSettings();

            const overlay = core.ui.query('.agentlet-info-overlay') as HTMLElement;
            expect(overlay).not.toBeNull();
            expect(hasInjectedElement(overlay)).toBe(false);
            expect(overlay.textContent).toContain(PAYLOAD);
            expect(overlay.textContent).toContain('&lt;b&gt;');
            expect(overlay.querySelector('b')).toBeNull();
            window.history.pushState({}, '', '/');
        });

        test('the help dialog escapes the active module name', async () => {
            const core = await createCore();
            core.moduleRegistry.activeModule = { name: PAYLOAD, patterns: [], cleanup: () => Promise.resolve() } as unknown as AgentletModule;

            core.showHelp();

            const overlay = core.ui.query('.agentlet-info-overlay') as HTMLElement;
            expect(overlay).not.toBeNull();
            expect(hasInjectedElement(overlay)).toBe(false);
            expect(overlay.textContent).toContain(PAYLOAD);
        });
    });

    describe('showModal()', () => {
        test('renders the title as text and closes through addEventListener buttons, not inline handlers', async () => {
            const core = await createCore();

            core.showModal(PAYLOAD, '<p class="body">Body</p>');

            const modal = core.ui.query('.modal') as HTMLElement;
            expect(modal.querySelector('h3')?.textContent).toBe(PAYLOAD);
            expect(hasInjectedElement(modal)).toBe(false);
            // content is HTML by contract
            expect(modal.querySelector('p.body')?.textContent).toBe('Body');
            expect(modal.querySelector('[onclick]')).toBeNull();

            const buttons = Array.from(modal.querySelectorAll('button'));
            expect(buttons.map(b => b.textContent)).toEqual(['×', 'Close']);
            buttons[1].click();
            expect(core.ui.query('.modal')).toBeNull();

            core.showModal('Again', 'x');
            (core.ui.query('.modal button') as HTMLElement).click();
            expect(core.ui.query('.modal')).toBeNull();
        });
    });

    describe('environment variables dialog', () => {
        const KEY = 'K"><img src=x onerror=alert(1)>';
        const VALUE = 'v"><img src=x onerror=alert(2)>';

        test('renders a malicious variable name and value as text', async () => {
            const core = await createCore();
            core.envManager?.set(KEY, VALUE);

            core.showEnvVarsDialog();

            const list = core.ui.query('.env-vars-list') as HTMLElement;
            expect(hasInjectedElement(list)).toBe(false);
            expect(list.querySelector('strong')?.textContent).toBe(KEY);
            expect(list.querySelector('span')?.textContent).toBe(VALUE);
            expect(list.querySelector('[onclick]')).toBeNull();
        });

        test('the Delete button removes a variable whose name contains quotes and markup', async () => {
            const core = await createCore();
            core.envManager?.set(KEY, VALUE);
            core.envManager?.set('PLAIN', '1');
            core.showEnvVarsDialog();

            const remove = core.ui.query('[data-env-action="remove"]') as HTMLElement;
            expect(remove.getAttribute('data-env-key')).toBe(KEY);
            remove.click();

            expect(core.envManager?.has(KEY)).toBe(false);
            expect(core.envManager?.has('PLAIN')).toBe(true);
            expect(core.ui.query('.env-vars-list')?.textContent).not.toContain('onerror');
        });

        test('Add/Update stores a variable typed into the inputs, and keeps working after a refresh', async () => {
            const core = await createCore();
            core.showEnvVarsDialog();

            const add = (key: string, value: string): void => {
                (core.ui.query('#env-var-key') as HTMLInputElement).value = key;
                (core.ui.query('#env-var-value') as HTMLInputElement).value = value;
                (core.ui.query('[data-env-action="add"]') as HTMLElement).click();
            };
            add(KEY, 'one');
            add('SECOND', 'two');

            expect(core.envManager?.get(KEY)).toBe('one');
            expect(core.envManager?.get('SECOND')).toBe('two');
            expect(hasInjectedElement(core.ui.query('.env-vars-list') as HTMLElement)).toBe(false);

            // an empty name is ignored
            add('', 'ignored');
            expect(Object.keys(core.envManager?.getAll() || {})).toHaveLength(2);
        });

        test('a click on the text inside a button still triggers its action', async () => {
            const core = await createCore();
            core.envManager?.set('NESTED', '1');
            core.showEnvVarsDialog();

            const remove = core.ui.query('[data-env-action="remove"]') as HTMLElement;
            const inner = document.createElement('i');
            remove.appendChild(inner);
            inner.click();

            expect(core.envManager?.has('NESTED')).toBe(false);
        });
    });

    describe('minimizeWithImage', () => {
        test.each(['javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x'])(
            'drops the unsafe URL %s from the config',
            async (url) => {
                const core = await createCore({ minimizeWithImage: url });
                expect(core.config.minimizeWithImage).toBeNull();
                expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('minimizeWithImage ignored'));
            }
        );

        test.each(['https://example.com/icon.png', '/icon.png', 'data:image/png;base64,iVBORw0KGgo='])(
            'keeps the safe URL %s',
            async (url) => {
                const core = await createCore({ minimizeWithImage: url });
                expect(core.config.minimizeWithImage).toBe(url);
            }
        );

        test('a URL that tries to break out of the attribute does not create an attribute or element', async () => {
            const url = 'x.png" onerror="alert(1)"><img src=y onerror=alert(2)>';
            const core = await createCore();
            core.config.minimizeWithImage = url;

            core.uiManager.showImageOverlay();
            const overlay = core.ui.imageOverlay as HTMLElement | null;
            const images = overlay ? overlay.querySelectorAll('img') : [];

            expect(images).toHaveLength(1);
            expect(images[0].hasAttribute('onerror')).toBe(false);
            expect(images[0].getAttribute('src')).toBe(url);
        });

        test('showImageOverlay() refuses a javascript: URL even if the config was mutated afterwards', async () => {
            const core = await createCore();
            core.config.minimizeWithImage = 'javascript:alert(1)';

            core.uiManager.showImageOverlay();

            const img = (core.ui.imageOverlay as HTMLElement).querySelector('img') as HTMLImageElement;
            expect(img.hasAttribute('src')).toBe(false);
        });
    });

    describe('login button', () => {
        test('user initials from the identity provider are rendered as text', () => {
            const manager = new AuthManager({ enabled: true, loginUrl: 'https://idp.example.com' });
            const button = manager.createLoginButton() as HTMLButtonElement;
            manager.authenticatedUser = { name: '< img' };

            manager.updateButtonContent();

            expect(button.children).toHaveLength(0);
            expect(button.textContent).toBe('👤 <I');
        });

        test('the configured icon and text are rendered as text', () => {
            const manager = new AuthManager({
                enabled: true,
                loginUrl: 'https://idp.example.com',
                buttonIcon: '<img src=x onerror=alert(1)>',
                buttonText: PAYLOAD
            });
            const button = manager.createLoginButton() as HTMLButtonElement;

            expect(button.children).toHaveLength(0);
            expect(button.textContent).toBe(`<img src=x onerror=alert(1)> ${PAYLOAD}`);
        });
    });

    describe('keyboard shortcuts help', () => {
        test('escapes the shortcut keys and description', async () => {
            const show = jest.fn();
            (window as unknown as { agentlet: unknown }).agentlet = { utils: { Dialog: { show, isActive: false } } };
            const manager = new ShortcutManager();
            manager.init(hotkeys as unknown as Parameters<ShortcutManager['init']>[0]);
            await manager.register('ctrl+k', jest.fn(), { description: PAYLOAD });

            manager.showHelp();

            const [, options] = show.mock.calls[0];
            const container = document.createElement('div');
            container.innerHTML = options.message;
            expect(hasInjectedElement(container)).toBe(false);
            expect(container.textContent).toContain(PAYLOAD);
            hotkeys.unbind();
            manager.clear();
        });
    });
});
