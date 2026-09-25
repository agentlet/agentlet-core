/**
 * Library Setup Manager
 * Handles initialization of external libraries (XLSX, html2canvas, PDF.js, hotkeys)
 * Supports both bundled libraries and dynamic loading from registry
 */

import { LibraryLoader } from './LibraryLoader.js';
import type { LibraryRegistryConfig } from './LibraryLoader.js';
import type { LibrarySetupAPI } from '../types/public-api';

/** Constructor config. A subset of `AgentletCoreConfig` (see `src/types/public-api.d.ts`), which is what `src/index.ts` actually passes in. */
export interface LibrarySetupConfig {
    /** `'bundled'` (the default) sets up libraries handed to `initializeAll()` directly; `'registry'` defers to a `LibraryLoader` for on-demand loading and makes `initializeAll()` a no-op. */
    loadingMode?: 'bundled' | 'registry';
    pdfWorkerUrl?: string;
    registryUrl?: string;
}

/**
 * Minimal shape of the `pdfjs-dist` module this file reads/writes - only
 * the member actually touched (`GlobalWorkerOptions.workerSrc`), not the
 * full library surface, mirroring how `PDFProcessor.ts` types the same
 * global locally rather than importing `pdfjs-dist`'s own types.
 */
interface PdfjsLibModule {
    GlobalWorkerOptions: {
        workerSrc: string;
    };
}

/**
 * Minimal shape of the `hotkeys-js` module this file forwards to
 * `window.hotkeys` and to `ShortcutManager.init()`. Mirrors the narrower,
 * separately-declared (and unexported) `HotkeysLike` in
 * `ShortcutManager.ts` - duplicated here rather than imported, matching
 * how other converted files type third-party globals locally. The
 * callback's `handler` argument is typed `unknown` rather than mirroring
 * `ShortcutManager.ts`'s own `HotkeysHandler` (`{ shortcut?: string; [key:
 * string]: unknown }`): the real `hotkeys-js` value's handler argument
 * (`HotkeysEvent`, with named, non-indexed properties) isn't structurally
 * assignable to an indexed type in this nested/contravariant position, so
 * `unknown` is what actually accepts the real bundled module here.
 * `shortcutManager.init()` below still accepts this type - see
 * `ShortcutManagerLike`.
 */
interface HotkeysModule {
    (keys: string, scope: string, callback: (event: KeyboardEvent, handler: unknown) => void): void;
    filter: (event: KeyboardEvent) => boolean;
    unbind(keys?: string, scope?: string): void;
}

/**
 * Minimal shape of `ShortcutManager` this file needs to wire up
 * hotkeys-js - just the framework-internal `init()` hook, which the
 * agentlet-author-facing `ShortcutManagerAPI` (in public-api.d.ts)
 * intentionally omits. Mirrors how `AgentletCore.shortcutManager` is
 * itself typed as the concrete `ShortcutManager` class rather than
 * `ShortcutManagerAPI`, for the same reason `AgentletCore.librarySetup`
 * is typed as the concrete `LibrarySetup` class.
 */
interface ShortcutManagerLike {
    init(hotkeysLib: HotkeysModule): void;
}

/**
 * The bundled-mode library payload `initializeAll()` accepts. `XLSX`/
 * `html2canvas` are forwarded to `window.*` without this file reading any
 * of their members (`TableExtractor.ts`/`ScreenCapture.ts` define their
 * own narrower shapes for the members *they* call), so `unknown` is the
 * honest minimal type for those two - not a fabricated interface this
 * file never actually uses.
 */
export interface BundledLibraries {
    XLSX?: unknown;
    html2canvas?: unknown;
    pdfjsLib?: PdfjsLibModule;
    hotkeys?: HotkeysModule;
}

/**
 * Window-global surface this file reads/writes. Accessed through this cast
 * rather than bare `window.XLSX`/etc. property reads, since there is no
 * ambient type declaration for any of them under strict tsc - the same
 * approach `ShortcutManager.ts`/`ScreenCapture.ts`/`PDFProcessor.ts` use
 * for the same globals.
 */
interface LibraryGlobalsWindow {
    XLSX?: unknown;
    html2canvas?: unknown;
    pdfjsLib?: PdfjsLibModule;
    hotkeys?: HotkeysModule;
}

function getLibraryGlobals(): LibraryGlobalsWindow {
    return window as unknown as LibraryGlobalsWindow;
}

export class LibrarySetup implements LibrarySetupAPI {
    config: LibrarySetupConfig;
    libraryLoader: LibraryLoader | null;
    loadingMode: 'bundled' | 'registry';

