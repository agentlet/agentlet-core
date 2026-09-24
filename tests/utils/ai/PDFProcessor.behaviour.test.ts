/**
 * Behaviour characterization tests for PDFProcessor.
 *
 * tests/utils/ai/PDFProcessor.test.js covers the happy paths (bundled PDF.js
 * detection, page conversion, maxPages, file/URL input, capabilities) but
 * leaves several branches untested: `ensurePDFJS()`'s `librarySetup`
 * delegation path (only the "wait for bundled version" path is covered),
 * `convertPDFToImages()`'s scale/format/quality option forwarding to
 * pdf.js/canvas, the `GlobalWorkerOptions.workerSrc` CDN-fallback quirk, and
 * `createPDFPreviews()` (its one existing test is `test.skip`d). This file
 * pins down that CURRENT behaviour ahead of the file's conversion to
 * TypeScript.
 */

import PDFProcessorCtor from '../../../src/utils/ai/PDFProcessor.js';

/** Minimal shape of `src/libraries/LibrarySetup.js` actually used by PDFProcessor. */
interface LibrarySetupStub {
    ensureLibrary(name: string): Promise<boolean>;
}

interface PDFConversionOptionsStub {
    scale?: number;
    format?: string;
    quality?: number;
    maxPages?: number;
}

/**
 * PDFProcessor.js is untyped, plain JS, so `tsc` only infers a weak shape
 * for it. This local type describes the real runtime surface exercised
 * here.
 */
interface PDFProcessorTestInstance {
    librarySetup: LibrarySetupStub | null;
    isPDFJSAvailable(): boolean;
    ensurePDFJS(): Promise<boolean>;
    convertPDFToImages(pdfData: File | ArrayBuffer | Uint8Array, options?: PDFConversionOptionsStub): Promise<string[]>;
    createPDFPreviews(
        images: string[],
        options?: { maxWidth?: number; maxHeight?: number; border?: string; borderRadius?: string; showPageNumbers?: boolean }
    ): HTMLElement[];
}

const PDFProcessor = PDFProcessorCtor as unknown as new (librarySetup?: LibrarySetupStub | null) => PDFProcessorTestInstance;

interface PDFJSPageMock {
    getViewport: jest.Mock<{ width: number; height: number }, [{ scale: number }]>;
    render: jest.Mock<{ promise: Promise<void> }, [unknown]>;
}

interface PDFJSDocumentMock {
    numPages: number;
    getPage: jest.Mock<Promise<PDFJSPageMock>, [number]>;
}

interface PDFJSLibMock {
    getDocument: jest.Mock<{ promise: Promise<PDFJSDocumentMock> }, [unknown]>;
}

function setPdfjsLib(mock: PDFJSLibMock | undefined): void {
    (window as unknown as { pdfjsLib?: PDFJSLibMock }).pdfjsLib = mock;
}

function setAgentletGlobal(mock: { configurePDFWorker: jest.Mock } | undefined): void {
    (window as unknown as { agentlet?: { configurePDFWorker: jest.Mock } }).agentlet = mock;
}

