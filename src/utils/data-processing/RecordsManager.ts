/**
 * RecordsManager - structured copy and paste between web apps
 * (`window.agentlet.records`, see docs/rfcs/0001-records-api.md).
 *
 * Builds on the existing pieces: `forms.quickExport()` and `FormFiller`,
 * `tables.extract()`, `ElementSelector`, `Dialog`, `storage.local` and the
 * event bus. The records modules under `./records/` hold the format, the
 * transport, the matcher and the preview; this class wires them together.
 */
import type {
    AgentletRecord,
    AgentletUtils,
    EventBusAPI,
    FieldsRecord,
    FormExtractorAPI,
    FormFillerAPI,
    FormFillResult,
    FormFillSelectorValues,
    RecordCopyOptions,
    RecordCopyResult,
    RecordCreateOptions,
    RecordEventPayload,
    RecordFieldMapping,
    RecordFieldMappingEntry,
    RecordFillOptions,
    RecordFillResult,
    RecordFromElementOptions,
    RecordFromFormOptions,
    RecordFromTableOptions,
    RecordMatchOptions,
    RecordOnPasteOptions,
    RecordPasteFromClipboardOptions,
    RecordPickOptions,
    RecordsAPI,
    RecordsManagerAPI,
    RecordTypeDefinition,
    RecordValidationResult,
    RecordValue,
    StorageManagerAPI,
    TableExtractorAPI,
    TableRecord
} from '../../types/public-api';
import { logger } from '../system/Logger.js';
import {
    buildSource,
    fieldCount,
    isTableRecord,
    MAX_RECORD_BYTES,
    payloadRecords,
    RECORD_VERSION,
    toEnvelope,
    validatePayload,
    type RecordPayload
} from './records/envelope.js';
import { ClipboardTransport, type RecordTransport } from './records/ClipboardTransport.js';
import { createFieldsRecord, filterFields, recordFromElement, recordFromForm, recordFromTable, type ExtractorDeps } from './records/extractors.js';
import { MappingMemory } from './records/mappingMemory.js';
import { showPreview } from './records/previewDialog.js';
import { analyzeMatch, collectTargetFields, formSignature, toMapping } from './records/RecordMatcher.js';
import { resolveElement } from './records/domFields.js';
import { isSensitiveElement, isSensitiveKey } from './records/sensitive.js';
import { slugify, utf8ByteLength } from './records/text.js';
import { RecordTypeRegistry } from './records/typeRegistry.js';
import { toFillValue } from './records/valueConversion.js';

const DEFAULT_MIN_CONFIDENCE = 0.6;

export interface RecordsManagerDeps {
    eventBus: Pick<EventBusAPI, 'emit'>;
    formExtractor: Pick<FormExtractorAPI, 'quickExport'>;
    formFiller: Pick<FormFillerAPI, 'fillForm'>;
    tableExtractor: Pick<TableExtractorAPI, 'extractTableData'>;
    /** `null` disables the mapping memory. */
    storageManager?: Pick<StorageManagerAPI, 'getJSON' | 'setJSON'> | null;
    /** Read lazily: `window.agentlet.utils` only exists once `GlobalAPI` has run. */
    getUtils?: () => Partial<Pick<AgentletUtils, 'Dialog' | 'ElementSelector'>> | null | undefined;
    /** Defaults to the clipboard transport. */
    transport?: RecordTransport;
}

function emptyFillResult(): FormFillResult {
    return { total: 0, successful: 0, failed: 0, skipped: 0, details: [], errors: [] };
}

/** A deep copy that keeps only the known parts of a record, with a fresh `source`, and without sensitive or redacted data. */
function sanitizeForCopy(record: AgentletRecord, redact: string[]): AgentletRecord {
    if (isTableRecord(record)) {
        const keep = record.columns.map(column => !isSensitiveKey(slugify(column)) && !redact.includes(column) && !redact.includes(slugify(column)));
        const copy: TableRecord = {
            agentlet: 'record',
            version: RECORD_VERSION,
            type: 'table',
            columns: record.columns.filter((_column, index) => keep[index]),
            rows: record.rows.map(row => row.filter((_cell, index) => keep[index] ?? true)),
            source: buildSource()
        };
        if (record.labels) copy.labels = { ...record.labels };
        return copy;
    }
    const fields: Record<string, RecordValue> = {};
    const labels: Record<string, string> = { ...(record.labels ?? {}) };
    Object.keys(record.fields).forEach(key => { fields[key] = record.fields[key]; });
    filterFields(fields, labels, redact);
    const copy: FieldsRecord = { agentlet: 'record', version: RECORD_VERSION, type: record.type, fields };
    if (Object.keys(labels).length > 0) copy.labels = labels;
    copy.source = buildSource();
    return copy;
}

