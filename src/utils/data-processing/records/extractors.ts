/**
 * The `from*` extractors: turn a form, a table, a `dl` or a group of label
 * and value pairs on the current page into a record.
 *
 * They only read the page. What they read is data: nothing here keeps a
 * selector or evaluates anything it finds.
 */
import type {
    AgentletRecord,
    FieldsRecord,
    FormExtractorAPI,
    RecordFromElementOptions,
    RecordFromFormOptions,
    RecordFromTableOptions,
    RecordValue,
    TableExtractorAPI,
    TableRecord
} from '../../../types/public-api';
import { buildSource, RECORD_VERSION } from './envelope.js';
import { cleanLabel, cleanText, countMatches, labelTexts, NON_DATA_TYPES, resolveElement } from './domFields.js';
import { isSensitiveElement, isSensitiveKey } from './sensitive.js';
import { compactText, slugify } from './text.js';
import { isValidTypeName, KNOWN_KEYS, knownKeyForLabel } from './typeRegistry.js';

export interface ExtractorDeps {
    formExtractor: Pick<FormExtractorAPI, 'quickExport'>;
    tableExtractor: Pick<TableExtractorAPI, 'extractTableData'>;
}

const SKIPPED_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEMPLATE', 'SELECT', 'INPUT', 'TEXTAREA', 'OPTION']);

const BLOCK_SELECTOR = 'address, article, aside, blockquote, dd, details, div, dl, dt, fieldset, figure, footer, form, h1, h2, h3, h4, h5, h6, header, hr, li, main, nav, ol, p, pre, section, table, ul';

const CONTROL_SELECTOR = 'input:not([type="hidden"]):not([type="submit"]):not([type="button"]):not([type="reset"]):not([type="image"]), select, textarea';

/** A copy of `base` with a fresh `source` block. */
function newFieldsRecord(type: string, fields: Record<string, RecordValue>, labels: Record<string, string>): FieldsRecord {
    if (!isValidTypeName(type)) {
        throw new Error(`Invalid record type: ${type}`);
    }
    if (type === 'table') {
        throw new Error('The "table" type holds columns and rows: use fromTable()');
    }
    const record: FieldsRecord = { agentlet: 'record', version: RECORD_VERSION, type, fields };
    if (Object.keys(labels).length > 0) record.labels = labels;
    record.source = buildSource();
    return record;
}

/** Drops sensitive keys, the caller's `redact` keys, and unsafe keys. */
export function filterFields(fields: Record<string, RecordValue>, labels: Record<string, string>, redact: string[] = []): void {
    for (const key of Object.keys(fields)) {
        if (isSensitiveKey(key) || redact.includes(key)) {
            delete fields[key];
            delete labels[key];
        }
    }
}

/** Builds a fields record from an object the caller wrote. Throws for an unusable key or value. */
export function createFieldsRecord(
    type: string,
    fields: Record<string, RecordValue>,
    labels: Record<string, string> = {}
): FieldsRecord {
    if (typeof fields !== 'object' || fields === null || Array.isArray(fields)) {
        throw new Error('create() needs a fields object');
    }
    const copy: Record<string, RecordValue> = {};
    for (const key of Object.keys(fields)) {
        if (key === '__proto__' || key === 'constructor' || key === 'prototype' || key === '') {
            throw new Error(`Field key not allowed: ${key}`);
        }
        const value = fields[key];
        const valid = value === null || typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value));
        if (!valid) {
            throw new Error(`Field ${key} must be a string, number, boolean or null`);
        }
        copy[key] = value;
    }
    const cleanLabels: Record<string, string> = {};
    for (const key of Object.keys(labels)) {
        if (typeof labels[key] === 'string' && key in copy) cleanLabels[key] = labels[key];
    }
    filterFields(copy, cleanLabels);
    return newFieldsRecord(type, copy, cleanLabels);
}

/** Picks the record key for a form control: `autocomplete`, then `name`/`id`, then the label. */
function keyForControl(element: Element | null, name: string | null, labels: string[]): string {
    if (element) {
        const tokens = (element.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/);
        const token = tokens.find(entry => entry in KNOWN_KEYS);
        if (token) return token;
    }
    const identifiers = [name, element?.getAttribute('id') ?? null].filter((entry): entry is string => !!entry);
    for (const identifier of identifiers) {
        const compact = compactText(identifier);
        const known = Object.keys(KNOWN_KEYS).find(key => compactText(key) === compact);
        if (known) return known;
        const fromSynonym = knownKeyForLabel(identifier);
        if (fromSynonym) return fromSynonym;
    }
    for (const label of labels) {
        const known = knownKeyForLabel(label);
        if (known) return known;
    }
    const base = identifiers[0] ?? labels[0];
    return base ? slugify(base) : '';
}

