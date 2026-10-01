/**
 * The three clipboard representations of a record payload: the custom JSON
 * envelope, `text/html` with the envelope embedded, and `text/plain`.
 */
import type { AgentletRecord, RecordValue } from '../../../types/public-api';
import { isTableRecord, toEnvelope, type RecordPayload } from './envelope.js';
import { escapeHtml, fromBase64Url, humanize, toBase64Url } from './text.js';
import { KNOWN_KEYS } from './typeRegistry.js';

export const CUSTOM_MIME = 'web application/vnd.agentlet.record+json';
export const HTML_ATTRIBUTE = 'data-agentlet-record';

interface Grid {
    header: string[];
    rows: RecordValue[][];
}

function cellText(value: RecordValue): string {
    return value === null ? '' : String(value);
}

function labelOf(record: AgentletRecord, key: string): string {
    if (isTableRecord(record)) return key;
    return record.labels?.[key] ?? KNOWN_KEYS[key]?.label ?? humanize(key);
}

/** A list of fields records as a grid: one column per key seen, in first-seen order. */
function listGrid(items: AgentletRecord[]): Grid {
    const keys: string[] = [];
    const labels = new Map<string, string>();
    for (const item of items) {
        if (isTableRecord(item)) continue;
        for (const key of Object.keys(item.fields)) {
            if (!labels.has(key)) {
                keys.push(key);
                labels.set(key, labelOf(item, key));
            }
        }
    }
    return {
        header: keys.map(key => labels.get(key) as string),
        rows: items.map(item => keys.map(key => (isTableRecord(item) ? null : (item.fields[key] ?? null))))
    };
}

function gridOf(payload: RecordPayload): Grid | null {
    if (payload.kind === 'list') {
        if (payload.items.length > 0 && payload.items.every(isTableRecord)) {
            // A list of table records: stack their rows under the first header.
            const first = payload.items[0];
            return { header: isTableRecord(first) ? first.columns : [], rows: payload.items.flatMap(item => (isTableRecord(item) ? item.rows : [])) };
        }
        return listGrid(payload.items);
    }
    if (isTableRecord(payload.record)) {
        return { header: payload.record.columns, rows: payload.record.rows };
    }
    return null;
}

/** `text/html`: a `<table>` for tables and lists, a `<dl>` for one record, the envelope in `data-agentlet-record`. */
export function buildHtml(payload: RecordPayload): string {
    const embedded = toBase64Url(JSON.stringify(toEnvelope(payload)));
    const grid = gridOf(payload);
    if (grid) {
        const head = grid.header.map(text => `<th>${escapeHtml(text)}</th>`).join('');
        const body = grid.rows
            .map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cellText(cell))}</td>`).join('')}</tr>`)
            .join('');
        return `<table ${HTML_ATTRIBUTE}="${embedded}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
    }
    const record = (payload as { kind: 'record'; record: AgentletRecord }).record;
    const fields = isTableRecord(record) ? {} : record.fields;
    const items = Object.keys(fields)
        .map(key => `<dt>${escapeHtml(labelOf(record, key))}</dt><dd>${escapeHtml(cellText(fields[key]))}</dd>`)
        .join('');
    return `<dl ${HTML_ATTRIBUTE}="${embedded}">${items}</dl>`;
}

function tsvCell(value: string): string {
    return value.replace(/[\t\r\n]+/g, ' ');
}

/** `text/plain`: TSV for tables and lists, `Label: value` lines for one record. */
export function buildPlainText(payload: RecordPayload): string {
    const grid = gridOf(payload);
    if (grid) {
        const lines = [grid.header, ...grid.rows.map(row => row.map(cellText))];
        return lines.map(line => line.map(tsvCell).join('\t')).join('\n');
    }
    const record = (payload as { kind: 'record'; record: AgentletRecord }).record;
    if (isTableRecord(record)) return '';
    return Object.keys(record.fields)
        .map(key => `${tsvCell(labelOf(record, key))}: ${tsvCell(cellText(record.fields[key]))}`)
        .join('\n');
}

/** Reads the embedded envelope out of a `text/html` clipboard format. Never executes anything: the HTML is parsed into an inert document. */
export function extractEmbeddedEnvelope(html: string): unknown {
    if (!html || !html.includes(HTML_ATTRIBUTE)) return null;
    let encoded: string | null = null;
    try {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        encoded = doc.querySelector(`[${HTML_ATTRIBUTE}]`)?.getAttribute(HTML_ATTRIBUTE) ?? null;
    } catch {
        return null;
    }
    if (!encoded) return null;
    const json = fromBase64Url(encoded);
    return json === null ? null : parseJson(json);
}

/** Parses the custom format text. */
export function parseCustomFormat(text: string): unknown {
    return parseJson(text);
}

function parseJson(text: string): unknown {
    try {
        return JSON.parse(text);
    } catch {
        return null;
    }
}
