/**
 * PDF Processor - PDF-to-image conversion utility for agentlet-core
 * Converts PDF files to images for AI analysis using PDF.js
 */

export default class PDFProcessor {
    constructor(librarySetup = null) {
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
     * @returns {boolean} True if PDF.js is loaded
     */
    isPDFJSAvailable() {
        return typeof window.pdfjsLib !== 'undefined';
    }

    /**
     * Ensure PDF.js library is loaded
     * @returns {Promise<boolean>}
     */
    async ensurePDFJS() {
        if (this.isPDFJSAvailable()) {
            return true;
        }
        
        if (this.librarySetup) {
            try {
                console.log('📄 Loading PDF.js library for PDF processing...');
                return await this.librarySetup.ensureLibrary('pdfjs');
            } catch (error) {
                console.warn('📄 Failed to load PDF.js library:', error.message);
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
     * @returns {Promise<void>} Promise that resolves when PDF.js is available
     */
    async loadPDFJS() {
        const available = await this.ensurePDFJS();
        if (!available) {
            throw new Error('PDF.js library is not available. PDF processing is disabled.');
        }
    }

    /**
     * Convert PDF file to array of base64 images
     * @param {File|ArrayBuffer|Uint8Array} pdfData - PDF file data
     * @param {Object} options - Conversion options
     * @returns {Promise<Array<string>>} Array of base64 image data URLs
     */
    async convertPDFToImages(pdfData, options = {}) {
        const pdfJSAvailable = await this.ensurePDFJS();
        if (!pdfJSAvailable) {
            throw new Error('PDF.js library not available. PDF processing is disabled.');
        }

        const mergedOptions = { ...this.defaultOptions, ...options };
        const images = [];

        try {
            console.log('📄 Loading PDF document...');
            
            // Convert File to ArrayBuffer if needed
            let processedData = pdfData;
            if (pdfData instanceof File) {
                console.log(`📄 Converting File to ArrayBuffer: ${pdfData.name}`);
                processedData = await this.fileToArrayBuffer(pdfData);
            }
            
            // Validate data
            if (!processedData || processedData.byteLength === 0) {
                throw new Error('PDF data is empty or invalid');
            }
            
            // Load PDF document with proper error handling
            const loadingTask = window.pdfjsLib.getDocument({
                data: processedData,
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
                    const renderContext = {
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
            
            // Check if it's a worker-related error and provide helpful guidance
            if (error.message && error.message.includes('GlobalWorkerOptions.workerSrc')) {
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
                    throw new Error(`PDF worker not found. Automatically configured CDN fallback. Please try again. Original error: ${error.message}`);
                }
            }
            
            throw new Error(`PDF conversion failed: ${error.message}`);
        }
    }

    /**
     * Convert File to ArrayBuffer
     * @param {File} file - File object
     * @returns {Promise<ArrayBuffer>} ArrayBuffer
     */
    async fileToArrayBuffer(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            
            reader.onload = (event) => {
                resolve(event.target.result);
            };
            
            reader.onerror = () => {
                reject(new Error('Failed to read PDF file'));
            };
            
            reader.readAsArrayBuffer(file);
        });
    }

    /**
     * Convert PDF file input to images
     * @param {HTMLInputElement} fileInput - File input element
     * @param {Object} options - Conversion options
     * @returns {Promise<Array<string>>} Array of base64 image data URLs
     */
    async convertFileInputToImages(fileInput, options = {}) {
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
     * @param {string} pdfUrl - URL to PDF file
     * @param {Object} options - Conversion options
     * @returns {Promise<Array<string>>} Array of base64 image data URLs
     */
    async convertPDFFromURL(pdfUrl, options = {}) {
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
            throw new Error(`Failed to load PDF from URL: ${error.message}`);
        }
    }

    /**
     * Display PDF page images in console for debugging
     * @param {Array<string>} images - Array of base64 image data URLs
     * @param {string} pdfName - Name of the PDF for logging
     */
    displayPDFImagesInConsole(images, pdfName = 'PDF') {
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
     * @param {Array<string>} images - Array of base64 image data URLs
     * @param {Object} options - Preview options
     * @returns {Array<HTMLElement>} Array of preview image elements
     */
    createPDFPreviews(images, options = {}) {
        const {
            maxWidth = 300,
            maxHeight = 400,
            border = '2px solid #ddd',
            borderRadius = '8px',
            showPageNumbers = true
        } = options;

        const previews = [];

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
     * @returns {Object} Capability information
     */
    getCapabilities() {
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