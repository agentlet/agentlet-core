/**
 * Tests for the record envelope: validation (`records.validate()`), the
 * size limit, unknown versions and keys, malformed input, and the built-in
 * and custom record types.
 */
import { fromBase64Url, toBase64Url } from '../../../../src/utils/data-processing/records/text.js';
import { MAX_RECORD_BYTES, validatePayload } from '../../../../src/utils/data-processing/records/envelope.js';
import { installRealDom, makeManager, uninstallLayout } from './helpers.js';

beforeAll(installRealDom);
afterAll(uninstallLayout);

const valid = () => ({
    agentlet: 'record',
    version: 1,
    type: 'organization',
    fields: { organization: 'Example SAS', siren: '123456789', employees: 12, active: true, vat: null },
    labels: { siren: 'SIREN' },
    source: { url: 'https://a.example/x', origin: 'https://a.example', title: 'Example', copiedAt: '2026-10-01T09:30:00.000Z' }
});

describe('records.validate()', () => {
    const { manager } = makeManager();

    it('accepts a well-formed record and returns a fresh copy', () => {
        const input = valid();
        const result = manager.validate(input);
        expect(result.valid).toBe(true);
        if (!result.valid) return;
        expect(result.record).toEqual(input);
        expect(result.record).not.toBe(input);
        expect((result.record as { fields: object }).fields).not.toBe(input.fields);
    });

    it('accepts a table record', () => {
        const result = manager.validate({
            agentlet: 'record', version: 1, type: 'table', columns: ['a', 'b'], rows: [['1', 2], [null, true]]
        });
        expect(result.valid).toBe(true);
    });

    it('ignores unknown top-level keys and drops them from the result', () => {
        const result = manager.validate({ ...valid(), futureThing: { nested: true }, extra: 1 });
        expect(result.valid).toBe(true);
        if (!result.valid) return;
        expect(Object.keys(result.record).sort()).toEqual(['agentlet', 'fields', 'labels', 'source', 'type', 'version']);
    });

    it('accepts a minor version of the same major', () => {
        expect(manager.validate({ ...valid(), version: 1.4 }).valid).toBe(true);
    });

    it.each([2, 3, 0, 0.5, 10])('rejects the unknown major version %s', (version) => {
        const result = manager.validate({ ...valid(), version });
        expect(result.valid).toBe(false);
        if (result.valid) return;
        expect(result.errors.join(' ')).toMatch(/major version/);
    });

    it.each(['1', null, undefined, NaN])('rejects a version that is not a number: %p', (version) => {
        expect(manager.validate({ ...valid(), version }).valid).toBe(false);
    });

    it('rejects a wrong marker', () => {
        expect(manager.validate({ ...valid(), agentlet: 'other' }).valid).toBe(false);
    });

    it.each([null, undefined, 42, 'text', true, [], [valid()]])('rejects malformed input: %p', (value) => {
        const result = manager.validate(value);
        expect(result.valid).toBe(false);
        if (result.valid) return;
        expect(result.errors.length).toBeGreaterThan(0);
    });

    it.each(['', 'Contact', '1abc', 'has space', 'a'.repeat(80)])('rejects the type name %p', (type) => {
        expect(manager.validate({ ...valid(), type }).valid).toBe(false);
    });

    it('rejects fields that are not an object', () => {
        expect(manager.validate({ ...valid(), fields: [1, 2] }).valid).toBe(false);
        expect(manager.validate({ ...valid(), fields: 'x' }).valid).toBe(false);
        const { fields: _fields, ...withoutFields } = valid();
        expect(manager.validate(withoutFields).valid).toBe(false);
    });

    it('rejects nested values, functions and non-finite numbers in fields', () => {
        expect(manager.validate({ ...valid(), fields: { a: { b: 1 } } }).valid).toBe(false);
        expect(manager.validate({ ...valid(), fields: { a: [1] } }).valid).toBe(false);
        expect(manager.validate({ ...valid(), fields: { a: Infinity } }).valid).toBe(false);
    });

    it('rejects keys that could reach Object.prototype', () => {
        const parsed = JSON.parse('{"agentlet":"record","version":1,"type":"fields","fields":{"__proto__":"x"}}');
        expect(manager.validate(parsed).valid).toBe(false);
        expect(manager.validate({ ...valid(), fields: { constructor: 'x' } }).valid).toBe(false);
        expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    });

    it('rejects a table with bad columns or rows', () => {
        const base = { agentlet: 'record', version: 1, type: 'table' };
        expect(manager.validate({ ...base, columns: [1], rows: [] }).valid).toBe(false);
        expect(manager.validate({ ...base, columns: ['a'], rows: ['x'] }).valid).toBe(false);
        expect(manager.validate({ ...base, columns: ['a'], rows: [[{}]] }).valid).toBe(false);
        expect(manager.validate({ ...base, columns: ['a'] }).valid).toBe(false);
    });

    it('rejects columns on a record whose type is not "table"', () => {
        expect(manager.validate({ agentlet: 'record', version: 1, type: 'contact', columns: [], rows: [] }).valid).toBe(false);
    });

    it('drops labels that are not strings and keeps the rest', () => {
        const result = manager.validate({ ...valid(), labels: { siren: 'SIREN', bad: 5 } });
        expect(result.valid).toBe(true);
        if (!result.valid) return;
        expect(result.record.labels).toEqual({ siren: 'SIREN' });
    });

    it('rejects labels that are not an object', () => {
        expect(manager.validate({ ...valid(), labels: 'x' }).valid).toBe(false);
    });

    it('keeps only string members of source', () => {
        const result = manager.validate({ ...valid(), source: { url: 5, origin: 'https://a.example', evil: '<script>' } });
        expect(result.valid).toBe(true);
        if (!result.valid) return;
        expect(result.record.source).toEqual({ url: '', origin: 'https://a.example', title: '', copiedAt: '' });
    });

    it('does not mutate its input', () => {
        const input = valid();
        const snapshot = JSON.stringify(input);
        manager.validate(input);
        expect(JSON.stringify(input)).toBe(snapshot);
    });

    it('rejects a value that cannot be serialized', () => {
        const circular: Record<string, unknown> = { agentlet: 'record', version: 1, type: 'fields', fields: {} };
        circular.self = circular;
        const result = manager.validate(circular);
        expect(result.valid).toBe(false);
    });

    describe('size limit', () => {
        it('rejects a record above 1 MB', () => {
            const big = { ...valid(), fields: { note: 'x'.repeat(MAX_RECORD_BYTES + 1) } };
            const result = manager.validate(big);
            expect(result.valid).toBe(false);
            if (result.valid) return;
            expect(result.errors.join(' ')).toMatch(/1 MB limit/);
        });

        it('counts bytes, not characters', () => {
            // Each "é" takes two bytes in UTF-8, so this is 1.2 MB in bytes and 0.6 million characters.
            const big = { ...valid(), fields: { note: 'é'.repeat(600_000) } };
            expect(manager.validate(big).valid).toBe(false);
        });

        it('accepts a record just under the limit', () => {
            const near = { ...valid(), fields: { note: 'x'.repeat(MAX_RECORD_BYTES - 1000) } };
            expect(manager.validate(near).valid).toBe(true);
        });
    });

    it('rejects a list envelope, which belongs to read() and fromPasteEvent()', () => {
        const list = { agentlet: 'records', version: 1, type: 'organization', items: [valid()] };
        const result = manager.validate(list);
        expect(result.valid).toBe(false);
    });
});

