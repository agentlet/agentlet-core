/**
 * Library Setup Manager
 * Handles initialization of external libraries (XLSX, html2canvas, PDF.js, hotkeys)
 * Supports both bundled libraries and dynamic loading from registry
 */


import LibraryLoader from './LibraryLoader.js';

export class LibrarySetup {
    constructor(config = {}) {
        this.config = config;
        this.libraryLoader = null;
        this.loadingMode = config.loadingMode || 'bundled'; // 'bundled' or 'registry'
    }
    
    /**
     * Initialize library loader with registry configuration
     * @param {Object} registryConfig - Registry configuration with libraries paths
     */
    initializeRegistryLoader(registryConfig = {}) {
        if (this.loadingMode === 'registry') {
            this.libraryLoader = new LibraryLoader(registryConfig);
            console.log('📚 Registry-based library loading enabled');
        }
    }


    /**
     * Set up XLSX library for Excel export functionality
     */
    setupXLSX(XLSX) {
        // Make XLSX available globally for TableExtractor
        if (typeof window.XLSX === 'undefined') {
            window.XLSX = XLSX;
            console.log('📊 XLSX library loaded for Excel export functionality');
        }
    }

    /**
     * Set up html2canvas library for screenshot functionality
     */
    setupHTML2Canvas(html2canvas) {
        // Make html2canvas available globally for ScreenCapture
        if (typeof window.html2canvas === 'undefined') {
            window.html2canvas = html2canvas;
            console.log('📸 html2canvas library loaded for screenshot functionality');
        }
    }

    /**
     * Set up PDF.js library for PDF processing functionality
     */
    setupPDFJS(pdfjsLib) {
        // Make PDF.js available globally for PDFProcessor
        if (typeof window.pdfjsLib === 'undefined') {
            window.pdfjsLib = pdfjsLib;
            
            // Configure worker URL - prioritize explicit config, then derive from registry URL
            let workerSrc = './pdf.worker.min.js'; // fallback
            
            if (this.config.pdfWorkerUrl) {
                // Explicit worker URL provided
                workerSrc = this.config.pdfWorkerUrl;
            } else if (this.config.registryUrl) {
                // Derive worker URL from registry URL
                // e.g., https://example.com/static/agentlets-registry.json -> https://example.com/static/pdf.worker.min.js
                try {
                    const registryUrl = new URL(this.config.registryUrl);
                    registryUrl.pathname = registryUrl.pathname.replace(/[^/]+$/, 'pdf.worker.min.js');
                    workerSrc = registryUrl.toString();
                } catch (error) {
                    console.warn('Failed to derive PDF worker URL from registry URL:', error);
                }
            }
            
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
            window.pdfjsLib.GlobalWorkerOptions.verbosity = 0;
            
            console.log('📄 PDF.js library loaded for PDF processing functionality');
            console.log('📄 PDF.js worker URL set to:', workerSrc);
            
            // Verify the setting worked
            console.log('📄 PDF.js GlobalWorkerOptions.workerSrc:', window.pdfjsLib.GlobalWorkerOptions.workerSrc);
        }
    }

    /**
     * Configure PDF.js worker URL manually
     * @param {string} workerUrl - URL to the PDF.js worker file
     */
    configurePDFWorker(workerUrl) {
        if (window.pdfjsLib) {
            window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
            console.log('📄 PDF.js worker URL manually set to:', workerUrl);
        } else {
            console.warn('📄 PDF.js not loaded yet, cannot set worker URL');
        }
    }
    
    /**
     * Set up hotkeys library for keyboard shortcuts
     */
    setupHotkeys(hotkeys, shortcutManager) {
        // Make hotkeys available globally
        if (typeof window.hotkeys === 'undefined') {
            window.hotkeys = hotkeys;
            console.log('⌨️ hotkeys-js library loaded for keyboard shortcuts');
        }
        
        // Initialize shortcut manager with hotkeys
        if (shortcutManager) {
            shortcutManager.init(hotkeys);
            console.log('⌨️ ShortcutManager initialized with hotkeys-js');
        }
    }

    /**
     * Initialize all libraries at once
     * Supports both bundled and registry-based loading
     */
    initializeAll(libraries = {}, shortcutManager) {
        if (this.loadingMode === 'bundled') {
            // Traditional bundled approach
            const { XLSX, html2canvas, pdfjsLib, hotkeys } = libraries;
            
            if (XLSX) this.setupXLSX(XLSX);
            if (html2canvas) this.setupHTML2Canvas(html2canvas);
            if (pdfjsLib) this.setupPDFJS(pdfjsLib);
            if (hotkeys) this.setupHotkeys(hotkeys, shortcutManager);
            
            console.log('📚 Bundled libraries setup completed');
        } else {
            // Registry-based approach - libraries loaded on demand
            console.log('📚 Registry-based loading enabled - libraries will load on demand');
        }
    }
    
    /**
     * Get the library loader instance
     * @returns {LibraryLoader|null}
     */
    getLibraryLoader() {
        return this.libraryLoader;
    }
    
    /**
     * Load a library dynamically (for registry mode)
     * @param {string} name - Library name
     * @returns {Promise<boolean>}
     */
    async loadLibrary(name) {
        if (this.loadingMode === 'bundled') {
            // In bundled mode, libraries should already be available
            return this.isLibraryAvailable(name);
        }
        
        if (!this.libraryLoader) {
            throw new Error('Library loader not initialized. Call initializeRegistryLoader() first.');
        }
        
        return await this.libraryLoader.loadLibrary(name);
    }
    
    /**
     * Check if a library is available
     * @param {string} name - Library name
     * @returns {boolean}
     */
    isLibraryAvailable(name) {
        switch (name) {
        case 'xlsx':
            return typeof window.XLSX !== 'undefined';
        case 'html2canvas':
            return typeof window.html2canvas !== 'undefined';
        case 'pdfjs':
            return typeof window.pdfjsLib !== 'undefined';
        case 'hotkeys':
            return typeof window.hotkeys !== 'undefined';
        default:
            return false;
        }
    }
    
    /**
     * Ensure a library is available (load if needed)
     * @param {string} name - Library name
     * @returns {Promise<boolean>}
     */
    async ensureLibrary(name) {
        if (this.isLibraryAvailable(name)) {
            return true;
        }
        
        if (this.loadingMode === 'registry' && this.libraryLoader) {
            return await this.libraryLoader.loadLibrary(name);
        }
        
        return false;
    }
}