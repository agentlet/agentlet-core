/**
 * Tests for ShortcutManager's shadow-DOM-aware target resolution.
 *
 * These tests exercise the real hotkeys-js dispatch path (no mocking of the
 * library) so the shadow DOM regression is actually caught: hotkeys-js
 * binds its keydown/keyup listeners on `document`, so for an event
 * dispatched inside an open shadow root, `event.target` as observed from
 * `document` is the shadow host (a plain DIV), not the focused element.
 * Only `event.composedPath()[0]` resolves to the real target. See
 * getEventTarget()/isEditableTarget() in src/utils/ui/ShortcutManager.js.
 *
 * tests/setup.js globally replaces document.createElement and document.head
 * with plain-object mocks so lighter suites don't need a full DOM. These
 * tests need the real thing (attachShadow, dispatchEvent, composedPath), so
 * each test restores jsdom's native implementations first - the same trick
 * used in tests/ui/UIManager.test.js.
 */

import hotkeys from 'hotkeys-js';
import ShortcutManager from '../../../src/utils/ui/ShortcutManager.js';

// hotkeys-js resolves the pressed key from `keyCode`/`which`, not `key`.
// 72 is the keyCode for the letter "h".
const KEY_H = 72;

/**
 * Dispatch a real keydown on `target` with hotkeys-js-compatible keyCode/
 * which, bubbling and composed so it crosses shadow boundaries and reaches
 * the `document` listener hotkeys-js installs.
 */
function dispatchKeydown(target, { keyCode = KEY_H, ctrlKey = false, metaKey = false, altKey = false } = {}) {
    const event = new KeyboardEvent('keydown', {
        key: 'h',
        keyCode,
        which: keyCode,
        bubbles: true,
        composed: true,
        cancelable: true,
        ctrlKey,
        metaKey,
        altKey
    });
    target.dispatchEvent(event);
    return event;
}

/**
 * hotkeys-js keeps module-level state (`_downKeys`, pressed modifiers) that
 * only a matching keyup clears. Firing one with no modifiers after every
 * keydown keeps each test's key/modifier state from leaking into the next.
 */
function dispatchKeyupReset(target, { keyCode = KEY_H } = {}) {
    const event = new KeyboardEvent('keyup', {
        key: 'h',
        keyCode,
        which: keyCode,
        bubbles: true,
        composed: true,
        cancelable: true
    });
    target.dispatchEvent(event);
}

describe('ShortcutManager - real event target through shadow DOM', () => {
    let manager;

    beforeEach(() => {
        // Restore jsdom's real Document.prototype implementations removed
        // by tests/setup.js's global mocks; these tests need real
        // attachShadow(), dispatchEvent() and composedPath() support.
        delete document.createElement;
        delete document.head;
        document.body.innerHTML = '';

        manager = new ShortcutManager();
        manager.init(hotkeys);
    });

    afterEach(() => {
        hotkeys.unbind();
        manager.clear();
        document.body.innerHTML = '';
    });

    function createLightInput() {
        const input = document.createElement('input');
        document.body.appendChild(input);
        return input;
    }

    function createShadowInput() {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const input = document.createElement('input');
        shadow.appendChild(input);
        return input;
    }

    test('(a) bare letter shortcut does not fire from a light DOM input, and the letter still types', async () => {
        const callback = jest.fn();
        await manager.register('h', callback, { allowInInputs: false });

        const input = createLightInput();
        const event = dispatchKeydown(input);
        dispatchKeyupReset(input);

        expect(callback).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    test('(b) bare letter shortcut does not fire from an input inside an open shadow root (regression test)', async () => {
        const callback = jest.fn();
        await manager.register('h', callback, { allowInInputs: false });

        const input = createShadowInput();
        const event = dispatchKeydown(input);
        dispatchKeyupReset(input);

        // Without composedPath()-based target resolution, event.target seen
        // from document is the shadow host (a DIV), isEditableTarget() would
        // return false, and the callback would fire here.
        expect(callback).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    test('(c) ctrl+letter shortcut is blocked but its default is prevented, in light DOM and inside a shadow root', async () => {
        const callback = jest.fn();
        await manager.register('ctrl+h', callback, { allowInInputs: false });

        const lightInput = createLightInput();
        const lightEvent = dispatchKeydown(lightInput, { ctrlKey: true });
        dispatchKeyupReset(lightInput);

        expect(callback).not.toHaveBeenCalled();
        expect(lightEvent.defaultPrevented).toBe(true);

        const shadowInput = createShadowInput();
        const shadowEvent = dispatchKeydown(shadowInput, { ctrlKey: true });
        dispatchKeyupReset(shadowInput);

        expect(callback).not.toHaveBeenCalled();
        expect(shadowEvent.defaultPrevented).toBe(true);
    });

    test('(d) bare letter shortcut fires and is prevented when no editable target is focused', async () => {
        const callback = jest.fn();
        await manager.register('h', callback, { allowInInputs: false });

        const event = dispatchKeydown(document.body);
        dispatchKeyupReset(document.body);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(true);
    });

    test('(e) allowInInputs: true fires even from an input inside a shadow root', async () => {
        const callback = jest.fn();
        await manager.register('h', callback, { allowInInputs: true });

        const input = createShadowInput();
        dispatchKeydown(input);
        dispatchKeyupReset(input);

        expect(callback).toHaveBeenCalledTimes(1);
    });

    test('(f) preventDefault: false leaves the event unprevented when the shortcut fires', async () => {
        const callback = jest.fn();
        await manager.register('h', callback, { preventDefault: false });

        const event = dispatchKeydown(document.body);
        dispatchKeyupReset(document.body);

        expect(callback).toHaveBeenCalledTimes(1);
        expect(event.defaultPrevented).toBe(false);
    });

    test('(g) a contenteditable element inside a shadow root behaves like an input (blocked, not prevented)', async () => {
        const callback = jest.fn();
        await manager.register('h', callback, { allowInInputs: false });

        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadow = host.attachShadow({ mode: 'open' });
        const editable = document.createElement('div');
        // jsdom does not implement isContentEditable, so set it explicitly.
        Object.defineProperty(editable, 'isContentEditable', { value: true });
        shadow.appendChild(editable);

        const event = dispatchKeydown(editable);
        dispatchKeyupReset(editable);

        expect(callback).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });

    test('(h) a disabled manager does not fire any shortcut', async () => {
        const callback = jest.fn();
        await manager.register('h', callback, { allowInInputs: false });
        manager.setEnabled(false);

        const event = dispatchKeydown(document.body);
        dispatchKeyupReset(document.body);

        expect(callback).not.toHaveBeenCalled();
        expect(event.defaultPrevented).toBe(false);
    });
});