class RecordsManager implements RecordsManagerAPI {
    private readonly deps: RecordsManagerDeps;
    private readonly registry = new RecordTypeRegistry();
    private readonly memory: MappingMemory;
    private readonly transport: RecordTransport;
    private readonly pasteListeners = new Set<() => void>();

    constructor(deps: RecordsManagerDeps) {
        this.deps = deps;
        this.memory = new MappingMemory(deps.storageManager ?? null);
        this.transport = deps.transport ?? new ClipboardTransport();
    }

    /* ---- Types ---- */

    defineType(definition: RecordTypeDefinition): void {
        this.registry.define(definition);
    }

    getType(name: string): RecordTypeDefinition | null {
        return this.registry.get(name);
    }

    listTypes(): RecordTypeDefinition[] {
        return this.registry.list();
    }

    /* ---- Create ---- */

    create(type: string, fields: Record<string, RecordValue>, options: RecordCreateOptions = {}): FieldsRecord {
        return createFieldsRecord(type, fields, options.labels);
    }

    fromForm(element: Element, options: RecordFromFormOptions = {}): FieldsRecord {
        return recordFromForm(this.extractorDeps(), element, options);
    }

    fromTable(table: HTMLTableElement, options: RecordFromTableOptions = {}): TableRecord {
        return recordFromTable(this.extractorDeps(), table, options);
    }

    fromElement(element: Element, options: RecordFromElementOptions = {}): AgentletRecord | null {
        return recordFromElement(this.extractorDeps(), element, options);
    }

    pick(options: RecordPickOptions = {}): Promise<AgentletRecord | null> {
        const selector = this.deps.getUtils?.()?.ElementSelector;
        if (!selector) {
            return Promise.reject(new Error('ElementSelector is not available'));
        }
        if (selector.isActive) {
            return Promise.reject(new Error('Element selection is already active'));
        }
        return new Promise<AgentletRecord | null>((resolve, reject) => {
            let finished = false;
            const onKeydown = (event: KeyboardEvent) => {
                if (event.key === 'Escape') finish(() => resolve(null));
            };
            const finish = (settle: () => void) => {
                if (finished) return;
                finished = true;
                document.removeEventListener('keydown', onKeydown, true);
                settle();
            };
            document.addEventListener('keydown', onKeydown, true);
            selector.start(element => {
                finish(() => {
                    try {
                        resolve(this.fromElement(element, options));
                    } catch (error) {
                        reject(error);
                    }
                });
            }, {
                selector: options.selector,
                message: options.message ?? 'Click the element to copy as a record. Escape cancels.'
            });
        });
    }

    /* ---- Transport ---- */

    async copy(record: AgentletRecord | AgentletRecord[], options: RecordCopyOptions = {}): Promise<RecordCopyResult> {
        const list = Array.isArray(record) ? record : [record];
        if (list.length === 0) {
            throw new Error('copy() needs at least one record');
        }
        const redact = options.redact ?? [];
        const items = list.map(item => {
            const result = validatePayload(item);
            if (!result.valid) {
                throw new Error(`Invalid record: ${result.errors.join('; ')}`);
            }
            return sanitizeForCopy((result.payload as { kind: 'record'; record: AgentletRecord }).record, redact);
        });
        const type = items[0].type;
        if (items.some(item => item.type !== type)) {
            throw new Error('A list holds records of one type: copy records of different types separately');
        }
        const payload: RecordPayload = items.length === 1
            ? { kind: 'record', record: items[0] }
            : { kind: 'list', type, items };

        const bytes = utf8ByteLength(JSON.stringify(toEnvelope(payload)));
        if (bytes > MAX_RECORD_BYTES) {
            throw new Error(`Record is ${bytes} bytes, above the ${MAX_RECORD_BYTES} byte (1 MB) limit`);
        }

        const outcome = await this.transport.write(payload);
        this.emitEvent('records:copied', items);
        return { formats: outcome.formats, customFormat: outcome.customFormat, records: items.length, bytes: outcome.bytes, method: outcome.method };
    }

