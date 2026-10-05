/**
 * Helpers for building the panel's markup safely.
 *
 * Values that come from the host page (URLs, document titles), from a module
 * (names, titles, descriptions), from the user (environment variable names) or
 * from an identity provider must never be concatenated into an HTML string
 * unescaped. Prefer building nodes with `createElement()` and `textContent`;
 * where an HTML template is kept, pass every interpolated value through
 * `escapeHtml()` (text and double or single quoted attribute values alike) and
 * every URL through `sanitizeUrl()` first.
 *
 * `Dialog.escapeHtml()` (public) keeps its historical text-only behaviour (it
 * leaves quotes alone); this module's `escapeHtml()` also escapes quotes, so it
 * is safe inside attribute values too.
 */

const HTML_ESCAPES: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    '\'': '&#39;'
};

/** Escapes a value for HTML text content and for quoted attribute values. */
export function escapeHtml(value: unknown): string {
    return String(value).replace(/[&<>"']/g, char => HTML_ESCAPES[char]);
}

const SCHEME_PATTERN = /^([a-z][a-z0-9+.-]*):/i;
const DATA_IMAGE_PATTERN = /^data:image\/[a-z0-9.+-]+[;,]/i;

export interface SanitizeUrlOptions {
    /** Also accept `data:image/...` URLs (for `<img src>`). Default: false. */
    allowDataImage?: boolean;
}

/**
 * Returns `url` (trimmed) when it is safe to put in a `src` or `href`
 * attribute, or `null` otherwise. Accepted: `http:`, `https:`, relative URLs
 * (no scheme) and, with `allowDataImage`, `data:image/...`. Everything else
 * (`javascript:`, `vbscript:`, `data:text/html`, `blob:`, `file:`, ...) is
 * rejected. Browsers ignore tabs, newlines and other control characters inside
 * a URL scheme (`java\tscript:`), so the scheme is checked on a copy with
 * those stripped.
 */
export function sanitizeUrl(url: unknown, options: SanitizeUrlOptions = {}): string | null {
    if (typeof url !== 'string') return null;
    const trimmed = url.trim();
    if (!trimmed) return null;

    // Strip the control characters and spaces a browser ignores inside a URL scheme.
    const normalized = trimmed.replace(/[\u0000- ]/g, '');
    const scheme = SCHEME_PATTERN.exec(normalized);
    if (!scheme) return trimmed;

    const name = scheme[1].toLowerCase();
    if (name === 'http' || name === 'https') return trimmed;
    if (name === 'data' && options.allowDataImage && DATA_IMAGE_PATTERN.test(normalized)) return trimmed;
    return null;
}
