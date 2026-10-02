/**
 * The phase 1 transport: the system clipboard.
 *
 * Write: first a `copy` event with `text/html` (record embedded) and
 * `text/plain`, synchronously inside the user gesture, which needs no
 * permission and works on every engine. Then one `ClipboardItem` with the
 * custom format, `text/html` and `text/plain` as an enhancement. When the
 * browser rejects the custom format (Firefox does), retry with HTML and plain
 * text only. When the async clipboard API is missing or refuses the write
 * (webviews, iframes without the `clipboard-write` permissions policy,
 * locked-down browsers), the copy event content stays.
 *
 * Read: the custom format first (only reachable through
 * `navigator.clipboard.read()`), then the HTML embedding. Plain text is
 * never turned into a record in phase 1.
 */
import { logger } from '../../system/Logger.js';
import { MAX_RECORD_BYTES, toEnvelope, validatePayload, type RecordPayload } from './envelope.js';
import { buildHtml, buildPlainText, CUSTOM_MIME, extractEmbeddedEnvelope, parseCustomFormat } from './formats.js';
import { utf8ByteLength } from './text.js';

export interface WriteOutcome {
    formats: string[];
    customFormat: boolean;
    bytes: number;
    method: WriteMethod;
}

/** Small interface so the extension and native transports can follow in phase 3. */
export interface RecordTransport {
    name: string;
    write(payload: RecordPayload): Promise<WriteOutcome>;
    read(): Promise<RecordPayload | null>;
}

/** Accepts a parsed value only if it validates; anything else is "no record". */
function toPayload(value: unknown): RecordPayload | null {
    if (value === null || value === undefined) return null;
    const result = validatePayload(value);
    if (!result.valid) {
        logger.log('Clipboard held an invalid record:', result.errors);
        return null;
    }
    return result.payload;
}

/** From a custom-format text, then from the HTML embedding. */
export function payloadFromFormats(custom: string | null, html: string | null): RecordPayload | null {
    if (custom && utf8ByteLength(custom) <= MAX_RECORD_BYTES) {
        const fromCustom = toPayload(parseCustomFormat(custom));
        if (fromCustom) return fromCustom;
    }
    if (html) {
        return toPayload(extractEmbeddedEnvelope(html));
    }
    return null;
}

function makeBlob(content: string, type: string): Blob {
    return new Blob([content], { type });
}

/** How a record reached the clipboard. */
export type WriteMethod = 'clipboard-api' | 'copy-event';

function blockedError(apiFailure: string, eventFailure: string): Error {
    return new Error(
        'Copying was blocked by the browser. '
        + `The copy event failed (${eventFailure}) and navigator.clipboard.write() failed (${apiFailure}). `
        + 'Copy from a click or a key press, and check that the page may write to the clipboard.'
    );
}

function reasonOf(error: unknown): string {
    if (error instanceof Error && error.message) return error.message;
    return typeof error === 'string' && error ? error : 'unknown error';
}

interface PolicyLike {
    allowsFeature?(feature: string): boolean;
}

/**
 * Known up front, without awaiting, that the async clipboard API cannot work:
 * the API is missing (insecure context, old browser) or the frame has no
 * `clipboard-write` permissions policy (a cross-origin iframe without
 * `allow="clipboard-write"`). Returns the reason, or `null` when the API may work.
 */
function apiBlockedUpFront(): string | null {
    const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
    if (!clipboard) return 'navigator.clipboard is not available in this page';
    if (typeof clipboard.write !== 'function' || typeof ClipboardItem === 'undefined') {
        return 'navigator.clipboard.write() or ClipboardItem is not available in this page';
    }
    try {
        const doc = document as unknown as { permissionsPolicy?: PolicyLike; featurePolicy?: PolicyLike };
        const policy = doc.permissionsPolicy ?? doc.featurePolicy;
        if (policy && typeof policy.allowsFeature === 'function' && policy.allowsFeature('clipboard-write') === false) {
            return 'the clipboard-write permissions policy blocks this frame';
        }
    } catch {
        // No policy API: let the real write decide.
    }
    return null;
}

interface SavedSelection {
    ranges: Range[];
    active: HTMLElement | null;
    start: number | null;
    end: number | null;
    direction: 'forward' | 'backward' | 'none' | null;
}