    async read(): Promise<AgentletRecord[] | null> {
        const payload = await this.transport.read();
        if (!payload) return null;
        const records = payloadRecords(payload);
        this.emitEvent('records:pasted', records);
        return records;
    }

    fromPasteEvent(event: ClipboardEvent): AgentletRecord[] | null {
        const clipboard = this.transport as RecordTransport & { fromPasteEvent?: (event: ClipboardEvent) => RecordPayload | null };
        const payload = typeof clipboard.fromPasteEvent === 'function' ? clipboard.fromPasteEvent(event) : null;
        return payload ? payloadRecords(payload) : null;
    }

    onPaste(handler: (records: AgentletRecord[], event: ClipboardEvent) => void, options: RecordOnPasteOptions): () => void {
        const scope = options?.scope;
        if (!scope || typeof (scope as Element).addEventListener !== 'function' || (scope as Node).nodeType !== Node.ELEMENT_NODE) {
            throw new TypeError('onPaste() needs options.scope, the element to listen in (usually the target form)');
        }
        const listener = (event: Event) => {
            const pasteEvent = event as ClipboardEvent;
            let records = this.fromPasteEvent(pasteEvent);
            if (!records) return;
            const { types } = options;
            if (types) records = records.filter(record => types.includes(record.type));
            if (records.length === 0) return;

            // Only a paste that carries a record is taken over.
            pasteEvent.preventDefault();
            this.emitEvent('records:pasted', records);
            try {
                const result = handler(records, pasteEvent) as unknown;
                if (result && typeof (result as Promise<unknown>).catch === 'function') {
                    (result as Promise<unknown>).catch(error => console.error('Error in records.onPaste handler:', error));
                }
            } catch (error) {
                console.error('Error in records.onPaste handler:', error);
            }
        };
        scope.addEventListener('paste', listener);
        const unsubscribe = () => {
            scope.removeEventListener('paste', listener);
            this.pasteListeners.delete(unsubscribe);
        };
        this.pasteListeners.add(unsubscribe);
        return unsubscribe;
    }

    async pasteFromClipboard(target: Element, options: RecordPasteFromClipboardOptions = {}): Promise<RecordFillResult | null> {
        const records = await this.read();
        if (!records) return null;
        const { types, ...fillOptions } = options;
        const record = records.find(item => !isTableRecord(item) && (!types || types.includes(item.type)));
        if (!record) return null;
        return this.fill(record, target, fillOptions);
    }

    /* ---- Mapping and fill ---- */

    match(record: AgentletRecord, target: Element, options: RecordMatchOptions = {}): RecordFieldMapping {
        const { analysis } = this.analyze(record, target, options.remember !== false);
        return toMapping(analysis, target, options.minConfidence ?? DEFAULT_MIN_CONFIDENCE);
    }

