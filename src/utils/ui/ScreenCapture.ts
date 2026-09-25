/**
 * Screen Capture Utility for Agentlet Core
 * Provides DOM screenshot functionality using html2canvas
 */
import type {
    ScreenCaptureAPI,
    Html2CanvasOptions,
    ScreenCaptureAsDataURLOptions,
    ScreenCaptureAsBlobOptions,
    ScreenCaptureDownloadOptions,
    ScreenCaptureRegion
} from '../../types/public-api';
import type { LibrarySetup } from '../../libraries/LibrarySetup.js';

/**
 * Minimal shape of `LibrarySetup` this file actually uses - deliberately
 * not the whole class, just the one method `ensureHTML2Canvas()` calls.
 */
type LibrarySetupLike = Pick<LibrarySetup, 'ensureLibrary'>;

/** Signature of the global `html2canvas` function once the library is loaded. */
type Html2CanvasFn = (element: Element, options: Html2CanvasOptions) => Promise<HTMLCanvasElement>;

/**
 * Accessed through this helper (via `window`) rather than a bare
 * `html2canvas` identifier, since there is no ambient type declaration for
 * it under strict tsc.
 */
function getHtml2Canvas(): Html2CanvasFn | undefined {
    return (window as unknown as { html2canvas?: Html2CanvasFn }).html2canvas;
}

/** Best-effort extraction of a `.message` string from an unknown error-like value. */
function extractMessage(error: unknown): unknown {
    return (error && typeof error === 'object' && 'message' in error)
        ? (error as { message?: unknown }).message
        : undefined;
}

class ScreenCapture implements ScreenCaptureAPI {
    librarySetup: LibrarySetupLike | null;
    isCapturing: boolean;
    defaultOptions: Html2CanvasOptions;

    constructor(librarySetup: LibrarySetupLike | null = null) {
        this.librarySetup = librarySetup;
        this.isCapturing = false;
        this.defaultOptions = {
            allowTaint: false,
            useCORS: true,
            scale: 1,
            backgroundColor: null,
            removeContainer: true,
            logging: false,
            imageTimeout: 15000,
            onclone: null
        };
    }

    /**
     * Check if screenshot capture is available
     */
    isScreenCaptureAvailable(): boolean {
        return typeof getHtml2Canvas() !== 'undefined';
    }

    /**
     * Ensure html2canvas library is loaded
     */
    async ensureHTML2Canvas(): Promise<boolean> {
        if (this.isScreenCaptureAvailable()) {
            return true;
        }

        if (this.librarySetup) {
            try {
                console.log('📸 Loading html2canvas library for screenshot functionality...');
                return await this.librarySetup.ensureLibrary('html2canvas');
            } catch (error) {
                console.warn('📸 Failed to load html2canvas library:', extractMessage(error));
                return false;
            }
        }

        return false;
    }

    /**
     * Capture entire page as image
     * @param options - html2canvas options
     * @returns Canvas element with screenshot
     */
    async capturePage(options: Html2CanvasOptions = {}): Promise<HTMLCanvasElement> {
        const mergedOptions = { ...this.defaultOptions, ...options };

        try {
            this.isCapturing = true;
            console.log('📸 Capturing full page...');

            // Ensure html2canvas is available
            const html2canvasAvailable = await this.ensureHTML2Canvas();
            if (!html2canvasAvailable) {
                throw new Error('html2canvas library not available. Screenshots are disabled.');
            }

            const canvas = await getHtml2Canvas()!(document.body, mergedOptions);
            console.log('📸 Page capture completed');

            return canvas;
        } catch (error) {
            console.error('📸 Page capture failed:', error);
            throw error;
        } finally {
            this.isCapturing = false;
        }
    }

    /**
     * Capture specific element as image
     * @param element - Element to capture
     * @param options - html2canvas options
     * @returns Canvas element with screenshot
     */
    async captureElement(element: HTMLElement, options: Html2CanvasOptions = {}): Promise<HTMLCanvasElement> {
        if (!element || !(element instanceof HTMLElement)) {
            throw new Error('Invalid element provided for capture');
        }

        const mergedOptions = { ...this.defaultOptions, ...options };

        try {
            this.isCapturing = true;
            console.log('📸 Capturing element:', element.tagName, element.id || element.className);

            // Ensure html2canvas is available
            const html2canvasAvailable = await this.ensureHTML2Canvas();
            if (!html2canvasAvailable) {
                throw new Error('html2canvas library not available. Screenshots are disabled.');
            }

            const canvas = await getHtml2Canvas()!(element, mergedOptions);
            console.log('📸 Element capture completed');

            return canvas;
        } catch (error) {
            console.error('📸 Element capture failed:', error);
            throw error;
        } finally {
            this.isCapturing = false;
        }
    }

