/**
 * Guards for the extension's least-privilege, no-remote-code design. These
 * read the extension sources and the manifest; they do not run a browser.
 */
const fs = require('fs');
const path = require('path');

const extensionDir = path.join(__dirname, '..', '..', 'extension');

function listFiles(dir) {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const full = path.join(dir, entry.name);
        return entry.isDirectory() ? listFiles(full) : [full];
    });
}

const manifest = JSON.parse(fs.readFileSync(path.join(extensionDir, 'manifest.json'), 'utf8'));
const sourceFiles = listFiles(extensionDir).filter((f) => /\.(js|html)$/.test(f));

describe('extension manifest', () => {
    test('requests only activeTab, scripting and storage', () => {
        expect([...manifest.permissions].sort()).toEqual(['activeTab', 'scripting', 'storage']);
        expect(manifest.optional_permissions).toBeUndefined();
    });

    test('has no host access, no content scripts and no web accessible resources', () => {
        expect(manifest.host_permissions).toBeUndefined();
        expect(manifest.optional_host_permissions).toBeUndefined();
        expect(manifest.content_scripts).toBeUndefined();
        expect(manifest.web_accessible_resources).toBeUndefined();
        expect(manifest.externally_connectable).toBeUndefined();
    });

    test('keeps a strict content security policy for extension pages', () => {
        expect(manifest.content_security_policy.extension_pages).toBe("script-src 'self'; object-src 'self'");
    });

    test('only references files that exist in the extension folder', () => {
        const referenced = [
            manifest.background.service_worker,
            manifest.action.default_popup,
            manifest.options_page,
            ...Object.values(manifest.icons),
            ...Object.values(manifest.action.default_icon)
        ];
        for (const file of referenced) {
            expect(fs.existsSync(path.join(extensionDir, file))).toBe(true);
        }
    });

    test('ships no content script or test module files', () => {
        expect(fs.existsSync(path.join(extensionDir, 'content.js'))).toBe(false);
        expect(fs.existsSync(path.join(extensionDir, 'modules', 'simple-test-module.js'))).toBe(false);
    });
});

describe('extension sources', () => {
    const forbidden = [
        ['fetch(', /\bfetch\s*\(/],
        ['XMLHttpRequest', /\bXMLHttpRequest\b/],
        ['new Function', /\bnew\s+Function\b/],
        ['Function(', /(^|[^A-Za-z0-9_.])Function\s*\(/],
        ['eval(', /(^|[^A-Za-z0-9_.])eval\s*\(/],
        ['importScripts(', /\bimportScripts\s*\(/],
        ['dynamic import()', /(^|[^A-Za-z0-9_.])import\s*\(/],
        ['createElement script', /createElement\(\s*['"`]script['"`]\s*\)/],
        ['remote import', /\bimport\b[^;\n]*from\s*['"]https?:/],
        ['remote script tag', /<script[^>]+src\s*=\s*['"]?(https?:)?\/\//i],
        ['javascript: url', /javascript:/i]
    ];

    test('finds the extension files to scan', () => {
        const names = sourceFiles.map((f) => path.relative(extensionDir, f));
        expect(names).toEqual(expect.arrayContaining(['background.js', 'bootstrap.js', 'popup.js', 'options.js']));
    });

    test.each(forbidden)('contains no %s', (label, pattern) => {
        const offenders = sourceFiles.filter((file) => pattern.test(fs.readFileSync(file, 'utf8')));
        expect(offenders.map((f) => path.relative(extensionDir, f))).toEqual([]);
    });

    test('the build lists module files explicitly', () => {
        const list = fs.readFileSync(path.join(extensionDir, 'bundled-modules.js'), 'utf8');
        expect(list).toMatch(/export const BUNDLED_MODULES = \[[^\]]*\];/);
    });
});
