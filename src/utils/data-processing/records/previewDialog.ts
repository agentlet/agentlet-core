/**
 * The preview dialog shown by `records.fill()`: where the record came from,
 * one row per record field with the target field it maps to (a select to
 * change it), and the fields that matched nothing. Built on the shared
 * `Dialog`. It only fills the form on Fill, and never submits it.
 */
import type { DialogAPI, FieldsRecord, RecordFieldMappingEntry } from '../../../types/public-api';
import { escapeHtml } from './text.js';
import type { TargetField } from './RecordMatcher.js';
import { isCompatible } from './valueConversion.js';
import type { RecordTypeRegistry } from './typeRegistry.js';

export interface PreviewInput {
    dialog: DialogAPI;
    registry: RecordTypeRegistry;
    record: FieldsRecord;
    fields: TargetField[];
    keys: string[];
    /** Assignments at or above the confidence threshold: preselected. */
    selected: RecordFieldMappingEntry[];
    /** Assignments below the threshold: suggested but left to the user. */
    suggested: RecordFieldMappingEntry[];
}

export interface PreviewResult {
    confirmed: boolean;
    /** Record key to selector; a key the user left on "Do not fill" is absent. */
    selection: Record<string, string>;
}

const MAX_VALUE_LENGTH = 80;

/** "just now", "5 minutes ago", "2 hours ago", "3 days ago". Empty when the date is unusable. */
export function formatAge(copiedAt: string | undefined, now: number = Date.now()): string {
    if (!copiedAt) return '';
    const time = Date.parse(copiedAt);
    if (Number.isNaN(time)) return '';
    const seconds = Math.max(0, Math.round((now - time) / 1000));
    if (seconds < 45) return 'just now';
    const minutes = Math.round(seconds / 60);
    if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
    const hours = Math.round(minutes / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.round(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
}

function sourceLine(record: FieldsRecord): string {
    const source = record.source;
    if (!source || (!source.origin && !source.title)) return 'Source: not stated.';
    const parts = [source.origin || 'unknown origin'];
    if (source.title) parts.push(source.title);
    const age = formatAge(source.copiedAt);
    if (age) parts.push(`copied ${age}`);
    return `Source (as stated by the copying page): ${parts.join(', ')}.`;
}

function displayValue(value: unknown): string {
    const text = value === null || value === undefined ? '' : String(value);
    return text.length > MAX_VALUE_LENGTH ? `${text.slice(0, MAX_VALUE_LENGTH)}...` : text;
}

function matchText(entry: RecordFieldMappingEntry | undefined, suggested: RecordFieldMappingEntry | undefined, fields: TargetField[]): string {
    if (entry) {
        const percent = Math.round(entry.confidence * 100);
        if (entry.reason === 'remembered') return 'Remembered';
        const how: Record<string, string> = { autocomplete: 'autocomplete', name: 'field name', label: 'label', type: 'input type', manual: 'your choice' };
        return `By ${how[entry.reason] ?? entry.reason}, ${percent}%`;
    }
    if (suggested) {
        const field = fields.find(item => item.selector === suggested.selector);
        return `Suggested: ${field?.display ?? suggested.selector}, ${Math.round(suggested.confidence * 100)}%`;
    }
    return '';
}

function rowHtml(input: PreviewInput, key: string, current: string): string {
    const { record, fields, registry } = input;
    const value = record.fields[key];
    const label = registry.labelFor(key, record.type, record.labels?.[key]);
    const options = fields
        .filter(field => isCompatible(field, value))
        .map(field => `<option value="${escapeHtml(field.selector)}"${field.selector === current ? ' selected' : ''}>${escapeHtml(field.display)}</option>`)
        .join('');
    const entry = input.selected.find(item => item.key === key);
    const suggested = input.suggested.find(item => item.key === key);
    const cell = 'padding:4px 8px;border-bottom:1px solid rgba(128,128,128,0.25);vertical-align:top;text-align:left;';
    return `<tr>
<td style="${cell}">${escapeHtml(label)}</td>
<td style="${cell}word-break:break-word;">${escapeHtml(displayValue(value))}</td>
<td style="${cell}"><select data-agentlet-record-key="${escapeHtml(key)}" aria-label="Target field for ${escapeHtml(label)}" style="max-width:200px;"><option value="">Do not fill</option>${options}</select></td>
<td style="${cell}white-space:nowrap;">${escapeHtml(matchText(entry, suggested, fields))}</td>
</tr>`;
}

function buildHtml(input: PreviewInput, selection: Record<string, string>): string {
    const matched = input.keys.filter(key => selection[key]);
    const unmatched = input.keys.filter(key => !selection[key]);
    const head = 'padding:4px 8px;text-align:left;border-bottom:2px solid rgba(128,128,128,0.4);';
    const rows = [
        ...matched.map(key => rowHtml(input, key, selection[key])),
        ...(unmatched.length > 0
            ? ['<tr><td colspan="4" style="padding:10px 8px 4px;font-weight:600;">Not matched</td></tr>', ...unmatched.map(key => rowHtml(input, key, ''))]
            : [])
    ].join('');
    return `<div class="agentlet-records-preview" style="font-size:14px;">
<p style="margin:0 0 12px;">${escapeHtml(sourceLine(input.record))}</p>
<table style="width:100%;border-collapse:collapse;">
<thead><tr><th style="${head}">Record field</th><th style="${head}">Value</th><th style="${head}">Target field</th><th style="${head}">Match</th></tr></thead>
<tbody>${rows}</tbody>
</table>
<p style="margin:12px 0 0;opacity:0.8;">Fill puts the values in the form. It does not submit it.</p>
</div>`;
}

/**
 * Shows the preview. Resolves when the user chooses Fill or Cancel (or closes
 * the dialog, which counts as Cancel). Rejects when another dialog is open.
 */
export function showPreview(input: PreviewInput): Promise<PreviewResult> {
    const { dialog } = input;
    if (dialog.isActive) {
        return Promise.reject(new Error('Another dialog is already open'));
    }

    const selection: Record<string, string> = {};
    input.selected.forEach(entry => { selection[entry.key] = entry.selector; });

    return new Promise<PreviewResult>(resolve => {
        dialog.showInfo({
            title: 'Fill form from record',
            icon: '',
            message: buildHtml(input, selection),
            allowHtml: true,
            maxWidth: '720px',
            minWidth: '420px',
            buttons: [
                { text: 'Cancel', value: 'cancel' },
                { text: 'Fill', value: 'fill', primary: true }
            ]
        }, value => {
            resolve({ confirmed: value === 'fill', selection: { ...selection } });
        });

        const root = dialog.getRoot();
        const container = root.querySelector('.agentlet-records-preview');
        if (!container) return;
        container.querySelectorAll<HTMLSelectElement>('select[data-agentlet-record-key]').forEach(select => {
            select.addEventListener('change', () => {
                const key = select.getAttribute('data-agentlet-record-key') as string;
                const chosen = select.value;
                if (chosen === '') {
                    delete selection[key];
                    return;
                }
                // A target field takes one value: release it from any other record field.
                container.querySelectorAll<HTMLSelectElement>('select[data-agentlet-record-key]').forEach(other => {
                    const otherKey = other.getAttribute('data-agentlet-record-key') as string;
                    if (otherKey !== key && other.value === chosen) {
                        other.value = '';
                        delete selection[otherKey];
                    }
                });
                selection[key] = chosen;
            });
        });
    });
}
