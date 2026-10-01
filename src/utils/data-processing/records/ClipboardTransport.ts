/**
 * The phase 1 transport: the system clipboard.
 *
 * Write: one `ClipboardItem` with the custom format, `text/html` (record
 * embedded) and `text/plain`. When the browser rejects the custom format
 * (Firefox does), retry with HTML and plain text only.
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

export class ClipboardTransport implements RecordTransport {
    readonly name = 'clipboard';

    async write(payload: RecordPayload): Promise<WriteOutcome> {
        const json = JSON.stringify(toEnvelope(payload));
        const bytes = utf8ByteLength(json);
        const html = buildHtml(payload);
        const text = buildPlainText(payload);

        const clipboard = typeof navigator !== 'undefined' ? navigator.clipboard : undefined;
        const ItemClass = typeof ClipboardItem !== 'undefined' ? ClipboardItem : undefined;

        if (!clipboard || (!ItemClass && typeof clipboard.writeText !== 'function')) {
            throw new Error('The clipboard is not available in this page');
        }
        if (!ItemClass || typeof clipboard.write !== 'function') {
            // No rich clipboard: plain text only, the record cannot travel.
            await clipboard.writeText(text);
            return { formats: ['text/plain'], customFormat: false, bytes };
        }

        const supportsCustom = typeof ItemClass.supports === 'function' ? ItemClass.supports(CUSTOM_MIME) : true;
        if (supportsCustom) {
            try {
                await clipboard.write([new ItemClass({
                    [CUSTOM_MIME]: makeBlob(json, CUSTOM_MIME),
                    'text/html': makeBlob(html, 'text/html'),
                    'text/plain': makeBlob(text, 'text/plain')
                })]);
                return { formats: [CUSTOM_MIME, 'text/html', 'text/plain'], customFormat: true, bytes };
            } catch (error) {
                logger.log('Custom clipboard format rejected, retrying without it:', (error as Error).message);
            }
        }

        await clipboard.write([new ItemClass({
            'text/html': makeBlob(html, 'text/html'),
            'text/plain': makeBlob(text, 'text/plain')
        })]);
        return { formats: ['text/html', 'text/plain'], customFormat: false, bytes };
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
