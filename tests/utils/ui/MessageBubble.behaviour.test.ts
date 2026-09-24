/**
 * Characterization tests for MessageBubble.
 *
 * These tests pin down the CURRENT behaviour of
 * `src/utils/ui/MessageBubble.js` before it is converted to
 * `MessageBubble.ts`. Nothing here should change when the conversion lands
 * - if an assertion needs to change, the conversion changed behaviour and
 * that is a bug in the conversion, not in this file.
 *
 * Only paths NOT already covered by `tests/utils/ui/MessageBubble.test.js`
 * are exercised here (that file stays byte-identical). In particular:
 * - `tests/utils/ui/MessageBubble.test.js`'s top `describe('MessageBubble', ...)`
 *   block replaces `document.createElement`/`appendChild` with plain-object
 *   mocks, so it never observes real DOM structure/CSS.
 * - its `describe('MessageBubble - shadow DOM mounting', ...)` block covers
 *   setRoot()/getRoot() resolution and one branch of the fallback-style
 *   injection rule (the `#agentlet-core-styles` id check).
 *
 * This file restores jsdom's real `document.createElement`/`document.head`
 * (removed by `tests/setup.js`'s global mocks) the same way that block
 * does, so bubble markup, container positioning and style injection can be
 * asserted against a real DOM.
 */

import MessageBubble from '../../../src/utils/ui/MessageBubble.js';
import type { MessageBubbleOptions } from '../../../src/types/public-api';

/**
 * `MessageBubble.js`'s current (pre-conversion) JSDoc has no `[options.x]`
 * optionality markers, so TypeScript's JS inference treats every `show()`
 * option as required - the exact gap `MessageBubbleOptions` (and this
 * conversion) closes. Bridges the two so these characterization tests can
 * call `show()` the same partial-options way real consumers do.
 */
function showBubble(bubble: MessageBubble, options: MessageBubbleOptions): string {
    return (bubble.show as (options: MessageBubbleOptions) => string)(options);
}

/**
 * tests/setup.js permanently replaces the global `CustomEvent` with a
 * `jest.fn()` returning a plain `{type, detail}` object - not a real
 * `Event` - which breaks a genuine `dispatchEvent()` call. Unlike
 * `document.createElement`/`document.head` (accessors inherited from
 * `Document.prototype`, restorable via `delete`), `CustomEvent` is an own
 * property of `window` with no prototype to fall back to once overwritten,
 * so `delete` would leave it `undefined` instead of restoring it (verified
 * against jsdom directly). This subclasses the still-intact real `Event`
 * global to provide a working, genuinely dispatchable replacement.
 */
class RealCustomEvent<T = unknown> extends Event {
    readonly detail: T | null;

    constructor(type: string, params: CustomEventInit<T> = {}) {
        super(type, params);
        this.detail = params.detail ?? null;
    }
}