function uniqueKey(key: string, taken: Set<string>): string {
    if (!taken.has(key)) return key;
    let index = 2;
    while (taken.has(`${key}-${index}`)) index++;
    return `${key}-${index}`;
}

/** Reads a form (or any element holding form controls) into a fields record. */
export function recordFromForm(deps: ExtractorDeps, root: Element, options: RecordFromFormOptions = {}): FieldsRecord {
    const exported = deps.formExtractor.quickExport(root);
    const fields: Record<string, RecordValue> = {};
    const labels: Record<string, string> = {};
    const seenSelectors = new Set<string>();
    const radioGroups = new Set<string>();

    for (const field of exported) {
        if (field.type === 'radio') {
            // One entry per group: the checked radio's value.
            const groupKey = field.name ?? field.selector;
            if (radioGroups.has(groupKey)) continue;
            radioGroups.add(groupKey);
        } else if (NON_DATA_TYPES.has(field.type) || seenSelectors.has(field.selector)) {
            continue;
        }
        seenSelectors.add(field.selector);

        const element = resolveElement(root, field.selector);
        if (field.type === 'password' || isSensitiveElement(element)) continue;
        if (element && countMatches(root, field.selector) > 1 && field.type !== 'radio') continue;

        const texts = labelTexts(element, field.label);
        const key = keyForControl(element, field.name, texts);
        if (!key) continue;
        if (isSensitiveKey(key) || (options.redact ?? []).includes(key)) continue;

        let value: RecordValue = null;
        const raw = field.value;
        if (field.type === 'checkbox' && raw && typeof raw === 'object' && 'checked' in raw) {
            value = raw.checked;
        } else if (field.type === 'radio') {
            const checked = Array.isArray(field.options) ? (field.options as Array<{ value: string; checked?: boolean }>).find(option => option.checked) : undefined;
            value = checked ? checked.value : null;
        } else if (field.type === 'select' && raw && typeof raw === 'object' && 'selectedOptions' in raw) {
            const selected = raw.selectedOptions[0];
            value = selected && raw.selectedValue !== '' ? (cleanText(selected.text) || selected.value) : null;
        } else if (typeof raw === 'string') {
            const text = field.type === 'textarea' ? raw.trim() : cleanText(raw);
            if (field.type === 'number' && text !== '' && Number.isFinite(Number(text))) {
                value = Number(text);
            } else {
                value = text === '' ? null : text;
            }
        }

        if ((value === null || value === '') && !options.includeEmpty) continue;

        const finalKey = uniqueKey(key, new Set(Object.keys(fields)));
        fields[finalKey] = value;
        if (texts[0]) labels[finalKey] = texts[0];
    }

    filterFields(fields, labels, options.redact);
    return newFieldsRecord(options.type ?? 'fields', fields, labels);
}

/** Reads a table into a table record. */
export function recordFromTable(deps: ExtractorDeps, table: HTMLTableElement, options: RecordFromTableOptions = {}): TableRecord {
    const data = deps.tableExtractor.extractTableData(table, options);
    let columns = data.headers.slice();
    if (columns.length === 0) {
        const width = Math.max(0, ...data.rows.map(row => row.length));
        columns = Array.from({ length: width }, (_unused, index) => `Column ${index + 1}`);
    }
    return {
        agentlet: 'record',
        version: RECORD_VERSION,
        type: 'table',
        columns,
        rows: data.rows.map(row => row.slice()),
        source: buildSource()
    };
}

function pairsToRecord(pairs: Array<[string, string]>, options: RecordFromFormOptions): FieldsRecord | null {
    const fields: Record<string, RecordValue> = {};
    const labels: Record<string, string> = {};
    for (const [rawLabel, rawValue] of pairs) {
        const label = cleanLabel(rawLabel);
        const value = cleanText(rawValue);
        if (!label) continue;
        if (value === '' && !options.includeEmpty) continue;
        const key = knownKeyForLabel(label) ?? slugify(label);
        if (!key) continue;
        const finalKey = uniqueKey(key, new Set(Object.keys(fields)));
        fields[finalKey] = value === '' ? null : value;
        labels[finalKey] = label;
    }
    filterFields(fields, labels, options.redact);
    if (Object.keys(fields).length === 0) return null;
    return newFieldsRecord(options.type ?? 'fields', fields, labels);
}

