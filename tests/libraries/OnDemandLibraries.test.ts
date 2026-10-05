/**
 * On-demand loading of SheetJS, html2canvas and pdf.js in the script builds
 * (where nothing is embedded): LibrarySetup resolves a chunk URL, loads it
 * with a script tag once, shares one load between concurrent callers, and
 * surfaces a clear error when the file cannot be loaded.
 *
 * Like LibraryLoader.test.ts, the real jsdom createElement/head are restored
 * (tests/setup.js mocks both) so the injected `<script>` is a real element
 * whose `onload`/`onerror` the tests call in place of a network fetch.
 */

import { LibrarySetup } from '../../src/libraries/LibrarySetup.js';

const BASE = 'https://cdn.example.com/agentlet/';

type LibraryGlobals = {
    XLSX?: unknown;
    html2canvas?: unknown;
    pdfjsLib?: { GlobalWorkerOptions: { workerSrc: string } };
};

function globals(): LibraryGlobals {
    return window as unknown as LibraryGlobals;
}

function scriptsFor(url: string): HTMLScriptElement[] {
    return Array.from(document.head.querySelectorAll<HTMLScriptElement>(`script[src="${url}"]`));
}

function lastScript(): HTMLScriptElement {
    const scripts = document.head.querySelectorAll<HTMLScriptElement>('script');
    return scripts[scripts.length - 1];
}

/** Lets pending promise callbacks run so the script element exists before the test drives it. */
async function flush(): Promise<void> {
    for (let i = 0; i < 5; i++) {
        await Promise.resolve();
    }
}

function succeed(script: HTMLScriptElement, define: () => void): void {
    define();
    (script.onload as (() => void) | null)?.();
}

function fail(script: HTMLScriptElement): void {
    (script.onerror as ((event: unknown) => void) | null)?.(new Event('error'));
}

