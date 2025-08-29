/**
 * Screen Capture Utility for Agentlet Core
 * Provides DOM screenshot functionality using html2canvas
 */

export default class ScreenCapture {
    constructor() {
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
     * Capture entire page as image
     * @param {Object} options - html2canvas options
     * @returns {Promise<HTMLCanvasElement>} Canvas element with screenshot
     */
    async capturePage(options = {}) {
        const mergedOptions = { ...this.defaultOptions, ...options };
        const $ = window.agentlet.$;
        
        try {
            this.isCapturing = true;
            console.log('📸 Capturing full page...');
            
            // Check if html2canvas is available
            if (typeof window.html2canvas === 'undefined') {
                throw new Error('html2canvas library not loaded. Please include html2canvas in your page.');
            }
            
            const canvas = await window.html2canvas($('body')[0], mergedOptions);
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
     * @param {HTMLElement} element - Element to capture
     * @param {Object} options - html2canvas options
     * @returns {Promise<HTMLCanvasElement>} Canvas element with screenshot
     */
    async captureElement(element, options = {}) {
        if (!element || !(element instanceof HTMLElement)) {
            throw new Error('Invalid element provided for capture');
        }

        const mergedOptions = { ...this.defaultOptions, ...options };
        
        try {
            this.isCapturing = true;
            console.log('📸 Capturing element:', element.tagName, element.id || element.className);
            
            // Check if html2canvas is available
            if (typeof window.html2canvas === 'undefined') {
                throw new Error('html2canvas library not loaded. Please include html2canvas in your page.');
            }
            
            const canvas = await window.html2canvas(element, mergedOptions);
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
     * @param {string} selector - CSS selector for element to capture
     * @param {Object} options - html2canvas options
     * @returns {Promise<HTMLCanvasElement>} Canvas element with screenshot
     */
    // eslint-disable-next-line require-await
    async captureBySelector(selector, options = {}) {
        const $ = window.agentlet.$;
        const element = $(selector)[0];
        
        if (!element) {
            throw new Error(`Element not found with selector: ${selector}`);
        }

        return this.captureElement(element, options);
    }

    /**
     * Convert canvas to data URL (base64)
     * @param {HTMLCanvasElement} canvas - Canvas to convert
     * @param {string} format - Image format ('image/png', 'image/jpeg', 'image/webp')
     * @param {number} quality - Image quality (0-1, for JPEG/WebP)
     * @returns {string} Data URL
     */
    canvasToDataURL(canvas, format = 'image/png', quality = 0.9) {
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
     * @param {HTMLCanvasElement} canvas - Canvas to convert
     * @param {string} format - Image format ('image/png', 'image/jpeg', 'image/webp')
     * @param {number} quality - Image quality (0-1, for JPEG/WebP)
     * @returns {Promise<Blob>} Image blob
     */
    // eslint-disable-next-line require-await
    async canvasToBlob(canvas, format = 'image/png', quality = 0.9) {
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
     * @param {HTMLElement|string} target - Element or selector to capture
     * @param {Object} options - Capture options
     * @returns {Promise<string>} Data URL
     */
    async captureAsDataURL(target, options = {}) {
        const { format = 'image/png', quality = 0.9, showInConsole = true, ...captureOptions } = options;
        
        let canvas;
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
     * @param {HTMLElement|string} target - Element or selector to capture
     * @param {Object} options - Capture options
     * @returns {Promise<Blob>} Image blob
     */
    async captureAsBlob(target, options = {}) {
        const { format = 'image/png', quality = 0.9, ...captureOptions } = options;
        
        let canvas;
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
     * @param {HTMLElement|string} target - Element or selector to capture
     * @param {Object} options - Capture and download options
     */
    async downloadCapture(target, options = {}) {
        const {
            filename = 'screenshot.png',
            format = 'image/png',
            quality = 0.9,
            ...captureOptions
        } = options;

        try {
            const dataURL = await this.captureAsDataURL(target, { format, quality, ...captureOptions });
            
            // Create download link
            const $ = window.agentlet.$;
            const link = $('<a>')[0];
            link.href = dataURL;
            link.download = filename;
            link.style.display = 'none';
            
            $('body').append(link);
            link.click();
            $(link).remove();
            
            console.log('📸 Download initiated:', filename);
        } catch (error) {
            console.error('📸 Download failed:', error);
            throw error;
        }
    }

    /**
     * Copy captured image to clipboard (if supported)
     * @param {HTMLElement|string} target - Element or selector to capture
     * @param {Object} options - Capture options
     */
    async copyToClipboard(target, options = {}) {
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
     * @param {Object} options - Capture options
     * @returns {Promise<string>} Data URL of captured element
     */
    // eslint-disable-next-line require-await
    async interactiveCapture(options = {}) {
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
                    
                    const dataURL = await this.captureAsDataURL(element, options);
                    
                    MessageBubble.hideAll();
                    MessageBubble.success(`Element captured: ${info.tagName}${info.id ? `#${  info.id}` : ''}`, {
                        duration: 3000
                    });
                    
                    resolve(dataURL);
                } catch (error) {
                    MessageBubble.hideAll();
                    MessageBubble.error(`Capture failed: ${  error.message}`);
                    reject(error);
                }
            });
        });
    }

    /**
     * Capture visible viewport area
     * @param {Object} options - Capture options
     * @returns {Promise<HTMLCanvasElement>} Canvas with viewport screenshot
     */
    // eslint-disable-next-line require-await
    async captureViewport(options = {}) {
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
     * @param {Object} region - Region coordinates {x, y, width, height}
     * @param {Object} options - Capture options
     * @returns {Promise<HTMLCanvasElement>} Canvas with region screenshot
     */
    // eslint-disable-next-line require-await
    async captureRegion(region, options = {}) {
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
     * @returns {boolean} Whether capture is in progress
     */
    isCapturingInProgress() {
        return this.isCapturing;
    }

    /**
     * Utility method to get image dimensions from data URL
     * @param {string} dataURL - Image data URL
     * @returns {Promise<{width: number, height: number}>} Image dimensions
     */
    // eslint-disable-next-line require-await
    async getImageDimensions(dataURL) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                resolve({
                    width: img.width,
                    height: img.height
                });
            };
            img.onerror = () => {
                reject(new Error('Failed to load image'));
            };
            img.src = dataURL;
        });
    }

    /**
     * Display image in browser console for debugging
     * @param {string} dataURL - Image data URL
     * @param {string} captureType - Type of capture ('page' or 'element')
     */
    displayImageInConsole(dataURL, captureType = 'image') {
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
     * @param {string} dataURL - Image data URL
     * @param {Object} options - Preview options
     * @returns {HTMLElement} Preview element
     */
    createPreview(dataURL, options = {}) {
        const {
            maxWidth = 300,
            maxHeight = 200,
            border = '2px solid #ddd',
            borderRadius = '8px'
        } = options;

        const $ = window.agentlet.$;
        const preview = $('<img>')[0];
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