describe('MessageBubble - real DOM behaviour', () => {
    let messageBubble: MessageBubble;

    beforeEach(() => {
        // Restore jsdom's real Document.prototype implementations removed
        // by tests/setup.js's global mocks - see tests/ui/UIManager.test.js
        // for the same trick.
        delete (document as { createElement?: unknown }).createElement;
        delete (document as { head?: unknown }).head;
        document.body.innerHTML = '';
        delete (window as { agentlet?: unknown }).agentlet;
        (global as unknown as { CustomEvent: unknown }).CustomEvent = RealCustomEvent;

        messageBubble = new MessageBubble();
    });

    afterEach(() => {
        jest.useRealTimers();
        document.body.innerHTML = '';
        document.getElementById('agentlet-bubble-styles')?.remove();
        delete (window as { agentlet?: unknown }).agentlet;
    });

    test('init() mounts a fixed-position container on document.body by default', () => {
        messageBubble.init();

        const container = messageBubble.container as HTMLDivElement;
        expect(container.id).toBe('agentlet-message-bubbles');
        expect(container.parentNode).toBe(document.body);
        expect(container.style.position).toBe('fixed');
        expect(container.style.cssText).toContain('max-width: 400px');
    });

    test.each([
        ['top-right', { top: '20px', right: '20px', left: 'auto', bottom: 'auto' }, 'column'],
        ['top-left', { top: '20px', left: '20px', right: 'auto', bottom: 'auto' }, 'column'],
        ['bottom-right', { bottom: '20px', right: '20px', left: 'auto', top: 'auto' }, 'column-reverse'],
        ['bottom-left', { bottom: '20px', left: '20px', right: 'auto', top: 'auto' }, 'column-reverse']
    ] as const)('show() with position %s applies the matching container style', (position, expected, flexDirection) => {
        showBubble(messageBubble, { message: 'Hi', duration: 0, position });

        const container = messageBubble.container as HTMLDivElement;
        expect(container.style.top).toBe(expected.top);
        expect(container.style.right).toBe(expected.right);
        expect(container.style.bottom).toBe(expected.bottom);
        expect(container.style.left).toBe(expected.left);
        expect(container.style.flexDirection).toBe(flexDirection);
    });

    test('bubble markup for a titled, closable, default-icon bubble matches the snapshot', () => {
        const id = showBubble(messageBubble, {
            message: 'Saved successfully',
            type: 'success',
            title: 'All done',
            duration: 0,
            closable: true
        });

        const bubble = (messageBubble.getBubble(id) as { element: HTMLElement }).element;
        expect(bubble.outerHTML).toMatchSnapshot();

        expect(bubble.className).toBe('agentlet-bubble agentlet-bubble-success');
        expect(bubble.querySelector('button')).not.toBeNull();
        // Structure: bubble > [closeBtn, content > [iconEl?, textWrapper > [titleEl?, messageEl]]].
        // Navigated by position rather than a CSS combinator, since
        // `div > div > div` also matches against ancestors OUTSIDE the
        // bubble (it is mounted inside the message-bubbles container),
        // which silently reorders the match set.
        const content = bubble.children[bubble.children.length - 1] as HTMLElement;
        const textWrapper = content.children[content.children.length - 1] as HTMLElement;
        const titleEl = textWrapper.children[0] as HTMLElement;
        expect(titleEl.textContent).toBe('All done');
        // Default icon for 'success' is the checkmark emoji.
        const iconEl = bubble.querySelector('span');
        expect(iconEl?.innerHTML).toBe('✅');
    });

    test('closable: false renders no close button', () => {
        const id = showBubble(messageBubble, { message: 'No close button', duration: 0, closable: false });

        const bubble = (messageBubble.getBubble(id) as { element: HTMLElement }).element;
        expect(bubble.querySelector('button')).toBeNull();
    });

    test('allowHtml: false renders the message as literal text, not markup', () => {
        const id = showBubble(messageBubble, { message: '<b>Bold</b>', duration: 0, allowHtml: false });

        const bubble = (messageBubble.getBubble(id) as { element: HTMLElement }).element;
        expect(bubble.querySelector('b')).toBeNull();
        expect(bubble.textContent).toContain('<b>Bold</b>');
    });

    test('allowHtml: true renders the message as real markup', () => {
        const id = showBubble(messageBubble, { message: '<b>Bold</b>', duration: 0, allowHtml: true });

        const bubble = (messageBubble.getBubble(id) as { element: HTMLElement }).element;
        const boldEl = bubble.querySelector('b');
        expect(boldEl).not.toBeNull();
        expect(boldEl?.textContent).toBe('Bold');
    });

    test('setAutoHide() removes the bubble from the registry once its duration elapses', () => {
        jest.useFakeTimers();

        const id = showBubble(messageBubble, { message: 'Bye soon', duration: 500 });
        expect(messageBubble.exists(id)).toBe(true);

        jest.advanceTimersByTime(500); // fires hide()
        jest.advanceTimersByTime(300); // hide()'s own removal delay
        expect(messageBubble.exists(id)).toBe(false);
    });

    test('hide() clears the pending auto-hide timer', () => {
        jest.useFakeTimers();
        const clearSpy = jest.spyOn(global, 'clearTimeout');

        const id = showBubble(messageBubble, { message: 'Manual close', duration: 5000 });
        messageBubble.hide(id);

        expect(clearSpy).toHaveBeenCalled();
    });

    test('hideAll() removes every bubble from the DOM after the removal delay', () => {
        jest.useFakeTimers();

        showBubble(messageBubble, { message: 'One', duration: 0 });
        showBubble(messageBubble, { message: 'Two', duration: 0 });
        const container = messageBubble.container as HTMLDivElement;
        expect(container.children.length).toBe(2);

        messageBubble.hideAll();
        jest.advanceTimersByTime(300);

        expect(container.children.length).toBe(0);
        expect(messageBubble.getCount()).toBe(0);
    });

    test('cleanup() synchronously removes the container and resets initialized', () => {
        showBubble(messageBubble, { message: 'Temp', duration: 0 });
        const container = messageBubble.container;

        messageBubble.cleanup();

        expect(messageBubble.container).toBeNull();
        expect(messageBubble.initialized).toBe(false);
        expect(document.body.contains(container as Node)).toBe(false);
    });

    test('updateMessage() quirk: it mutates the outer flex-row wrapper, not the innermost message div', () => {
        // `div > div:last-child` matches the *first* such div in document
        // order - the `content` flex wrapper (last child of the bubble when
        // there is no close button) - not the innermost message <div>,
        // which is also technically "a div that is its parent's last div
        // child" but comes later in the tree. This is existing behaviour,
        // not something this conversion should "fix".
        const id = showBubble(messageBubble, { message: 'Original', duration: 0, closable: false });
        const bubble = (messageBubble.getBubble(id) as { element: HTMLElement }).element;
        const contentWrapper = bubble.firstElementChild as HTMLElement;

        const result = messageBubble.updateMessage(id, 'Updated');

        expect(result).toBe(true);
        expect(contentWrapper.textContent).toBe('Updated');
    });

    test('getBubble() returns the stored record, and undefined for an unknown id', () => {
        const id = showBubble(messageBubble, { message: 'Track me', duration: 0 });

        const record = messageBubble.getBubble(id);
        expect(record?.element).toBeInstanceOf(HTMLElement);
        expect(record?.options.message).toBe('Track me');
        expect(messageBubble.getBubble('does-not-exist')).toBeUndefined();
    });

    test('fallback style injection is idempotent: a second bubble does not duplicate the <style> tag', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadowRoot = host.attachShadow({ mode: 'open' });
        messageBubble.setRoot(shadowRoot);

        showBubble(messageBubble, { message: 'One', duration: 0 });
        showBubble(messageBubble, { message: 'Two', duration: 0 });

        expect(shadowRoot.querySelectorAll('#agentlet-bubble-styles').length).toBe(1);
    });

    test('fallback style is not injected into a shadow root that already has adopted stylesheets', () => {
        const host = document.createElement('div');
        document.body.appendChild(host);
        const shadowRoot = host.attachShadow({ mode: 'open' });
        const sheet = new CSSStyleSheet();
        shadowRoot.adoptedStyleSheets = [sheet];
        messageBubble.setRoot(shadowRoot);

        showBubble(messageBubble, { message: 'Adopted styles present', duration: 0 });

        expect(shadowRoot.querySelector('#agentlet-bubble-styles')).toBeNull();
    });

    test('legacy/body mode injects the fallback style into document.head, not document.body', () => {
        showBubble(messageBubble, { message: 'Legacy mode', duration: 0 });

        expect(document.head.querySelector('#agentlet-bubble-styles')).not.toBeNull();
        expect(document.body.querySelector('#agentlet-bubble-styles')).toBeNull();
    });
});

