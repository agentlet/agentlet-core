/**
 * Characterization tests for LibrarySetup.
 *
 * These tests pin down the CURRENT behaviour of
 * `src/libraries/LibrarySetup.js` (bundled-library wiring onto `window.*`,
 * PDF.js worker URL resolution, the bundled/registry `loadingMode` split,
 * and delegation to `LibraryLoader`) before it is converted to
 * `LibrarySetup.ts`. Nothing here should change when the conversion lands -
 * if an assertion needs to change, the conversion changed behaviour and
 * that is a bug in the conversion, not in this file.
 */

import { LibrarySetup } from '../../src/libraries/LibrarySetup.js';
import LibraryLoader from '../../src/libraries/LibraryLoader.js';

/** Minimal shape of the constructor config `LibrarySetup` reads. */
interface LibrarySetupConfigStub {
    loadingMode?: 'bundled' | 'registry';
    pdfWorkerUrl?: string;
    registryUrl?: string;
}

/** Minimal shape of the `ShortcutManager` instance `setupHotkeys`/`initializeAll` wire up. */
interface ShortcutManagerStub {
    init: jest.Mock;
}

/** The full instance surface this file exercises. */
interface LibrarySetupInstance {
    config: LibrarySetupConfigStub;
    libraryLoader: { loadLibrary(name: string): Promise<boolean> } | null;
    loadingMode: 'bundled' | 'registry';
    initializeRegistryLoader(registryConfig?: Record<string, unknown>): void;
    setupXLSX(xlsx: unknown): void;
    setupHTML2Canvas(html2canvas: unknown): void;
    setupPDFJS(pdfjsLib: { GlobalWorkerOptions: { workerSrc: string; verbosity?: number } }): void;
    configurePDFWorker(workerUrl: string): void;
    setupHotkeys(hotkeys: unknown, shortcutManager?: ShortcutManagerStub | null): void;
    initializeAll(libraries?: Record<string, unknown>, shortcutManager?: ShortcutManagerStub | null): void;
    getLibraryLoader(): { loadLibrary(name: string): Promise<boolean> } | null;
    loadLibrary(name: string): Promise<boolean>;
    isLibraryAvailable(name: string): boolean;
    ensureLibrary(name: string): Promise<boolean>;
}

const TypedLibrarySetup = LibrarySetup as unknown as new (config?: LibrarySetupConfigStub) => LibrarySetupInstance;

function makeSetup(config?: LibrarySetupConfigStub): LibrarySetupInstance {
    return new TypedLibrarySetup(config);
}

/** Window-global surface LibrarySetup reads/writes for library availability. */
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

