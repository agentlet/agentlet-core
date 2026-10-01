/**
 * DOM helpers shared by the extractors and the matcher: resolving a
 * selector back to its element, reading label texts, and the field types
 * that never take part in copy or fill.
 */

/** Input types that carry no value worth copying and cannot be filled. */
export const NON_DATA_TYPES: ReadonlySet<string> = new Set(['submit', 'button', 'reset', 'image', 'file', 'hidden', 'password', 'radio']);

/** Collapses whitespace and trims. */
export function cleanText(text: string | null | undefined): string {
    return (text ?? '').replace(/\s+/g, ' ').trim();
}

/** Strips a trailing colon and a required marker from a label text. */
export function cleanLabel(text: string): string {
    return cleanText(text).replace(/\s*[:*]+\s*$/, '').trim();
}

/** The element a selector from `forms.quickExport()` points at, or `null` if the selector is invalid or matches nothing. */
export function resolveElement(root: Element, selector: string): Element | null {
    try {
        if (root.matches(selector)) return root;
        return root.querySelector(selector);
    } catch {
        return null;
    }
}

/** Number of elements `selector` matches under `root`: more than one means the selector cannot address a single field. */
export function countMatches(root: Element, selector: string): number {
    try {
        return root.querySelectorAll(selector).length + (root.matches(selector) ? 1 : 0);
    } catch {
        return 0;
    }
}

/** The text of a `<label>`, without the text of the controls inside it. */
function labelTextWithoutControls(label: Element): string {
    const clone = label.cloneNode(true) as Element;
    clone.querySelectorAll('input, select, textarea, button, option').forEach(node => node.remove());
    return cleanLabel(clone.textContent || '');
}

/**
 * Label texts for a control, best first: the explicit `<label for>`, the
 * wrapping `<label>` without the control's own text, `aria-label`, and what
 * `forms.quickExport()` reported.
 */
export function labelTexts(element: Element | null, quickLabel: string | null): string[] {
    const texts: string[] = [];
    const add = (text: string | null | undefined) => {
        const cleaned = cleanLabel(text ?? '');
        if (cleaned && !texts.includes(cleaned)) texts.push(cleaned);
    };
    if (element) {
        const id = element.getAttribute('id');
        if (id) {
            const root = element.getRootNode() as Document | ShadowRoot | Element;
            let explicit: Element[] = [];
            try {
                explicit = Array.from(root.querySelectorAll?.(`label[for="${id.replace(/"/g, '\\"')}"]`) ?? []);
            } catch {
                explicit = [];
            }
            explicit.forEach(label => add(labelTextWithoutControls(label)));
        }
        const wrapping = element.closest('label');
        if (wrapping) add(labelTextWithoutControls(wrapping));
        add(element.getAttribute('aria-label'));
    }
    if (quickLabel) quickLabel.split(' | ').forEach(add);
    return texts;
}
