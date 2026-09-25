/**
 * Characterization tests for LibraryLoader.
 *
 * These tests pin down the CURRENT behaviour of
 * `src/libraries/LibraryLoader.js` (registry-based dynamic script loading,
 * URL resolution, in-flight-load deduplication, and the `window.*` globals
 * it reads/writes) before it is converted to `LibraryLoader.ts`. Nothing
 * here should change when the conversion lands - if an assertion needs to
 * change, the conversion changed behaviour and that is a bug in the
 * conversion, not in this file.
 *
 * The global Jest setup (`tests/setup.js`) replaces `document.createElement`
 * with a bare-bones mock and shadows `document.head` with a mock object
 * that isn't part of the live document tree. `loadScript()` needs a real
 * script element (so `onload`/`onerror` handlers can be invoked directly,
 * the same way jsdom itself never performs the actual network fetch) and a
 * real `document.head`, so this file restores the genuine jsdom
 * implementations before any test runs, following the same pattern as
 * `ScriptInjector.test.ts`.
 */

import LibraryLoader from '../../src/libraries/LibraryLoader.js';

/** Minimal shape of the constructor config `LibraryLoader` reads. */
interface LibraryRegistryConfigStub {
    libraries?: Record<string, string>;
    baseUrl?: string;
}

/** The full instance surface this file exercises. */
interface LibraryLoaderInstance {
    libraries: Record<string, string>;
    loadedLibraries: Set<string>;
    loadingPromises: Map<string, Promise<boolean>>;
    baseUrl: string;
    loadLibrary(name: string): Promise<boolean>;
    isLibraryLoaded(name: string): boolean;
    getLibraryUrl(name: string): string | null;
    loadScript(url: string): Promise<void>;
    setupLibraryGlobals(name: string): void;
    loadLibraries(names: string[]): Promise<boolean[]>;
    getLoadingStatus(): Record<string, { configured: boolean; loaded: boolean; loading: boolean; url: string | null }>;
    ensureLibrary(name: string): Promise<boolean>;
    isLoading(): boolean;
    getLoadedLibraries(): string[];
}

const TypedLibraryLoader = LibraryLoader as unknown as new (registryConfig?: LibraryRegistryConfigStub) => LibraryLoaderInstance;

function makeLoader(registryConfig?: LibraryRegistryConfigStub): LibraryLoaderInstance {
    return new TypedLibraryLoader(registryConfig);
}

/** Window-global surface LibraryLoader reads/writes for library availability. */
type LibraryGlobals = {
    XLSX?: unknown;
    html2canvas?: unknown;
    pdfjsLib?: { GlobalWorkerOptions: { workerSrc: string; verbosity?: number } };
    hotkeys?: unknown;
};

function windowGlobals(): LibraryGlobals {
    return window as unknown as LibraryGlobals;
}

function clearLibraryGlobals(): void {
    const globals = windowGlobals();
    delete globals.XLSX;
    delete globals.html2canvas;
    delete globals.pdfjsLib;
    delete globals.hotkeys;
}

/** Finds the `<script>` element `loadScript()` just appended to `document.head`. */
function findInjectedScript(url: string): HTMLScriptElement | null {
    return document.head.querySelector<HTMLScriptElement>(`script[src="${url}"]`);
}