describe('MessageBubble - convenience method defaults', () => {
    let messageBubble: MessageBubble;
    let showSpy: jest.SpyInstance;

    beforeEach(() => {
        messageBubble = new MessageBubble();
        showSpy = jest.spyOn(messageBubble, 'show').mockReturnValue('bubble-1');
    });

    afterEach(() => {
        showSpy.mockRestore();
    });

    test('custom() calls show() with type "custom"', () => {
        messageBubble.custom('Custom message');

        expect(showSpy).toHaveBeenCalledWith({ message: 'Custom message', type: 'custom' });
    });

    test('toast() defaults to type "info", a 3000ms duration and no close button', () => {
        messageBubble.toast('Toasted');

        expect(showSpy).toHaveBeenCalledWith({
            message: 'Toasted',
            type: 'info',
            duration: 3000,
            closable: false
        });
    });

    test('notify() defaults to a null title, no auto-hide and a close button', () => {
        messageBubble.notify('Persistent');

        expect(showSpy).toHaveBeenCalledWith({
            message: 'Persistent',
            type: 'info',
            title: null,
            duration: 0,
            closable: true
        });
    });

    test('loading() defaults to a custom-styled, non-closable, non-expiring bubble with an hourglass icon', () => {
        messageBubble.loading();

        expect(showSpy).toHaveBeenCalledWith({
            message: 'Loading...',
            type: 'custom',
            icon: '⏳',
            duration: 0,
            closable: false,
            style: {
                background: '#f0f9ff',
                color: '#0369a1',
                border: '1px solid #bae6fd'
            }
        });
    });
});

