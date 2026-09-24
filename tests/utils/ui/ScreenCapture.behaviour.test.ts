/**
 * Behaviour characterization tests for ScreenCapture.
 *
 * Unlike tests/utils/ui/ScreenCapture.test.js (which replaces `global.document`
 * / `global.window` wholesale and mostly checks that methods exist / don't
 * throw), this file keeps the real jsdom `window`/`document` and drives
 * `window.html2canvas` through a mock, exercising each public method: option
 * merging, the html2canvas-availability/loading path (via a `librarySetup`
 * stub), the data URL / blob / download / clipboard flows, viewport and
 * region capture math, and the error paths when the library is missing or
 * throws. These pin down CURRENT behaviour ahead of the file's conversion to
 * TypeScript.
 */

import ScreenCaptureCtor from '../../../src/utils/ui/ScreenCapture.js';
import type { ScreenCaptureAPI, Html2CanvasOptions } from '../../../src/types/public-api';

/**
 * ScreenCapture.js is untyped, plain JS, so `tsc` only infers a weak shape
 * for it. This local type describes the real runtime surface - the public
 * `ScreenCaptureAPI` contract plus the extra instance fields this suite
 * inspects directly (`isCapturing`, `defaultOptions`, `librarySetup`).
 */
interface ScreenCaptureTestInstance extends ScreenCaptureAPI {
    isCapturing: boolean;
    defaultOptions: Html2CanvasOptions;
    librarySetup: LibrarySetupStub | null;
}

/** Minimal shape of `src/libraries/LibrarySetup.js` actually used by ScreenCapture. */
interface LibrarySetupStub {
    ensureLibrary(name: string): Promise<boolean>;
}

const ScreenCapture = ScreenCaptureCtor as unknown as new (librarySetup?: LibrarySetupStub | null) => ScreenCaptureTestInstance;

type Html2CanvasMock = jest.Mock<Promise<HTMLCanvasElement>, [Element, Html2CanvasOptions]>;

