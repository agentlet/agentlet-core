/**
 * LibraryLoader - Dynamic loading of external libraries
 * Supports registry-based loading from internal hosting infrastructure
 */

export class LibraryLoader {
    constructor(registryConfig = {}) {
        this.libraries = registryConfig.libraries || {};
        this.loadedLibraries = new Set();
        this.loadingPromises = new Map();
        this.baseUrl = registryConfig.baseUrl || '';
        
        console.log('📚 LibraryLoader initialized with libraries:', Object.keys(this.libraries));
    }

    /**
     * Load a library by name
     * @param {string} name - Library name (xlsx, html2canvas, pdfjs, hotkeys)
     * @returns {Promise<boolean>} Success status
     */
    async loadLibrary(name) {
        // Already loaded
        if (this.isLibraryLoaded(name)) {
            return true;
        }

        // Currently loading - wait for existing promise
        if (this.loadingPromises.has(name)) {
            return await this.loadingPromises.get(name);
        }

        const url = this.getLibraryUrl(name);
        if (!url) {
            throw new Error(`Library '${name}' not configured in registry. Add it to agentlets-registry.json libraries section.`);
        }

        console.log(`📚 Loading library: ${name} from ${url}`);

        const loadingPromise = this.loadScript(url)
            .then(() => {
                this.loadedLibraries.add(name);
                this.setupLibraryGlobals(name);
                console.log(`✅ Library loaded successfully: ${name}`);
                return true;
            })
            .catch(error => {
                console.error(`❌ Failed to load library ${name}:`, error);
                throw new Error(`Failed to load library '${name}' from ${url}. Check that the file exists and is accessible.`);
            })
            .finally(() => {
                this.loadingPromises.delete(name);
            });

        this.loadingPromises.set(name, loadingPromise);
        return await loadingPromise;
    }

    /**
     * Check if a library is already loaded
     * @param {string} name - Library name
     * @returns {boolean} 
     */
    isLibraryLoaded(name) {
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
            return this.loadedLibraries.has(name);
        }
    }

    /**
     * Get the URL for a library
     * @param {string} name - Library name
     * @returns {string|null} Library URL
     */
    getLibraryUrl(name) {
        const configuredUrl = this.libraries[name];
        if (!configuredUrl) return null;

        // Handle relative URLs
        if (configuredUrl.startsWith('./') || configuredUrl.startsWith('../')) {
            return this.baseUrl + configuredUrl.substring(1);
        }
        
        // Handle absolute URLs (http/https) or root-relative URLs (/)
        return configuredUrl;
    }

    /**
     * Load a script dynamically
     * @param {string} url - Script URL
     * @returns {Promise<void>}
     */
    loadScript(url) {
        return new Promise((resolve, reject) => {
            // Check if script is already loaded
            const existingScript = document.querySelector(`script[src="${url}"]`);
            if (existingScript) {
                resolve();
                return;
            }

            const script = document.createElement('script');
            script.src = url;
            script.type = 'text/javascript';
            script.crossOrigin = 'anonymous'; // For CORS support
            
            script.onload = () => {
                console.log(`📚 Script loaded: ${url}`);
                resolve();
            };
            
            script.onerror = (error) => {
                console.error(`📚 Script load failed: ${url}`, error);
                // Clean up failed script
                if (script.parentNode) {
                    script.parentNode.removeChild(script);
                }
                reject(new Error(`Failed to load script: ${url}`));
            };

            document.head.appendChild(script);
        });
    }

    /**
     * Set up global variables after library loads
     * @param {string} name - Library name
     */
    setupLibraryGlobals(name) {
        switch (name) {
        case 'pdfjs':
            // Configure PDF.js worker if not already configured
            if (window.pdfjsLib && !window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
                const workerUrl = this.getLibraryUrl('pdfjs-worker') || './pdf.worker.min.js';
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                window.pdfjsLib.GlobalWorkerOptions.verbosity = 0;
                console.log('📄 PDF.js worker configured:', workerUrl);
            }
            break;
        default:
            // Most libraries don't need additional setup
            break;
        }
    }

    /**
     * Load multiple libraries in parallel
     * @param {string[]} names - Array of library names
     * @returns {Promise<boolean[]>} Array of success statuses
     */
    async loadLibraries(names) {
        const promises = names.map(name => this.loadLibrary(name));
        return await Promise.all(promises);
    }

    /**
     * Get loading status for all configured libraries
     * @returns {Object} Loading status object
     */
    getLoadingStatus() {
        const status = {};
        Object.keys(this.libraries).forEach(name => {
            status[name] = {
                configured: true,
                loaded: this.isLibraryLoaded(name),
                loading: this.loadingPromises.has(name),
                url: this.getLibraryUrl(name)
            };
        });
        return status;
    }

    /**
     * Create a promise that resolves when a library is available
     * @param {string} name - Library name
     * @returns {Promise<boolean>}
     */
    async ensureLibrary(name) {
        if (this.isLibraryLoaded(name)) {
            return true;
        }
        
        return await this.loadLibrary(name);
    }

    /**
     * Check if any libraries are currently loading
     * @returns {boolean}
     */
    isLoading() {
        return this.loadingPromises.size > 0;
    }

    /**
     * Get list of loaded libraries
     * @returns {string[]}
     */
    getLoadedLibraries() {
        return Object.keys(this.libraries).filter(name => this.isLibraryLoaded(name));
    }
}

export default LibraryLoader;