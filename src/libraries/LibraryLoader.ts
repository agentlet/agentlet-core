/**
 * LibraryLoader - Dynamic loading of external libraries
 * Supports registry-based loading from internal hosting infrastructure
 */

/** Constructor config: a map of library name -> script URL, plus an optional prefix for entries that start with `./` or `../`. */
export interface LibraryRegistryConfig {
    libraries?: Record<string, string>;
    baseUrl?: string;
}

/** Per-library snapshot returned by `getLoadingStatus()`. */
export interface LibraryLoadingStatus {
    configured: boolean;
    loaded: boolean;
    loading: boolean;
    url: string | null;
}

/**
 * Minimal shape of the `pdfjs-dist` global this file reads/writes when
 * configuring the PDF.js worker after a registry-driven load - only the
 * member actually touched, not the full library surface. `pdfjs-dist` is
 * never imported here; `LibrarySetup.ts` (bundled mode) or a registry
 * script (this file, on-demand mode) assigns it onto `window.pdfjsLib` at
 * runtime, so it is read through `getPdfjsLibGlobal()` (via `window`)
 * rather than a `window.pdfjsLib` typed as part of the global `Window`
 * interface - the same approach `PDFProcessor.ts` uses for the same global.
 */
interface PdfjsLibGlobal {
    GlobalWorkerOptions: {
        workerSrc: string;
    };
}

/**
 * Accessed through these helpers (via `window`) rather than bare
 * `window.XLSX`/`window.html2canvas`/`window.pdfjsLib`/`window.hotkeys`
 * property reads, since there is no ambient type declaration for any of
 * them under strict tsc. Only used here to test for presence (a `typeof
 * ... !== 'undefined'` check), except `getPdfjsLibGlobal()` which is also
 * used to configure the worker.
 */
function getXLSXGlobal(): unknown {
    return (window as unknown as { XLSX?: unknown }).XLSX;
}

function getHtml2CanvasGlobal(): unknown {
    return (window as unknown as { html2canvas?: unknown }).html2canvas;
}

function getPdfjsLibGlobal(): PdfjsLibGlobal | undefined {
    return (window as unknown as { pdfjsLib?: PdfjsLibGlobal }).pdfjsLib;
}

function getHotkeysGlobal(): unknown {
    return (window as unknown as { hotkeys?: unknown }).hotkeys;
}

class LibraryLoader {
    libraries: Record<string, string>;
    loadedLibraries: Set<string>;
    loadingPromises: Map<string, Promise<boolean>>;
    baseUrl: string;

    constructor(registryConfig: LibraryRegistryConfig = {}) {
        this.libraries = registryConfig.libraries || {};
        this.loadedLibraries = new Set();
        this.loadingPromises = new Map();
        this.baseUrl = registryConfig.baseUrl || '';

        console.log('📚 LibraryLoader initialized with libraries:', Object.keys(this.libraries));
    }

    /**
     * Load a library by name
     * @param name - Library name (xlsx, html2canvas, pdfjs, hotkeys)
     * @returns Success status
     */
    async loadLibrary(name: string): Promise<boolean> {
        // Already loaded
        if (this.isLibraryLoaded(name)) {
            return true;
        }

        // Currently loading - wait for existing promise
        const existingPromise = this.loadingPromises.get(name);
        if (existingPromise) {
            return await existingPromise;
        }

        const url = this.getLibraryUrl(name);
        if (!url) {
            throw new Error(`Library '${name}' not configured in registry. Add it to agentlets-registry.json libraries section.`);
        }

        console.log(`📚 Loading library: ${name} from ${url}`);

        const loadingPromise: Promise<boolean> = this.loadScript(url)
            .then(() => {
                this.loadedLibraries.add(name);
                this.setupLibraryGlobals(name);
                console.log(`✅ Library loaded successfully: ${name}`);
                return true;
            })
            .catch((error: unknown) => {
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
     * @param name - Library name
     */
    isLibraryLoaded(name: string): boolean {
        switch (name) {
        case 'xlsx':
            return typeof getXLSXGlobal() !== 'undefined';
        case 'html2canvas':
            return typeof getHtml2CanvasGlobal() !== 'undefined';
        case 'pdfjs':
            return typeof getPdfjsLibGlobal() !== 'undefined';
        case 'hotkeys':
            return typeof getHotkeysGlobal() !== 'undefined';
        default:
            return this.loadedLibraries.has(name);
        }
    }

    /**
     * Get the URL for a library
     * @param name - Library name
     * @returns Library URL, or null if not configured
     */
    getLibraryUrl(name: string): string | null {
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
     * @param url - Script URL
     */
    loadScript(url: string): Promise<void> {
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

            script.onload = (): void => {
                console.log(`📚 Script loaded: ${url}`);
                resolve();
            };

            script.onerror = (error): void => {
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
     * @param name - Library name
     */
    setupLibraryGlobals(name: string): void {
        switch (name) {
        case 'pdfjs': {
            // Configure PDF.js worker if not already configured
            const pdfjsLib = getPdfjsLibGlobal();
            if (pdfjsLib && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
                const workerUrl = this.getLibraryUrl('pdfjs-worker') || './pdf.worker.min.js';
                pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
                // `verbosity` is not part of pdfjs-dist's own `GlobalWorkerOptions`
                // type (its ambient `.d.ts` only declares `workerSrc`/`workerPort`)
                // but the pre-conversion code has always set it anyway - kept as
                // a narrow cast rather than widening `PdfjsLibGlobal` itself
                // (likely a no-op against modern pdfjs-dist, since nothing in the
                // library reads `GlobalWorkerOptions.verbosity` for logging).
                (pdfjsLib.GlobalWorkerOptions as { workerSrc: string; verbosity: number }).verbosity = 0;
                console.log('📄 PDF.js worker configured:', workerUrl);
            }
            break;
        }
        default:
            // Most libraries don't need additional setup
            break;
        }
    }

    /**
     * Load multiple libraries in parallel
     * @param names - Array of library names
     * @returns Array of success statuses
     */
    async loadLibraries(names: string[]): Promise<boolean[]> {
        const promises = names.map(name => this.loadLibrary(name));
        return await Promise.all(promises);
    }

    /**
     * Get loading status for all configured libraries
     */
    getLoadingStatus(): Record<string, LibraryLoadingStatus> {
        const status: Record<string, LibraryLoadingStatus> = {};
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
     * @param name - Library name
     */
    async ensureLibrary(name: string): Promise<boolean> {
        if (this.isLibraryLoaded(name)) {
            return true;
        }

        return await this.loadLibrary(name);
    }

    /**
     * Check if any libraries are currently loading
     */
    isLoading(): boolean {
        return this.loadingPromises.size > 0;
    }

    /**
     * Get list of loaded libraries
     */
    getLoadedLibraries(): string[] {
        return Object.keys(this.libraries).filter(name => this.isLibraryLoaded(name));
    }
}

export { LibraryLoader };
export default LibraryLoader;