describe('ScreenCapture behaviour characterization', () => {
    let screenCapture: ScreenCaptureTestInstance;
    let mockCanvas: HTMLCanvasElement;
    let html2canvasMock: Html2CanvasMock;

    beforeAll(() => {
        // tests/setup.js globally replaces document.createElement with a
        // plain non-DOM mock. Restore the real jsdom implementation for this
        // file so `instanceof HTMLElement` checks and real style/attribute
        // behaviour work as they do in a browser.
        document.createElement = Document.prototype.createElement.bind(document);

        // jsdom does not implement the Clipboard API's ClipboardItem.
        if (typeof (global as unknown as { ClipboardItem?: unknown }).ClipboardItem === 'undefined') {
            (global as unknown as { ClipboardItem: new (items: Record<string, Blob>) => { items: Record<string, Blob> } }).ClipboardItem =
                class ClipboardItemStub {
                    items: Record<string, Blob>;
                    constructor(items: Record<string, Blob>) {
                        this.items = items;
                    }
                };
        }
    });

    beforeEach(() => {
        mockCanvas = {
            toDataURL: jest.fn(() => 'data:image/png;base64,mockdata'),
            toBlob: jest.fn((callback: (blob: Blob | null) => void) => {
                callback(new Blob(['mock'], { type: 'image/png' }));
            })
        } as unknown as HTMLCanvasElement;

        html2canvasMock = jest.fn<Promise<HTMLCanvasElement>, [Element, Html2CanvasOptions]>(() => Promise.resolve(mockCanvas));
        (window as unknown as { html2canvas?: Html2CanvasMock }).html2canvas = html2canvasMock;

        jest.spyOn(console, 'log').mockImplementation();
        jest.spyOn(console, 'warn').mockImplementation();
        jest.spyOn(console, 'error').mockImplementation();

        screenCapture = new ScreenCapture();
    });

    afterEach(() => {
        delete (window as unknown as { html2canvas?: Html2CanvasMock }).html2canvas;
        jest.restoreAllMocks();
        document.body.innerHTML = '';
    });

    describe('isScreenCaptureAvailable()', () => {
        test('reflects whether window.html2canvas is defined', () => {
            expect(screenCapture.isScreenCaptureAvailable()).toBe(true);
            delete (window as unknown as { html2canvas?: Html2CanvasMock }).html2canvas;
            expect(screenCapture.isScreenCaptureAvailable()).toBe(false);
        });
    });

    describe('ensureHTML2Canvas()', () => {
        test('resolves true immediately without touching librarySetup when already available', async () => {
            const librarySetup: LibrarySetupStub = { ensureLibrary: jest.fn() };
            const withLibrarySetup = new ScreenCapture(librarySetup);

            await expect(withLibrarySetup.ensureHTML2Canvas()).resolves.toBe(true);
            expect(librarySetup.ensureLibrary).not.toHaveBeenCalled();
        });

        test('delegates to librarySetup.ensureLibrary("html2canvas") when unavailable', async () => {
            delete (window as unknown as { html2canvas?: Html2CanvasMock }).html2canvas;
            const librarySetup: LibrarySetupStub = { ensureLibrary: jest.fn(() => Promise.resolve(true)) };
            const withLibrarySetup = new ScreenCapture(librarySetup);

            await expect(withLibrarySetup.ensureHTML2Canvas()).resolves.toBe(true);
            expect(librarySetup.ensureLibrary).toHaveBeenCalledWith('html2canvas');
        });

        test('catches a librarySetup failure, warns, and resolves false', async () => {
            delete (window as unknown as { html2canvas?: Html2CanvasMock }).html2canvas;
            const librarySetup: LibrarySetupStub = {
                ensureLibrary: jest.fn(() => Promise.reject(new Error('network down')))
            };
            const withLibrarySetup = new ScreenCapture(librarySetup);

            await expect(withLibrarySetup.ensureHTML2Canvas()).resolves.toBe(false);
            expect(console.warn).toHaveBeenCalledWith('📸 Failed to load html2canvas library:', 'network down');
        });

        test('resolves false when unavailable and no librarySetup was provided', async () => {
            delete (window as unknown as { html2canvas?: Html2CanvasMock }).html2canvas;
            await expect(screenCapture.ensureHTML2Canvas()).resolves.toBe(false);
        });
    });

    describe('capturePage()', () => {
        test('merges defaultOptions with call-site options and captures document.body', async () => {
            await screenCapture.capturePage({ scale: 2 });

            expect(html2canvasMock).toHaveBeenCalledWith(
                document.body,
                expect.objectContaining({ ...screenCapture.defaultOptions, scale: 2 })
            );
        });

        test('throws when html2canvas is unavailable, and resets isCapturing in a finally block', async () => {
            delete (window as unknown as { html2canvas?: Html2CanvasMock }).html2canvas;

            await expect(screenCapture.capturePage()).rejects.toThrow(
                'html2canvas library not available. Screenshots are disabled.'
            );
            expect(screenCapture.isCapturing).toBe(false);
        });

        test('propagates an html2canvas rejection, logs it, and still resets isCapturing', async () => {
            const failure = new Error('canvas boom');
            html2canvasMock.mockImplementation(() => Promise.reject(failure));

            await expect(screenCapture.capturePage()).rejects.toBe(failure);
            expect(console.error).toHaveBeenCalledWith('📸 Page capture failed:', failure);
            expect(screenCapture.isCapturing).toBe(false);
        });
    });

    describe('captureElement()', () => {
        test('rejects a null/undefined element before ever calling html2canvas', async () => {
            await expect(screenCapture.captureElement(null as unknown as HTMLElement))
                .rejects.toThrow('Invalid element provided for capture');
            expect(html2canvasMock).not.toHaveBeenCalled();
        });

        test('forwards the element and merged options to html2canvas', async () => {
            const el = document.createElement('div');
            await screenCapture.captureElement(el, { logging: true });

            expect(html2canvasMock).toHaveBeenCalledWith(
                el,
                expect.objectContaining({ ...screenCapture.defaultOptions, logging: true })
            );
        });
    });

    describe('captureBySelector()', () => {
        test('throws a selector-specific message when nothing matches', async () => {
            await expect(screenCapture.captureBySelector('.does-not-exist'))
                .rejects.toThrow('Element not found with selector: .does-not-exist');
        });

        test('delegates to captureElement() for the first match', async () => {
            const el = document.createElement('div');
            el.className = 'target';
            document.body.appendChild(el);

            await screenCapture.captureBySelector('.target');

            expect(html2canvasMock).toHaveBeenCalledWith(el, expect.any(Object));
            el.remove();
        });
    });

    describe('canvasToDataURL() / canvasToBlob()', () => {
        test('forwards format and quality to canvas.toDataURL()', () => {
            screenCapture.canvasToDataURL(mockCanvas, 'image/jpeg', 0.5);
            expect(mockCanvas.toDataURL).toHaveBeenCalledWith('image/jpeg', 0.5);
        });

        test('wraps and rethrows a toDataURL failure, logging it first', () => {
            const failure = new Error('encode failed');
            (mockCanvas.toDataURL as jest.Mock).mockImplementation(() => { throw failure; });

            expect(() => screenCapture.canvasToDataURL(mockCanvas)).toThrow(failure);
            expect(console.error).toHaveBeenCalledWith('📸 Canvas to data URL conversion failed:', failure);
        });

        test('canvasToBlob() rejects when the canvas resolves a null blob', async () => {
            (mockCanvas.toBlob as jest.Mock).mockImplementation((cb: (b: Blob | null) => void) => cb(null));
            await expect(screenCapture.canvasToBlob(mockCanvas)).rejects.toThrow('Failed to convert canvas to blob');
        });
    });

    describe('captureAsDataURL()', () => {
        test('defaults to a full-page capture and shows the result in the console', async () => {
            const dataURL = await screenCapture.captureAsDataURL();

            expect(dataURL).toBe('data:image/png;base64,mockdata');
            expect(html2canvasMock).toHaveBeenCalledWith(document.body, expect.any(Object));
            expect(console.log).toHaveBeenCalledWith('📄 Full page screenshot preview:');
        });

        test('a string target is treated as a selector (captureType "element")', async () => {
            const el = document.createElement('div');
            el.id = 'pick-me';
            document.body.appendChild(el);

            await screenCapture.captureAsDataURL('#pick-me');

            expect(html2canvasMock).toHaveBeenCalledWith(el, expect.any(Object));
            expect(console.log).toHaveBeenCalledWith('📸 Captured image preview:');
            el.remove();
        });

        test('showInConsole: false suppresses the console preview', async () => {
            await screenCapture.captureAsDataURL(undefined, { showInConsole: false });
            expect(console.log).not.toHaveBeenCalledWith(expect.stringContaining('preview:'));
        });
    });

    describe('captureAsBlob()', () => {
        test('captures an HTMLElement target and converts it via canvasToBlob()', async () => {
            const el = document.createElement('div');
            const blob = await screenCapture.captureAsBlob(el, { format: 'image/jpeg', quality: 0.7 });

            expect(html2canvasMock).toHaveBeenCalledWith(el, expect.any(Object));
            expect(mockCanvas.toBlob).toHaveBeenCalledWith(expect.any(Function), 'image/jpeg', 0.7);
            expect(blob).toBeInstanceOf(Blob);
        });
    });

    describe('downloadCapture()', () => {
        test('creates a hidden, auto-clicked download link with the given filename', async () => {
            const clickSpy = jest.fn();
            const createElementSpy = jest.spyOn(document, 'createElement');
            let anchor: HTMLAnchorElement | undefined;
            createElementSpy.mockImplementation((tag: string) => {
                const real = Document.prototype.createElement.call(document, tag);
                if (tag === 'a') {
                    anchor = real as HTMLAnchorElement;
                    anchor.click = clickSpy;
                }
                return real;
            });

            await screenCapture.downloadCapture(undefined, { filename: 'shot.png' });

            expect(anchor?.download).toBe('shot.png');
            expect(anchor?.href).toBe('data:image/png;base64,mockdata');
            expect(anchor?.style.display).toBe('none');
            expect(clickSpy).toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('📸 Download initiated:', 'shot.png');
        });

        test('logs and rethrows when the underlying capture fails', async () => {
            delete (window as unknown as { html2canvas?: Html2CanvasMock }).html2canvas;

            await expect(screenCapture.downloadCapture()).rejects.toThrow(
                'html2canvas library not available. Screenshots are disabled.'
            );
            expect(console.error).toHaveBeenCalledWith('📸 Download failed:', expect.any(Error));
        });
    });

    describe('copyToClipboard()', () => {
        test('throws when the Clipboard API is not supported', async () => {
            await expect(screenCapture.copyToClipboard(document.createElement('div')))
                .rejects.toThrow('Clipboard API not supported in this browser');
        });

        test('writes a ClipboardItem built from the captured blob when supported', async () => {
            const write = jest.fn<Promise<void>, [unknown[]]>(() => Promise.resolve());
            Object.defineProperty(navigator, 'clipboard', {
                value: { write },
                configurable: true
            });

            await screenCapture.copyToClipboard(document.createElement('div'));

            expect(write).toHaveBeenCalledTimes(1);
            const [items] = write.mock.calls[0];
            expect(items).toHaveLength(1);
            expect(console.log).toHaveBeenCalledWith('📸 Image copied to clipboard');

            Reflect.deleteProperty(navigator, 'clipboard');
        });
    });

    describe('captureViewport() / captureRegion()', () => {
        test('captureViewport() merges window size/scroll offsets into the capture options', async () => {
            await screenCapture.captureViewport({ scale: 3 });

            expect(html2canvasMock).toHaveBeenCalledWith(
                document.body,
                expect.objectContaining({
                    scale: 3,
                    width: window.innerWidth,
                    height: window.innerHeight,
                    x: window.pageXOffset,
                    y: window.pageYOffset
                })
            );
        });

        test('captureRegion() throws when width/height are missing', async () => {
            await expect(screenCapture.captureRegion({} as { width: number; height: number }))
                .rejects.toThrow('Width and height must be specified for region capture');
        });

        test('captureRegion() defaults x/y to 0 and forwards width/height', async () => {
            await screenCapture.captureRegion({ width: 100, height: 50 });

            expect(html2canvasMock).toHaveBeenCalledWith(
                document.body,
                expect.objectContaining({ x: 0, y: 0, width: 100, height: 50 })
            );
        });
    });

    describe('getImageDimensions()', () => {
        /**
         * jsdom's `Image`/`HTMLImageElement` never actually decodes a `src`,
         * so `onload`/`onerror` are driven manually here via a minimal fake
         * that fires one or the other on the next microtask, keyed off the
         * assigned `src`.
         */
        class FakeImage {
            onload: (() => void) | null = null;
            onerror: (() => void) | null = null;
            width = 640;
            height = 480;
            private _src = '';
            get src(): string {
                return this._src;
            }
            set src(value: string) {
                this._src = value;
                queueMicrotask(() => {
                    if (value === 'bad-image-url') {
                        this.onerror?.();
                    } else {
                        this.onload?.();
                    }
                });
            }
        }

        let originalImage: typeof Image;

        beforeEach(() => {
            originalImage = global.Image;
            global.Image = FakeImage as unknown as typeof Image;
        });

        afterEach(() => {
            global.Image = originalImage;
        });

        test('resolves the natural width/height once the image loads', async () => {
            await expect(screenCapture.getImageDimensions('data:image/png;base64,x'))
                .resolves.toEqual({ width: 640, height: 480 });
        });

        test('rejects with a fixed message when the image fails to load', async () => {
            await expect(screenCapture.getImageDimensions('bad-image-url'))
                .rejects.toThrow('Failed to load image');
        });
    });

    describe('displayImageInConsole() / createPreview()', () => {
        test('logs a page-specific title for captureType "page"', () => {
            screenCapture.displayImageInConsole('data:image/png;base64,x', 'page');
            expect(console.log).toHaveBeenCalledWith('📄 Full page screenshot preview:');
        });

        test('logs an element-specific title for any other captureType', () => {
            screenCapture.displayImageInConsole('data:image/png;base64,x', 'element');
            expect(console.log).toHaveBeenCalledWith('📸 Captured image preview:');
        });

        test('createPreview() returns an <img> with the dataURL as src and default sizing styles', () => {
            const preview = screenCapture.createPreview('data:image/png;base64,x') as HTMLImageElement;
            expect(preview.tagName).toBe('IMG');
            expect(preview.src).toBe('data:image/png;base64,x');
            expect(preview.style.maxWidth).toBe('300px');
            expect(preview.style.maxHeight).toBe('200px');
            expect(preview.style.border).toBe('2px solid rgb(221, 221, 221)');
        });

        test('createPreview() honours overridden maxWidth/maxHeight/border options', () => {
            const preview = screenCapture.createPreview('data:image/png;base64,x', {
                maxWidth: 50,
                maxHeight: 40,
                border: '1px solid red'
            }) as HTMLImageElement;
            expect(preview.style.maxWidth).toBe('50px');
            expect(preview.style.maxHeight).toBe('40px');
            expect(preview.style.border).toBe('1px solid red');
        });
    });
});