describe('on-demand libraries (script builds)', () => {
    beforeAll(() => {
        document.createElement = Document.prototype.createElement.bind(document);
        const realHead = document.querySelector('head') ?? document.getElementsByTagName('head')[0];
        Object.defineProperty(document, 'head', { value: realHead, writable: true, configurable: true });
    });

    beforeEach(() => {
        // Keeps getCoreScriptUrl() from finding anything in the jsdom document.
        jest.spyOn(document, 'querySelectorAll').mockImplementation(
            ((selector: string) => document.head.querySelectorAll(selector)) as typeof document.querySelectorAll
        );
    });

    afterEach(() => {
        jest.restoreAllMocks();
        delete globals().XLSX;
        delete globals().html2canvas;
        delete globals().pdfjsLib;
        document.head.innerHTML = '';
    });

    describe('loading', () => {
        test('loads the chunk next to libraryBaseUrl on first use, as a plain script tag', async () => {
            const setup = new LibrarySetup({ libraryBaseUrl: BASE });
            expect(setup.isLibraryAvailable('xlsx')).toBe(false);

            const pending = setup.ensureLibrary('xlsx');
            await flush();

            const script = lastScript();
            expect(script.src).toBe(`${BASE}agentlet-xlsx.min.js`);
            // No crossorigin attribute: a CDN without CORS headers must still work.
            expect(script.hasAttribute('crossorigin')).toBe(false);

            succeed(script, () => { globals().XLSX = { utils: {} }; });
            await expect(pending).resolves.toBe(true);
            expect(setup.isLibraryAvailable('xlsx')).toBe(true);
        });

        test.each([
            ['xlsx', 'agentlet-xlsx.min.js', 'XLSX'],
            ['html2canvas', 'agentlet-html2canvas.min.js', 'html2canvas'],
            ['pdfjs', 'agentlet-pdfjs.min.js', 'pdfjsLib']
        ] as const)('uses the %s chunk file name %s', async (name, file, globalKey) => {
            const setup = new LibrarySetup({ libraryBaseUrl: BASE });
            const pending = setup.ensureLibrary(name);
            await flush();

            const script = lastScript();
            expect(script.src).toBe(`${BASE}${file}`);
            succeed(script, () => {
                (globals() as Record<string, unknown>)[globalKey] = globalKey === 'pdfjsLib' ? { GlobalWorkerOptions: { workerSrc: '' } } : {};
            });
            await expect(pending).resolves.toBe(true);
        });

        test('loads once: a second call after the load adds no script', async () => {
            const setup = new LibrarySetup({ libraryBaseUrl: BASE });
            const first = setup.ensureLibrary('xlsx');
            await flush();
            succeed(lastScript(), () => { globals().XLSX = {}; });
            await first;

            await expect(setup.ensureLibrary('xlsx')).resolves.toBe(true);
            await expect(setup.loadLibrary('xlsx')).resolves.toBe(true);
            expect(scriptsFor(`${BASE}agentlet-xlsx.min.js`)).toHaveLength(1);
        });

        test('concurrent calls share one load', async () => {
            const setup = new LibrarySetup({ libraryBaseUrl: BASE });
            const calls = [setup.ensureLibrary('xlsx'), setup.ensureLibrary('xlsx'), setup.loadLibrary('xlsx')];
            await flush();

            expect(scriptsFor(`${BASE}agentlet-xlsx.min.js`)).toHaveLength(1);
            succeed(lastScript(), () => { globals().XLSX = {}; });
            await expect(Promise.all(calls)).resolves.toEqual([true, true, true]);
        });

        test('different libraries load independently', async () => {
            const setup = new LibrarySetup({ libraryBaseUrl: BASE });
            const xlsx = setup.ensureLibrary('xlsx');
            const canvas = setup.ensureLibrary('html2canvas');
            await flush();

            expect(scriptsFor(`${BASE}agentlet-xlsx.min.js`)).toHaveLength(1);
            expect(scriptsFor(`${BASE}agentlet-html2canvas.min.js`)).toHaveLength(1);

            succeed(scriptsFor(`${BASE}agentlet-xlsx.min.js`)[0], () => { globals().XLSX = {}; });
            succeed(scriptsFor(`${BASE}agentlet-html2canvas.min.js`)[0], () => { globals().html2canvas = () => {}; });
            await expect(Promise.all([xlsx, canvas])).resolves.toEqual([true, true]);
        });

        test('does not load a library the host page already provides', async () => {
            globals().XLSX = { utils: {} };
            const setup = new LibrarySetup({ libraryBaseUrl: BASE });

            await expect(setup.ensureLibrary('xlsx')).resolves.toBe(true);
            expect(document.head.querySelectorAll('script')).toHaveLength(0);
        });

        test('resolves false for libraries that are not loaded on demand', async () => {
            const setup = new LibrarySetup({ libraryBaseUrl: BASE });
            await expect(setup.ensureLibrary('hotkeys')).resolves.toBe(false);
            await expect(setup.ensureLibrary('unknown-lib')).resolves.toBe(false);
            expect(document.head.querySelectorAll('script')).toHaveLength(0);
        });
    });

    describe('failure', () => {
        test('rejects with the URL and the option that changes it when the file cannot be loaded', async () => {
            const setup = new LibrarySetup({ libraryBaseUrl: BASE });
            const pending = setup.ensureLibrary('xlsx');
            await flush();
            fail(lastScript());

            await expect(pending).rejects.toThrow(`Failed to load library 'xlsx' from ${BASE}agentlet-xlsx.min.js`);
            await expect(pending).rejects.toThrow('libraryBaseUrl');
            expect(setup.isLibraryAvailable('xlsx')).toBe(false);
        });

        test('a failed load is not cached: the next call tries again', async () => {
            const setup = new LibrarySetup({ libraryBaseUrl: BASE });
            const first = setup.ensureLibrary('xlsx');
            await flush();
            fail(lastScript());
            await expect(first).rejects.toThrow('Failed to load library');

            const second = setup.ensureLibrary('xlsx');
            await flush();
            expect(scriptsFor(`${BASE}agentlet-xlsx.min.js`)).toHaveLength(1);
            succeed(lastScript(), () => { globals().XLSX = {}; });
            await expect(second).resolves.toBe(true);
        });

        test('rejects when the script ran but did not define its global (a wrong file)', async () => {
            const setup = new LibrarySetup({ libraryBaseUrl: BASE });
            const pending = setup.ensureLibrary('html2canvas');
            await flush();
            succeed(lastScript(), () => {});

            await expect(pending).rejects.toThrow(/did not define its global/);
        });

        test('rejects with how to configure a location when none can be determined', async () => {
            const setup = new LibrarySetup({});
            await expect(setup.ensureLibrary('pdfjs')).rejects.toThrow(/libraryBaseUrl/);
            await expect(setup.ensureLibrary('pdfjs')).rejects.toThrow('agentlet-pdfjs.min.js');
            expect(document.head.querySelectorAll('script')).toHaveLength(0);
        });
    });

    describe('URL resolution and override', () => {
        test('libraryUrls points one library at an explicit file', async () => {
            const setup = new LibrarySetup({ libraryBaseUrl: BASE, libraryUrls: { xlsx: 'https://mirror.example.com/sheetjs.js' } });
            const pending = setup.ensureLibrary('xlsx');
            await flush();

            expect(lastScript().src).toBe('https://mirror.example.com/sheetjs.js');
            succeed(lastScript(), () => { globals().XLSX = {}; });
            await pending;
        });

        test('follows the folder of the core script when no libraryBaseUrl is set', async () => {
            (document.querySelectorAll as jest.Mock).mockReturnValue([{ src: 'https://cdn.example.com/v3/agentlet-core.min.js' }]);
            const setup = new LibrarySetup({});
            const pending = setup.ensureLibrary('xlsx');
            await flush();

            expect(lastScript().src).toBe('https://cdn.example.com/v3/agentlet-xlsx.min.js');
            succeed(lastScript(), () => { globals().XLSX = {}; });
            await pending;
        });

        test('canLoadLibrary is true for an on-demand library with a known location, false otherwise', () => {
            expect(new LibrarySetup({ libraryBaseUrl: BASE }).canLoadLibrary('xlsx')).toBe(true);
            expect(new LibrarySetup({ libraryBaseUrl: BASE }).canLoadLibrary('hotkeys')).toBe(false);
            expect(new LibrarySetup({}).canLoadLibrary('xlsx')).toBe(false);

            globals().XLSX = {};
            expect(new LibrarySetup({}).canLoadLibrary('xlsx')).toBe(true);
        });
    });

    describe('PDF.js worker, character maps and standard fonts', () => {
        async function loadPdfjs(setup: LibrarySetup): Promise<void> {
            const pending = setup.ensureLibrary('pdfjs');
            await flush();
            succeed(lastScript(), () => { globals().pdfjsLib = { GlobalWorkerOptions: { workerSrc: '' } }; });
            await pending;
        }

        test('points the worker next to the chunk once pdf.js has loaded', async () => {
            await loadPdfjs(new LibrarySetup({ libraryBaseUrl: BASE }));
            expect(globals().pdfjsLib?.GlobalWorkerOptions.workerSrc).toBe(`${BASE}pdf.worker.min.mjs`);
        });

        test('pdfWorkerUrl overrides the worker location', async () => {
            await loadPdfjs(new LibrarySetup({ libraryBaseUrl: BASE, pdfWorkerUrl: 'https://static.example.com/w.mjs' }));
            expect(globals().pdfjsLib?.GlobalWorkerOptions.workerSrc).toBe('https://static.example.com/w.mjs');
        });

        test('getPDFAssetUrls resolves cmaps/ and standard_fonts/ next to the worker, absolute, with a trailing slash', () => {
            expect(new LibrarySetup({ libraryBaseUrl: BASE }).getPDFAssetUrls()).toEqual({
                cMapUrl: `${BASE}cmaps/`,
                standardFontDataUrl: `${BASE}standard_fonts/`
            });
        });

        test('pdfCMapUrl and pdfStandardFontsUrl override each folder', () => {
            const setup = new LibrarySetup({
                libraryBaseUrl: BASE,
                pdfCMapUrl: 'https://static.example.com/maps',
                pdfStandardFontsUrl: '/fonts/'
            });
            expect(setup.getPDFAssetUrls()).toEqual({
                cMapUrl: 'https://static.example.com/maps/',
                standardFontDataUrl: `${window.location.origin}/fonts/`
            });
        });

        test('getPDFAssetUrls is undefined, never a third-party URL, when no location is known', () => {
            expect(new LibrarySetup({}).getPDFAssetUrls()).toEqual({ cMapUrl: undefined, standardFontDataUrl: undefined });
        });
    });

    describe('preloadLibraries', () => {
        test('loads the requested libraries during the call', async () => {
            const setup = new LibrarySetup({ libraryBaseUrl: BASE });
            const done = setup.preloadLibraries(['xlsx']);
            await flush();

            succeed(lastScript(), () => { globals().XLSX = {}; });
            await done;
            expect(setup.isLibraryAvailable('xlsx')).toBe(true);
        });

        test('uses the preloadLibraries config by default, and loads nothing when it is not set', async () => {
            await new LibrarySetup({ libraryBaseUrl: BASE }).preloadLibraries();
            expect(document.head.querySelectorAll('script')).toHaveLength(0);

            const setup = new LibrarySetup({ libraryBaseUrl: BASE, preloadLibraries: ['html2canvas'] });
            const done = setup.preloadLibraries();
            await flush();
            expect(lastScript().src).toBe(`${BASE}agentlet-html2canvas.min.js`);
            succeed(lastScript(), () => { globals().html2canvas = () => {}; });
            await done;
        });

        test('never rejects: a failed load is logged and surfaces again on use', async () => {
            const setup = new LibrarySetup({ libraryBaseUrl: BASE });
            const done = setup.preloadLibraries(['xlsx']);
            await flush();
            fail(lastScript());

            await expect(done).resolves.toBeUndefined();
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Could not preload library 'xlsx'"), expect.stringContaining('Failed to load library'));
        });

        test('warns about an unknown library name', async () => {
            await new LibrarySetup({ libraryBaseUrl: BASE }).preloadLibraries(['nope']);
            expect(console.warn).toHaveBeenCalledWith(expect.stringContaining("Cannot preload unknown library 'nope'"));
        });
    });
});
