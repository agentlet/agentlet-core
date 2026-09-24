/**
 * Escapes `text` for safe insertion as HTML content, by round-tripping it
 * through a detached element's `textContent`/`innerHTML`. Note this only
 * escapes what a text node needs (`&`, `<`, `>`); quote characters are
 * left untouched, since they only need escaping inside attribute values.
 */
export function escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
