/**
 * Where the on-demand library files are fetched from: the order in which the
 * library folder is resolved (explicit config, core script URL, registry URL,
 * extension root) and the per-file overrides.
 */

import {
    getCoreScriptUrl,
    getLibraryBaseUrl,
    resolveLibraryChunkUrl,
    resolveLibraryFileUrl
} from '../../src/libraries/LibraryUrls.js';

type GlobalWithChrome = { chrome?: { runtime?: { getURL?: (path: string) => string } } };

/** Makes `document.querySelectorAll('script[src]')` report the given script URLs. */
function mockScriptTags(...urls: string[]): jest.SpyInstance {
    return jest.spyOn(document, 'querySelectorAll').mockReturnValue(
        urls.map(src => ({ src })) as unknown as NodeListOf<Element>
    );
}

describe('LibraryUrls', () => {
    afterEach(() => {
        jest.restoreAllMocks();
        delete (globalThis as GlobalWithChrome).chrome;
    });

    describe('getCoreScriptUrl', () => {
        test('is undefined when no script tag looks like a core build', () => {
            mockScriptTags('https://cdn.example.com/other.js', 'https://cdn.example.com/app.js');
            expect(getCoreScriptUrl()).toBeUndefined();
        });

        test.each([
            'agentlet-core.js',
            'agentlet-core.min.js',
            'agentlet-core.full.min.js',
            'agentlet-core.esm.js'
        ])('finds %s among the page scripts, ignoring a query string', (file) => {
            mockScriptTags('https://cdn.example.com/app.js', `https://cdn.example.com/v1/${file}?ts=1`);
            expect(getCoreScriptUrl()).toBe(`https://cdn.example.com/v1/${file}?ts=1`);
        });

        test('prefers the last matching script tag', () => {
            mockScriptTags('https://a.example.com/agentlet-core.js', 'https://b.example.com/agentlet-core.min.js');
            expect(getCoreScriptUrl()).toBe('https://b.example.com/agentlet-core.min.js');
        });
    });

    describe('entry script capture (evaluated when the bundle first runs)', () => {
        afterEach(() => {
            delete (globalThis as { __AGENTLET_MODULE_URL__?: string }).__AGENTLET_MODULE_URL__;
            Object.defineProperty(document, 'currentScript', { value: null, configurable: true });
        });

        function loadModuleFresh(): typeof import('../../src/libraries/LibraryUrls.js') {
            let loaded!: typeof import('../../src/libraries/LibraryUrls.js');
            jest.isolateModules(() => {
                loaded = require('../../src/libraries/LibraryUrls.js');
            });
            return loaded;
        }

        test('uses document.currentScript of a classic script', () => {
            const script = Document.prototype.createElement.call(document, 'script') as HTMLScriptElement;
            script.src = 'https://cdn.example.com/v2/agentlet-core.min.js';
            Object.defineProperty(document, 'currentScript', { value: script, configurable: true });

            expect(loadModuleFresh().getCoreScriptUrl()).toBe('https://cdn.example.com/v2/agentlet-core.min.js');
        });

        test('uses the module URL the ES module build injects', () => {
            (globalThis as { __AGENTLET_MODULE_URL__?: string }).__AGENTLET_MODULE_URL__ = 'https://cdn.example.com/esm/agentlet-core.esm.js';

            expect(loadModuleFresh().getCoreScriptUrl()).toBe('https://cdn.example.com/esm/agentlet-core.esm.js');
        });

        test('ignores a build-machine file: URL (a bundler rewrote import.meta.url) on a served page', () => {
            (globalThis as { __AGENTLET_MODULE_URL__?: string }).__AGENTLET_MODULE_URL__ = 'file:///home/dev/project/node_modules/agentlet-core/dist/agentlet-core.esm.js';
            mockScriptTags();

            expect(loadModuleFresh().getCoreScriptUrl()).toBeUndefined();
        });
    });

    describe('getLibraryBaseUrl', () => {
        test('libraryBaseUrl wins and gets a trailing slash', () => {
            mockScriptTags('https://cdn.example.com/v1/agentlet-core.min.js');
            expect(getLibraryBaseUrl({ libraryBaseUrl: 'https://static.example.com/agentlet' })).toBe('https://static.example.com/agentlet/');
        });

        test('resolves a relative libraryBaseUrl against the page', () => {
            expect(getLibraryBaseUrl({ libraryBaseUrl: '/assets/agentlet/' })).toBe(`${window.location.origin}/assets/agentlet/`);
        });

        test('falls back to the folder of the core script', () => {
            mockScriptTags('https://cdn.example.com/v1/agentlet-core.min.js?x=1');
            expect(getLibraryBaseUrl({ registryUrl: 'https://other.example.com/registry.js' })).toBe('https://cdn.example.com/v1/');
        });

        test('falls back to the folder of registryUrl when the core script URL is unknown', () => {
            mockScriptTags();
            expect(getLibraryBaseUrl({ registryUrl: 'https://other.example.com/static/agentlets-registry.js' })).toBe('https://other.example.com/static/');
        });

        test('resolves a relative registryUrl against the page', () => {
            mockScriptTags();
            expect(getLibraryBaseUrl({ registryUrl: '/cdn/v1/agentlets-registry.js' })).toBe(`${window.location.origin}/cdn/v1/`);
        });

        test('uses the extension root inside a browser extension', () => {
            mockScriptTags();
            (globalThis as GlobalWithChrome).chrome = { runtime: { getURL: (path: string) => `chrome-extension://abc/${path}` } };
            expect(getLibraryBaseUrl({})).toBe('chrome-extension://abc/');
        });

        test('is undefined when nothing identifies a location', () => {
            mockScriptTags();
            expect(getLibraryBaseUrl({})).toBeUndefined();
        });
    });

    describe('resolveLibraryFileUrl / resolveLibraryChunkUrl', () => {
        beforeEach(() => {
            mockScriptTags('https://cdn.example.com/v1/agentlet-core.min.js');
        });

        test('resolves files inside the library folder', () => {
            expect(resolveLibraryFileUrl('pdf.worker.min.mjs')).toBe('https://cdn.example.com/v1/pdf.worker.min.mjs');
            expect(resolveLibraryFileUrl('cmaps/', { libraryBaseUrl: 'https://static.example.com/lib/' })).toBe('https://static.example.com/lib/cmaps/');
        });

        test('names each chunk file next to the core', () => {
            expect(resolveLibraryChunkUrl('xlsx')).toBe('https://cdn.example.com/v1/agentlet-xlsx.min.js');
            expect(resolveLibraryChunkUrl('html2canvas')).toBe('https://cdn.example.com/v1/agentlet-html2canvas.min.js');
            expect(resolveLibraryChunkUrl('pdfjs')).toBe('https://cdn.example.com/v1/agentlet-pdfjs.min.js');
        });

        test('libraryUrls overrides a single chunk, the others keep following the folder', () => {
            const config = { libraryUrls: { xlsx: 'https://mirror.example.com/sheetjs.js' } };
            expect(resolveLibraryChunkUrl('xlsx', config)).toBe('https://mirror.example.com/sheetjs.js');
            expect(resolveLibraryChunkUrl('pdfjs', config)).toBe('https://cdn.example.com/v1/agentlet-pdfjs.min.js');
        });

        test('is undefined when the folder is unknown and there is no override', () => {
            mockScriptTags();
            expect(resolveLibraryChunkUrl('xlsx')).toBeUndefined();
            expect(resolveLibraryFileUrl('cmaps/')).toBeUndefined();
        });
    });
});
