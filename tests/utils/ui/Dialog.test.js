/**
 * Tests for Dialog's shadow-DOM-aware mounting:
 *  - setRoot()/getRoot() resolution (explicit root -> window.agentlet.ui.root
 *    -> document.body)
 *  - overlays mount inside the configured root instead of always on
 *    document.body
 *  - focusFirstInput() works across the shadow boundary (isConnected rather
 *    than document.body.contains())
 *  - the addDialogStyles() fallback (standalone use, no AgentletCore) is a
 *    no-op whenever a core stylesheet already covers the root
 *  - Escape keydown, dispatched from inside a shadow root, still reaches the
 *    document-level listener and closes the dialog
 *
 * tests/setup.js globally replaces document.createElement/document.head with
 * lightweight mocks (plain objects, no attachShadow/querySelector) so other
 * suites don't need a full DOM. These tests need the real thing - real
 * attachShadow(), real style elements, real focus handling - so each test
 * restores jsdom's native implementations first (see tests/ui/UIManager.test.js
 * and tests/ui/StyleInjector.test.js for the same pattern).
 */

import Dialog from '../../../src/utils/ui/Dialog.js';

function createShadowRoot() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    return host.attachShadow({ mode: 'open' });
}

describe('Dialog - shadow DOM mounting', () => {
    beforeEach(() => {
        // Restore jsdom's real Document.prototype implementations by removing
        // the own-property mocks installed by tests/setup.js.
        delete document.createElement;
        delete document.head;

        document.body.innerHTML = '';
        delete window.agentlet;
    });

    afterEach(() => {
        document.body.innerHTML = '';
        document.getElementById('agentlet-dialog-styles')?.remove();
        delete window.agentlet;
    });

    describe('setRoot()', () => {
        test('info() mounts the overlay inside the shadow root, not document.body', () => {
            const shadowRoot = createShadowRoot();
            const dialog = new Dialog();
            dialog.setRoot(shadowRoot);

            dialog.info('Hello there', 'Title');

            expect(dialog.overlay).not.toBeNull();
            expect(dialog.overlay.getRootNode()).toBe(shadowRoot);
            expect(shadowRoot.querySelector('.agentlet-dialog-overlay')).toBe(dialog.overlay);
            // document.body.contains() cannot see across the shadow boundary
            expect(document.body.contains(dialog.overlay)).toBe(false);

            dialog.hide();
        });

        test('prompt() (input dialog) also mounts inside the shadow root', () => {
            const shadowRoot = createShadowRoot();
            const dialog = new Dialog();
            dialog.setRoot(shadowRoot);

            dialog.prompt('Enter a value', 'default');

            expect(shadowRoot.querySelector('.agentlet-input-dialog')).not.toBeNull();
            expect(document.body.querySelector('.agentlet-input-dialog')).toBeNull();

            dialog.hide();
        });

        test('falls back to window.agentlet.ui.root when setRoot() was never called', () => {
            const shadowRoot = createShadowRoot();
            window.agentlet = { ui: { root: shadowRoot } };

            const dialog = new Dialog();
            dialog.info('Hello there');

            expect(dialog.overlay.getRootNode()).toBe(shadowRoot);

            dialog.hide();
        });
    });

    describe('standalone use (no setRoot, no window.agentlet)', () => {
        test('mounts the overlay on document.body', () => {
            const dialog = new Dialog();
            dialog.info('Hello there');

            expect(dialog.overlay.parentNode).toBe(document.body);

            dialog.hide();
        });

        test('injects the fallback #agentlet-dialog-styles exactly once, even across multiple dialogs', () => {
            const dialog1 = new Dialog();
            dialog1.info('First');
            expect(document.head.querySelectorAll('#agentlet-dialog-styles').length).toBe(1);
            dialog1.hide();

            const dialog2 = new Dialog();
            dialog2.info('Second');
            expect(document.head.querySelectorAll('#agentlet-dialog-styles').length).toBe(1);
            dialog2.hide();
        });
    });

    describe('addDialogStyles() fallback skip when a core stylesheet is present', () => {
        test('no fallback style is injected into a shadow root that already has #agentlet-core-styles', () => {
            const shadowRoot = createShadowRoot();
            const coreStyle = document.createElement('style');
            coreStyle.id = 'agentlet-core-styles';
            shadowRoot.appendChild(coreStyle);

            const dialog = new Dialog();
            dialog.setRoot(shadowRoot);
            dialog.info('Hello there');

            expect(shadowRoot.querySelector('#agentlet-dialog-styles')).toBeNull();

            dialog.hide();
        });

        test('no fallback style is injected on document.body when #agentlet-core-styles already exists in <head>', () => {
            const coreStyle = document.createElement('style');
            coreStyle.id = 'agentlet-core-styles';
            document.head.appendChild(coreStyle);

            const dialog = new Dialog();
            dialog.info('Hello there');

            expect(document.head.querySelector('#agentlet-dialog-styles')).toBeNull();

            dialog.hide();
        });
    });

    describe('focusFirstInput() across the shadow boundary', () => {
        test('focuses the input field mounted inside the shadow root', () => {
            const shadowRoot = createShadowRoot();
            const dialog = new Dialog();
            dialog.setRoot(shadowRoot);

            dialog.prompt('Enter your name', 'default value');

            const input = shadowRoot.querySelector('.agentlet-input-field');
            expect(input).not.toBeNull();
            expect(shadowRoot.activeElement).toBe(input);

            dialog.hide();
        });
    });

    describe('Escape key handling across the shadow boundary', () => {
        test('Escape dispatched from inside the shadow root still closes the dialog', () => {
            const shadowRoot = createShadowRoot();
            const dialog = new Dialog();
            dialog.setRoot(shadowRoot);

            const callback = jest.fn();
            dialog.info('Hello there', 'Title', callback);
            expect(dialog.isActive).toBe(true);

            // keydown is a composed event, so it bubbles out of the shadow root
            // to the document-level listener Dialog registers.
            const escapeEvent = new KeyboardEvent('keydown', {
                key: 'Escape',
                bubbles: true,
                composed: true
            });
            dialog.overlay.dispatchEvent(escapeEvent);

            expect(dialog.isActive).toBe(false);
            expect(callback).toHaveBeenCalledWith('cancel');
        });
    });
});