describe('LibraryLoader characterization', () => {
    beforeAll(() => {
        // Undo tests/setup.js's global document.createElement mock and
        // document.head shadow so loadScript() gets a real DOM to build into.
        document.createElement = Document.prototype.createElement.bind(document);
        const realHead = document.querySelector('head') ?? document.getElementsByTagName('head')[0];
        Object.defineProperty(document, 'head', {
            value: realHead,
            writable: true,
            configurable: true
        });
    });

    afterEach(() => {
        clearLibraryGlobals();
        document.head.innerHTML = '';
    });

    describe('constructor', () => {
        test('defaults libraries to {} and baseUrl to "" when no config is given', () => {
            const loader = makeLoader();
            expect(loader.libraries).toEqual({});
            expect(loader.baseUrl).toBe('');
            expect(loader.loadedLibraries.size).toBe(0);
            expect(loader.loadingPromises.size).toBe(0);
        });

        test('reads libraries and baseUrl from the provided registry config', () => {
            const loader = makeLoader({ libraries: { xlsx: './xlsx.js' }, baseUrl: 'https://cdn.example.com/static' });
            expect(loader.libraries).toEqual({ xlsx: './xlsx.js' });
            expect(loader.baseUrl).toBe('https://cdn.example.com/static');
        });
    });

    describe('isLibraryLoaded', () => {
        test.each([
            ['xlsx', 'XLSX', {}],
            ['html2canvas', 'html2canvas', () => {}],
            ['pdfjs', 'pdfjsLib', { GlobalWorkerOptions: { workerSrc: '' } }],
            ['hotkeys', 'hotkeys', () => {}]
        ] as const)('for "%s", tracks the window.%s global directly rather than loadedLibraries', (name, globalKey, value) => {
            const loader = makeLoader();
            expect(loader.isLibraryLoaded(name)).toBe(false);

            (windowGlobals() as unknown as Record<string, unknown>)[globalKey] = value;
            expect(loader.isLibraryLoaded(name)).toBe(true);
        });

        test('falls back to the internal loadedLibraries set for an unrecognised name', () => {
            const loader = makeLoader();
            expect(loader.isLibraryLoaded('some-custom-lib')).toBe(false);
            loader.loadedLibraries.add('some-custom-lib');
            expect(loader.isLibraryLoaded('some-custom-lib')).toBe(true);
        });
    });

    describe('getLibraryUrl', () => {
        test('returns null when the library is not configured', () => {
            const loader = makeLoader({ libraries: {} });
            expect(loader.getLibraryUrl('xlsx')).toBeNull();
        });

        test('returns an absolute http(s) or root-relative URL unchanged', () => {
            const loader = makeLoader({
                libraries: { xlsx: 'https://cdn.example.com/xlsx.js', hotkeys: '/static/hotkeys.js' }
            });
            expect(loader.getLibraryUrl('xlsx')).toBe('https://cdn.example.com/xlsx.js');
            expect(loader.getLibraryUrl('hotkeys')).toBe('/static/hotkeys.js');
        });

        test('prefixes a "./"-relative URL with baseUrl, dropping only the leading dot', () => {
            const loader = makeLoader({
                libraries: { xlsx: './xlsx.js' },
                baseUrl: 'https://cdn.example.com/static'
            });
            // './xlsx.js'.substring(1) === '/xlsx.js'
            expect(loader.getLibraryUrl('xlsx')).toBe('https://cdn.example.com/static/xlsx.js');
        });

        test('quirk: a "../"-relative URL also only has its leading dot stripped, not resolved up a directory', () => {
            const loader = makeLoader({
                libraries: { xlsx: '../xlsx.js' },
                baseUrl: 'https://cdn.example.com/static'
            });
            // '../xlsx.js'.substring(1) === './xlsx.js' (string slicing, not path resolution)
            expect(loader.getLibraryUrl('xlsx')).toBe('https://cdn.example.com/static./xlsx.js');
        });
    });

    describe('loadScript', () => {
        test('resolves immediately if a script with the same src already exists', async () => {
            const existing = document.createElement('script');
            existing.src = 'https://cdn.example.com/already-loaded.js';
            document.head.appendChild(existing);

            const loader = makeLoader();
            await expect(loader.loadScript('https://cdn.example.com/already-loaded.js')).resolves.toBeUndefined();
            // No second <script> tag was appended for the duplicate URL.
            expect(document.head.querySelectorAll('script[src="https://cdn.example.com/already-loaded.js"]').length).toBe(1);
        });

        test('appends a <script> with the expected attributes', async () => {
            const loader = makeLoader();
            const promise = loader.loadScript('https://cdn.example.com/lib.js');

            const script = findInjectedScript('https://cdn.example.com/lib.js');
            expect(script).not.toBeNull();
            expect(script?.type).toBe('text/javascript');
            expect(script?.crossOrigin).toBe('anonymous');

            script?.onload?.(new Event('load'));
            await expect(promise).resolves.toBeUndefined();
        });

        test('rejects and removes the script element when it fails to load', async () => {
            const loader = makeLoader();
            const promise = loader.loadScript('https://cdn.example.com/broken.js');

            const script = findInjectedScript('https://cdn.example.com/broken.js');
            expect(script).not.toBeNull();

            script?.onerror?.(new Event('error'));

            await expect(promise).rejects.toThrow('Failed to load script: https://cdn.example.com/broken.js');
            expect(findInjectedScript('https://cdn.example.com/broken.js')).toBeNull();
        });
    });

    describe('setupLibraryGlobals', () => {
        test('configures pdfjsLib GlobalWorkerOptions when workerSrc is not already set', () => {
            windowGlobals().pdfjsLib = { GlobalWorkerOptions: { workerSrc: '' } };
            const loader = makeLoader({ libraries: { 'pdfjs-worker': 'https://cdn.example.com/pdf.worker.js' } });

            loader.setupLibraryGlobals('pdfjs');

            expect(windowGlobals().pdfjsLib?.GlobalWorkerOptions.workerSrc).toBe('https://cdn.example.com/pdf.worker.js');
            expect(windowGlobals().pdfjsLib?.GlobalWorkerOptions.verbosity).toBe(0);
        });

        test('falls back to "./pdf.worker.min.js" when no pdfjs-worker URL is registered', () => {
            windowGlobals().pdfjsLib = { GlobalWorkerOptions: { workerSrc: '' } };
            const loader = makeLoader();

            loader.setupLibraryGlobals('pdfjs');

            expect(windowGlobals().pdfjsLib?.GlobalWorkerOptions.workerSrc).toBe('./pdf.worker.min.js');
        });

        test('does not overwrite an already-configured workerSrc', () => {
            windowGlobals().pdfjsLib = { GlobalWorkerOptions: { workerSrc: 'https://existing.example.com/worker.js' } };
            const loader = makeLoader({ libraries: { 'pdfjs-worker': 'https://cdn.example.com/pdf.worker.js' } });

            loader.setupLibraryGlobals('pdfjs');

            expect(windowGlobals().pdfjsLib?.GlobalWorkerOptions.workerSrc).toBe('https://existing.example.com/worker.js');
        });

        test('is a no-op for a library name with no special setup (e.g. "xlsx")', () => {
            expect(() => makeLoader().setupLibraryGlobals('xlsx')).not.toThrow();
        });
    });

    describe('loadLibrary', () => {
        test('throws when the library is not configured in the registry', async () => {
            const loader = makeLoader({ libraries: {} });
            await expect(loader.loadLibrary('xlsx')).rejects.toThrow(
                'Library \'xlsx\' not configured in registry. Add it to agentlets-registry.json libraries section.'
            );
        });

        test('resolves true immediately without touching the DOM when already loaded', async () => {
            windowGlobals().XLSX = {};
            const loader = makeLoader({ libraries: { xlsx: 'https://cdn.example.com/xlsx.js' } });

            await expect(loader.loadLibrary('xlsx')).resolves.toBe(true);
            expect(document.head.querySelectorAll('script').length).toBe(0);
        });

        test('loads the script, marks the library loaded, resolves true, and clears the in-flight promise', async () => {
            const loader = makeLoader({ libraries: { xlsx: 'https://cdn.example.com/xlsx.js' } });
            const promise = loader.loadLibrary('xlsx');
            expect(loader.loadingPromises.has('xlsx')).toBe(true);

            const script = findInjectedScript('https://cdn.example.com/xlsx.js');
            script?.onload?.(new Event('load'));

            await expect(promise).resolves.toBe(true);
            expect(loader.loadedLibraries.has('xlsx')).toBe(true);
            expect(loader.loadingPromises.has('xlsx')).toBe(false);
        });

        test('wraps a script-load failure in a descriptive error and does not mark it loaded', async () => {
            const loader = makeLoader({ libraries: { xlsx: 'https://cdn.example.com/xlsx.js' } });
            const promise = loader.loadLibrary('xlsx');

            const script = findInjectedScript('https://cdn.example.com/xlsx.js');
            script?.onerror?.(new Event('error'));

            await expect(promise).rejects.toThrow(
                'Failed to load library \'xlsx\' from https://cdn.example.com/xlsx.js. Check that the file exists and is accessible.'
            );
            expect(loader.loadedLibraries.has('xlsx')).toBe(false);
        });

        test('deduplicates concurrent loads of the same library into a single script tag', async () => {
            const loader = makeLoader({ libraries: { xlsx: 'https://cdn.example.com/xlsx.js' } });

            const first = loader.loadLibrary('xlsx');
            const second = loader.loadLibrary('xlsx');

            expect(document.head.querySelectorAll('script[src="https://cdn.example.com/xlsx.js"]').length).toBe(1);

            const script = findInjectedScript('https://cdn.example.com/xlsx.js');
            script?.onload?.(new Event('load'));

            await expect(first).resolves.toBe(true);
            await expect(second).resolves.toBe(true);
        });

    });

    describe('loadLibraries', () => {
        test('loads every named library in parallel and resolves an array of statuses', async () => {
            const loader = makeLoader({
                libraries: {
                    xlsx: 'https://cdn.example.com/xlsx.js',
                    hotkeys: 'https://cdn.example.com/hotkeys.js'
                }
            });

            const promise = loader.loadLibraries(['xlsx', 'hotkeys']);

            findInjectedScript('https://cdn.example.com/xlsx.js')?.onload?.(new Event('load'));
            findInjectedScript('https://cdn.example.com/hotkeys.js')?.onload?.(new Event('load'));

            await expect(promise).resolves.toEqual([true, true]);
        });
    });

    describe('getLoadingStatus', () => {
        test('reports one entry per configured library with its configured/loaded/loading/url state', async () => {
            const loader = makeLoader({
                libraries: {
                    xlsx: 'https://cdn.example.com/xlsx.js',
                    hotkeys: 'https://cdn.example.com/hotkeys.js'
                }
            });
            windowGlobals().hotkeys = () => {};

            const promise = loader.loadLibrary('xlsx');
            const status = loader.getLoadingStatus();

            expect(status).toEqual({
                xlsx: { configured: true, loaded: false, loading: true, url: 'https://cdn.example.com/xlsx.js' },
                hotkeys: { configured: true, loaded: true, loading: false, url: 'https://cdn.example.com/hotkeys.js' }
            });

            findInjectedScript('https://cdn.example.com/xlsx.js')?.onload?.(new Event('load'));
            await promise;
        });
    });

    describe('ensureLibrary', () => {
        test('resolves true without loading when already available', async () => {
            windowGlobals().XLSX = {};
            const loader = makeLoader({ libraries: { xlsx: 'https://cdn.example.com/xlsx.js' } });

            await expect(loader.ensureLibrary('xlsx')).resolves.toBe(true);
            expect(document.head.querySelectorAll('script').length).toBe(0);
        });

        test('delegates to loadLibrary when not yet available', async () => {
            const loader = makeLoader({ libraries: { xlsx: 'https://cdn.example.com/xlsx.js' } });
            const promise = loader.ensureLibrary('xlsx');

            findInjectedScript('https://cdn.example.com/xlsx.js')?.onload?.(new Event('load'));

            await expect(promise).resolves.toBe(true);
        });
    });

    describe('isLoading', () => {
        test('is false when nothing is loading', () => {
            expect(makeLoader().isLoading()).toBe(false);
        });

        test('is true while a load is in flight and false again once it settles', async () => {
            const loader = makeLoader({ libraries: { xlsx: 'https://cdn.example.com/xlsx.js' } });
            const promise = loader.loadLibrary('xlsx');
            expect(loader.isLoading()).toBe(true);

            findInjectedScript('https://cdn.example.com/xlsx.js')?.onload?.(new Event('load'));
            await promise;

            expect(loader.isLoading()).toBe(false);
        });
    });

    describe('getLoadedLibraries', () => {
        test('quirk: returns [] when nothing is loaded, and adding a recognised name (e.g. "xlsx") to loadedLibraries does not make it count either, since isLibraryLoaded checks window.XLSX for that name instead', () => {
            const loader = makeLoader({ libraries: { xlsx: 'https://cdn.example.com/xlsx.js' } });
            expect(loader.getLoadedLibraries()).toEqual([]);

            loader.loadedLibraries.add('xlsx');
            expect(loader.getLoadedLibraries()).toEqual([]);
        });

        test('only reports configured library names, even if loadedLibraries has an unconfigured one', () => {
            const loader = makeLoader({ libraries: { 'custom-lib': 'https://cdn.example.com/custom.js' } });
            loader.loadedLibraries.add('custom-lib');
            loader.loadedLibraries.add('some-unconfigured-lib');

            expect(loader.getLoadedLibraries()).toEqual(['custom-lib']);
        });

        test('reflects a library made available via its window global rather than loadedLibraries', () => {
            windowGlobals().XLSX = {};
            const loader = makeLoader({ libraries: { xlsx: 'https://cdn.example.com/xlsx.js' } });
            expect(loader.getLoadedLibraries()).toEqual(['xlsx']);
        });
    });
});
