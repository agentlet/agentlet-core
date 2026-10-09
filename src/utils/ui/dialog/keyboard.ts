/**
 * Keyboard helpers for the dialog keydown handler.
 */

/**
 * Elements whose own Enter handling the browser must keep: buttons and
 * links activate, `summary` toggles, and a multi-line field inserts a new
 * line. `closest()` is used so a key event dispatched on a child of such an
 * element (an icon inside a button) counts too.
 */
const NATIVE_ENTER_SELECTOR = [
    'button',
    'a[href]',
    '[role="button"]',
    'summary',
    'textarea',
    '[contenteditable]:not([contenteditable="false"])'
].join(', ');

/** Whether Enter on `element` does something natively that a dialog must not swallow. */
export function hasNativeEnterBehaviour(element: Element): boolean {
    return element.closest(NATIVE_ENTER_SELECTOR) !== null;
}

/**
 * The element that actually received a key event. Dialog keydown listeners
 * sit on `document`, where an event from inside a shadow root is retargeted
 * to the shadow host, so the real target is read from the composed path.
 * Returns `null` when the event has no element target.
 */
export function getKeyEventTarget(event: KeyboardEvent): Element | null {
    const origin = typeof event.composedPath === 'function' ? event.composedPath()[0] : event.target;
    return origin instanceof Element ? origin : null;
}