describe('LibrarySetup characterization', () => {
    afterEach(() => {
        clearLibraryGlobals();
    });

    describe('setupXLSX', () => {
        test('assigns the module onto window.XLSX when not already present', () => {
            const setup = makeSetup();
            const xlsxModule = { utils: {} };

            setup.setupXLSX(xlsxModule);

            expect(windowGlobals().XLSX).toBe(xlsxModule);
        });

        test('does not overwrite an existing window.XLSX', () => {
            const existing = { marker: 'existing' };
            windowGlobals().XLSX = existing;
            const setup = makeSetup();

            setup.setupXLSX({ marker: 'new' });

            expect(windowGlobals().XLSX).toBe(existing);
        });
    });

    describe('setupHTML2Canvas', () => {
        test('assigns the function onto window.html2canvas when not already present', () => {
            const setup = makeSetup();
            const html2canvasFn = () => {};

            setup.setupHTML2Canvas(html2canvasFn);

            expect(windowGlobals().html2canvas).toBe(html2canvasFn);
        });

        test('does not overwrite an existing window.html2canvas', () => {
            const existing = () => {};
            windowGlobals().html2canvas = existing;
            const setup = makeSetup();

            setup.setupHTML2Canvas(() => {});

            expect(windowGlobals().html2canvas).toBe(existing);
        });
    });

    describe('setupPDFJS', () => {
        function pdfjsModule(): { GlobalWorkerOptions: { workerSrc: string; verbosity?: number } } {
            return { GlobalWorkerOptions: { workerSrc: '' } };
        }

        test('assigns the module onto window.pdfjsLib and defaults the worker URL to "./pdf.worker.min.js"', () => {
            const setup = makeSetup();
            const module = pdfjsModule();

            setup.setupPDFJS(module);

            expect(windowGlobals().pdfjsLib).toBe(module);
            expect(module.GlobalWorkerOptions.workerSrc).toBe('./pdf.worker.min.js');
            expect(module.GlobalWorkerOptions.verbosity).toBe(0);
        });

        test('prefers an explicit config.pdfWorkerUrl over the default', () => {
            const setup = makeSetup({ pdfWorkerUrl: 'https://cdn.example.com/pdf.worker.min.js' });
            const module = pdfjsModule();

            setup.setupPDFJS(module);

            expect(module.GlobalWorkerOptions.workerSrc).toBe('https://cdn.example.com/pdf.worker.min.js');
        });

        test('derives the worker URL from config.registryUrl by replacing the last path segment', () => {
            const setup = makeSetup({ registryUrl: 'https://example.com/static/agentlets-registry.json' });
            const module = pdfjsModule();

            setup.setupPDFJS(module);

            expect(module.GlobalWorkerOptions.workerSrc).toBe('https://example.com/static/pdf.worker.min.js');
        });

        test('config.pdfWorkerUrl takes priority over config.registryUrl when both are set', () => {
            const setup = makeSetup({
                pdfWorkerUrl: 'https://explicit.example.com/worker.js',
                registryUrl: 'https://example.com/static/agentlets-registry.json'
            });
            const module = pdfjsModule();

            setup.setupPDFJS(module);

            expect(module.GlobalWorkerOptions.workerSrc).toBe('https://explicit.example.com/worker.js');
        });

        test('quirk: falls back to the default worker URL (not registryUrl itself) when registryUrl fails to parse as a URL', () => {
            const setup = makeSetup({ registryUrl: 'not a valid url' });
            const module = pdfjsModule();

            setup.setupPDFJS(module);

            expect(module.GlobalWorkerOptions.workerSrc).toBe('./pdf.worker.min.js');
        });

        test('does nothing at all when window.pdfjsLib is already set, even with a different config', () => {
            const existing = pdfjsModule();
            existing.GlobalWorkerOptions.workerSrc = 'https://already.example.com/worker.js';
            windowGlobals().pdfjsLib = existing;
            const setup = makeSetup({ pdfWorkerUrl: 'https://new.example.com/worker.js' });

            setup.setupPDFJS(pdfjsModule());

            expect(windowGlobals().pdfjsLib).toBe(existing);
            expect(existing.GlobalWorkerOptions.workerSrc).toBe('https://already.example.com/worker.js');
        });
    });

    describe('configurePDFWorker', () => {
        test('sets GlobalWorkerOptions.workerSrc when window.pdfjsLib exists', () => {
            const module = { GlobalWorkerOptions: { workerSrc: 'old' } };
            windowGlobals().pdfjsLib = module;
            const setup = makeSetup();

            setup.configurePDFWorker('https://manual.example.com/worker.js');

            expect(module.GlobalWorkerOptions.workerSrc).toBe('https://manual.example.com/worker.js');
        });

        test('does nothing (no throw) when window.pdfjsLib is not yet loaded', () => {
            const setup = makeSetup();
            expect(() => setup.configurePDFWorker('https://manual.example.com/worker.js')).not.toThrow();
            expect(windowGlobals().pdfjsLib).toBeUndefined();
        });
    });

    describe('setupHotkeys', () => {
        test('assigns the module onto window.hotkeys when not already present', () => {
            const setup = makeSetup();
            const hotkeysFn = () => {};

            setup.setupHotkeys(hotkeysFn);

            expect(windowGlobals().hotkeys).toBe(hotkeysFn);
        });

        test('does not overwrite an existing window.hotkeys', () => {
            const existing = () => {};
            windowGlobals().hotkeys = existing;
            const setup = makeSetup();

            setup.setupHotkeys(() => {});

            expect(windowGlobals().hotkeys).toBe(existing);
        });

        test('initializes the given shortcut manager with the hotkeys module', () => {
            const setup = makeSetup();
            const hotkeysFn = () => {};
            const shortcutManager: ShortcutManagerStub = { init: jest.fn() };

            setup.setupHotkeys(hotkeysFn, shortcutManager);

            expect(shortcutManager.init).toHaveBeenCalledWith(hotkeysFn);
        });

        test('quirk: still initializes the shortcut manager even when window.hotkeys was already set', () => {
            windowGlobals().hotkeys = () => {};
            const setup = makeSetup();
            const hotkeysFn = () => {};
            const shortcutManager: ShortcutManagerStub = { init: jest.fn() };

            setup.setupHotkeys(hotkeysFn, shortcutManager);

            expect(shortcutManager.init).toHaveBeenCalledWith(hotkeysFn);
        });

        test('does not throw when no shortcut manager is given', () => {
            const setup = makeSetup();
            expect(() => setup.setupHotkeys(() => {})).not.toThrow();
        });
    });

    describe('initializeAll', () => {
        test('bundled mode: sets up every provided library', () => {
            const setup = makeSetup();
            const xlsxModule = {};
            const html2canvasFn = () => {};
            const pdfjsModule = { GlobalWorkerOptions: { workerSrc: '' } };
            const hotkeysFn = () => {};

            setup.initializeAll({ XLSX: xlsxModule, html2canvas: html2canvasFn, pdfjsLib: pdfjsModule, hotkeys: hotkeysFn });

            expect(windowGlobals().XLSX).toBe(xlsxModule);
            expect(windowGlobals().html2canvas).toBe(html2canvasFn);
            expect(windowGlobals().pdfjsLib).toBe(pdfjsModule);
            expect(windowGlobals().hotkeys).toBe(hotkeysFn);
        });

        test('bundled mode: skips any library omitted from the libraries map', () => {
            const setup = makeSetup();
            setup.initializeAll({ XLSX: { marker: 'xlsx-only' } });

            expect(windowGlobals().XLSX).toEqual({ marker: 'xlsx-only' });
            expect(windowGlobals().html2canvas).toBeUndefined();
            expect(windowGlobals().pdfjsLib).toBeUndefined();
            expect(windowGlobals().hotkeys).toBeUndefined();
        });

        test('bundled mode: wires the shortcut manager through setupHotkeys when hotkeys is provided', () => {
            const setup = makeSetup();
            const shortcutManager: ShortcutManagerStub = { init: jest.fn() };
            const hotkeysFn = () => {};

            setup.initializeAll({ hotkeys: hotkeysFn }, shortcutManager);

            expect(shortcutManager.init).toHaveBeenCalledWith(hotkeysFn);
        });

        test('bundled mode: does not touch the shortcut manager when hotkeys is not provided', () => {
            const setup = makeSetup();
            const shortcutManager: ShortcutManagerStub = { init: jest.fn() };

            setup.initializeAll({}, shortcutManager);

            expect(shortcutManager.init).not.toHaveBeenCalled();
        });

        test('registry mode: does not set up any library, even when the libraries map is populated', () => {
            const setup = makeSetup({ loadingMode: 'registry' });

            setup.initializeAll({ XLSX: {}, html2canvas: () => {}, pdfjsLib: { GlobalWorkerOptions: { workerSrc: '' } }, hotkeys: () => {} });

            expect(windowGlobals().XLSX).toBeUndefined();
            expect(windowGlobals().html2canvas).toBeUndefined();
            expect(windowGlobals().pdfjsLib).toBeUndefined();
            expect(windowGlobals().hotkeys).toBeUndefined();
        });
    });

    describe('initializeRegistryLoader / getLibraryLoader', () => {
        test('creates a real LibraryLoader when loadingMode is "registry"', () => {
            const setup = makeSetup({ loadingMode: 'registry' });

            setup.initializeRegistryLoader({ libraries: { xlsx: 'https://cdn.example.com/xlsx.js' } });

            expect(setup.getLibraryLoader()).toBeInstanceOf(LibraryLoader);
        });

        test('quirk: does nothing when loadingMode is "bundled" (the default), even if called explicitly', () => {
            const setup = makeSetup();

            setup.initializeRegistryLoader({ libraries: { xlsx: 'https://cdn.example.com/xlsx.js' } });

            expect(setup.getLibraryLoader()).toBeNull();
        });
    });

    describe('isLibraryAvailable', () => {
        test.each([
            ['xlsx', 'XLSX'],
            ['html2canvas', 'html2canvas'],
            ['pdfjs', 'pdfjsLib'],
            ['hotkeys', 'hotkeys']
        ] as const)('reflects window.%s for "%s"', (name, globalKey) => {
            const setup = makeSetup();
            expect(setup.isLibraryAvailable(name)).toBe(false);

            (windowGlobals() as unknown as Record<string, unknown>)[globalKey] = {};
            expect(setup.isLibraryAvailable(name)).toBe(true);
        });

        test('returns false for an unrecognised library name', () => {
            const setup = makeSetup();
            expect(setup.isLibraryAvailable('unknown-lib')).toBe(false);
        });
    });

    describe('loadLibrary', () => {
        test('bundled mode: resolves isLibraryAvailable(name) without a library loader', async () => {
            windowGlobals().XLSX = {};
            const setup = makeSetup();

            await expect(setup.loadLibrary('xlsx')).resolves.toBe(true);
            await expect(setup.loadLibrary('hotkeys')).resolves.toBe(false);
        });

        test('registry mode: throws when initializeRegistryLoader() has not been called', async () => {
            const setup = makeSetup({ loadingMode: 'registry' });

            await expect(setup.loadLibrary('xlsx')).rejects.toThrow(
                'Library loader not initialized. Call initializeRegistryLoader() first.'
            );
        });

        test('registry mode: delegates to the library loader once initialized', async () => {
            const setup = makeSetup({ loadingMode: 'registry' });
            setup.initializeRegistryLoader({ libraries: { xlsx: 'https://cdn.example.com/xlsx.js' } });
            const loader = setup.getLibraryLoader();
            const loadLibrarySpy = jest.spyOn(loader as { loadLibrary(name: string): Promise<boolean> }, 'loadLibrary')
                .mockResolvedValue(true);

            await expect(setup.loadLibrary('xlsx')).resolves.toBe(true);
            expect(loadLibrarySpy).toHaveBeenCalledWith('xlsx');
        });
    });

    describe('ensureLibrary', () => {
        test('resolves true immediately when the library is already available', async () => {
            windowGlobals().XLSX = {};
            const setup = makeSetup();

            await expect(setup.ensureLibrary('xlsx')).resolves.toBe(true);
        });

        test('registry mode: delegates to the library loader when not yet available', async () => {
            const setup = makeSetup({ loadingMode: 'registry' });
            setup.initializeRegistryLoader({ libraries: { xlsx: 'https://cdn.example.com/xlsx.js' } });
            const loader = setup.getLibraryLoader();
            const loadLibrarySpy = jest.spyOn(loader as { loadLibrary(name: string): Promise<boolean> }, 'loadLibrary')
                .mockResolvedValue(true);

            await expect(setup.ensureLibrary('xlsx')).resolves.toBe(true);
            expect(loadLibrarySpy).toHaveBeenCalledWith('xlsx');
        });

        test('quirk: resolves false (rather than throwing) in registry mode when no library loader was initialized', async () => {
            const setup = makeSetup({ loadingMode: 'registry' });
            await expect(setup.ensureLibrary('xlsx')).resolves.toBe(false);
        });

        test('bundled mode: resolves false when unavailable, without consulting any library loader', async () => {
            const setup = makeSetup();
            await expect(setup.ensureLibrary('xlsx')).resolves.toBe(false);
        });
    });
});