describe('PDFProcessor behaviour characterization', () => {
    afterEach(() => {
        setPdfjsLib(undefined);
        setAgentletGlobal(undefined);
    });

    describe('ensurePDFJS()', () => {
        test('delegates to librarySetup.ensureLibrary("pdfjs") and resolves true when it succeeds', async () => {
            setPdfjsLib(undefined);
            const librarySetup: LibrarySetupStub = { ensureLibrary: jest.fn(() => Promise.resolve(true)) };
            const processor = new PDFProcessor(librarySetup);

            await expect(processor.ensurePDFJS()).resolves.toBe(true);
            expect(librarySetup.ensureLibrary).toHaveBeenCalledWith('pdfjs');
        });

        test('catches a librarySetup failure, warns, and resolves false', async () => {
            setPdfjsLib(undefined);
            const librarySetup: LibrarySetupStub = { ensureLibrary: jest.fn(() => Promise.reject(new Error('cdn unreachable'))) };
            const processor = new PDFProcessor(librarySetup);

            await expect(processor.ensurePDFJS()).resolves.toBe(false);
            expect(console.warn).toHaveBeenCalledWith('📄 Failed to load PDF.js library:', 'cdn unreachable');
        });
    });

    describe('convertPDFToImages() option handling', () => {
        let mockPage: PDFJSPageMock;
        let mockDocument: PDFJSDocumentMock;
        let mockPdfjsLib: PDFJSLibMock;
        let mockCanvas: { getContext: jest.Mock; toDataURL: jest.Mock; remove: jest.Mock; width: number; height: number };
        let originalCreateElement: typeof document.createElement;

        beforeEach(() => {
            mockPage = {
                getViewport: jest.fn<{ width: number; height: number }, [{ scale: number }]>(() => ({ width: 800, height: 600 })),
                render: jest.fn<{ promise: Promise<void> }, [unknown]>(() => ({ promise: Promise.resolve() }))
            };
            mockDocument = {
                numPages: 1,
                getPage: jest.fn<Promise<PDFJSPageMock>, [number]>(() => Promise.resolve(mockPage))
            };
            mockPdfjsLib = { getDocument: jest.fn<{ promise: Promise<PDFJSDocumentMock> }, [unknown]>(() => ({ promise: Promise.resolve(mockDocument) })) };
            setPdfjsLib(mockPdfjsLib);

            mockCanvas = {
                getContext: jest.fn(() => ({})),
                toDataURL: jest.fn(() => 'data:image/webp;base64,mock'),
                remove: jest.fn(),
                width: 0,
                height: 0
            };
            originalCreateElement = document.createElement;
            document.createElement = jest.fn((tagName: string) => {
                if (tagName === 'canvas') {
                    return mockCanvas as unknown as HTMLCanvasElement;
                }
                return originalCreateElement.call(document, tagName);
            }) as typeof document.createElement;
        });

        afterEach(() => {
            document.createElement = originalCreateElement;
        });

        test('forwards a custom scale to page.getViewport() and format/quality to canvas.toDataURL()', async () => {
            const processor = new PDFProcessor();

            const images = await processor.convertPDFToImages(new ArrayBuffer(8), {
                scale: 3,
                format: 'image/webp',
                quality: 0.25
            });

            expect(mockPage.getViewport).toHaveBeenCalledWith({ scale: 3 });
            expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/webp', 0.25);
            expect(images).toEqual(['data:image/webp;base64,mock']);
        });

        test('auto-configures the CDN worker fallback and rethrows a friendlier error on a GlobalWorkerOptions.workerSrc failure', async () => {
            mockPdfjsLib.getDocument.mockReturnValue({
                promise: Promise.reject(new Error('Setup GlobalWorkerOptions.workerSrc first.'))
            });
            const configurePDFWorker = jest.fn();
            setAgentletGlobal({ configurePDFWorker });

            const processor = new PDFProcessor();

            await expect(processor.convertPDFToImages(new ArrayBuffer(8))).rejects.toThrow(
                'PDF worker not found. Automatically configured CDN fallback. Please try again. ' +
                    'Original error: Setup GlobalWorkerOptions.workerSrc first.'
            );
            expect(configurePDFWorker).toHaveBeenCalledWith(
                'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js'
            );
        });
    });

    describe('createPDFPreviews()', () => {
        let originalCreateElement: typeof document.createElement;

        beforeAll(() => {
            // tests/setup.js globally replaces document.createElement with a plain
            // non-DOM mock. Restore the real jsdom implementation for this describe
            // block so appendChild/querySelector behave as they do in a browser.
            originalCreateElement = document.createElement;
            document.createElement = Document.prototype.createElement.bind(document);
        });

        afterAll(() => {
            document.createElement = originalCreateElement;
        });

        test('builds an <img> plus a page-number label per image by default', () => {
            const processor = new PDFProcessor();
            const images = ['data:image/png;base64,aaa', 'data:image/png;base64,bbb'];

            const previews = processor.createPDFPreviews(images);

            expect(previews).toHaveLength(2);
            const [first, second] = previews;
            expect(first.querySelector('img')?.getAttribute('src')).toBe(images[0]);
            expect(first.textContent).toContain('Page 1');
            expect(second.querySelector('img')?.getAttribute('src')).toBe(images[1]);
            expect(second.textContent).toContain('Page 2');
        });

        test('omits the page-number label when showPageNumbers is false', () => {
            const processor = new PDFProcessor();
            const previews = processor.createPDFPreviews(['data:image/png;base64,aaa'], { showPageNumbers: false });

            expect(previews[0].textContent).toBe('');
            expect(previews[0].querySelectorAll('div')).toHaveLength(0);
        });
    });
});