    /**
     * Capture element by selector
     * @param selector - CSS selector for element to capture
     * @param options - html2canvas options
     * @returns Canvas element with screenshot
     */
    // eslint-disable-next-line require-await
    async captureBySelector(selector: string, options: Html2CanvasOptions = {}): Promise<HTMLCanvasElement> {
        const element = document.querySelector(selector);

        if (!element) {
            throw new Error(`Element not found with selector: ${selector}`);
        }

        return this.captureElement(element as HTMLElement, options);
    }

    /**
     * Convert canvas to data URL (base64)
     * @param canvas - Canvas to convert
     * @param format - Image format ('image/png', 'image/jpeg', 'image/webp')
     * @param quality - Image quality (0-1, for JPEG/WebP)
     * @returns Data URL
     */
    canvasToDataURL(canvas: HTMLCanvasElement, format: string = 'image/png', quality: number = 0.9): string {
        if (!canvas || !canvas.toDataURL) {
            throw new Error('Invalid canvas provided');
        }

        try {
            return canvas.toDataURL(format, quality);
        } catch (error) {
            console.error('📸 Canvas to data URL conversion failed:', error);
            throw error;
        }
    }

    /**
     * Convert canvas to blob
     * @param canvas - Canvas to convert
     * @param format - Image format ('image/png', 'image/jpeg', 'image/webp')
     * @param quality - Image quality (0-1, for JPEG/WebP)
     * @returns Image blob
     */
    // eslint-disable-next-line require-await
    async canvasToBlob(canvas: HTMLCanvasElement, format: string = 'image/png', quality: number = 0.9): Promise<Blob> {
        if (!canvas || !canvas.toBlob) {
            throw new Error('Invalid canvas provided');
        }

        return new Promise((resolve, reject) => {
            canvas.toBlob((blob) => {
                if (blob) {
                    resolve(blob);
                } else {
                    reject(new Error('Failed to convert canvas to blob'));
                }
            }, format, quality);
        });
    }

    /**
     * Capture and return as data URL (base64)
     * @param target - Element or selector to capture
     * @param options - Capture options
     * @returns Data URL
     */
    async captureAsDataURL(target?: HTMLElement | string, options: ScreenCaptureAsDataURLOptions = {}): Promise<string> {
        const { format = 'image/png', quality = 0.9, showInConsole = true, ...captureOptions } = options;

        let canvas: HTMLCanvasElement;
        let captureType = 'page';

        if (typeof target === 'string') {
            canvas = await this.captureBySelector(target, captureOptions);
            captureType = 'element';
        } else if (target instanceof HTMLElement) {
            canvas = await this.captureElement(target, captureOptions);
            captureType = 'element';
        } else {
            // Capture full page
            canvas = await this.capturePage(captureOptions);
            captureType = 'page';
        }

        const dataURL = this.canvasToDataURL(canvas, format, quality);

        // Display image in console for debugging (if enabled)
        if (showInConsole) {
            this.displayImageInConsole(dataURL, captureType);
        }

        return dataURL;
    }

    /**
     * Capture and return as blob
     * @param target - Element or selector to capture
     * @param options - Capture options
     * @returns Image blob
     */
    async captureAsBlob(target?: HTMLElement | string, options: ScreenCaptureAsBlobOptions = {}): Promise<Blob> {
        const { format = 'image/png', quality = 0.9, ...captureOptions } = options;

        let canvas: HTMLCanvasElement;
        if (typeof target === 'string') {
            canvas = await this.captureBySelector(target, captureOptions);
        } else if (target instanceof HTMLElement) {
            canvas = await this.captureElement(target, captureOptions);
        } else {
            // Capture full page
            canvas = await this.capturePage(captureOptions);
        }

        return this.canvasToBlob(canvas, format, quality);
    }

    /**
     * Download captured image
     * @param target - Element or selector to capture
     * @param options - Capture and download options
     */
    async downloadCapture(target?: HTMLElement | string, options: ScreenCaptureDownloadOptions = {}): Promise<void> {
        const {
            filename = 'screenshot.png',
            format = 'image/png',
            quality = 0.9,
            ...captureOptions
        } = options;

        try {
            const dataURL = await this.captureAsDataURL(target, { format, quality, ...captureOptions });

            // Create download link
            const link = document.createElement('a');
            link.href = dataURL;
            link.download = filename;
            link.style.display = 'none';

            document.body.appendChild(link);
            link.click();
            link.remove();

            console.log('📸 Download initiated:', filename);
        } catch (error) {
            console.error('📸 Download failed:', error);
            throw error;
        }
    }

