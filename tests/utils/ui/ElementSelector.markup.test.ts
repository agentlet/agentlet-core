/**
 * Markup characterization tests for ElementSelector.
 *
 * Unlike tests/utils/ui/ElementSelector.test.js (which mocks `document`
 * heavily and only checks method calls / mock interactions), this file
 * restores a real jsdom `document` and asserts the actual DOM produced by
 * start()/stop() (overlay + highlight box ids, classes, inline styles,
 * z-index values), the hover/click/keyboard event handling, the shape of
 * the element-info payload handed to the selection callback, and the
 * selector/xpath generation algorithms. These pin down CURRENT behaviour
 * (including a couple of quirks, called out below) ahead of the file's
 * conversion to TypeScript.
 *
 * tests/setup.js (loaded globally via setupFilesAfterEnv) replaces
 * `document.createElement` with a plain non-DOM mock for every test file.
 * That's fine for the existing unit tests, but it makes real markup
 * impossible to inspect. The `beforeAll` below restores the genuine jsdom
 * implementation for this file only.
 */

import ElementSelectorCtor from '../../../src/utils/ui/ElementSelector.js';
import { Z_INDEX } from '../../../src/utils/ui/ZIndex.js';
import type { ElementSelectorAPI, ElementInfo } from '../../../src/types/public-api';

/**
 * ElementSelector.js is untyped, plain JS. `tsc` (with `checkJs: false`)
 * infers parameter types for it from its JSDoc comments, which - unlike the
 * hand-written `ElementSelectorAPI.start()` declaration - mark `selector`
 * and `message` as both required on the options object. This local type
 * describes the class's actual runtime surface for this suite: the public
 * `ElementSelectorAPI` contract (whose `start()` signature is correctly
 * optional) plus the internal instance fields and event handlers this file
 * inspects and drives directly.
 */
interface ElementSelectorTestInstance extends ElementSelectorAPI {
    callback: ((element: Element, info: ElementInfo) => void) | null;
    overlay: HTMLElement | null;
    highlightBox: HTMLElement | null;
    currentElement: Element | null;
    originalCursor: string | null;
    allowedSelector: string | null;
    handleMouseMove(event: MouseEvent): void;
    handleClick(event: MouseEvent): void;
    handleKeydown(event: KeyboardEvent): void;
}

const ElementSelector = ElementSelectorCtor as unknown as new () => ElementSelectorTestInstance;

/**
 * jsdom does not implement `CSS.escape` (used by
 * ElementSelector#generateCSSSelector), even though every real browser
 * agentlet-core targets does. Polyfill it for this suite only, using the
 * standard CSSOM "serialize an identifier" algorithm, so the id/class
 * escaping branches can actually run under Jest.
 */
