/**
 * The sensitive-data rules of the records API, applied on both sides: a
 * field that matches is never copied into a record and never filled from one.
 */

const SENSITIVE_TOKENS = new Set(['current-password', 'new-password', 'one-time-code']);

/** Free record keys that are treated like the sensitive `autocomplete` tokens. */
const SENSITIVE_KEYS = new Set(['password', 'passwd', 'passcode']);

/** True for `current-password`, `new-password`, `one-time-code` and every `cc-*` token. */
export function isSensitiveToken(token: string): boolean {
    const lower = token.toLowerCase();
    return SENSITIVE_TOKENS.has(lower) || lower.startsWith('cc-');
}

/** The `autocomplete` attribute can hold several tokens ("section-x shipping cc-number"); any sensitive one counts. */
export function hasSensitiveAutocomplete(attribute: string | null | undefined): boolean {
    if (!attribute) return false;
    return attribute.split(/\s+/).some(token => token !== '' && isSensitiveToken(token));
}

/** True for a password input or a control whose `autocomplete` is sensitive. */
export function isSensitiveElement(element: Element | null): boolean {
    if (!element) return false;
    const type = (element as HTMLInputElement).type;
    if (typeof type === 'string' && type.toLowerCase() === 'password') return true;
    return hasSensitiveAutocomplete(element.getAttribute('autocomplete'));
}

/** True for a record key that must never be copied or filled. */
export function isSensitiveKey(key: string): boolean {
    const lower = key.trim().toLowerCase();
    return SENSITIVE_KEYS.has(lower) || isSensitiveToken(lower);
}