    /**
     * Copy captured image to clipboard (if supported)
     * @param target - Element or selector to capture
     * @param options - Capture options
     */
    async copyToClipboard(target?: HTMLElement | string, options: ScreenCaptureAsBlobOptions = {}): Promise<void> {
        if (!navigator.clipboard || !navigator.clipboard.write) {
            throw new Error('Clipboard API not supported in this browser');
        }

        try {
            const blob = await this.captureAsBlob(target, options);
            const clipboardItem = new ClipboardItem({ [blob.type]: blob });

            await navigator.clipboard.write([clipboardItem]);
            console.log('📸 Image copied to clipboard');
        } catch (error) {
            console.error('📸 Clipboard copy failed:', error);
            throw error;
        }
    }

    /**
     * Interactive element selector for capture
     * @param options - Capture options
     * @returns Data URL of captured element
     */
    // eslint-disable-next-line require-await
    async interactiveCapture(options: Html2CanvasOptions = {}): Promise<string> {
        const ElementSelector = window.agentlet.utils.ElementSelector;
        const MessageBubble = window.agentlet.utils.MessageBubble;

        return new Promise((resolve, reject) => {
            const bubbleId = MessageBubble.loading('Click on an element to capture...', {
                duration: 0,
                closable: true,
                onClose: () => reject(new Error('Capture cancelled'))
            });

            ElementSelector.start(async (element, info) => {
                try {
                    MessageBubble.hide(bubbleId);
                    MessageBubble.loading('Capturing element...');

                    const dataURL = await this.captureAsDataURL(element as HTMLElement, options);

                    MessageBubble.hideAll();
                    MessageBubble.success(`Element captured: ${info.tagName}${info.id ? `#${info.id}` : ''}`, {
                        duration: 3000
                    });

                    resolve(dataURL);
                } catch (error) {
                    MessageBubble.hideAll();
                    MessageBubble.error(`Capture failed: ${(error as Error).message}`);
                    reject(error);
                }
            });
        });
    }

    /**
     * Capture visible viewport area
     * @param options - Capture options
     * @returns Canvas with viewport screenshot
     */
    // eslint-disable-next-line require-await
    async captureViewport(options: Html2CanvasOptions = {}): Promise<HTMLCanvasElement> {
        const viewportOptions = {
            ...this.defaultOptions,
            ...options,
            width: window.innerWidth,
            height: window.innerHeight,
            x: window.pageXOffset,
            y: window.pageYOffset
        };

        return this.capturePage(viewportOptions);
    }

    /**
     * Capture specific region by coordinates
     * @param region - Region coordinates {x, y, width, height}
     * @param options - Capture options
     * @returns Canvas with region screenshot
     */
    // eslint-disable-next-line require-await
    async captureRegion(region: ScreenCaptureRegion, options: Html2CanvasOptions = {}): Promise<HTMLCanvasElement> {
        const { x = 0, y = 0, width, height } = region;

        if (!width || !height) {
            throw new Error('Width and height must be specified for region capture');
        }

        const regionOptions = {
            ...this.defaultOptions,
            ...options,
            x,
            y,
            width,
            height
        };

        return this.capturePage(regionOptions);
    }

    /**
     * Get capture status
     * @returns Whether capture is in progress
     */
    isCapturingInProgress(): boolean {
        return this.isCapturing;
    }

    /**
     * Utility method to get image dimensions from data URL
     * @param dataURL - Image data URL
     * @returns Image dimensions
     */
    // eslint-disable-next-line require-await
    async getImageDimensions(dataURL: string): Promise<{ width: number; height: number }> {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = (): void => {
                resolve({
                    width: img.width,
                    height: img.height
                });
            };
            img.onerror = (): void => {
                reject(new Error('Failed to load image'));
            };
            img.src = dataURL;
        });
    }

    /**
     * Display image in browser console for debugging
     * @param dataURL - Image data URL
     * @param captureType - Type of capture ('page' or 'element')
     */
    displayImageInConsole(dataURL: string, captureType: string = 'image'): void {
        const emoji = captureType === 'page' ? '📄' : '📸';
        const title = captureType === 'page' ? 'Full page screenshot' : 'Captured image';

        console.log(`${emoji} ${title} preview:`);
        console.log('%c ', `
            font-size: 200px;
            background: url(${dataURL}) no-repeat center;
            background-size: contain;
            padding: 50px 100px;
            border: 1px solid #ccc;
        `);
    }

    /**
     * Create preview of captured image
     * @param dataURL - Image data URL
     * @param options - Preview options
     * @returns Preview element
     */
    createPreview(
        dataURL: string,
        options: { maxWidth?: number; maxHeight?: number; border?: string; borderRadius?: string } = {}
    ): HTMLElement {
        const {
            maxWidth = 300,
            maxHeight = 200,
            border = '2px solid #ddd',
            borderRadius = '8px'
        } = options;

        const preview = document.createElement('img');
        preview.src = dataURL;
        preview.style.cssText = `
            max-width: ${maxWidth}px;
            max-height: ${maxHeight}px;
            border: ${border};
            border-radius: ${borderRadius};
            display: block;
            object-fit: contain;
        `;

        return preview;
    }
}

export default ScreenCapture;
