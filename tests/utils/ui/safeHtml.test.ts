import { escapeHtml, sanitizeUrl } from '../../../src/utils/ui/safeHtml.js';

describe('escapeHtml()', () => {
    test('escapes the five characters that matter in text and attribute values', () => {
        expect(escapeHtml('<a href="x" title=\'y\'>&</a>')).toBe(
            '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;'
        );
    });

    test('escapes ampersands first so existing entities are not interpreted', () => {
        expect(escapeHtml('&lt;b&gt;')).toBe('&amp;lt;b&amp;gt;');
    });

    test('coerces non-string values', () => {
        expect(escapeHtml(42)).toBe('42');
        expect(escapeHtml(null)).toBe('null');
    });
});

describe('sanitizeUrl()', () => {
    test.each([
        'https://example.com/a.png',
        'http://example.com/a.png?x=1&y=2',
        'HTTPS://EXAMPLE.COM/',
        '/images/a.png',
        'images/a.png',
        './a.png',
        '../a.png',
        '//cdn.example.com/a.png',
        '#fragment',
        '?q=1'
    ])('accepts %s', (url) => {
        expect(sanitizeUrl(url)).toBe(url);
    });

    test.each([
        'javascript:alert(1)',
        'JavaScript:alert(1)',
        '  javascript:alert(1)',
        'java\tscript:alert(1)',
        'java\nscript:alert(1)',
        '\u0001javascript:alert(1)',
        'vbscript:msgbox(1)',
        'data:text/html,<script>alert(1)</script>',
        'data:image',
        'blob:https://example.com/1234',
        'file:///etc/passwd',
        'ftp://example.com/a.png'
    ])('rejects %j', (url) => {
        expect(sanitizeUrl(url)).toBeNull();
        expect(sanitizeUrl(url, { allowDataImage: true })).toBeNull();
    });

    test('accepts data:image only when allowed', () => {
        const dataUrl = 'data:image/png;base64,iVBORw0KGgo=';
        expect(sanitizeUrl(dataUrl)).toBeNull();
        expect(sanitizeUrl(dataUrl, { allowDataImage: true })).toBe(dataUrl);
        expect(sanitizeUrl('data:image/svg+xml,%3Csvg/%3E', { allowDataImage: true })).toBe('data:image/svg+xml,%3Csvg/%3E');
    });

    test('rejects empty and non-string input', () => {
        expect(sanitizeUrl('')).toBeNull();
        expect(sanitizeUrl('   ')).toBeNull();
        expect(sanitizeUrl(undefined)).toBeNull();
        expect(sanitizeUrl(null)).toBeNull();
        expect(sanitizeUrl(42)).toBeNull();
    });

    test('trims surrounding whitespace', () => {
        expect(sanitizeUrl('  https://example.com/a.png \n')).toBe('https://example.com/a.png');
    });
});
