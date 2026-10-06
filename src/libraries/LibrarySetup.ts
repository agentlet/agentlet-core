/**
 * Library Setup Manager
 * Handles initialization of external libraries (XLSX, html2canvas, PDF.js, hotkeys)
 * Supports both bundled libraries and dynamic loading from registry
 */

import { LibraryLoader } from './LibraryLoader.js';
import type { LibraryRegistryConfig } from './LibraryLoader.js';
import { getEmbeddedImporters, getLibraryMode } from './embeddedLibraries.js';
import {
    LIBRARY_CHUNK_FILES,
    ON_DEMAND_LIBRARIES,
    PDF_CMAPS_DIR,
    PDF_STANDARD_FONTS_DIR,
    PDF_WORKER_FILE,
    getLibraryBaseUrl,
    resolveAgainstPage,
    resolveLibraryChunkUrl,
    resolveLibraryFileUrl
} from './LibraryUrls.js';
import type { OnDemandLibraryName } from './LibraryUrls.js';
import type { LibrarySetupAPI, PDFAssetUrls } from '../types/public-api';
import { logger } from '../utils/system/Logger.js';

/** Constructor config. A subset of `AgentletCoreConfig` (see `src/types/public-api.d.ts`), which is what `src/index.ts` actually passes in. */
export interface LibrarySetupConfig {
    /** `'bundled'` (the default) sets up libraries handed to `initializeAll()` directly; `'registry'` defers to a `LibraryLoader` for on-demand loading and makes `initializeAll()` a no-op. */
    loadingMode?: 'bundled' | 'registry';
    /**
     * URL of the `pdf.worker.min.mjs` file matching the bundled `pdfjs-dist`
     * version. Applied to `pdfjsLib.GlobalWorkerOptions.workerSrc` every time
     * `setupPDFJS()` runs. Without it the worker is looked up next to the core
     * script (or in `libraryBaseUrl`), see `resolvePDFWorkerSrc()`.
     */
    pdfWorkerUrl?: string;
    registryUrl?: string;
    /**
     * Folder URL holding the on-demand library files: `agentlet-xlsx.min.js`,
     * `agentlet-html2canvas.min.js`, `agentlet-pdfjs.min.js`,
     * `pdf.worker.min.mjs`, `cmaps/` and `standard_fonts/`. Defaults to the
     * folder the core script was loaded from (see `LibraryUrls.ts`).
     */
    libraryBaseUrl?: string;
    /** Per-library chunk URL, overriding `libraryBaseUrl` for that one file. */
    libraryUrls?: Partial<Record<OnDemandLibraryName, string>>;
    /** URL of the folder with the PDF.js character maps (`cmaps/`). */
    pdfCMapUrl?: string;
    /** URL of the folder with the PDF.js standard fonts (`standard_fonts/`). */
    pdfStandardFontsUrl?: string;
    /** Libraries to load while `init()` runs instead of on first use, so `window.XLSX` and friends exist once it resolves. */
    preloadLibraries?: OnDemandLibraryName[];
}

function isOnDemandLibrary(name: string): name is OnDemandLibraryName {
    return (ON_DEMAND_LIBRARIES as readonly string[]).includes(name);
}

