/**
 * The phase 1 transport: the system clipboard.
 *
 * Write: one `ClipboardItem` with the custom format, `text/html` (record
 * embedded) and `text/plain`. When the browser rejects the custom format
 * (Firefox does), retry with HTML and plain text only. When the async
 * clipboard API is missing or refuses the write (webviews, iframes without
 * the `clipboard-write` permission policy, locked-down browsers), fall back
 * to a `copy` event with HTML and plain text.
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
        + `navigator.clipboard.write() failed (${apiFailure}) and the copy event fallback failed (${eventFailure}). `
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

/**
 * The classic copy path: a one-shot capture-phase `copy` listener sets the
 * formats on `event.clipboardData`, then `document.execCommand('copy')` fires
 * the event. It needs no clipboard permission, only a user gesture. It is
 * synchronous, so a caller that has not awaited yet still holds the gesture.
 * The listener is always removed. Returns `null` on success, else the reason.
 */
function writeWithCopyEvent(html: string, text: string): string | null {
    if (typeof document === 'undefined' || typeof document.execCommand !== 'function') {
        return 'document.execCommand is not available';
    }
    let handled = false;
    const onCopy = (event: ClipboardEvent) => {
        const data = event.clipboardData;
        if (!data) return;
        data.setData('text/html', html);
        data.setData('text/plain', text);
        // Without this the browser overwrites the data with the selection.
        event.preventDefault();
        handled = true;
    };
    document.addEventListener('copy', onCopy, true);
    try {
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
        document.removeEventListener('copy', onCopy, true);
    }
}

export class ClipboardTransport implements RecordTransport {
    readonly name = 'clipboard';

    /**
     * Writes `navigator.clipboard.write()` first (custom format, then HTML and
     * plain text only). When the API is missing or rejects the write, for
     * example "Write permission denied" in a webview, an iframe without the
     * `clipboard-write` permissions policy or a locked-down browser, it falls
     * back to a `copy` event, which writes HTML and plain text.
     *
     * `execCommand('copy')` needs a live user activation, and the fallback
     * after a rejection runs after an `await`. Measured on 2026-10-01 (see
     * "Copy fallback" in docs/rfcs/0001-records-api.md): Chromium and Firefox
     * keep the activation for about five seconds, so the fallback after a
     * rejection works there. WebKit loses the gesture after any async
     * clipboard call, so the fallback after a rejection does not work there.
     * When the API is known to be unusable up front (missing, or blocked by
     * the permissions policy), the copy event therefore runs first, before any
     * `await`, which holds on every engine.
     */
    async write(payload: RecordPayload): Promise<WriteOutcome> {
        const json = JSON.stringify(toEnvelope(payload));
        const bytes = utf8ByteLength(json);
        const html = buildHtml(payload);
        const text = buildPlainText(payload);
        const copyEvent: WriteOutcome = { formats: ['text/html', 'text/plain'], customFormat: false, bytes, method: 'copy-event' };

        let apiFailure = apiBlockedUpFront();
        if (apiFailure) {
            const eventFailure = writeWithCopyEvent(html, text);
            if (!eventFailure) return copyEvent;
            throw blockedError(apiFailure, eventFailure);
        }

        try {
            return { ...(await this.writeWithClipboardApi(json, html, text)), bytes };
        } catch (error) {
            apiFailure = reasonOf(error);
            logger.log('navigator.clipboard.write() failed, falling back to a copy event:', apiFailure);
        }

        const eventFailure = writeWithCopyEvent(html, text);
        if (eventFailure) throw blockedError(apiFailure, eventFailure);
        return copyEvent;
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