describe('list envelopes', () => {
    it('validates every item and requires the list type', () => {
        const item = { agentlet: 'record', version: 1, type: 'contact', fields: { name: 'Ada' } };
        const ok = validatePayload({ agentlet: 'records', version: 1, type: 'contact', items: [item, item] });
        expect(ok.valid).toBe(true);
        const mixed = validatePayload({ agentlet: 'records', version: 1, type: 'contact', items: [{ ...item, type: 'address' }] });
        expect(mixed.valid).toBe(false);
        expect(validatePayload({ agentlet: 'records', version: 1, type: 'contact', items: [] }).valid).toBe(false);
        expect(validatePayload({ agentlet: 'records', version: 2, type: 'contact', items: [item] }).valid).toBe(false);
        expect(validatePayload({ agentlet: 'records', version: 1, type: 'contact', items: [{ ...item, fields: 'x' }] }).valid).toBe(false);
    });
});

describe('base64url helpers', () => {
    it('round-trips unicode text', () => {
        const text = JSON.stringify({ a: 'Café, Zoë, 日本語, emoji \u{1F600}' });
        expect(fromBase64Url(toBase64Url(text))).toBe(text);
    });

    it('uses the URL-safe alphabet without padding', () => {
        const encoded = toBase64Url('???>>>');
        expect(encoded).toMatch(/^[A-Za-z0-9_-]+$/);
    });

    it('returns null for text that is not base64url', () => {
        expect(fromBase64Url('not base64!')).toBeNull();
        expect(fromBase64Url('%%%')).toBeNull();
    });
});

