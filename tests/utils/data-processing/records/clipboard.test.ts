/**
 * Tests for the clipboard transport through `records.copy()`, `read()` and
 * `fromPasteEvent()`, with a mocked clipboard: the formats written, the
 * fallback when the custom format is rejected, the size limit and the
 * sensitive-data rule on copy.
 */
import type { AgentletRecord } from '../../../../src/types/public-api';
import { MAX_RECORD_BYTES } from '../../../../src/utils/data-processing/records/envelope.js';
import { toBase64Url } from '../../../../src/utils/data-processing/records/text.js';
import {
    FakeClipboardItem, fieldsRecord, installClipboard, installRealDom, makeManager, pasteEvent, removeClipboard,
    uninstallLayout, writtenFormats, type FakeClipboard
} from './helpers.js';

const CUSTOM = 'web application/vnd.agentlet.record+json';

beforeAll(installRealDom);
afterAll(uninstallLayout);

let clipboard: FakeClipboard;
beforeEach(() => { clipboard = installClipboard(); });
afterEach(() => { removeClipboard(); });

function organization(): AgentletRecord {
    const { manager } = makeManager();
    return manager.create('organization', { organization: 'Example SAS', siren: '123456789', 'postal-code': '75001' }, { labels: { siren: 'SIREN' } });
}

function embedded(html: string): unknown {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const attribute = doc.querySelector('[data-agentlet-record]')?.getAttribute('data-agentlet-record') as string;
    const base64 = attribute.replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(decodeURIComponent(Array.from(atob(base64), c => `%${c.charCodeAt(0).toString(16).padStart(2, '0')}`).join('')));
}

