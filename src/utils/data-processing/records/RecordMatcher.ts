/**
 * Rule-based matching of record fields to the fields of a target form.
 *
 * Signals, strongest first: a remembered mapping (1), the `autocomplete`
 * attribute (0.95), the field `name` or `id` (0.85, or 0.8 for a known
 * synonym), the label, `aria-label` or placeholder (0.75), and a lone field
 * of the same type (0.6). The input type also vetoes: a value that cannot go
 * into a field is never matched to it.
 *
 * Selectors in the result are computed here, from the target page. Nothing
 * in the record is ever used as a selector.
 */
import type {
    AgentletRecord,
    FormExtractorAPI,
    RecordFieldMapping,
    RecordFieldMappingEntry,
    RecordMatchReason,
    RecordValue
} from '../../../types/public-api';
import { isTableRecord } from './envelope.js';
import { cleanText, countMatches, labelTexts, NON_DATA_TYPES, resolveElement } from './domFields.js';
import { isSensitiveElement, isSensitiveKey } from './sensitive.js';
import { compactText, normalizeText } from './text.js';
import type { RecordTypeRegistry } from './typeRegistry.js';
import { isCompatible, type FieldOption } from './valueConversion.js';

export interface MatcherDeps {
    registry: RecordTypeRegistry;
}

/** A field of the target form that a record value may go into. */
export interface TargetField {
    selector: string;
    type: string;
    name: string | null;
    id: string | null;
    autocomplete: string[];
    /** Label texts as shown, best first. */
    labels: string[];
    /** Normalized label, `aria-label` and placeholder texts. */
    labelKeys: Set<string>;
    options: FieldOption[] | null;
    /** What the preview shows for this field. */
    display: string;
}

/** Everything `fill()` needs after matching: the mapping, the fields and the usable record values. */
export interface MatchAnalysis {
    fields: TargetField[];
    /** Record keys that can take part (not sensitive, not empty), in record order. */
    keys: string[];
    values: Record<string, RecordValue>;
    /** Every assignment, whatever its confidence. */
    entries: RecordFieldMappingEntry[];
}

const TYPE_KINDS = new Set(['email', 'tel', 'url', 'date', 'number']);

/** Lists the fields of `target` a value can go into. Sensitive, hidden, ambiguous and non-data fields are left out. */
export function collectTargetFields(deps: { formExtractor: Pick<FormExtractorAPI, 'quickExport'> }, target: Element): TargetField[] {
    const fields: TargetField[] = [];
    const seen = new Set<string>();
    for (const exported of deps.formExtractor.quickExport(target)) {
        if (NON_DATA_TYPES.has(exported.type) || seen.has(exported.selector)) continue;
        seen.add(exported.selector);

        const element = resolveElement(target, exported.selector);
        // Without the element, the `autocomplete` attribute cannot be checked: leave the field out.
        if (!element || isSensitiveElement(element)) continue;
        if (countMatches(target, exported.selector) !== 1) continue;

        const labels = labelTexts(element, exported.label);
        const placeholder = cleanText(element.getAttribute('placeholder') ?? exported.name ?? '');
        const labelKeys = new Set<string>();
        [...labels, element.getAttribute('aria-label') ?? '', element.getAttribute('placeholder') ?? ''].forEach(text => {
            const normalized = normalizeText(text);
            if (normalized) labelKeys.add(normalized);
        });

        let options: FieldOption[] | null = null;
        if (exported.type === 'select' && Array.isArray(exported.options)) {
            options = (exported.options as Array<{ value: string; text: string; disabled?: boolean }>).map(option => ({
                value: option.value,
                text: option.text,
                disabled: option.disabled
            }));
        }

        fields.push({
            selector: exported.selector,
            type: exported.type,
            name: exported.name,
            id: element.getAttribute('id'),
            autocomplete: (element.getAttribute('autocomplete') || '').toLowerCase().split(/\s+/).filter(Boolean),
            labels,
            labelKeys,
            options,
            display: labels[0] || placeholder || exported.name || element.getAttribute('id') || exported.selector
        });
    }
    return fields;
}

function usableKeys(record: AgentletRecord & { fields: Record<string, RecordValue> }): string[] {
    return Object.keys(record.fields).filter(key => {
        const value = record.fields[key];
        return !isSensitiveKey(key) && value !== null && value !== '';
    });
}

interface Scored {
    key: string;
    field: TargetField;
    confidence: number;
    reason: RecordMatchReason;
    keyIndex: number;
    fieldIndex: number;
    typeBonus: boolean;
}

/**
 * Computes every assignment, whatever its confidence. `fields` come from
 * `collectTargetFields()`. `remembered` maps record keys to selectors from the
 * mapping memory.
 */
