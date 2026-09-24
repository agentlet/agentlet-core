/**
 * PDF Processor - PDF-to-image conversion utility for agentlet-core
 * Converts PDF files to images for AI analysis using PDF.js
 */
import type { PDFConversionOptions, PDFCapabilities, PDFProcessorAPI, LibrarySetupAPI } from '../../types/public-api';

/**
 * Minimal shape of the `pdfjs-dist` global this file reads - only the
 * members actually called, not the full library surface. `pdfjs-dist` is
 * never imported here; `LibrarySetup.js` (see `src/libraries/LibrarySetup.js`)
 * assigns it onto `window.pdfjsLib` at runtime (bundled mode) or the caller
 * loads it before calling in, so it is read through `getPdfjsLib()` (via
 * `window`) rather than a `window.pdfjsLib` typed as part of the global
 * `Window` interface - the same approach `ScreenCapture.ts` uses for the
 * `html2canvas` global.
 */
interface PDFJSViewport {
    width: number;
    height: number;
}

interface PDFJSRenderContext {
    canvasContext: CanvasRenderingContext2D | null;
    viewport: PDFJSViewport;
}

interface PDFJSPage {
    getViewport(params: { scale: number }): PDFJSViewport;
    render(renderContext: PDFJSRenderContext): { promise: Promise<void> };
}

interface PDFJSDocument {
    numPages: number;
    getPage(pageNumber: number): Promise<PDFJSPage>;
}

interface PDFJSGetDocumentParams {
    data: ArrayBuffer | Uint8Array;
    cMapUrl?: string;
    cMapPacked?: boolean;
    verbosity?: number;
    standardFontDataUrl?: string;
}

interface PDFJSLib {
    getDocument(params: PDFJSGetDocumentParams): { promise: Promise<PDFJSDocument> };
}

function getPdfjsLib(): PDFJSLib | undefined {
    return (window as unknown as { pdfjsLib?: PDFJSLib }).pdfjsLib;
}

/** `this.defaultOptions`, always fully populated (unlike the caller-facing, all-optional `PDFConversionOptions`). */
interface PDFProcessorDefaultOptions {
    scale: number;
    format: string;
    quality: number;
    maxPages: number;
    /** Accepted but currently unused by the conversion routine. */
    canvasFactory: unknown;
}

export default class PDFProcessor implements PDFProcessorAPI {
    librarySetup: LibrarySetupAPI | null;
    defaultOptions: PDFProcessorDefaultOptions;

    constructor(librarySetup: LibrarySetupAPI | null = null) {
        this.librarySetup = librarySetup;
        this.defaultOptions = {
            scale: 1.5,
            format: 'image/png',
            quality: 0.9,
            maxPages: 10, // Limit to prevent memory issues
            canvasFactory: null
        };
    }

    /**
     * Check if PDF.js is available
     * @returns True if PDF.js is loaded
     */
    isPDFJSAvailable(): boolean {
        return typeof getPdfjsLib() !== 'undefined';
    }

    /**
     * Ensure PDF.js library is loaded
     */
    async ensurePDFJS(): Promise<boolean> {
        if (this.isPDFJSAvailable()) {
            return true;
        }

        if (this.librarySetup) {
            try {
                console.log('📄 Loading PDF.js library for PDF processing...');
                return await this.librarySetup.ensureLibrary('pdfjs');
            } catch (error) {
                console.warn('📄 Failed to load PDF.js library:', (error as Error).message);
                return false;
            }
        }

        // Wait for AgentletCore to initialize and set up PDF.js (bundled mode)
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max wait

        while (!this.isPDFJSAvailable() && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }

        if (!this.isPDFJSAvailable()) {
            console.warn('📄 PDF.js library is not available. PDF processing is disabled.');
            return false;
        }

        console.log('📄 PDF.js library is available (bundled version)');
        return true;
    }

    /**
     * Load PDF.js (backward compatibility)
     * @returns Promise that resolves when PDF.js is available
     */
    async loadPDFJS(): Promise<void> {
        const available = await this.ensurePDFJS();
        if (!available) {
            throw new Error('PDF.js library is not available. PDF processing is disabled.');
        }
    }

