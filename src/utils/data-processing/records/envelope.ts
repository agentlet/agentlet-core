/**
 * The record envelope: construction, validation and the size limit.
 *
 * Everything that comes from a clipboard is untrusted. `validatePayload()`
 * is the only way a foreign value becomes an `AgentletRecord`: it copies
 * known keys into fresh objects, ignores unknown top-level keys, rejects an
 * unknown major version, and never keeps a key that could reach
 * `Object.prototype`.
 */
import type { AgentletRecord, FieldsRecord, RecordSource, RecordValue, TableRecord } from '../../../types/public-api';
import { isValidTypeName } from './typeRegistry.js';
import { utf8ByteLength } from './text.js';

export const RECORD_VERSION = 1;
/** 1 MB of serialized JSON. */
export const MAX_RECORD_BYTES = 1024 * 1024;

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const MAX_KEY_LENGTH = 128;

/** What goes on the clipboard: one record, or a list of records of the same type. */
export type RecordPayload =
    | { kind: 'record'; record: AgentletRecord }
    | { kind: 'list'; type: string; items: AgentletRecord[] };

export type PayloadValidation =
    | { valid: true; payload: RecordPayload }
    | { valid: false; errors: string[] };

export function isTableRecord(record: AgentletRecord): record is TableRecord {
    return 'columns' in record;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRecordValue(value: unknown): value is RecordValue {
    return value === null
        || typeof value === 'string'
        || typeof value === 'boolean'
        || (typeof value === 'number' && Number.isFinite(value));
}

function isSafeKey(key: string): boolean {
    return key !== '' && key.length <= MAX_KEY_LENGTH && !FORBIDDEN_KEYS.has(key);
}

/** Builds the `source` block from the current page. */
export function buildSource(): RecordSource {
    const location = window.location;
    return {
        url: location.href,
        origin: location.origin,
        title: document.title || '',
        copiedAt: new Date().toISOString()
    };
}

function readSource(value: unknown): RecordSource | undefined {
    if (!isPlainObject(value)) return undefined;
    const text = (entry: unknown): string => (typeof entry === 'string' ? entry : '');
    return {
        url: text(value.url),
        origin: text(value.origin),
        title: text(value.title),
        copiedAt: text(value.copiedAt)
    };
}

function readLabels(value: unknown, errors: string[]): Record<string, string> | undefined {
    if (value === undefined) return undefined;
    if (!isPlainObject(value)) {
        errors.push('labels must be an object');
        return undefined;
    }
    const labels: Record<string, string> = {};
    for (const key of Object.keys(value)) {
        if (!isSafeKey(key)) continue;
        const label = value[key];
        if (typeof label === 'string') labels[key] = label;
    }
    return labels;
}

function checkEnvelopeHeader(value: Record<string, unknown>, expected: 'record' | 'records', errors: string[]): void {
    if (value.agentlet !== expected) {
        errors.push(`agentlet must be "${expected}"`);
    }
    if (typeof value.version !== 'number' || !Number.isFinite(value.version)) {
        errors.push('version must be a number');
    } else if (Math.floor(value.version) !== RECORD_VERSION) {
        errors.push(`Unsupported major version ${Math.floor(value.version)}, this reader supports ${RECORD_VERSION}`);
    }
}

/** Validates one record envelope without the size check (the caller checks the whole payload once). */
function validateRecord(value: unknown, where: string): { record: AgentletRecord } | { errors: string[] } {
    const errors: string[] = [];
    if (!isPlainObject(value)) {
        return { errors: [`${where}must be an object`] };
    }
    checkEnvelopeHeader(value, 'record', errors);

    const type = value.type;
    if (typeof type !== 'string' || !isValidTypeName(type)) {
        errors.push('type must be a lowercase name such as "contact"');
    }

    const labels = readLabels(value.labels, errors);
    const source = readSource(value.source);
    const hasColumns = 'columns' in value || 'rows' in value;

    if (type === 'table' || hasColumns) {
        if (type !== 'table') errors.push('a record with columns and rows must have the type "table"');
        const columns = value.columns;
        const rows = value.rows;
        if (!Array.isArray(columns) || columns.some(column => typeof column !== 'string')) {
            errors.push('columns must be an array of strings');
        }
        if (!Array.isArray(rows) || rows.some(row => !Array.isArray(row) || row.some(cell => !isRecordValue(cell)))) {
            errors.push('rows must be an array of arrays of string, number, boolean or null');
        }
        if (errors.length > 0) return { errors: errors.map(error => where + error) };
        const record: TableRecord = {
            agentlet: 'record',
            version: RECORD_VERSION,
            type: 'table',
            columns: (columns as string[]).slice(),
            rows: (rows as RecordValue[][]).map(row => row.slice())
        };
        if (labels) record.labels = labels;
        if (source) record.source = source;
        return { record };
    }

    const fields = value.fields;
    const clean: Record<string, RecordValue> = {};
    if (!isPlainObject(fields)) {
        errors.push('fields must be an object');
    } else {
        for (const key of Object.keys(fields)) {
            if (!isSafeKey(key)) {
                errors.push(`field key not allowed: ${key.slice(0, 40)}`);
                continue;
            }
            const entry = fields[key];
            if (!isRecordValue(entry)) {
                errors.push(`field ${key} must be a string, number, boolean or null`);
                continue;
            }
            clean[key] = entry;
        }
    }
    if (errors.length > 0) return { errors: errors.map(error => where + error) };
    const record: FieldsRecord = {
        agentlet: 'record',
        version: RECORD_VERSION,
        type: type as string,
        fields: clean
    };
    if (labels) record.labels = labels;
    if (source) record.source = source;
    return { record };
}

/**
 * Validates a record envelope or a list envelope (`{agentlet: 'records', ...}`).
 * The result holds fresh objects: nothing from `value` is kept by reference.
 */
export function validatePayload(value: unknown): PayloadValidation {
    let serialized: string;
    try {
        serialized = JSON.stringify(value) ?? '';
    } catch {
        return { valid: false, errors: ['value cannot be serialized as JSON'] };
    }
    const bytes = utf8ByteLength(serialized);
    if (bytes > MAX_RECORD_BYTES) {
        return { valid: false, errors: [`record is ${bytes} bytes, above the 1 MB limit`] };
    }
    if (!isPlainObject(value)) {
        return { valid: false, errors: ['record must be an object'] };
    }

    if (value.agentlet === 'records') {
        const errors: string[] = [];
        checkEnvelopeHeader(value, 'records', errors);
        if (typeof value.type !== 'string' || !isValidTypeName(value.type)) {
            errors.push('type must be a lowercase name such as "contact"');
        }
        const items = value.items;
        if (!Array.isArray(items) || items.length === 0) {
            errors.push('items must be a non-empty array');
        }
        if (errors.length > 0) return { valid: false, errors };
        const records: AgentletRecord[] = [];
        for (let index = 0; index < (items as unknown[]).length; index++) {
            const result = validateRecord((items as unknown[])[index], `items[${index}]: `);
            if ('errors' in result) errors.push(...result.errors);
            else if (result.record.type !== value.type) errors.push(`items[${index}]: type differs from the list type`);
            else records.push(result.record);
        }
        if (errors.length > 0) return { valid: false, errors };
        return { valid: true, payload: { kind: 'list', type: value.type as string, items: records } };
    }

    const result = validateRecord(value, '');
    if ('errors' in result) return { valid: false, errors: result.errors };
    return { valid: true, payload: { kind: 'record', record: result.record } };
}

/** The wire form of a payload: a record envelope, or a list envelope for several records. */
export function toEnvelope(payload: RecordPayload): unknown {
    if (payload.kind === 'record') return payload.record;
    return { agentlet: 'records', version: RECORD_VERSION, type: payload.type, items: payload.items };
}

export function payloadRecords(payload: RecordPayload): AgentletRecord[] {
    return payload.kind === 'record' ? [payload.record] : payload.items;
}

/** Number of fields in a record (columns for a table). */
export function fieldCount(record: AgentletRecord): number {
    return isTableRecord(record) ? record.columns.length : Object.keys(record.fields).length;
}
