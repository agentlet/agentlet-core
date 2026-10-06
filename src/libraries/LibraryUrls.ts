/**
 * Where the on-demand library files live, and how their URLs are resolved.
 *
 * The core bundle no longer inlines SheetJS (`xlsx`), `pdfjs-dist` and
 * `html2canvas`. In the script builds (`dist/agentlet-core.js` and
 * `dist/agentlet-core.min.js`) each one is a separate classic-script chunk
 * file emitted next to the core, loaded the first time a feature needs it.
 * The PDF.js worker, character maps and standard fonts are plain files in the
 * same folder. This module is the single place that decides which URL each of
 * those files is fetched from.
 *
 * Resolution order for the folder holding all of them:
 *
 * 1. `libraryBaseUrl` from the config (explicit override).
 * 2. The folder the core script itself was loaded from.
 * 3. The folder of `registryUrl`, for hosts that evaluate the core without a
 *    script URL (a `fetch()` + `eval()` loader) but serve a registry next to
 *    the other files.
 * 4. The extension root, inside a browser extension (`chrome.runtime.getURL`).
 *
 * A single file can always be pointed elsewhere with `libraryUrls`,
 * `pdfWorkerUrl`, `pdfCMapUrl` or `pdfStandardFontsUrl`.
 */

import type { OnDemandLibraryName } from '../types/public-api';

export type { OnDemandLibraryName };

export const ON_DEMAND_LIBRARIES: readonly OnDemandLibraryName[] = ['xlsx', 'html2canvas', 'pdfjs'];

/** File name of each library's chunk, relative to the library folder. */
export const LIBRARY_CHUNK_FILES: Readonly<Record<OnDemandLibraryName, string>> = {
    xlsx: 'agentlet-xlsx.min.js',
    html2canvas: 'agentlet-html2canvas.min.js',
    pdfjs: 'agentlet-pdfjs.min.js'
};

export const PDF_WORKER_FILE = 'pdf.worker.min.mjs';
export const PDF_CMAPS_DIR = 'cmaps/';
export const PDF_STANDARD_FONTS_DIR = 'standard_fonts/';

/** The subset of the core config that decides where library files are fetched from. */
export interface LibraryLocationConfig {
    /** Folder URL holding the chunk files, `pdf.worker.min.mjs`, `cmaps/` and `standard_fonts/`. */
    libraryBaseUrl?: string;
    /** Per-library URL of the chunk file, overriding `libraryBaseUrl`. */
    libraryUrls?: Partial<Record<OnDemandLibraryName, string>>;
    registryUrl?: string;
    pdfWorkerUrl?: string;
    pdfCMapUrl?: string;
    pdfStandardFontsUrl?: string;
}

/**
 * Set by the ESM build's banner (`const __AGENTLET_MODULE_URL__ =
 * import.meta.url;`), the only way an ES module can learn its own URL. It is
 * not declared anywhere else: the script builds never define it, and Jest
 * does not either.
 */
declare const __AGENTLET_MODULE_URL__: string | undefined;