describe('records.copy()', () => {
    it('writes the custom format, HTML with the record embedded, and plain text in one item', async () => {
        const { manager } = makeManager();
        const result = await manager.copy(organization());

        expect(clipboard.write).toHaveBeenCalledTimes(1);
        expect(clipboard.write.mock.calls[0][0]).toHaveLength(1);
        expect(result.formats).toEqual([CUSTOM, 'text/html', 'text/plain']);
        expect(result.customFormat).toBe(true);
        expect(result.records).toBe(1);
        expect(result.bytes).toBeGreaterThan(50);

        const formats = await writtenFormats(clipboard);
        expect(Object.keys(formats)).toEqual([CUSTOM, 'text/html', 'text/plain']);
        const envelope = JSON.parse(formats[CUSTOM]);
        expect(envelope).toMatchObject({ agentlet: 'record', version: 1, type: 'organization', fields: { organization: 'Example SAS' } });
        expect(formats['text/plain']).toBe('Organization: Example SAS\nSIREN: 123456789\nPostal code: 75001');
    });

    it('writes a dl whose root carries the base64url envelope', async () => {
        const { manager } = makeManager();
        await manager.copy(organization());
        const { 'text/html': html } = await writtenFormats(clipboard);
        expect(html.startsWith('<dl data-agentlet-record="')).toBe(true);
        expect(html).toContain('<dt>Organization</dt><dd>Example SAS</dd>');
        expect(html).toContain('<dt>SIREN</dt><dd>123456789</dd>');
        expect(embedded(html)).toMatchObject({ agentlet: 'record', type: 'organization', fields: { siren: '123456789' } });
    });

    it('sets the source and refreshes copiedAt, whatever the caller passed', async () => {
        const { manager } = makeManager();
        const record = fieldsRecord('fields', { a: '1' }, { source: { url: 'https://evil.example', origin: 'https://evil.example', title: 'x', copiedAt: '2000-01-01T00:00:00.000Z' } });
        await manager.copy(record);
        const { [CUSTOM]: custom } = await writtenFormats(clipboard);
        const written = JSON.parse(custom);
        expect(written.source.origin).toBe(window.location.origin);
        expect(written.source.copiedAt).not.toBe('2000-01-01T00:00:00.000Z');
    });

    it('writes a table record as a table and as TSV', async () => {
        const { manager } = makeManager();
        const table = { agentlet: 'record', version: 1, type: 'table', columns: ['Name', 'Qty'], rows: [['Bolt', 10], ['Nut\twith tab', null]] } as AgentletRecord;
        await manager.copy(table);
        const formats = await writtenFormats(clipboard);
        expect(formats['text/html']).toContain('<thead><tr><th>Name</th><th>Qty</th></tr></thead>');
        expect(formats['text/html']).toContain('<td>Bolt</td><td>10</td>');
        expect(formats['text/plain']).toBe('Name\tQty\nBolt\t10\nNut with tab\t');
        expect(embedded(formats['text/html'])).toMatchObject({ type: 'table', columns: ['Name', 'Qty'] });
    });

    it('writes a list of records of one type as one item, a table and a list envelope', async () => {
        const { manager } = makeManager();
        const one = fieldsRecord('contact', { name: 'Ada', email: 'ada@example.com' });
        const two = fieldsRecord('contact', { name: 'Grace', tel: '+33 1 02 03 04 05' });
        const result = await manager.copy([one, two]);
        expect(result.records).toBe(2);
        expect(clipboard.write.mock.calls[0][0]).toHaveLength(1);
        const formats = await writtenFormats(clipboard);
        expect(JSON.parse(formats[CUSTOM])).toMatchObject({ agentlet: 'records', version: 1, type: 'contact' });
        expect(JSON.parse(formats[CUSTOM]).items).toHaveLength(2);
        expect(formats['text/plain']).toBe('Name\tEmail\tPhone\nAda\tada@example.com\t\nGrace\t\t+33 1 02 03 04 05');
        expect(formats['text/html']).toMatch(/^<table data-agentlet-record="/);
        expect(embedded(formats['text/html'])).toMatchObject({ agentlet: 'records' });
    });

    it('writes a single-element array as a single record', async () => {
        const { manager } = makeManager();
        await manager.copy([fieldsRecord('contact', { name: 'Ada' })]);
        const formats = await writtenFormats(clipboard);
        expect(JSON.parse(formats[CUSTOM]).agentlet).toBe('record');
    });

    it('escapes HTML in values and labels', async () => {
        const { manager } = makeManager();
        await manager.copy(fieldsRecord('fields', { note: '<img src=x onerror=alert(1)> & "q"' }, { labels: { note: '<b>Note</b>' } }));
        const { 'text/html': html } = await writtenFormats(clipboard);
        const doc = new DOMParser().parseFromString(html, 'text/html');
        expect(doc.querySelector('img')).toBeNull();
        expect(doc.querySelector('b')).toBeNull();
        expect(doc.querySelector('dd')?.textContent).toBe('<img src=x onerror=alert(1)> & "q"');
    });

    describe('when the custom format is rejected', () => {
        it('retries with HTML and plain text only', async () => {
            clipboard.write
                .mockRejectedValueOnce(new DOMException("Type 'web application/vnd.agentlet.record+json' not supported for write", 'NotAllowedError'))
                .mockResolvedValueOnce(undefined);
            const { manager } = makeManager();
            const result = await manager.copy(organization());

            expect(clipboard.write).toHaveBeenCalledTimes(2);
            expect(result.formats).toEqual(['text/html', 'text/plain']);
            expect(result.customFormat).toBe(false);
            const retry = await writtenFormats(clipboard, 1);
            expect(Object.keys(retry)).toEqual(['text/html', 'text/plain']);
            // The record still travels, embedded in the HTML.
            expect(embedded(retry['text/html'])).toMatchObject({ type: 'organization' });
        });

        it('does not try the custom format when ClipboardItem.supports() says no', async () => {
            FakeClipboardItem.supportsResult = false;
            const { manager } = makeManager();
            const result = await manager.copy(organization());
            expect(clipboard.write).toHaveBeenCalledTimes(1);
            expect(result.customFormat).toBe(false);
            expect(Object.keys(await writtenFormats(clipboard))).toEqual(['text/html', 'text/plain']);
        });

        it('rejects when the write without the custom format fails too', async () => {
            clipboard.write.mockRejectedValue(new Error('denied'));
            const { manager, emit } = makeManager();
            await expect(manager.copy(organization())).rejects.toThrow('denied');
            expect(emit).not.toHaveBeenCalled();
        });
    });

    it('falls back to plain text when there is no ClipboardItem', async () => {
        installClipboard({ withItem: false });
        const { manager } = makeManager();
        const result = await manager.copy(organization());
        expect(result.formats).toEqual(['text/plain']);
        expect(result.customFormat).toBe(false);
    });

    it('rejects when the clipboard is not available', async () => {
        removeClipboard();
        const { manager } = makeManager();
        await expect(manager.copy(organization())).rejects.toThrow(/not available/);
    });

    describe('size limit', () => {
        it('rejects a record above 1 MB before touching the clipboard', async () => {
            const { manager } = makeManager();
            const big = fieldsRecord('fields', { note: 'x'.repeat(MAX_RECORD_BYTES + 10) });
            await expect(manager.copy(big)).rejects.toThrow(/1 MB/);
            expect(clipboard.write).not.toHaveBeenCalled();
        });

        it('rejects a table record above 1 MB', async () => {
            const { manager } = makeManager();
            const rows = Array.from({ length: 12000 }, () => ['x'.repeat(100)]);
            await expect(manager.copy({ agentlet: 'record', version: 1, type: 'table', columns: ['a'], rows })).rejects.toThrow(/1 MB/);
        });
    });

    it('rejects invalid records, an empty list and a list of mixed types', async () => {
        const { manager } = makeManager();
        await expect(manager.copy({ nope: true } as unknown as AgentletRecord)).rejects.toThrow(/Invalid record/);
        await expect(manager.copy([])).rejects.toThrow(/at least one/);
        await expect(manager.copy([fieldsRecord('contact', { a: '1' }), fieldsRecord('address', { a: '1' })])).rejects.toThrow(/one type/);
    });

    describe('sensitive data', () => {
        it('never writes password, one-time-code or cc-* keys, even when the caller passes them', async () => {
            const { manager } = makeManager();
            await manager.copy(fieldsRecord('fields', {
                name: 'Ada', 'password': 'p1', 'current-password': 'p2', 'new-password': 'p3', 'one-time-code': '123456', 'cc-number': '4111', 'cc-csc': '123'
            }, { labels: { password: 'Password', 'cc-number': 'Card' } }));
            const formats = await writtenFormats(clipboard);
            for (const text of Object.values(formats)) {
                expect(text).not.toMatch(/p1|p2|p3|123456|4111|Password|Card/);
            }
            expect(JSON.parse(formats[CUSTOM]).fields).toEqual({ name: 'Ada' });
        });

        it('drops the keys listed in redact', async () => {
            const { manager } = makeManager();
            await manager.copy(fieldsRecord('contact', { name: 'Ada', tel: '+33 1 02 03 04 05' }), { redact: ['tel'] });
            const formats = await writtenFormats(clipboard);
            expect(formats['text/plain']).toBe('Name: Ada');
            expect(JSON.parse(formats[CUSTOM]).fields).toEqual({ name: 'Ada' });
        });

        it('drops sensitive and redacted table columns', async () => {
            const { manager } = makeManager();
            await manager.copy({ agentlet: 'record', version: 1, type: 'table', columns: ['Name', 'Password', 'Notes'], rows: [['Ada', 'secret', 'n']] }, { redact: ['Notes'] });
            const formats = await writtenFormats(clipboard);
            expect(formats['text/plain']).toBe('Name\nAda');
        });
    });

    it('emits records:copied with the type, counts and origin, and no values', async () => {
        const { manager, emit } = makeManager();
        await manager.copy(organization());
        expect(emit).toHaveBeenCalledWith('records:copied', {
            type: 'organization', fieldCount: 3, itemCount: 1, sourceOrigin: window.location.origin
        });
        expect(JSON.stringify(emit.mock.calls)).not.toMatch(/Example SAS|123456789/);
    });
});

describe('records.read()', () => {
    const envelope = { agentlet: 'record', version: 1, type: 'contact', fields: { name: 'Ada' } };
    const htmlWith = (value: unknown) => `<dl data-agentlet-record="${toBase64Url(JSON.stringify(value))}"><dt>Name</dt><dd>Ada</dd></dl>`;
    const blob = (text: string) => ({ text: () => Promise.resolve(text) });

    it('reads the custom format first', async () => {
        clipboard.read.mockResolvedValue([new FakeClipboardItem({
            [CUSTOM]: blob(JSON.stringify(envelope)),
            'text/html': blob(htmlWith({ ...envelope, fields: { name: 'From html' } }))
        })]);
        const { manager, emit } = makeManager();
        const records = await manager.read();
        expect(records).toHaveLength(1);
        expect(records?.[0]).toMatchObject({ type: 'contact', fields: { name: 'Ada' } });
        expect(emit).toHaveBeenCalledWith('records:pasted', { type: 'contact', fieldCount: 1, itemCount: 1, sourceOrigin: null });
    });

    it('falls back to the HTML embedding when there is no custom format', async () => {
        clipboard.read.mockResolvedValue([new FakeClipboardItem({ 'text/html': blob(htmlWith(envelope)), 'text/plain': blob('Name: Ada') })]);
        const records = await makeManager().manager.read();
        expect(records?.[0]).toMatchObject({ type: 'contact', fields: { name: 'Ada' } });
    });

    it('falls back to the HTML embedding when the custom format is invalid', async () => {
        clipboard.read.mockResolvedValue([new FakeClipboardItem({ [CUSTOM]: blob('{not json'), 'text/html': blob(htmlWith(envelope)) })]);
        const records = await makeManager().manager.read();
        expect(records?.[0].type).toBe('contact');
    });

    it('returns a list envelope as several records', async () => {
        const list = { agentlet: 'records', version: 1, type: 'contact', items: [envelope, { ...envelope, fields: { name: 'Grace' } }] };
        clipboard.read.mockResolvedValue([new FakeClipboardItem({ [CUSTOM]: blob(JSON.stringify(list)) })]);
        const records = await makeManager().manager.read();
        expect(records).toHaveLength(2);
    });

    it('returns null for plain text, an empty clipboard, an unknown version or an oversized record', async () => {
        const { manager } = makeManager();
        clipboard.read.mockResolvedValue([new FakeClipboardItem({ 'text/plain': blob('Name: Ada') })]);
        expect(await manager.read()).toBeNull();
        clipboard.read.mockResolvedValue([]);
        expect(await manager.read()).toBeNull();
        clipboard.read.mockResolvedValue([new FakeClipboardItem({ [CUSTOM]: blob(JSON.stringify({ ...envelope, version: 2 })) })]);
        expect(await manager.read()).toBeNull();
        clipboard.read.mockResolvedValue([new FakeClipboardItem({ [CUSTOM]: blob(JSON.stringify({ ...envelope, fields: { a: 'x'.repeat(MAX_RECORD_BYTES) } })) })]);
        expect(await manager.read()).toBeNull();
    });

    it('rejects when the browser refuses to read, and when reading is unsupported', async () => {
        const { manager } = makeManager();
        clipboard.read.mockRejectedValue(new DOMException('denied', 'NotAllowedError'));
        await expect(manager.read()).rejects.toThrow('denied');
        removeClipboard();
        await expect(manager.read()).rejects.toThrow(/not available/);
    });
});

describe('records.fromPasteEvent()', () => {
    const envelope = { agentlet: 'record', version: 1, type: 'contact', fields: { name: 'Ada' } };
    const htmlWith = (value: unknown) => `<html><body><dl data-agentlet-record="${toBase64Url(JSON.stringify(value))}"><dt>Name</dt><dd>Ada</dd></dl></body></html>`;
    const { manager } = makeManager();
    const parse = (data: Record<string, string>, throwOn: string[] = []) => manager.fromPasteEvent(pasteEvent(data, throwOn) as ClipboardEvent);

    it('reads the custom format when the browser exposes it', () => {
        expect(parse({ [CUSTOM]: JSON.stringify(envelope), 'text/plain': 'x' })?.[0]).toMatchObject({ type: 'contact' });
    });

    it('reads the HTML embedding, which is what every engine exposes on a paste event', () => {
        expect(parse({ 'text/html': htmlWith(envelope), 'text/plain': 'Name: Ada' })?.[0]).toMatchObject({ type: 'contact', fields: { name: 'Ada' } });
    });

    it('reads a list envelope from the HTML', () => {
        const list = { agentlet: 'records', version: 1, type: 'contact', items: [envelope, envelope] };
        expect(parse({ 'text/html': htmlWith(list) })).toHaveLength(2);
    });

    it('returns null for plain text, ordinary HTML, no clipboard data, and unusable embeddings', () => {
        expect(parse({ 'text/plain': 'Name: Ada' })).toBeNull();
        expect(parse({ 'text/html': '<p>Hello</p>' })).toBeNull();
        expect(manager.fromPasteEvent(new Event('paste') as ClipboardEvent)).toBeNull();
        expect(parse({ 'text/html': '<dl data-agentlet-record="!!!"></dl>' })).toBeNull();
        expect(parse({ 'text/html': `<dl data-agentlet-record="${toBase64Url('not json')}"></dl>` })).toBeNull();
        expect(parse({ 'text/html': htmlWith({ ...envelope, version: 9 }) })).toBeNull();
        expect(parse({ 'text/html': '<dl data-agentlet-record=""></dl>' })).toBeNull();
    });

    it('survives getData() throwing on a format', () => {
        expect(parse({ [CUSTOM]: '{}', 'text/html': htmlWith(envelope) }, [CUSTOM])?.[0].type).toBe('contact');
        expect(parse({ 'text/html': htmlWith(envelope) }, ['text/html'])).toBeNull();
    });

    it('never runs script found in the pasted HTML', () => {
        (window as unknown as { pwned?: boolean }).pwned = false;
        const html = `<script>window.pwned = true</script><img src=x onerror="window.pwned = true"><dl data-agentlet-record="${toBase64Url(JSON.stringify(envelope))}"></dl>`;
        expect(parse({ 'text/html': html })).toHaveLength(1);
        expect((window as unknown as { pwned?: boolean }).pwned).toBe(false);
    });

    it('does not emit an event: parsing a paste event is pure', () => {
        const { manager: other, emit } = makeManager();
        other.fromPasteEvent(pasteEvent({ 'text/html': htmlWith(envelope) }) as ClipboardEvent);
        expect(emit).not.toHaveBeenCalled();
    });
});