describe('record types', () => {
    it('ships the built-in types', () => {
        const { manager } = makeManager();
        expect(manager.listTypes().map(type => type.name).sort()).toEqual(['address', 'contact', 'fields', 'organization', 'table']);
    });

    it('builds contact, address and organization on the autocomplete vocabulary', () => {
        const { manager } = makeManager();
        const contact = manager.getType('contact');
        expect(contact?.fields.map(field => field.key)).toEqual(expect.arrayContaining(['name', 'given-name', 'family-name', 'email', 'tel']));
        expect(manager.getType('address')?.fields.map(field => field.key)).toEqual(expect.arrayContaining(['street-address', 'postal-code', 'address-level2', 'country-name']));
        const organization = manager.getType('organization');
        expect(organization?.fields.map(field => field.key)).toContain('organization');
    });

    it('carries English and French synonyms', () => {
        const { manager } = makeManager();
        const email = manager.getType('contact')?.fields.find(field => field.key === 'email');
        expect(email?.synonyms).toEqual(expect.arrayContaining(['e-mail', 'courriel']));
        expect(email?.kind).toBe('email');
        const postal = manager.getType('address')?.fields.find(field => field.key === 'postal-code');
        expect(postal?.synonyms).toEqual(expect.arrayContaining(['zip code', 'code postal']));
    });

    it('returns null for an unknown type', () => {
        expect(makeManager().manager.getType('nope')).toBeNull();
    });

    it('defines a custom type and returns copies, not the stored object', () => {
        const { manager } = makeManager();
        manager.defineType({
            name: 'invoice',
            label: 'Invoice',
            fields: [
                { key: 'invoice-number', label: 'Invoice number', required: true },
                { key: 'total', kind: 'number' },
                { key: 'issue-date', kind: 'date', synonyms: ['date de facture'] }
            ]
        });
        const type = manager.getType('invoice');
        expect(type?.fields).toHaveLength(3);
        type?.fields.pop();
        expect(manager.getType('invoice')?.fields).toHaveLength(3);
        expect(manager.listTypes().map(entry => entry.name)).toContain('invoice');
    });

    it('lets a custom type be redefined but never a built-in one', () => {
        const { manager } = makeManager();
        manager.defineType({ name: 'ticket', fields: [{ key: 'id' }] });
        manager.defineType({ name: 'ticket', fields: [{ key: 'id' }, { key: 'status' }] });
        expect(manager.getType('ticket')?.fields).toHaveLength(2);
        expect(() => manager.defineType({ name: 'contact', fields: [] })).toThrow(/built in/);
    });

    it('rejects an invalid definition', () => {
        const { manager } = makeManager();
        expect(() => manager.defineType(null as never)).toThrow();
        expect(() => manager.defineType({ name: 'Bad Name', fields: [] })).toThrow(/name/);
        expect(() => manager.defineType({ name: 'ok', fields: 'x' as never })).toThrow(/fields/);
        expect(() => manager.defineType({ name: 'ok', fields: [{ key: 'A B' }] })).toThrow(/key/);
        expect(() => manager.defineType({ name: 'ok', fields: [{ key: 'a' }, { key: 'a' }] })).toThrow(/Duplicate/);
        expect(() => manager.defineType({ name: 'ok', fields: [{ key: 'a', kind: 'color' as never }] })).toThrow(/kind/);
        expect(() => manager.defineType({ name: 'ok', fields: [{ key: 'a', synonyms: [1] as never }] })).toThrow(/Synonyms/);
    });
});