export function analyzeMatch(
    deps: MatcherDeps,
    record: AgentletRecord,
    fields: TargetField[],
    remembered: Record<string, string> = {}
): MatchAnalysis {
    if (isTableRecord(record)) {
        throw new Error('A table record cannot be matched to a form: use a fields record');
    }
    const keys = usableKeys(record);
    const values: Record<string, RecordValue> = {};
    keys.forEach(key => { values[key] = record.fields[key]; });
    const { registry } = deps;

    const kinds = new Map<string, string | undefined>();
    keys.forEach(key => kinds.set(key, registry.kindFor(key, record.type)));
    const keysPerKind = new Map<string, number>();
    kinds.forEach(kind => { if (kind) keysPerKind.set(kind, (keysPerKind.get(kind) ?? 0) + 1); });
    const fieldsPerType = new Map<string, number>();
    fields.forEach(field => fieldsPerType.set(field.type, (fieldsPerType.get(field.type) ?? 0) + 1));

    const entries: RecordFieldMappingEntry[] = [];
    const usedKeys = new Set<string>();
    const usedFields = new Set<string>();

    // 1. Remembered mappings win outright. They are only honoured for a selector the target form really has.
    for (const key of keys) {
        const selector = remembered[key];
        if (typeof selector !== 'string') continue;
        const field = fields.find(entry => entry.selector === selector);
        if (!field || usedFields.has(field.selector)) continue;
        entries.push({ key, selector: field.selector, confidence: 1, reason: 'remembered' });
        usedKeys.add(key);
        usedFields.add(field.selector);
    }

    // 2. Score every other pair.
    const scored: Scored[] = [];
    keys.forEach((key, keyIndex) => {
        if (usedKeys.has(key)) return;
        const value = values[key];
        const labelCandidates = registry.labelCandidates(key, record.type, record.labels?.[key]);
        const compactKey = compactText(key);
        const compactSynonyms = new Set(Array.from(registry.synonymCandidates(key, record.type), compactText));
        const kind = kinds.get(key);

        fields.forEach((field, fieldIndex) => {
            if (usedFields.has(field.selector)) return;
            if (!isCompatible(field, value)) return;

            let confidence = 0;
            let reason: RecordMatchReason = 'type';

            if (field.autocomplete.includes(key)) {
                confidence = 0.95;
                reason = 'autocomplete';
            } else {
                const identifiers = [field.name, field.id].filter((entry): entry is string => !!entry).map(compactText);
                if (identifiers.includes(compactKey)) {
                    confidence = 0.85;
                    reason = 'name';
                } else if (identifiers.some(identifier => compactSynonyms.has(identifier))) {
                    confidence = 0.8;
                    reason = 'name';
                } else if (Array.from(field.labelKeys).some(label => labelCandidates.has(label))) {
                    confidence = 0.75;
                    reason = 'label';
                } else if (
                    kind && TYPE_KINDS.has(kind) && field.type === kind
                    && keysPerKind.get(kind) === 1 && fieldsPerType.get(field.type) === 1
                ) {
                    confidence = 0.6;
                    reason = 'type';
                }
            }
            if (confidence > 0) {
                scored.push({ key, field, confidence, reason, keyIndex, fieldIndex, typeBonus: kind === field.type });
            }
        });
    });

    // 3. Assign greedily from the highest score. Ties go to a type match, then record order, then page order.
    scored.sort((a, b) =>
        b.confidence - a.confidence
        || Number(b.typeBonus) - Number(a.typeBonus)
        || a.keyIndex - b.keyIndex
        || a.fieldIndex - b.fieldIndex
    );
    for (const candidate of scored) {
        if (usedKeys.has(candidate.key) || usedFields.has(candidate.field.selector)) continue;
        usedKeys.add(candidate.key);
        usedFields.add(candidate.field.selector);
        entries.push({
            key: candidate.key,
            selector: candidate.field.selector,
            confidence: candidate.confidence,
            reason: candidate.reason
        });
    }

    entries.sort((a, b) => keys.indexOf(a.key) - keys.indexOf(b.key));
    return { fields, keys, values, entries };
}

/** The public mapping: entries at or above `minConfidence`, the rest reported as unmatched. */
export function toMapping(analysis: MatchAnalysis, target: Element, minConfidence: number): RecordFieldMapping {
    const entries = analysis.entries.filter(entry => entry.confidence >= minConfidence);
    const usedKeys = new Set(entries.map(entry => entry.key));
    const usedSelectors = new Set(entries.map(entry => entry.selector));
    return {
        target,
        entries,
        unmatchedKeys: analysis.keys.filter(key => !usedKeys.has(key)),
        unmatchedFields: analysis.fields.map(field => field.selector).filter(selector => !usedSelectors.has(selector))
    };
}

/** A short stable hash, so a form signature stays a small storage key. */
function hash(text: string): string {
    let value = 0x811c9dc5;
    for (let index = 0; index < text.length; index++) {
        value ^= text.charCodeAt(index);
        value = Math.imul(value, 0x01000193) >>> 0;
    }
    return value.toString(36);
}

/** The form `action` path plus the sorted list of field names, hashed. `target` may be the form, or an element that holds it. */
export function formSignature(target: Element, fields: TargetField[]): string {
    const form = target.tagName === 'FORM' ? target : (target.closest('form') ?? target.querySelector('form'));
    let path = '';
    const action = form?.getAttribute('action');
    if (action) {
        try {
            path = new URL(action, window.location.href).pathname;
        } catch {
            path = action;
        }
    }
    const names = fields.map(field => field.name || field.id || field.type).sort();
    return hash(`${path}|${names.join(',')}`);
}