    constructor(config: LibrarySetupConfig = {}) {
        this.config = config;
        this.libraryLoader = null;
        this.loadingMode = config.loadingMode || 'bundled'; // 'bundled' or 'registry'
    }

    /**
     * Initialize library loader with registry configuration
     * @param registryConfig - Registry configuration with libraries paths
     */
    initializeRegistryLoader(registryConfig: LibraryRegistryConfig = {}): void {
        if (this.loadingMode === 'registry') {
            this.libraryLoader = new LibraryLoader(registryConfig);
            console.log('📚 Registry-based library loading enabled');
        }
    }

    /**
     * Set up XLSX library for Excel export functionality
     */
    setupXLSX(XLSX: unknown): void {
        // Make XLSX available globally for TableExtractor
        const globals = getLibraryGlobals();
        if (typeof globals.XLSX === 'undefined') {
            globals.XLSX = XLSX;
            console.log('📊 XLSX library loaded for Excel export functionality');
        }
    }

    /**
     * Set up html2canvas library for screenshot functionality
     */
    setupHTML2Canvas(html2canvas: unknown): void {
        // Make html2canvas available globally for ScreenCapture
        const globals = getLibraryGlobals();
        if (typeof globals.html2canvas === 'undefined') {
            globals.html2canvas = html2canvas;
            console.log('📸 html2canvas library loaded for screenshot functionality');
        }
    }

    /**
     * Set up PDF.js library for PDF processing functionality
     */
    setupPDFJS(pdfjsLib: PdfjsLibModule): void {
        // Make PDF.js available globally for PDFProcessor
        const globals = getLibraryGlobals();
        if (typeof globals.pdfjsLib === 'undefined') {
            globals.pdfjsLib = pdfjsLib;

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

            globals.pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;
            // `verbosity` is not part of pdfjs-dist's own `GlobalWorkerOptions`
            // type (its ambient `.d.ts` only declares `workerSrc`/`workerPort`)
            // but the pre-conversion code has always set it anyway - kept as a
            // narrow cast rather than widening `PdfjsLibModule` itself (likely
            // a no-op against modern pdfjs-dist, since nothing in the library
            // reads `GlobalWorkerOptions.verbosity` for logging).
            (globals.pdfjsLib.GlobalWorkerOptions as { workerSrc: string; verbosity: number }).verbosity = 0;

            console.log('📄 PDF.js library loaded for PDF processing functionality');
            console.log('📄 PDF.js worker URL set to:', workerSrc);

            // Verify the setting worked
            console.log('📄 PDF.js GlobalWorkerOptions.workerSrc:', globals.pdfjsLib.GlobalWorkerOptions.workerSrc);
        }
    }

    /**
     * Configure PDF.js worker URL manually
     * @param workerUrl - URL to the PDF.js worker file
     */
    configurePDFWorker(workerUrl: string): void {
        const globals = getLibraryGlobals();
        if (globals.pdfjsLib) {
            globals.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
            console.log('📄 PDF.js worker URL manually set to:', workerUrl);
        } else {
            console.warn('📄 PDF.js not loaded yet, cannot set worker URL');
        }
    }

    /**
     * Set up hotkeys library for keyboard shortcuts
     */
    setupHotkeys(hotkeys: HotkeysModule, shortcutManager?: ShortcutManagerLike | null): void {
        // Make hotkeys available globally
        const globals = getLibraryGlobals();
        if (typeof globals.hotkeys === 'undefined') {
            globals.hotkeys = hotkeys;
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
    initializeAll(libraries: BundledLibraries = {}, shortcutManager?: ShortcutManagerLike | null): void {
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
     */
    getLibraryLoader(): LibraryLoader | null {
        return this.libraryLoader;
    }

    /**
     * Load a library dynamically (for registry mode)
     * @param name - Library name
     */
    async loadLibrary(name: string): Promise<boolean> {
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
     * @param name - Library name
     */
    isLibraryAvailable(name: string): boolean {
        const globals = getLibraryGlobals();
        switch (name) {
        case 'xlsx':
            return typeof globals.XLSX !== 'undefined';
        case 'html2canvas':
            return typeof globals.html2canvas !== 'undefined';
        case 'pdfjs':
            return typeof globals.pdfjsLib !== 'undefined';
        case 'hotkeys':
            return typeof globals.hotkeys !== 'undefined';
        default:
            return false;
        }
    }

    /**
     * Ensure a library is available (load if needed)
     * @param name - Library name
     */
    async ensureLibrary(name: string): Promise<boolean> {
        if (this.isLibraryAvailable(name)) {
            return true;
        }

        if (this.loadingMode === 'registry' && this.libraryLoader) {
            return await this.libraryLoader.loadLibrary(name);
        }

        return false;
    }
}