describe('MessageBubble - click/close listener wiring', () => {
    let messageBubble: MessageBubble;

    beforeEach(() => {
        delete (window as { agentlet?: unknown }).agentlet;

        // The 'real DOM behaviour' group above restores the real
        // document.head (see its own beforeEach); addStyles() would then
        // try to appendChild() the plain-object <style> mock below into a
        // genuine Node, which throws. Give this group its own tolerant
        // head stand-in, mirroring tests/setup.js's original mockHead.
        Object.defineProperty(document, 'head', {
            value: { appendChild: jest.fn(), querySelector: jest.fn(() => null) },
            writable: true,
            configurable: true
        });

        // Mock createElement to return objects exposing a spy-able
        // addEventListener, the same technique
        // tests/utils/ui/MessageBubble.test.js's top describe block uses,
        // to check listener wiring without needing a full real DOM.
        jest.spyOn(document.body, 'appendChild').mockImplementation((child) => child);
        jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
            return {
                tagName: tagName.toUpperCase(),
                id: '',
                style: { cssText: '' },
                innerHTML: '',
                textContent: '',
                dispatchEvent: jest.fn(),
                querySelector: jest.fn(() => ({ innerHTML: '', textContent: '' })),
                querySelectorAll: jest.fn(() => []),
                remove: jest.fn(),
                classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn() },
                addEventListener: jest.fn(),
                removeEventListener: jest.fn(),
                appendChild: jest.fn()
                // eslint-disable-next-line @typescript-eslint/no-explicit-any -- mock DOM node deliberately duck-typed, not a real HTMLElement
            } as any;
        });

        global.setTimeout = jest.fn((fn: TimerHandler) => {
            if (typeof fn === 'function') fn();
            return 123 as unknown as ReturnType<typeof setTimeout>;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any -- matches tests/utils/ui/MessageBubble.test.js's own global.setTimeout mock
        }) as any;

        messageBubble = new MessageBubble();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('onClick is wired up via addEventListener when provided', () => {
        const onClick = jest.fn();
        const id = showBubble(messageBubble, { message: 'Clickable', duration: 0, onClick });

        const bubble = (messageBubble.getBubble(id) as { element: { addEventListener: jest.Mock } }).element;
        expect(bubble.addEventListener).toHaveBeenCalledWith('click', onClick);
    });

    test('onClose is wired up via addEventListener when provided', () => {
        const onClose = jest.fn();
        const id = showBubble(messageBubble, { message: 'Closable', duration: 0, onClose });

        const bubble = (messageBubble.getBubble(id) as { element: { addEventListener: jest.Mock } }).element;
        expect(bubble.addEventListener).toHaveBeenCalledWith('agentlet-bubble-close', onClose);
    });
});