/** Message of anything thrown, for log lines. */
function messageOf(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
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
 * `ShortcutManager.ts` - duplicated here rather than imported, the same
 * way other files type third-party globals locally. The
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
    /** Loader for the on-demand libraries of a non-registry setup, created on first use. */
    onDemandLoader: LibraryLoader | null;
    loadingMode: 'bundled' | 'registry';

    constructor(config: LibrarySetupConfig = {}) {
        this.config = config;
        this.libraryLoader = null;
        this.onDemandLoader = null;
        this.loadingMode = config.loadingMode || 'bundled'; // 'bundled' or 'registry'
    }

    /**
     * Initialize library loader with registry configuration
     * @param registryConfig - Registry configuration with libraries paths
     */
    initializeRegistryLoader(registryConfig: LibraryRegistryConfig = {}): void {
        if (this.loadingMode === 'registry') {
            this.libraryLoader = new LibraryLoader({
                ...registryConfig,
                onLoaded: registryConfig.onLoaded || ((name, library) => this.handleLibraryLoaded(name, library))
            });
            logger.log('📚 Registry-based library loading enabled');
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
            logger.log('📊 XLSX library loaded for Excel export functionality');
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
            logger.log('📸 html2canvas library loaded for screenshot functionality');
        }
    }

    /**
     * Set up PDF.js library for PDF processing functionality
     */
    setupPDFJS(pdfjsLib: PdfjsLibModule): void {
        // Make PDF.js available globally for PDFProcessor. Guarded: don't
        // replace an existing window.pdfjsLib reference.
        const globals = getLibraryGlobals();
        const isFirstSetup = typeof globals.pdfjsLib === 'undefined';
        if (isFirstSetup) {
            globals.pdfjsLib = pdfjsLib;
            logger.log('📄 PDF.js library loaded for PDF processing functionality');
        }

        // Configure the worker URL every time this runs, even when
        // window.pdfjsLib was already set. In a bundled build, `pdfjs-dist`
        // assigns `globalThis.pdfjsLib` itself as a side effect of evaluating
        // its own module body (see `node_modules/pdfjs-dist/build/pdf.mjs`),
        // which happens before `initializeAll()`/`setupPDFJS()` ever run -
        // `window.pdfjsLib` is therefore *always* already defined by this
        // point in that build. So the worker URL is set unconditionally:
        // guarding on `window.pdfjsLib` being undefined would skip
        // `pdfWorkerUrl` here and PDF conversion would fail with pdf.js's own
        // "No GlobalWorkerOptions.workerSrc specified".
        const activeLib = globals.pdfjsLib as PdfjsLibModule;
        const workerSrc = this.resolvePDFWorkerSrc();

        activeLib.GlobalWorkerOptions.workerSrc = workerSrc;
        // `verbosity` is not part of pdfjs-dist's own `GlobalWorkerOptions`
        // type (its ambient `.d.ts` only declares `workerSrc`/`workerPort`),
        // so it is set through a narrow cast rather than by widening
        // `PdfjsLibModule` itself. Likely a no-op against modern pdfjs-dist,
        // since nothing in the library reads `GlobalWorkerOptions.verbosity`
        // for logging.
        (activeLib.GlobalWorkerOptions as { workerSrc: string; verbosity: number }).verbosity = 0;

        logger.log('📄 PDF.js worker URL set to:', workerSrc);

        // Verify the setting worked
        logger.log('📄 PDF.js GlobalWorkerOptions.workerSrc:', activeLib.GlobalWorkerOptions.workerSrc);
    }

    /**
     * Resolve the PDF.js worker URL, first match wins:
     *
     * 1. `config.pdfWorkerUrl`.
     * 2. The registry loader's `pdfjs-worker` entry (registry mode).
     * 3. `pdf.worker.min.mjs` inside the library folder: `config.libraryBaseUrl`,
     *    else the folder the core script was loaded from, else the folder of
     *    `config.registryUrl` (see `LibraryUrls.ts`). The npm package and the
     *    release assets ship the file next to the core bundle, so a host that
     *    serves the whole `dist/` folder needs no configuration.
     * 4. `'./pdf.worker.min.mjs'`, which resolves relative to the *page's* URL
     *    and is only a last resort.
     *
     * A relative `registryUrl` (e.g. '/cdn/v1/agentlets-registry.js', as
     * agentlet.io configures) is resolved against the page, so it derives an
     * absolute worker URL instead of throwing.
     */
    resolvePDFWorkerSrc(): string {
        if (this.config.pdfWorkerUrl) {
            return this.config.pdfWorkerUrl;
        }

        const registryWorkerUrl = this.libraryLoader?.getLibraryUrl('pdfjs-worker');
        if (registryWorkerUrl) {
            return registryWorkerUrl;
        }

        const derived = resolveLibraryFileUrl(PDF_WORKER_FILE, this.config);
        if (derived) {
            return derived;
        }

        return `./${PDF_WORKER_FILE}`;
    }

    /**
     * Absolute URLs of the PDF.js character maps and standard fonts, which
     * ship next to the core bundle as `cmaps/` and `standard_fonts/` and are
     * resolved like the worker. Absolute because pdf.js hands them to its
     * worker, where a relative URL would resolve against the worker file
     * instead of the page. A value is undefined when no location can be
     * determined; PDF conversion then runs without it (only PDFs that rely on
     * non-embedded CJK fonts or standard fonts are affected) and there is
     * never a request to a third-party host.
     */
    getPDFAssetUrls(): PDFAssetUrls {
        const folder = (override: string | undefined, dir: string): string | undefined => {
            const url = override ? resolveAgainstPage(override) ?? override : resolveLibraryFileUrl(dir, this.config);
            if (!url) {
                return undefined;
            }
            return url.endsWith('/') ? url : `${url}/`;
        };
        return {
            cMapUrl: folder(this.config.pdfCMapUrl, PDF_CMAPS_DIR),
            standardFontDataUrl: folder(this.config.pdfStandardFontsUrl, PDF_STANDARD_FONTS_DIR)
        };
    }

    /**
     * Configure PDF.js worker URL manually
     * @param workerUrl - URL to the PDF.js worker file
     */
    configurePDFWorker(workerUrl: string): void {
        const globals = getLibraryGlobals();
        if (globals.pdfjsLib) {
            globals.pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
            logger.log('📄 PDF.js worker URL manually set to:', workerUrl);
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
            logger.log('⌨️ hotkeys-js library loaded for keyboard shortcuts');
        }

        // Initialize shortcut manager with hotkeys
        if (shortcutManager) {
            shortcutManager.init(hotkeys);
            logger.log('⌨️ ShortcutManager initialized with hotkeys-js');
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

            logger.log('📚 Bundled libraries setup completed');
        } else {
            // Registry-based approach - libraries loaded on demand
            logger.log('📚 Registry-based loading enabled - libraries will load on demand');
        }
    }

    /**
     * Get the library loader instance
     */
    getLibraryLoader(): LibraryLoader | null {
        return this.libraryLoader;
    }

    /**
     * Load a library dynamically. In registry mode this goes through the
     * registry loader. Otherwise only the on-demand libraries (`xlsx`,
     * `html2canvas`, `pdfjs`) can be loaded; anything else resolves to
     * whether it is already available.
     * @param name - Library name
     */
    async loadLibrary(name: string): Promise<boolean> {
        if (this.loadingMode === 'bundled') {
            if (this.isLibraryAvailable(name)) {
                return true;
            }
            if (isOnDemandLibrary(name)) {
                await this.loadOnDemand(name);
                return true;
            }
            return false;
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
     * Whether a library is loaded or can be loaded on demand: true when it is
     * already available, is part of this build, or a URL for it is known.
     * Synchronous feature checks (`isExcelExportAvailable()`, ...) use this.
     * @param name - Library name
     */
    canLoadLibrary(name: string): boolean {
        if (this.isLibraryAvailable(name)) {
            return true;
        }
        if (this.loadingMode === 'registry') {
            const loader = this.libraryLoader;
            return !!loader && (!!loader.importers[name] || loader.getLibraryUrl(name) !== null);
        }
        if (!isOnDemandLibrary(name)) {
            return false;
        }
        return !!getEmbeddedImporters()[name] || !!resolveLibraryChunkUrl(name, this.config);
    }

    /**
     * Ensure a library is available (load if needed). Rejects with an error
     * that names the URL and how to change it when an on-demand library cannot
     * be loaded; resolves false for a library that is neither available nor
     * loadable here (`hotkeys`, unknown names).
     * @param name - Library name
     */
    async ensureLibrary(name: string): Promise<boolean> {
        if (this.isLibraryAvailable(name)) {
            return true;
        }

        if (this.loadingMode === 'registry') {
            if (this.libraryLoader) {
                return await this.libraryLoader.loadLibrary(name);
            }
            return false;
        }

        if (isOnDemandLibrary(name)) {
            await this.loadOnDemand(name);
            return true;
        }

        return false;
    }

    /**
     * Load the given libraries now instead of on first use (default: the
     * `preloadLibraries` config, which in a single-file build is every
     * on-demand library). Use it before calling an API that cannot wait for a
     * load, such as the synchronous `TableExtractor.createExcelWorkbook()`.
     * Never rejects: a failure is logged and surfaces again when the library
     * is actually used.
     */
    async preloadLibraries(names?: string[]): Promise<void> {
        const requested = names ?? this.getDefaultPreload();
        await Promise.all(requested.map(async (name) => {
            if (!isOnDemandLibrary(name)) {
                console.warn(`Cannot preload unknown library '${name}'. Known libraries: ${ON_DEMAND_LIBRARIES.join(', ')}.`);
                return;
            }
            try {
                await this.ensureLibrary(name);
            } catch (error) {
                console.warn(`Could not preload library '${name}':`, messageOf(error));
            }
        }));
    }

    private getDefaultPreload(): string[] {
        if (this.config.preloadLibraries) {
            return this.config.preloadLibraries;
        }
        // A single-file build always carried every library and registered it
        // during init(), so window.XLSX etc. exist once init() resolves. Keep
        // that there; the script and ES module builds load on first use.
        return this.loadingMode === 'bundled' && getLibraryMode() === 'inline' ? [...ON_DEMAND_LIBRARIES] : [];
    }

    /**
     * Load an on-demand library with the loader of this setup: the embedded
     * module in an ES module or single-file build, the chunk script in a script
     * build.
     */
    private async loadOnDemand(name: OnDemandLibraryName): Promise<void> {
        const loader = this.getOnDemandLoader();
        if (!loader.importers[name] && !loader.getLibraryUrl(name)) {
            throw new Error(
                `Cannot load '${name}' on demand: the location of ${LIBRARY_CHUNK_FILES[name]} is unknown ` +
                '(the core script URL could not be detected). Set `libraryBaseUrl` in the AgentletCore config to the folder that ' +
                `serves the files of dist/, or \`libraryUrls.${name}\` to the file itself.`
            );
        }

        await loader.loadLibrary(name);

        if (!this.isLibraryAvailable(name)) {
            throw new Error(
                `Library '${name}' was loaded from ${loader.getLibraryUrl(name) ?? 'its module'} but did not define its global. ` +
                `Check that the file is ${LIBRARY_CHUNK_FILES[name]} from the same agentlet-core version.`
            );
        }
    }

    private getOnDemandLoader(): LibraryLoader {
        if (!this.onDemandLoader) {
            const importers = getEmbeddedImporters();
            const libraries: Record<string, string> = {};
            for (const name of ON_DEMAND_LIBRARIES) {
                const url = importers[name] ? undefined : resolveLibraryChunkUrl(name, this.config);
                if (url) {
                    libraries[name] = url;
                }
            }
            const baseUrl = getLibraryBaseUrl(this.config);
            this.onDemandLoader = new LibraryLoader({
                libraries,
                importers: importers as Record<string, () => Promise<unknown>>,
                // A plain script tag, like the one that loaded the core: a
                // crossorigin attribute would demand CORS headers from hosts
                // that serve the core without them.
                crossOrigin: null,
                loadFailureHint: baseUrl
                    ? `The library files are looked up in ${baseUrl}; set \`libraryBaseUrl\` (or \`libraryUrls\`) in the AgentletCore config if they are served elsewhere.`
                    : 'Set `libraryBaseUrl` (or `libraryUrls`) in the AgentletCore config to where the files of dist/ are served.',
                onLoaded: (name, library) => this.handleLibraryLoaded(name, library)
            });
        }
        return this.onDemandLoader;
    }

    /**
     * Run the same setup a bundled library gets once a loader has produced it
     * (the global assignment, and the worker URL for pdf.js).
     */
    private handleLibraryLoaded(name: string, library: unknown): void {
        const globals = getLibraryGlobals();
        switch (name) {
        case 'xlsx':
            if (library !== undefined) this.setupXLSX(library);
            break;
        case 'html2canvas':
            if (library !== undefined) this.setupHTML2Canvas(library);
            break;
        case 'pdfjs': {
            const pdfjsLib = (library as PdfjsLibModule | undefined) ?? globals.pdfjsLib;
            if (pdfjsLib) this.setupPDFJS(pdfjsLib);
            break;
        }
        default:
            break;
        }
    }
}
