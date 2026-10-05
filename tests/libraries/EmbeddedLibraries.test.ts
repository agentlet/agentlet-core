/**
 * Loading when the libraries are part of the build (the ES module build, whose
 * chunks are reached with `import()`, and the single-file build that inlines
 * everything): no script tag, one import shared between concurrent callers, and
 * the same global setup as a script load.
 */

import { LibrarySetup } from '../../src/libraries/LibrarySetup.js';
import * as embedded from '../../src/libraries/embeddedLibraries';

jest.mock('../../src/libraries/embeddedLibraries', () => ({
    getEmbeddedImporters: jest.fn(),
    getLibraryMode: jest.fn()
}));

const mockedEmbedded = embedded as unknown as {
    getEmbeddedImporters: jest.Mock;
    getLibraryMode: jest.Mock;
};

type LibraryGlobals = {
    XLSX?: unknown;
    html2canvas?: unknown;
    pdfjsLib?: { GlobalWorkerOptions: { workerSrc: string } };
};

function globals(): LibraryGlobals {
    return window as unknown as LibraryGlobals;
}

describe('embedded libraries (ES module and single-file builds)', () => {
    const xlsxNamespace = { utils: {}, writeFile: jest.fn() };
    const html2canvasFn = jest.fn();
    const pdfjsModule = { GlobalWorkerOptions: { workerSrc: '' } };
    let importers: { xlsx: jest.Mock; html2canvas: jest.Mock; pdfjs: jest.Mock };

    beforeEach(() => {
        importers = {
            xlsx: jest.fn().mockResolvedValue(xlsxNamespace),
            html2canvas: jest.fn().mockResolvedValue(html2canvasFn),
            pdfjs: jest.fn().mockImplementation(async () => {
                pdfjsModule.GlobalWorkerOptions.workerSrc = '';
                return pdfjsModule;
            })
        };
        mockedEmbedded.getEmbeddedImporters.mockReturnValue(importers);
        mockedEmbedded.getLibraryMode.mockReturnValue('split');
    });

    afterEach(() => {
        delete globals().XLSX;
        delete globals().html2canvas;
        delete globals().pdfjsLib;
        jest.clearAllMocks();
    });

    test('imports the library on first use and puts it on window, with no script tag', async () => {
        const scripts = document.querySelectorAll('script').length;
        const setup = new LibrarySetup({});

        expect(setup.canLoadLibrary('xlsx')).toBe(true);
        await expect(setup.ensureLibrary('xlsx')).resolves.toBe(true);

        expect(globals().XLSX).toBe(xlsxNamespace);
        expect(importers.xlsx).toHaveBeenCalledTimes(1);
        expect(document.querySelectorAll('script').length).toBe(scripts);
    });

    test('imports once, and concurrent callers share the single import', async () => {
        const setup = new LibrarySetup({});

        await expect(Promise.all([
            setup.ensureLibrary('html2canvas'),
            setup.ensureLibrary('html2canvas'),
            setup.loadLibrary('html2canvas')
        ])).resolves.toEqual([true, true, true]);
        await setup.ensureLibrary('html2canvas');

        expect(globals().html2canvas).toBe(html2canvasFn);
        expect(importers.html2canvas).toHaveBeenCalledTimes(1);
    });

    test('configures the pdf.js worker after the import (pdfWorkerUrl wins)', async () => {
        const setup = new LibrarySetup({ pdfWorkerUrl: 'https://static.example.com/worker.mjs' });
        await setup.ensureLibrary('pdfjs');

        expect(globals().pdfjsLib).toBe(pdfjsModule);
        expect(pdfjsModule.GlobalWorkerOptions.workerSrc).toBe('https://static.example.com/worker.mjs');
    });

    test('surfaces a clear error when the import fails, and tries again on the next call', async () => {
        importers.xlsx.mockRejectedValueOnce(new Error('Failed to fetch dynamically imported module: ./chunks/xlsx.js'));
        const setup = new LibrarySetup({});

        await expect(setup.ensureLibrary('xlsx')).rejects.toThrow(/Failed to load library 'xlsx'.*Failed to fetch dynamically imported module/);
        await expect(setup.ensureLibrary('xlsx')).resolves.toBe(true);
        expect(importers.xlsx).toHaveBeenCalledTimes(2);
    });

    test('a library the host page already provides is not imported', async () => {
        globals().XLSX = { utils: {} };
        await new LibrarySetup({}).ensureLibrary('xlsx');
        expect(importers.xlsx).not.toHaveBeenCalled();
    });

    describe('preloading', () => {
        test('a script or ES module build preloads nothing by default', async () => {
            await new LibrarySetup({}).preloadLibraries();
            expect(importers.xlsx).not.toHaveBeenCalled();
            expect(importers.html2canvas).not.toHaveBeenCalled();
            expect(importers.pdfjs).not.toHaveBeenCalled();
        });

        test('the single-file build registers every library during init, like before on-demand loading', async () => {
            mockedEmbedded.getLibraryMode.mockReturnValue('inline');
            await new LibrarySetup({}).preloadLibraries();

            expect(globals().XLSX).toBe(xlsxNamespace);
            expect(globals().html2canvas).toBe(html2canvasFn);
            expect(globals().pdfjsLib).toBe(pdfjsModule);
        });

        test('the preloadLibraries config replaces that default, even in the single-file build', async () => {
            mockedEmbedded.getLibraryMode.mockReturnValue('inline');
            await new LibrarySetup({ preloadLibraries: ['xlsx'] }).preloadLibraries();

            expect(importers.xlsx).toHaveBeenCalledTimes(1);
            expect(importers.html2canvas).not.toHaveBeenCalled();
            expect(importers.pdfjs).not.toHaveBeenCalled();
        });

        test('registry mode keeps loading through the registry, so the single-file default does not apply', async () => {
            mockedEmbedded.getLibraryMode.mockReturnValue('inline');
            await new LibrarySetup({ loadingMode: 'registry' }).preloadLibraries();

            expect(importers.xlsx).not.toHaveBeenCalled();
        });
    });
});
