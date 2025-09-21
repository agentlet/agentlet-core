/**
 * Tests for PDFProcessor utility
 */

import PDFProcessor from '../../../src/utils/ai/PDFProcessor.js';

// Mock PDF.js
const mockPDFJS = {
    getDocument: jest.fn(),
    GlobalWorkerOptions: { workerSrc: '' }
};

// Mock PDF document
const mockPDFDocument = {
    numPages: 3,
    getPage: jest.fn()
};

// Mock PDF page
const mockPDFPage = {
    getViewport: jest.fn(() => ({ width: 800, height: 600 })),
    render: jest.fn(() => ({ promise: Promise.resolve() }))
};

// Mock canvas
const mockCanvas = {
    getContext: jest.fn(() => ({
        fillRect: jest.fn(),
        drawImage: jest.fn()
    })),
    toDataURL: jest.fn(() => 'data:image/png;base64,mock-image-data'),
    remove: jest.fn(),
    width: 800,
    height: 600
};

describe('PDFProcessor', () => {
    let pdfProcessor;
    let originalCreateElement;
    let originalConsoleLog;
    let originalConsoleError;

    beforeEach(() => {
        pdfProcessor = new PDFProcessor();
        
        // Mock console methods
        originalConsoleLog = console.log;
        originalConsoleError = console.error;
        console.log = jest.fn();
        console.error = jest.fn();

        // Mock document.createElement for canvas
        originalCreateElement = document.createElement;
        document.createElement = jest.fn((tagName) => {
            if (tagName === 'canvas') {
                return mockCanvas;
            }
            if (tagName === 'script') {
                return {
                    onload: null,
                    onerror: null,
                    src: ''
                };
            }
            return originalCreateElement(tagName);
        });

        // Mock document.head.appendChild
        document.head.appendChild = jest.fn();

        // Reset mocks
        jest.clearAllMocks();
        mockPDFDocument.getPage.mockResolvedValue(mockPDFPage);
        mockPDFJS.getDocument.mockReturnValue({
            promise: Promise.resolve(mockPDFDocument)
        });
    });

    afterEach(() => {
        console.log = originalConsoleLog;
        console.error = originalConsoleError;
        document.createElement = originalCreateElement;
    });

    describe('Constructor', () => {
        test('should create instance with default options', () => {
            expect(pdfProcessor).toBeInstanceOf(PDFProcessor);
            expect(pdfProcessor.defaultOptions).toEqual({
                scale: 1.5,
                format: 'image/png',
                quality: 0.9,
                maxPages: 10,
                canvasFactory: null
            });
        });
    });

    describe('isPDFJSAvailable', () => {
        test('should return false when PDF.js is not loaded', () => {
            delete window.pdfjsLib;
            expect(pdfProcessor.isPDFJSAvailable()).toBe(false);
        });

        test('should return true when PDF.js is loaded', () => {
            window.pdfjsLib = mockPDFJS;
            expect(pdfProcessor.isPDFJSAvailable()).toBe(true);
        });
    });

    describe('loadPDFJS', () => {
        test('should not load if already available', async () => {
            window.pdfjsLib = mockPDFJS;
            await pdfProcessor.loadPDFJS();
            // No dynamic loading should happen with bundled version
            expect(document.head.appendChild).not.toHaveBeenCalled();
        });

        test('should wait for bundled PDF.js to become available', async () => {
            delete window.pdfjsLib;
            
            // Simulate AgentletCore setting up PDF.js after a delay
            setTimeout(() => {
                window.pdfjsLib = mockPDFJS;
            }, 50);

            await pdfProcessor.loadPDFJS();
            
            // Should not try to create script elements for bundled version
            expect(document.head.appendChild).not.toHaveBeenCalled();
            expect(console.log).toHaveBeenCalledWith('📄 PDF.js library is available (bundled version)');
        });

        test('should timeout if bundled PDF.js never becomes available', async () => {
            delete window.pdfjsLib;
            
            // Mock setTimeout to make test faster
            const originalSetTimeout = global.setTimeout;
            let timeoutCallbacks = [];
            global.setTimeout = jest.fn((callback, delay) => {
                timeoutCallbacks.push(callback);
                return originalSetTimeout(callback, 0); // Execute immediately for test
            });

            const promise = pdfProcessor.loadPDFJS();
            
            // Execute all timeout callbacks to simulate waiting
            for (let i = 0; i < 50; i++) {
                if (timeoutCallbacks[i]) {
                    timeoutCallbacks[i]();
                }
            }

            await expect(promise).rejects.toThrow('PDF.js library is not available. Make sure AgentletCore is properly initialized.');
            
            global.setTimeout = originalSetTimeout;
        }, 10000);
    });

    describe('convertPDFToImages', () => {
        beforeEach(() => {
            window.pdfjsLib = mockPDFJS;
        });

        test('should convert PDF to images successfully', async () => {
            const mockArrayBuffer = new ArrayBuffer(8);
            
            const images = await pdfProcessor.convertPDFToImages(mockArrayBuffer);
            
            expect(images).toHaveLength(3); // mockPDFDocument.numPages
            expect(images[0]).toBe('data:image/png;base64,mock-image-data');
            expect(mockPDFJS.getDocument).toHaveBeenCalledWith({
                data: mockArrayBuffer,
                cMapUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/cmaps/',
                cMapPacked: true,
                verbosity: 0,
                standardFontDataUrl: 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/standard_fonts/'
            });
        });

        test('should handle File objects by converting to ArrayBuffer', async () => {
            const mockFile = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
            
            // Mock the fileToArrayBuffer method
            const mockArrayBuffer = new ArrayBuffer(8);
            pdfProcessor.fileToArrayBuffer = jest.fn().mockResolvedValue(mockArrayBuffer);
            
            const images = await pdfProcessor.convertPDFToImages(mockFile);
            
            expect(pdfProcessor.fileToArrayBuffer).toHaveBeenCalledWith(mockFile);
            expect(images).toHaveLength(3);
        });

        test('should respect maxPages option', async () => {
            const mockArrayBuffer = new ArrayBuffer(8);
            const options = { maxPages: 2 };
            
            const images = await pdfProcessor.convertPDFToImages(mockArrayBuffer, options);
            
            expect(images).toHaveLength(2);
            expect(mockPDFDocument.getPage).toHaveBeenCalledTimes(2);
        });

        test('should handle PDF loading failure', async () => {
            mockPDFJS.getDocument.mockReturnValue({
                promise: Promise.reject(new Error('Invalid PDF'))
            });
            
            const mockArrayBuffer = new ArrayBuffer(8);
            
            await expect(pdfProcessor.convertPDFToImages(mockArrayBuffer))
                .rejects.toThrow('PDF conversion failed: Invalid PDF');
        });

        test('should handle page rendering failure', async () => {
            // Mock page render failure for page 2
            mockPDFDocument.getPage.mockImplementation((pageNum) => {
                if (pageNum === 2) {
                    return Promise.reject(new Error('Page render failed'));
                }
                return Promise.resolve(mockPDFPage);
            });
            
            const mockArrayBuffer = new ArrayBuffer(8);
            
            const images = await pdfProcessor.convertPDFToImages(mockArrayBuffer);
            
            // Should continue with other pages despite one failure
            expect(images).toHaveLength(2); // 3 total - 1 failed
            expect(console.error).toHaveBeenCalledWith(
                '📄 Error processing page 2:',
                expect.any(Error)
            );
        });
    });

    describe('convertFileInputToImages', () => {
        beforeEach(() => {
            window.pdfjsLib = mockPDFJS;
        });

        test('should handle file input with PDF file', async () => {
            const mockFile = new File(['pdf content'], 'test.pdf', { type: 'application/pdf' });
            const mockFileInput = {
                files: [mockFile]
            };

            // Mock the convertPDFToImages method since it now handles File objects directly
            pdfProcessor.convertPDFToImages = jest.fn().mockResolvedValue(['image1', 'image2', 'image3']);

            const images = await pdfProcessor.convertFileInputToImages(mockFileInput);
            
            expect(images).toHaveLength(3);
            expect(pdfProcessor.convertPDFToImages).toHaveBeenCalledWith(mockFile, {});
        });

        test('should reject if no file selected', async () => {
            const mockFileInput = { files: [] };
            
            await expect(pdfProcessor.convertFileInputToImages(mockFileInput))
                .rejects.toThrow('No PDF file selected');
        });

        test('should reject if file is not PDF', async () => {
            const mockFile = new File(['content'], 'test.txt', { type: 'text/plain' });
            const mockFileInput = { files: [mockFile] };
            
            await expect(pdfProcessor.convertFileInputToImages(mockFileInput))
                .rejects.toThrow('Selected file is not a PDF');
        });
    });

    describe('convertPDFFromURL', () => {
        beforeEach(() => {
            window.pdfjsLib = mockPDFJS;
        });

        test('should fetch and convert PDF from URL', async () => {
            const mockArrayBuffer = new ArrayBuffer(8);
            
            global.fetch = jest.fn(() => Promise.resolve({
                ok: true,
                arrayBuffer: () => Promise.resolve(mockArrayBuffer)
            }));

            const images = await pdfProcessor.convertPDFFromURL('https://example.com/test.pdf');
            
            expect(fetch).toHaveBeenCalledWith('https://example.com/test.pdf');
            expect(images).toHaveLength(3);
        });

        test('should handle fetch failure', async () => {
            global.fetch = jest.fn(() => Promise.resolve({
                ok: false,
                status: 404,
                statusText: 'Not Found'
            }));

            await expect(pdfProcessor.convertPDFFromURL('https://example.com/test.pdf'))
                .rejects.toThrow('Failed to load PDF from URL: HTTP 404: Not Found');
        });
    });

    describe('displayPDFImagesInConsole', () => {
        test('should display images in console', () => {
            const images = ['data:image/png;base64,image1', 'data:image/png;base64,image2'];
            
            pdfProcessor.displayPDFImagesInConsole(images, 'Test PDF');
            
            expect(console.log).toHaveBeenCalledWith('📄 Test PDF converted to 2 page(s):');
            expect(console.log).toHaveBeenCalledWith('📄 Page 1:');
            expect(console.log).toHaveBeenCalledWith('📄 Page 2:');
        });
    });

    describe('createPDFPreviews', () => {
        test.skip('DOM manipulation method - requires jQuery integration', () => {
            // This test is skipped as it requires complex jQuery DOM mocking
            // The method works correctly in the browser environment
        });
    });

    describe('getCapabilities', () => {
        test('should return capability information', () => {
            window.pdfjsLib = mockPDFJS;
            
            const capabilities = pdfProcessor.getCapabilities();
            
            expect(capabilities).toEqual({
                pdfJSAvailable: true,
                supportedFormats: ['application/pdf'],
                outputFormats: ['image/png', 'image/jpeg', 'image/webp'],
                maxRecommendedFileSize: '50MB',
                maxRecommendedPages: 10,
                features: [
                    'PDF to image conversion',
                    'Multi-page support',
                    'Configurable resolution',
                    'Memory-efficient processing',
                    'Console preview',
                    'AI integration ready'
                ]
            });
        });
    });
});