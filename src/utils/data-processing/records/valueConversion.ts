/**
 * Turns a record value into what a target field takes, and decides whether a
 * value can go into a field at all. The second part is the "type veto" of
 * the matcher: a `number` never goes into an `input[type=email]`.
 */
import type { FormFillValue, RecordValue } from '../../../types/public-api';
import { normalizeText } from './text.js';

export interface FieldOption {
    value: string;
    text: string;
    disabled?: boolean;
}

/** The part of a target field the conversion needs. */
export interface ConvertibleField {
    type: string;
    options: FieldOption[] | null;
}

const TRUE_WORDS = new Set(['yes', 'true', '1', 'oui', 'on', 'vrai']);
const FALSE_WORDS = new Set(['no', 'false', '0', 'non', 'off', 'faux']);

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const URL_PATTERN = /^(?:https?:\/\/)?[^\s/$.?#][^\s]*\.[^\s]{2,}$/i;
const TEL_PATTERN = /^\+?[\d\s().\-/]{4,}$/;

/** `true` or `false` for a boolean, 1, 0 and the words yes, true, oui, no, false, non. `null` for anything else. */
export function parseBooleanish(value: RecordValue): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value === 1 ? true : value === 0 ? false : null;
    if (typeof value !== 'string') return null;
    const word = normalizeText(value);
    if (TRUE_WORDS.has(word)) return true;
    if (FALSE_WORDS.has(word)) return false;
    return null;
}

/** `YYYY-MM-DD` from an ISO date or a day-first `D/M/YYYY`, `D.M.YYYY` or `D-M-YYYY`. `null` for anything else. */
export function normalizeDate(value: RecordValue): string | null {
    if (typeof value !== 'string') return null;
    const text = value.trim();
    let year: number;
    let month: number;
    let day: number;
    const iso = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/.exec(text);
    const dayFirst = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(text);
    if (iso) {
        [year, month, day] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
    } else if (dayFirst) {
        [day, month, year] = [Number(dayFirst[1]), Number(dayFirst[2]), Number(dayFirst[3])];
    } else {
        return null;
    }
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
    return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** A plain decimal string ("1234.5") from a number or from text such as "1 234,50". `null` when it is not a number. */
export function normalizeNumber(value: RecordValue): string | null {
    if (typeof value === 'number') return Number.isFinite(value) ? String(value) : null;
    if (typeof value !== 'string') return null;
    const text = value.replace(/[\s  ]/g, '');
    if (/^-?\d+(?:[.,]\d+)?$/.test(text)) return text.replace(',', '.');
    if (/^-?\d{1,3}(?:\.\d{3})+,\d+$/.test(text)) return text.replace(/\./g, '').replace(',', '.');
    if (/^-?\d{1,3}(?:,\d{3})+(?:\.\d+)?$/.test(text)) return text.replace(/,/g, '');
    return null;
}

/** The option a value selects: by value first, then by text. Disabled options and the empty placeholder never match. */
export function resolveOption(options: FieldOption[] | null, value: RecordValue): FieldOption | null {
    if (!options || value === null) return null;
    const usable = options.filter(option => !option.disabled && option.value !== '');
    const text = String(value).trim();
    const exact = usable.find(option => option.value === text);
    if (exact) return exact;
    const wanted = normalizeText(text);
    if (wanted === '') return null;
    return usable.find(option => normalizeText(option.value) === wanted)
        ?? usable.find(option => normalizeText(option.text) === wanted)
        ?? null;
}

/** False when `value` can never go into `field`. */
export function isCompatible(field: ConvertibleField, value: RecordValue): boolean {
    switch (field.type) {
    case 'email':
        return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());
    case 'url':
        return typeof value === 'string' && URL_PATTERN.test(value.trim());
    case 'tel':
        return (typeof value === 'string' || typeof value === 'number')
            && TEL_PATTERN.test(String(value).trim())
            && String(value).replace(/\D/g, '').length >= 4;
    case 'number':
    case 'range':
        return normalizeNumber(value) !== null;
    case 'date':
        return normalizeDate(value) !== null;
    case 'checkbox':
        return parseBooleanish(value) !== null;
    case 'select':
        return resolveOption(field.options, value) !== null;
    default:
        return true;
    }
}

/** What `forms.fill()` is given for `field`, or `null` when the value cannot be written there. */
export function toFillValue(field: ConvertibleField, value: RecordValue): FormFillValue | null {
    if (value === null) return null;
    if (!isCompatible(field, value)) return null;
    switch (field.type) {
    case 'checkbox':
        return parseBooleanish(value);
    case 'select':
        return resolveOption(field.options, value)?.value ?? null;
    case 'date':
        return normalizeDate(value);
    case 'number':
    case 'range':
        return normalizeNumber(value);
    default:
        return typeof value === 'string' ? value : String(value);
    }
}