/** Matches the file name of any core build when scanning the page's script tags. */
const CORE_SCRIPT_PATTERN = /\/agentlet-core(?:\.[a-z]+)*\.js(?:[?#].*)?$/;

function isBuildMachinePath(url: string): boolean {
    return url.startsWith('file:') && typeof window !== 'undefined' && !!window.location && window.location.protocol !== 'file:';
}

/**
 * `document.currentScript` is only set while a classic script first runs, so
 * it has to be read while this module is evaluated (which happens
 * synchronously inside the IIFE bundle, during that first run).
 */
function captureEntryScriptUrl(): string | undefined {
    // A bundler (webpack) replaces `import.meta.url` with the module's path on
    // the build machine, a `file:` URL that means nothing in a served page.
    if (typeof __AGENTLET_MODULE_URL__ === 'string' && __AGENTLET_MODULE_URL__ && !isBuildMachinePath(__AGENTLET_MODULE_URL__)) {
        return __AGENTLET_MODULE_URL__;
    }
    if (typeof document !== 'undefined') {
        const current = document.currentScript;
        if (current instanceof HTMLScriptElement && current.src) {
            return current.src;
        }
    }
    return undefined;
}

const capturedScriptUrl = captureEntryScriptUrl();

/**
 * URL the core script was loaded from, or undefined when it cannot be known
 * (for example the code was evaluated from a string). Falls back to the last
 * `<script src>` whose file name looks like a core build.
 */
export function getCoreScriptUrl(): string | undefined {
    if (capturedScriptUrl) {
        return capturedScriptUrl;
    }
    if (typeof document !== 'undefined' && typeof document.querySelectorAll === 'function') {
        const candidates = Array.from(document.querySelectorAll<HTMLScriptElement>('script[src]'))
            .map(script => script.src)
            .filter(src => CORE_SCRIPT_PATTERN.test(src));
        if (candidates.length > 0) {
            return candidates[candidates.length - 1];
        }
    }
    return undefined;
}

function pageUrl(): string | undefined {
    return typeof window !== 'undefined' && window.location ? window.location.href : undefined;
}

/** Resolves a possibly relative URL against the page; returns undefined when it cannot be parsed. */
export function resolveAgainstPage(url: string): string | undefined {
    try {
        const base = pageUrl();
        return (base ? new URL(url, base) : new URL(url)).href;
    } catch {
        return undefined;
    }
}

function directoryOf(url: string): string | undefined {
    try {
        return new URL('.', url).href;
    } catch {
        return undefined;
    }
}

interface ChromeRuntimeLike {
    chrome?: { runtime?: { getURL?: (path: string) => string } };
}

function getExtensionRootUrl(): string | undefined {
    const runtime = (globalThis as unknown as ChromeRuntimeLike).chrome?.runtime;
    if (runtime && typeof runtime.getURL === 'function') {
        try {
            return runtime.getURL('');
        } catch {
            return undefined;
        }
    }
    return undefined;
}

/**
 * Folder (absolute URL ending in `/`) the library files are fetched from, or
 * undefined when no source of truth is available.
 */
export function getLibraryBaseUrl(config: LibraryLocationConfig = {}): string | undefined {
    if (config.libraryBaseUrl) {
        const absolute = resolveAgainstPage(config.libraryBaseUrl);
        if (absolute) {
            return absolute.endsWith('/') ? absolute : `${absolute}/`;
        }
        console.warn('Ignoring an invalid libraryBaseUrl:', config.libraryBaseUrl);
    }

    const scriptUrl = getCoreScriptUrl();
    if (scriptUrl) {
        const dir = directoryOf(scriptUrl);
        if (dir) {
            return dir;
        }
    }

    if (config.registryUrl) {
        const absolute = resolveAgainstPage(config.registryUrl);
        const dir = absolute ? directoryOf(absolute) : undefined;
        if (dir) {
            return dir;
        }
        console.warn('Failed to derive the library folder from registryUrl:', config.registryUrl);
    }

    return getExtensionRootUrl();
}

/** Absolute URL of `relativePath` inside the library folder, or undefined when the folder is unknown. */
export function resolveLibraryFileUrl(relativePath: string, config: LibraryLocationConfig = {}): string | undefined {
    const base = getLibraryBaseUrl(config);
    if (!base) {
        return undefined;
    }
    try {
        return new URL(relativePath, base).href;
    } catch {
        return undefined;
    }
}

/**
 * URL of a library's chunk file: the per-library override if set, otherwise
 * the standard file name inside the library folder.
 */
export function resolveLibraryChunkUrl(name: OnDemandLibraryName, config: LibraryLocationConfig = {}): string | undefined {
    const override = config.libraryUrls?.[name];
    if (override) {
        return resolveAgainstPage(override) ?? override;
    }
    return resolveLibraryFileUrl(LIBRARY_CHUNK_FILES[name], config);
}