/** `dt` and `dd` pairs, also when each pair is wrapped in a `div`. */
function definitionListPairs(root: Element): Array<[string, string]> {
    const pairs: Array<[string, string]> = [];
    let term: string | null = null;
    const values: string[] = [];
    const flush = () => {
        if (term !== null) pairs.push([term, values.join(' ')]);
        term = null;
        values.length = 0;
    };
    root.querySelectorAll('dt, dd').forEach(node => {
        if (node.tagName === 'DT') {
            flush();
            term = visibleText(node);
        } else if (term !== null) {
            values.push(visibleText(node));
        }
    });
    flush();
    return pairs;
}

const INERT_SELECTOR = 'script, style, noscript, template';

/** The text a reader sees: `textContent` without script, style and template content. */
function visibleText(element: Element): string {
    if (element.querySelector(INERT_SELECTOR) === null) return cleanText(element.textContent);
    const clone = element.cloneNode(true) as Element;
    clone.querySelectorAll(INERT_SELECTOR).forEach(node => node.remove());
    return cleanText(clone.textContent);
}

function hasBlockDescendant(element: Element): boolean {
    return element.querySelector(BLOCK_SELECTOR) !== null;
}

function pairOf(element: Element): [string, string] | null {
    if (SKIPPED_TAGS.has(element.tagName)) return null;
    const children = Array.from(element.children).filter(child => !SKIPPED_TAGS.has(child.tagName));

    if (children.length === 2 && children.every(child => !hasBlockDescendant(child) && child.querySelector(CONTROL_SELECTOR) === null)) {
        const label = cleanLabel(visibleText(children[0]));
        const value = visibleText(children[1]);
        const ownText = Array.from(element.childNodes)
            .filter(node => node.nodeType === Node.TEXT_NODE)
            .map(node => cleanText(node.textContent))
            .join('');
        if (label && value && label.length <= 60 && ownText === '') return [label, value];
    }

    if (children.length <= 1 && !hasBlockDescendant(element) && element.querySelector(CONTROL_SELECTOR) === null) {
        const text = visibleText(element);
        const match = /^([^:]{1,60}):\s*(\S.*)$/.exec(text);
        if (match) return [match[1], match[2]];
    }
    return null;
}

/** Label and value pairs laid out as sibling elements or as "Label: value" text. Deepest matches win. */
function labelValuePairs(root: Element): Array<[string, string]> {
    const all = [root, ...Array.from(root.querySelectorAll('*'))];
    const consumed = new Set<Element>();
    const found: Array<{ order: number; pair: [string, string] }> = [];
    for (let index = all.length - 1; index >= 0; index--) {
        const element = all[index];
        if (consumed.has(element)) continue;
        const pair = pairOf(element);
        if (!pair) continue;
        found.push({ order: index, pair });
        for (let node: Element | null = element; node; node = node === root ? null : node.parentElement) {
            consumed.add(node);
        }
    }
    return found.sort((a, b) => a.order - b.order).map(entry => entry.pair);
}

/** The first thing on the page that looks like a record: a table, a form, a `dl`, or label and value pairs. */
export function recordFromElement(deps: ExtractorDeps, element: Element, options: RecordFromElementOptions = {}): AgentletRecord | null {
    if (element.tagName === 'TABLE') {
        return recordFromTable(deps, element as HTMLTableElement, options.table);
    }

    const hasControls = element.tagName === 'FORM' || element.matches(CONTROL_SELECTOR) || element.querySelector(CONTROL_SELECTOR) !== null;
    if (hasControls) {
        const record = recordFromForm(deps, element, options);
        if (Object.keys(record.fields).length > 0) return record;
    }

    const tables = element.querySelectorAll('table');
    if (tables.length === 1) {
        return recordFromTable(deps, tables[0] as HTMLTableElement, options.table);
    }

    if (element.tagName === 'DL' || element.querySelector('dl')) {
        const record = pairsToRecord(definitionListPairs(element), options);
        if (record) return record;
    }

    return pairsToRecord(labelValuePairs(element), options);
}