function cssEscapePolyfill(value: string): string {
    const string = String(value);
    const { length } = string;
    const firstCodeUnit = string.charCodeAt(0);
    let result = '';
    for (let index = 0; index < length; index++) {
        const codeUnit = string.charCodeAt(index);
        if (codeUnit === 0x0000) {
            result += '�';
            continue;
        }
        if (
            (codeUnit >= 0x0001 && codeUnit <= 0x001f) || codeUnit === 0x007f ||
            (index === 0 && codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
            (index === 1 && codeUnit >= 0x0030 && codeUnit <= 0x0039 && firstCodeUnit === 0x002d)
        ) {
            result += `\\${codeUnit.toString(16)} `;
            continue;
        }
        if (index === 0 && length === 1 && codeUnit === 0x002d) {
            result += `\\${string.charAt(index)}`;
            continue;
        }
        if (
            codeUnit >= 0x0080 ||
            codeUnit === 0x002d ||
            codeUnit === 0x005f ||
            (codeUnit >= 0x0030 && codeUnit <= 0x0039) ||
            (codeUnit >= 0x0041 && codeUnit <= 0x005a) ||
            (codeUnit >= 0x0061 && codeUnit <= 0x007a)
        ) {
            result += string.charAt(index);
            continue;
        }
        result += `\\${string.charAt(index)}`;
    }
    return result;
}

if (typeof CSS === 'undefined' || typeof CSS.escape !== 'function') {
    (globalThis as unknown as { CSS: { escape: (value: string) => string } }).CSS = {
        escape: cssEscapePolyfill
    };
}

/** Give `el` a fixed `getBoundingClientRect()` result for deterministic positioning math. */
function setRect(el: Element, rect: Partial<DOMRect>): void {
    const full = {
        x: 0, y: 0, width: 0, height: 0, top: 0, left: 0, right: 0, bottom: 0,
        toJSON: () => ({}),
        ...rect
    } as DOMRect;
    el.getBoundingClientRect = () => full;
}

/** Build a fake mouse/keyboard event with just the members ElementSelector reads. */
function fakeEvent(overrides: Partial<{ clientX: number; clientY: number; key: string }> = {}): {
    clientX: number;
    clientY: number;
    key?: string;
    preventDefault: jest.Mock;
    stopPropagation: jest.Mock;
} {
    return {
        clientX: 0,
        clientY: 0,
        preventDefault: jest.fn(),
        stopPropagation: jest.fn(),
        ...overrides
    };
}

describe('ElementSelector markup characterization', () => {
    let elementSelector: ElementSelectorTestInstance;

    beforeAll(() => {
        // Restore the real jsdom implementation that tests/setup.js
        // globally replaces with a plain mock object.
        document.createElement = Document.prototype.createElement.bind(document);
    });

    beforeEach(() => {
        document.body.innerHTML = '';
        document.body.style.cursor = '';
        document.body.style.userSelect = '';

        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();

        elementSelector = new ElementSelector();
    });

    afterEach(() => {
        if (elementSelector.isActive) {
            elementSelector.stop();
        }
        jest.restoreAllMocks();
        document.body.innerHTML = '';
    });

    describe('start() markup', () => {
        test('creates a fixed, full-viewport overlay with the SELECTION_BACKDROP z-index', () => {
            elementSelector.start(jest.fn());

            const overlay = document.getElementById('agentlet-element-selector-overlay') as HTMLElement;
            expect(overlay).not.toBeNull();
            expect(overlay.style.position).toBe('fixed');
            expect(overlay.style.top).toBe('0px');
            expect(overlay.style.left).toBe('0px');
            expect(overlay.style.width).toBe('100vw');
            expect(overlay.style.height).toBe('100vh');
            expect(overlay.style.background).toBe('rgba(0, 0, 0, 0.2)');
            expect(overlay.style.pointerEvents).toBe('none');
            expect(overlay.style.zIndex).toBe(String(Z_INDEX.SELECTION_BACKDROP));
        });

        test('overlay contains a default instruction message at the SELECTION_HIGHLIGHT z-index', () => {
            elementSelector.start(jest.fn());

            const overlay = document.getElementById('agentlet-element-selector-overlay') as HTMLElement;
            const message = overlay.firstElementChild as HTMLElement;
            expect(message.textContent).toBe('Click an element to select it, or press Enter to confirm selection, ESC to cancel');
            expect(message.style.zIndex).toBe(String(Z_INDEX.SELECTION_HIGHLIGHT));
        });

        test('a selector option changes the default message to mention it', () => {
            elementSelector.start(jest.fn(), { selector: 'button' });

            const message = document.getElementById('agentlet-element-selector-overlay')!.firstElementChild as HTMLElement;
            expect(message.textContent).toBe('Click a button element to select it, or press Enter to confirm selection, ESC to cancel');
        });

        test('a custom message option overrides the default text even with a selector set', () => {
            elementSelector.start(jest.fn(), { selector: 'button', message: 'Pick a button' });

            const message = document.getElementById('agentlet-element-selector-overlay')!.firstElementChild as HTMLElement;
            expect(message.textContent).toBe('Pick a button');
        });

        test('creates a hidden highlight box at the BACKDROP z-index', () => {
            elementSelector.start(jest.fn());

            const box = document.getElementById('agentlet-element-selector-highlight') as HTMLElement;
            expect(box).not.toBeNull();
            expect(box.style.position).toBe('absolute');
            expect(box.style.display).toBe('none');
            expect(box.style.border).toBe('2px solid rgb(0, 123, 255)');
            expect(box.style.zIndex).toBe(String(Z_INDEX.BACKDROP));
        });

        test('sets crosshair cursor and disables text selection, logging activation', () => {
            elementSelector.start(jest.fn());

            expect(document.body.style.cursor).toBe('crosshair');
            expect(document.body.style.userSelect).toBe('none');
            expect(console.log).toHaveBeenCalledWith(
                '🎯 Element selector activated. Click an element to select it, ESC to cancel.'
            );
        });

        test('snapshot: overlay + highlight box markup', () => {
            elementSelector.start(jest.fn(), { selector: 'a' });
            expect(document.body.innerHTML).toMatchSnapshot();
        });

        test('calling start() while already active is a no-op that only warns (no second overlay)', () => {
            const firstCallback = jest.fn();
            elementSelector.start(firstCallback);
            elementSelector.start(jest.fn());

            expect(document.querySelectorAll('#agentlet-element-selector-overlay').length).toBe(1);
            expect(elementSelector.callback).toBe(firstCallback);
            expect(console.warn).toHaveBeenCalledWith('Element selector is already active');
        });
    });

    describe('stop() cleanup', () => {
        test('removes overlay and highlight box from the DOM and restores cursor/userSelect', () => {
            document.body.style.cursor = 'default';
            elementSelector.start(jest.fn());

            elementSelector.stop();

            expect(document.getElementById('agentlet-element-selector-overlay')).toBeNull();
            expect(document.getElementById('agentlet-element-selector-highlight')).toBeNull();
            expect(document.body.style.cursor).toBe('default');
            expect(document.body.style.userSelect).toBe('');
            expect(console.log).toHaveBeenCalledWith('🎯 Element selector deactivated');
        });

        test('calling stop() while inactive is a silent no-op', () => {
            elementSelector.stop();
            expect(console.log).not.toHaveBeenCalledWith('🎯 Element selector deactivated');
        });
    });

    describe('hover handling (handleMouseMove)', () => {
        let target: HTMLElement;

        beforeEach(() => {
            target = document.createElement('div');
            target.id = 'hover-target';
            document.body.appendChild(target);
            setRect(target, { left: 100, top: 50, width: 200, height: 80, right: 300, bottom: 130 });
            elementSelector.start(jest.fn());
            document.elementFromPoint = jest.fn(() => target);
        });

        test('positions the highlight box around the hovered element with a 2px outset', () => {
            elementSelector.handleMouseMove(fakeEvent({ clientX: 150, clientY: 90 }) as unknown as MouseEvent);

            const box = document.getElementById('agentlet-element-selector-highlight') as HTMLElement;
            expect(box.style.display).toBe('block');
            expect(box.style.left).toBe('98px');
            expect(box.style.top).toBe('48px');
            expect(box.style.width).toBe('204px');
            expect(box.style.height).toBe('84px');
            expect(elementSelector.currentElement).toBe(target);
        });

        test('hovering the same element twice does not recompute the highlight box a second time', () => {
            elementSelector.handleMouseMove(fakeEvent() as unknown as MouseEvent);
            const highlightSpy = jest.spyOn(elementSelector, 'highlightElement');

            elementSelector.handleMouseMove(fakeEvent() as unknown as MouseEvent);

            expect(highlightSpy).not.toHaveBeenCalled();
        });

        test('hovering an internal element (inside #agentlet-container) hides the highlight', () => {
            const container = document.createElement('div');
            container.id = 'agentlet-container';
            const internalChild = document.createElement('span');
            container.appendChild(internalChild);
            document.body.appendChild(container);
            document.elementFromPoint = jest.fn(() => internalChild);

            elementSelector.handleMouseMove(fakeEvent() as unknown as MouseEvent);

            const box = document.getElementById('agentlet-element-selector-highlight') as HTMLElement;
            expect(box.style.display).toBe('none');
            expect(elementSelector.currentElement).toBeNull();
        });

        test('with an allowedSelector, hovering a non-matching leaf highlights the nearest matching ancestor', () => {
            elementSelector.stop();
            const wrapper = document.createElement('button');
            const span = document.createElement('span');
            wrapper.appendChild(span);
            document.body.appendChild(wrapper);
            setRect(wrapper, { left: 10, top: 10, width: 50, height: 20, right: 60, bottom: 30 });

            elementSelector.start(jest.fn(), { selector: 'button' });
            document.elementFromPoint = jest.fn(() => span);

            elementSelector.handleMouseMove(fakeEvent() as unknown as MouseEvent);

            expect(elementSelector.currentElement).toBe(wrapper);
        });
    });

    describe('click handling (handleClick)', () => {
        test('prevents default/propagation and selects the clicked element, invoking the callback', () => {
            const target = document.createElement('div');
            target.id = 'click-target';
            target.className = 'foo bar';
            target.textContent = 'hello world';
            document.body.appendChild(target);
            setRect(target, { left: 5, top: 5, width: 40, height: 20, right: 45, bottom: 25 });

            const callback = jest.fn();
            elementSelector.start(callback);
            document.elementFromPoint = jest.fn(() => target);

            const event = fakeEvent({ clientX: 10, clientY: 10 });
            elementSelector.handleClick(event as unknown as MouseEvent);

            expect(event.preventDefault).toHaveBeenCalled();
            expect(event.stopPropagation).toHaveBeenCalled();
            expect(callback).toHaveBeenCalledTimes(1);

            const [selectedElement, info] = callback.mock.calls[0] as [Element, ElementInfo];
            expect(selectedElement).toBe(target);
            expect(info).toMatchObject({
                tagName: 'div',
                id: 'click-target',
                className: 'foo bar',
                classes: ['foo', 'bar'],
                text: 'hello world',
                cssSelector: '#click-target',
                xpath: '//*[@id="click-target"]',
                hasChildren: false,
                parent: 'body'
            });
            expect(info.position).toEqual({ x: 5, y: 5, width: 40, height: 20 });

            // selectElement calls stop() before invoking the callback, so by
            // the time the callback runs the overlay is already gone.
            expect(document.getElementById('agentlet-element-selector-overlay')).toBeNull();
        });

        test('clicking with no matching element under the pointer does nothing', () => {
            const callback = jest.fn();
            elementSelector.start(callback);
            document.elementFromPoint = jest.fn(() => null);

            elementSelector.handleClick(fakeEvent() as unknown as MouseEvent);

            expect(callback).not.toHaveBeenCalled();
            expect(elementSelector.isActive).toBe(true);
        });
    });

    describe('keyboard handling (handleKeydown)', () => {
        test('Escape cancels the selection without invoking the callback', () => {
            const callback = jest.fn();
            elementSelector.start(callback);

            elementSelector.handleKeydown(fakeEvent({ key: 'Escape' }) as unknown as KeyboardEvent);

            expect(elementSelector.isActive).toBe(false);
            expect(callback).not.toHaveBeenCalled();
        });

        test('Enter selects the currently hovered element', () => {
            const target = document.createElement('div');
            document.body.appendChild(target);
            setRect(target, { left: 0, top: 0, width: 10, height: 10, right: 10, bottom: 10 });

            const callback = jest.fn();
            elementSelector.start(callback);
            document.elementFromPoint = jest.fn(() => target);
            elementSelector.handleMouseMove(fakeEvent() as unknown as MouseEvent);

            elementSelector.handleKeydown(fakeEvent({ key: 'Enter' }) as unknown as KeyboardEvent);

            expect(callback).toHaveBeenCalledWith(target, expect.any(Object));
        });

        test('Enter with no currently hovered element does nothing', () => {
            const callback = jest.fn();
            elementSelector.start(callback);

            elementSelector.handleKeydown(fakeEvent({ key: 'Enter' }) as unknown as KeyboardEvent);

            expect(callback).not.toHaveBeenCalled();
            expect(elementSelector.isActive).toBe(true);
        });
    });

    describe('generateCSSSelector()', () => {
        test('an element with an id short-circuits to `#id`, escaped', () => {
            const el = document.createElement('div');
            el.id = '1weird:id';
            expect(elementSelector.generateCSSSelector(el)).toBe(`#${CSS.escape('1weird:id')}`);
        });

        test('classes are limited to the first 3, and agentlet- prefixed classes are filtered out', () => {
            const el = document.createElement('div');
            el.className = 'agentlet-internal a b c d';
            expect(elementSelector.generateCSSSelector(el)).toBe('div.a.b.c');
        });

        test('builds a parent > child path capped at 5 levels', () => {
            let el = document.body;
            for (let i = 0; i < 7; i++) {
                const child = document.createElement('div');
                child.className = `level${i}`;
                el.appendChild(child);
                el = child;
            }
            const selector = elementSelector.generateCSSSelector(el);
            expect(selector.split(' > ').length).toBe(5);
        });
    });

    describe('getXPath()', () => {
        test('an element with an id short-circuits to //*[@id="..."]', () => {
            const el = document.createElement('div');
            el.id = 'unique';
            expect(elementSelector.getXPath(el)).toBe('//*[@id="unique"]');
        });

        test('a same-tag sibling adds a 1-based [n] index, ignoring an id on an ancestor', () => {
            const parent = document.createElement('div');
            parent.id = 'parent-has-id';
            document.body.appendChild(parent);
            const first = document.createElement('span');
            const second = document.createElement('span');
            parent.appendChild(first);
            parent.appendChild(second);

            // The id short-circuit only applies to the element getXPath() was
            // called on directly, not to ancestors encountered while walking
            // up - so the parent's id is ignored, and the walk continues all
            // the way to <html> rather than stopping at document.body.
            expect(elementSelector.getXPath(second)).toBe('/html/body/div/span[2]');
        });

        test('a lone element of its tag gets no [n] suffix', () => {
            const parent = document.createElement('div');
            document.body.appendChild(parent);
            const onlyChild = document.createElement('em');
            parent.appendChild(onlyChild);
            expect(elementSelector.getXPath(onlyChild)).toBe('/html/body/div/em');
        });
    });

    describe('helper methods', () => {
        test('getElementAttributes() returns every attribute as a plain object', () => {
            const el = document.createElement('a');
            el.setAttribute('href', '/x');
            el.setAttribute('data-foo', 'bar');
            expect(elementSelector.getElementAttributes(el)).toEqual({ href: '/x', 'data-foo': 'bar' });
        });

        test('isElementVisible() is false for display:none and true for a normal visible box', () => {
            const el = document.createElement('div');
            document.body.appendChild(el);
            setRect(el, { width: 10, height: 10 });
            expect(elementSelector.isElementVisible(el)).toBe(true);

            el.style.display = 'none';
            expect(elementSelector.isElementVisible(el)).toBe(false);
        });

        test('isElementSelectable() returns true and warns on an invalid selector, instead of throwing', () => {
            elementSelector.allowedSelector = ':::not-a-selector';
            const el = document.createElement('div');
            expect(elementSelector.isElementSelectable(el)).toBe(true);
            expect(console.warn).toHaveBeenCalledWith(
                'Invalid selector:', ':::not-a-selector', expect.any(Error)
            );
        });

        test('isInternalElement() flags the toggle button id as internal', () => {
            const toggle = document.createElement('button');
            toggle.id = 'agentlet-toggle';
            expect(elementSelector.isInternalElement(toggle)).toBe(true);
        });
    });
});