function isTextControl(element: Element | null): element is HTMLInputElement | HTMLTextAreaElement {
    return !!element && (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA');
}

function saveSelection(): SavedSelection {
    const selection = document.getSelection();
    const ranges: Range[] = [];
    for (let i = 0; selection && i < selection.rangeCount; i += 1) ranges.push(selection.getRangeAt(i));
    const active = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const control = isTextControl(active) ? active : null;
    let start: number | null = null;
    let end: number | null = null;
    let direction: SavedSelection['direction'] = null;
    try {
        if (control) {
            start = control.selectionStart;
            end = control.selectionEnd;
            direction = control.selectionDirection;
        }
    } catch {
        // Some input types (email, number) throw on selectionStart.
    }
    return { ranges, active, start, end, direction };
}

function restoreSelection(saved: SavedSelection): void {
    try {
        if (saved.active && document.activeElement !== saved.active) saved.active.focus({ preventScroll: true });
        if (isTextControl(saved.active) && saved.start !== null && saved.end !== null) {
            saved.active.setSelectionRange(saved.start, saved.end, saved.direction ?? undefined);
        }
        const selection = document.getSelection();
        if (selection && !isTextControl(saved.active)) {
            selection.removeAllRanges();
            saved.ranges.forEach(range => selection.addRange(range));
        }
    } catch (error) {
        logger.log('Could not restore the selection after copying:', reasonOf(error));
    }
}

/**
 * Puts a temporary off-screen element in the page and selects its content, so
 * `execCommand('copy')` has a selection. WebKit only enables the copy command
 * for a range selection (or a cancelled `beforecopy`). The element is
 * `aria-hidden`, fixed off screen and not focusable by users, so it neither
 * scrolls the page nor shifts layout. Returns a cleanup that removes it and
 * restores the previous selection and focus. Returns `null` when the page has
 * no body to host it.
 */
function selectTemporaryContent(text: string): (() => void) | null {
    const host = document.body ?? document.documentElement;
    if (!host || typeof document.createRange !== 'function') return null;
    const saved = saveSelection();
    const element = document.createElement('span');
    element.setAttribute('aria-hidden', 'true');
    element.textContent = text.slice(0, 200) || ' ';
    element.style.cssText = 'position:fixed;top:0;left:-9999px;width:1px;height:1px;overflow:hidden;'
        + 'white-space:pre;opacity:0;pointer-events:none;user-select:text;-webkit-user-select:text';
    const cleanup = () => {
        element.remove();
        restoreSelection(saved);
    };
    try {
        host.appendChild(element);
        // A focused text control keeps its own selection and would win: move the focus off it.
        if (isTextControl(saved.active) || saved.active?.isContentEditable) {
            element.tabIndex = -1;
            element.focus({ preventScroll: true });
        }
        const selection = document.getSelection();
        if (!selection) {
            cleanup();
            return null;
        }
        const range = document.createRange();
        range.selectNodeContents(element);
        selection.removeAllRanges();
        selection.addRange(range);
    } catch (error) {
        logger.log('Could not select a temporary element for the copy:', reasonOf(error));
        cleanup();
        return null;
    }
    return cleanup;
}

/**
 * The classic copy path: a one-shot capture-phase `copy` listener sets the
 * formats on `event.clipboardData`, then `document.execCommand('copy')` fires
 * the event. It needs no clipboard permission, only a user gesture. It is
 * synchronous, so a caller that has not awaited yet still holds the gesture.
 *
 * WebKit returns false without firing `copy` unless the command is enabled:
 * there must be a range selection, or a `beforecopy` event must be cancelled.
 * So a one-shot `beforecopy` listener cancels the event, and a temporary
 * off-screen selection is made for engines that ignore `beforecopy`. Selection
 * and focus are restored. Every listener and the element are removed in a
 * `finally`. Returns `null` on success, else the reason.
 */
function writeWithCopyEvent(html: string, text: string): string | null {
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
        return 'document.execCommand is not available';
    }
    let handled = false;
    const onBeforeCopy = (event: Event) => {
        event.preventDefault();
    };
    const onCopy = (event: ClipboardEvent) => {
        const data = event.clipboardData;
        if (!data) return;
        data.setData('text/html', html);
        data.setData('text/plain', text);
        // Without this the browser overwrites the data with the selection.
        event.preventDefault();
        handled = true;
    };
    document.addEventListener('beforecopy', onBeforeCopy, true);
    document.addEventListener('copy', onCopy, true);
    let cleanup: (() => void) | null = null;
    try {
        cleanup = selectTemporaryContent(text);
        const ok = document.execCommand('copy');
        if (!ok) {
            const inactive = typeof navigator !== 'undefined' && navigator.userActivation?.isActive === false;
            return inactive
                ? 'execCommand("copy") returned false: no user activation, copy from a click or a key press'
                : 'execCommand("copy") returned false';
        }
        return handled ? null : 'the copy event did not fire or had no clipboardData';
    } catch (error) {
        return reasonOf(error);
    } finally {
        document.removeEventListener('beforecopy', onBeforeCopy, true);
        document.removeEventListener('copy', onCopy, true);
        cleanup?.();
    }
}

export class ClipboardTransport implements RecordTransport {
    readonly name = 'clipboard';

