/**
 * Argument checks at the `records` API boundary. A bad argument gets a clear
 * `TypeError` that names the method, instead of a `Cannot read properties of
 * undefined` thrown from deep inside an extractor.
 */

/** True for a DOM element, including one from another frame (no `instanceof`). */
export function isElement(value: unknown): value is Element {
    return typeof value === 'object' && value !== null && (value as Node).nodeType === 1
        && typeof (value as Element).tagName === 'string';
}

/** Throws `records.<method>() expects <what>` unless `value` is an element. */
export function assertElement(value: unknown, method: string, what = 'an Element'): asserts value is Element {
    if (!isElement(value)) {
        throw new TypeError(`records.${method}() expects ${what}`);
    }
}

/** Throws unless `value` is a `<table>` element. */
export function assertTable(value: unknown, method: string): asserts value is HTMLTableElement {
    if (!isElement(value) || value.tagName !== 'TABLE') {
        throw new TypeError(`records.${method}() expects a table element`);
    }
}