    /**
     * Convert PDF file to array of base64 images
     * @param pdfData - PDF file data
     * @param options - Conversion options
     * @returns Array of base64 image data URLs
     */
    async convertPDFToImages(pdfData: File | ArrayBuffer | Uint8Array, options: PDFConversionOptions = {}): Promise<string[]> {
        const pdfJSAvailable = await this.ensurePDFJS();
        if (!pdfJSAvailable) {
            throw new Error('PDF.js library not available. PDF processing is disabled.');
        }

        const mergedOptions: PDFProcessorDefaultOptions = { ...this.defaultOptions, ...options };
        const images: string[] = [];

        try {
            console.log('📄 Loading PDF document...');

            // Convert File to ArrayBuffer if needed
            let processedData: File | ArrayBuffer | Uint8Array = pdfData;
            if (pdfData instanceof File) {
                console.log(`📄 Converting File to ArrayBuffer: ${pdfData.name}`);
                processedData = await this.fileToArrayBuffer(pdfData);
            }

            // At this point processedData is never actually a File: either the caller
            // passed an ArrayBuffer/Uint8Array directly, or the `instanceof File` branch
            // above just replaced it with one. tsc cannot see that from the `if` alone,
            // so the buffer-only members it reads below go through this one cast.
            const bufferData = processedData as ArrayBuffer | Uint8Array;

            // Validate data
            if (!bufferData || bufferData.byteLength === 0) {
                throw new Error('PDF data is empty or invalid');
            }

            // Load PDF document with proper error handling
            const loadingTask = getPdfjsLib()!.getDocument({
                data: bufferData,
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                cMapPacked: true,
                verbosity: 0, // Reduce console noise
                standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/'
            });

            const pdf = await loadingTask.promise;

            const totalPages = Math.min(pdf.numPages, mergedOptions.maxPages);
            console.log(`📄 PDF loaded: ${totalPages} pages (of ${pdf.numPages} total)`);

            // Convert each page to image
            for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
                try {
                    console.log(`📄 Processing page ${pageNum}/${totalPages}...`);

                    const page = await pdf.getPage(pageNum);
                    const viewport = page.getViewport({ scale: mergedOptions.scale });

                    // Create canvas
                    const canvas = document.createElement('canvas');
                    const context = canvas.getContext('2d');
                    canvas.height = viewport.height;
                    canvas.width = viewport.width;

                    // Render page to canvas
                    const renderContext: PDFJSRenderContext = {
                        canvasContext: context,
                        viewport: viewport
                    };

                    await page.render(renderContext).promise;

                    // Convert canvas to base64
                    const imageDataURL = canvas.toDataURL(mergedOptions.format, mergedOptions.quality);
                    images.push(imageDataURL);

                    // Clean up
                    canvas.remove();

                    console.log(`📄 Page ${pageNum} converted successfully`);

                } catch (pageError) {
                    console.error(`📄 Error processing page ${pageNum}:`, pageError);
                    // Continue with other pages
                }
            }

            console.log(`📄 PDF conversion completed: ${images.length} images created`);
            return images;

        } catch (error) {
            console.error('📄 PDF conversion failed:', error);

            const errorMessage = (error as Error).message;

            // Check if it's a worker-related error and provide helpful guidance
            if (errorMessage && errorMessage.includes('GlobalWorkerOptions.workerSrc')) {
                console.error('📄 PDF.js worker configuration issue. You can fix this by:');
                console.error('1. Setting pdfWorkerPath in agentletConfig before initialization');
                console.error('2. Or calling window.agentlet.configurePDFWorker("/path/to/pdf.worker.min.js")');
                console.error('3. Or using the CDN fallback: window.agentlet.configurePDFWorker("https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js")');

                // Try to automatically fallback to CDN worker
                if (window.agentlet && window.agentlet.configurePDFWorker) {
                    console.log('📄 Attempting automatic fallback to CDN worker...');
                    const cdnWorker = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                    window.agentlet.configurePDFWorker(cdnWorker);

                    // Suggest user to retry
                    throw new Error(`PDF worker not found. Automatically configured CDN fallback. Please try again. Original error: ${errorMessage}`);
                }
            }

            throw new Error(`PDF conversion failed: ${errorMessage}`);
        }
    }

    /**
     * Convert File to ArrayBuffer
     * @param file - File object
     */
    async fileToArrayBuffer(file: File): Promise<ArrayBuffer> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();

            reader.onload = (event): void => {
                resolve(event.target!.result as ArrayBuffer);
            };

            reader.onerror = (): void => {
                reject(new Error('Failed to read PDF file'));
            };

            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Convert PDF file input to images
     * @param fileInput - File input element
     * @param options - Conversion options
     */
    async convertFileInputToImages(fileInput: HTMLInputElement, options: PDFConversionOptions = {}): Promise<string[]> {
        if (!fileInput || !fileInput.files || fileInput.files.length === 0) {
            throw new Error('No PDF file selected');
        }

        const file = fileInput.files[0];
        if (file.type !== 'application/pdf') {
            throw new Error('Selected file is not a PDF');
        }

        console.log(`📄 Converting PDF file: ${file.name} (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

        // Use the main convertPDFToImages method which now handles File objects
        return await this.convertPDFToImages(file, options);
    }

    /**
     * Convert PDF from URL to images
     * @param pdfUrl - URL to PDF file
     * @param options - Conversion options
     */
    async convertPDFFromURL(pdfUrl: string, options: PDFConversionOptions = {}): Promise<string[]> {
        try {
            console.log(`📄 Fetching PDF from URL: ${pdfUrl}`);

            const response = await fetch(pdfUrl);
            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: ${response.statusText}`);
            }

            const arrayBuffer = await response.arrayBuffer();
            return await this.convertPDFToImages(arrayBuffer, options);

        } catch (error) {
            console.error('📄 Failed to fetch PDF from URL:', error);
            throw new Error(`Failed to load PDF from URL: ${(error as Error).message}`);
        }
    }

    /**
     * Display PDF page images in console for debugging
     * @param images - Array of base64 image data URLs
     * @param pdfName - Name of the PDF for logging
     */
    displayPDFImagesInConsole(images: string[], pdfName: string = 'PDF'): void {
        console.log(`📄 ${pdfName} converted to ${images.length} page(s):`);

        images.forEach((image, index) => {
            console.log(`📄 Page ${index + 1}:`);
            console.log('%c ', `
                font-size: 200px;
                background: url(${image}) no-repeat center;
                background-size: contain;
                padding: 50px 100px;
                border: 1px solid #ccc;
                margin: 5px 0;
            `);
        });
    }

    /**
     * Create preview elements for PDF pages
     * @param images - Array of base64 image data URLs
     * @param options - Preview options
     */
    createPDFPreviews(
        images: string[],
        options: { maxWidth?: number; maxHeight?: number; border?: string; borderRadius?: string; showPageNumbers?: boolean } = {}
    ): HTMLElement[] {
        const {
            maxWidth = 300,
            maxHeight = 400,
            border = '2px solid #ddd',
            borderRadius = '8px',
            showPageNumbers = true
        } = options;

        const previews: HTMLElement[] = [];

        images.forEach((image, index) => {
            const container = document.createElement('div');
            container.style.cssText = `
                display: inline-block;
                margin: 10px;
                text-align: center;
            `;

            const img = document.createElement('img');
            img.src = image;
            img.style.cssText = `
                max-width: ${maxWidth}px;
                max-height: ${maxHeight}px;
                border: ${border};
                border-radius: ${borderRadius};
                display: block;
                object-fit: contain;
            `;

            container.appendChild(img);

            if (showPageNumbers) {
                const label = document.createElement('div');
                label.textContent = `Page ${index + 1}`;
                label.style.cssText = `
                    margin-top: 5px;
                    font-size: 12px;
                    color: #666;
                    font-family: Arial, sans-serif;
                `;
                container.appendChild(label);
            }

            previews.push(container);
        });

        return previews;
    }

    /**
     * Get information about PDF processing capabilities
     */
    getCapabilities(): PDFCapabilities {
        return {
            pdfJSAvailable: this.isPDFJSAvailable(),
            supportedFormats: ['application/pdf'],
            outputFormats: ['image/png', 'image/jpeg', 'image/webp'],
            maxRecommendedFileSize: '50MB',
            maxRecommendedPages: this.defaultOptions.maxPages,
            features: [
                'PDF to image conversion',
                'Multi-page support',
                'Configurable resolution',
                'Memory-efficient processing',
                'Console preview',
                'AI integration ready'
            ]
        };
    }
}