    /**
     * Copies in two steps, the first one before any `await`:
     *
     * 1. The copy event, synchronously, inside the user gesture: a one-shot
     *    capture-phase `copy` listener sets `text/html` (record embedded) and
     *    `text/plain`, then `document.execCommand('copy')` fires it. It needs
     *    no clipboard permission and works on every engine.
     * 2. Then `navigator.clipboard.write()` as an enhancement: the custom
     *    format plus HTML and plain text, with one retry without the custom
     *    format. When it succeeds it replaces the clipboard with a superset of
     *    the same data. When it fails or is unavailable (webviews, iframes
     *    without the `clipboard-write` permissions policy, locked-down
     *    browsers) the error is only logged and the copy event content stays.
     *
     * The order matters: WebKit refuses `execCommand('copy')` after any async
     * clipboard call, even a rejected one, so a fallback that runs after the
     * API fails cannot work there. See "Copy fallback" in
     * docs/rfcs/0001-records-api.md.
     *
     * Rejects only when both paths failed. Callers must not `await` anything
     * before calling this from a click handler.
     */
    async write(payload: RecordPayload): Promise<WriteOutcome> {
        const json = JSON.stringify(toEnvelope(payload));
        const bytes = utf8ByteLength(json);
        const html = buildHtml(payload);
        const text = buildPlainText(payload);

        // Step 1: synchronous, still inside the gesture.
        const eventFailure = writeWithCopyEvent(html, text);

        // Step 2: the async API, only when it may work.
        let apiFailure = apiBlockedUpFront();
        if (!apiFailure) {
            try {
                return { ...(await this.writeWithClipboardApi(json, html, text)), bytes };
            } catch (error) {
                apiFailure = reasonOf(error);
                logger.log(
                    eventFailure
                        ? 'navigator.clipboard.write() failed:'
                        : 'navigator.clipboard.write() failed, keeping the copy event content:',
                    apiFailure
                );
            }
        }

        if (eventFailure) throw blockedError(apiFailure, eventFailure);
        return { formats: ['text/html', 'text/plain'], customFormat: false, bytes, method: 'copy-event' };
    }

    /** `navigator.clipboard.write()` with one retry without the custom format. Throws when the browser refuses. */
    private async writeWithClipboardApi(json: string, html: string, text: string): Promise<Omit<WriteOutcome, 'bytes'>> {
        const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
        const ItemClass = typeof ClipboardItem !== 'undefined' ? ClipboardItem : undefined;
        if (!clipboard || typeof clipboard.write !== 'function' || !ItemClass) {
            throw new Error('navigator.clipboard.write() is not available in this page');
        }

        const supportsCustom = typeof ItemClass.supports === 'function' ? ItemClass.supports(CUSTOM_MIME) : true;
        if (supportsCustom) {
            try {
                await clipboard.write([new ItemClass({
                    [CUSTOM_MIME]: makeBlob(json, CUSTOM_MIME),
                    'text/html': makeBlob(html, 'text/html'),
                    'text/plain': makeBlob(text, 'text/plain')
                })]);
                return { formats: [CUSTOM_MIME, 'text/html', 'text/plain'], customFormat: true, method: 'clipboard-api' };
            } catch (error) {
                logger.log('Custom clipboard format rejected, retrying without it:', reasonOf(error));
            }
        }

        await clipboard.write([new ItemClass({
            'text/html': makeBlob(html, 'text/html'),
            'text/plain': makeBlob(text, 'text/plain')
        })]);
        return { formats: ['text/html', 'text/plain'], customFormat: false, method: 'clipboard-api' };
    }

    async read(): Promise<RecordPayload | null> {
        const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
        if (!clipboard || typeof clipboard.read !== 'function') {
            throw new Error('Reading the clipboard is not available in this page');
        }
        const items = await clipboard.read();
        for (const item of items) {
            let custom: string | null = null;
            let html: string | null = null;
            if (item.types.includes(CUSTOM_MIME)) {
                custom = await (await item.getType(CUSTOM_MIME)).text();
            }
            if (item.types.includes('text/html')) {
                html = await (await item.getType('text/html')).text();
            }
            const payload = payloadFromFormats(custom, html);
            if (payload) return payload;
        }
        return null;
    }

    /**
     * Reads a record from a `paste` event. `getData()` on the custom type is
     * tried first, but no engine exposed it on a paste event in the spike, so
     * in practice this reads the HTML embedding.
     */
    fromPasteEvent(event: ClipboardEvent): RecordPayload | null {
        const data = event.clipboardData;
        if (!data) return null;
        let custom: string | null = null;
        try {
            custom = data.getData(CUSTOM_MIME) || null;
        } catch {
            custom = null;
        }
        let html: string | null = null;
        try {
            html = data.getData('text/html') || null;
        } catch {
            html = null;
        }
        return payloadFromFormats(custom, html);
    }
}
