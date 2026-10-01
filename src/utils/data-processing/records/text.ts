/**
 * Text helpers shared by the records modules: normalization for matching,
 * slugs for field keys, and UTF-8 helpers that work the same in every
 * browser and in jsdom.
 */

/**
 * Lowercase, accents removed, camelCase split, every run of
 * non-alphanumerics folded to one space. "Prénom *" gives "prenom",
 * "postalCode" gives "postal code".
 */
export function normalizeText(text: string): string {
    return text
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .normalize('NFD')
        .replace(/[̀-ͯ]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}

/** `normalizeText()` with the separators removed: "postal-code" and "postalCode" both give "postalcode". */
export function compactText(text: string): string {
    return normalizeText(text).replace(/ /g, '');
}

/** A lowercase hyphenated key: "Raison sociale" gives "raison-sociale". */
export function slugify(text: string): string {
    return normalizeText(text).replace(/ /g, '-');
}

/** "postal-code" gives "Postal code". */
export function humanize(key: string): string {
    const text = key.replace(/[-_]+/g, ' ').trim();
    return text ? text.charAt(0).toUpperCase() + text.slice(1) : key;
}

/** Number of bytes `text` takes in UTF-8. */
export function utf8ByteLength(text: string): number {
    let bytes = 0;
    for (let i = 0; i < text.length; i++) {
        const code = text.charCodeAt(i);
        if (code < 0x80) {
            bytes += 1;
        } else if (code < 0x800) {
            bytes += 2;
        } else if (code >= 0xd800 && code <= 0xdbff && i + 1 < text.length) {
            bytes += 4;
            i++;
        } else {
            bytes += 3;
        }
    }
    return bytes;
}

/** UTF-8 text to base64url, without padding. Throws on a lone surrogate. */
export function toBase64Url(text: string): string {
    const binary = encodeURIComponent(text).replace(/%([0-9A-F]{2})/g, (_match, hex: string) => String.fromCharCode(parseInt(hex, 16)));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** The reverse of `toBase64Url()`. Returns `null` for anything that is not valid base64url UTF-8. */
export function fromBase64Url(encoded: string): string | null {
    try {
        if (!/^[A-Za-z0-9_-]*$/.test(encoded)) return null;
        const padded = encoded.replace(/-/g, '+').replace(/_/g, '/');
        const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
        const percent = Array.from(binary, char => `%${char.charCodeAt(0).toString(16).padStart(2, '0')}`).join('');
        return decodeURIComponent(percent);
    } catch {
        return null;
    }
}

/** Escapes text for HTML content and double-quoted attribute values. */
export function escapeHtml(text: string): string {
    return text
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}