    async fill(record: AgentletRecord, target: Element, options: RecordFillOptions = {}): Promise<RecordFillResult> {
        if (isTableRecord(record)) {
            throw new Error('A table record cannot fill a form: use a fields record');
        }
        const minConfidence = options.minConfidence ?? DEFAULT_MIN_CONFIDENCE;
        const remember = options.remember !== false;
        const { analysis, signature } = this.analyze(record, target, remember);

        const automatic = analysis.entries.filter(entry => entry.confidence >= minConfidence);
        const suggested = analysis.entries.filter(entry => entry.confidence < minConfidence);
        let chosen: RecordFieldMappingEntry[] = automatic;

        if (options.preview !== false) {
            const dialog = this.deps.getUtils?.()?.Dialog;
            if (!dialog) {
                throw new Error('Dialog is not available: pass preview: false, or show your own preview with match()');
            }
            const result = await showPreview({
                dialog,
                registry: this.registry,
                record,
                fields: analysis.fields,
                keys: analysis.keys,
                selected: automatic,
                suggested
            });
            if (!result.confirmed) {
                return { ...emptyFillResult(), mapping: toMapping({ ...analysis, entries: automatic }, target, 0), confirmed: false };
            }
            chosen = [];
            const corrections: Record<string, string> = {};
            for (const key of analysis.keys) {
                const selector = result.selection[key];
                if (!selector) continue;
                const auto = automatic.find(entry => entry.key === key);
                if (auto && auto.selector === selector) {
                    chosen.push(auto);
                } else {
                    chosen.push({ key, selector, confidence: 1, reason: 'manual' });
                    corrections[key] = selector;
                }
            }
            if (remember) this.memory.save(record.type, signature, corrections);
        }

        const selectorValues: Array<{ selector: string; value: string | boolean }> = [];
        const written: RecordFieldMappingEntry[] = [];
        for (const entry of chosen) {
            const field = analysis.fields.find(item => item.selector === entry.selector);
            if (!field) continue;
            // Never fill a sensitive field, whatever the mapping says.
            if (isSensitiveKey(entry.key) || isSensitiveElement(resolveElement(target, entry.selector))) continue;
            const value = toFillValue(field, analysis.values[entry.key]);
            if (value === null) continue;
            selectorValues.push({ selector: entry.selector, value });
            written.push(entry);
        }

        const fillResult = this.deps.formFiller.fillForm(target, selectorValues as FormFillSelectorValues, options.fill);
        const mapping = toMapping({ ...analysis, entries: written }, target, 0);
        this.emitEvent('records:filled', [record], fillResult.successful);
        return { ...fillResult, mapping, confirmed: true };
    }

    validate(value: unknown): RecordValidationResult {
        const result = validatePayload(value);
        if (!result.valid) return result;
        if (result.payload.kind !== 'record') {
            return { valid: false, errors: ['value is a list envelope: validate each item on its own'] };
        }
        return { valid: true, record: result.payload.record };
    }

    /* ---- Lifecycle ---- */

    createProxy(): RecordsAPI {
        return {
            defineType: definition => this.defineType(definition),
            getType: name => this.getType(name),
            listTypes: () => this.listTypes(),
            create: (type, fields, options) => this.create(type, fields, options),
            fromForm: (element, options) => this.fromForm(element, options),
            fromTable: (table, options) => this.fromTable(table, options),
            fromElement: (element, options) => this.fromElement(element, options),
            pick: options => this.pick(options),
            copy: (record, options) => this.copy(record, options),
            read: () => this.read(),
            fromPasteEvent: event => this.fromPasteEvent(event),
            onPaste: (handler, options) => this.onPaste(handler, options),
            pasteFromClipboard: (target, options) => this.pasteFromClipboard(target, options),
            match: (record, target, options) => this.match(record, target, options),
            fill: (record, target, options) => this.fill(record, target, options),
            validate: value => this.validate(value)
        };
    }

    /** Removes every `onPaste` listener. */
    cleanup(): void {
        Array.from(this.pasteListeners).forEach(unsubscribe => unsubscribe());
        this.pasteListeners.clear();
    }

    /* ---- Internals ---- */

    private extractorDeps(): ExtractorDeps {
        return { formExtractor: this.deps.formExtractor, tableExtractor: this.deps.tableExtractor };
    }

    private analyze(record: AgentletRecord, target: Element, remember: boolean) {
        if (isTableRecord(record)) {
            throw new Error('A table record cannot be matched to a form: use a fields record');
        }
        const fields = collectTargetFields(this.deps, target);
        const signature = formSignature(target, fields);
        const remembered = remember ? this.memory.load(record.type, signature) : {};
        const analysis = analyzeMatch({ registry: this.registry }, record, fields, remembered);
        return { analysis, signature };
    }

    /** Emits an event that carries counts and the claimed origin, never values. */
    private emitEvent(name: string, records: AgentletRecord[], count?: number): void {
        const payload: RecordEventPayload = {
            type: records[0]?.type ?? '',
            fieldCount: count ?? records.reduce((sum, item) => sum + fieldCount(item), 0),
            itemCount: records.length,
            sourceOrigin: records[0]?.source?.origin || null
        };
        try {
            this.deps.eventBus.emit(name, payload);
        } catch (error) {
            logger.log('records event failed:', (error as Error).message);
        }
    }
}

export default RecordsManager;
