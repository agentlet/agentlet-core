/**
 * How a given build of the core obtains SheetJS, `pdfjs-dist` and
 * `html2canvas`. tools/build.js sets `__AGENTLET_LIBS__` per output file:
 *
 * - `'script'` (the default, also what Jest sees): the libraries are not part
 *   of the bundle. Each one is a classic-script chunk file loaded on first use
 *   (see LibraryUrls.ts).
 * - `'split'` (`dist/agentlet-core.esm.js`): the libraries are separate ES
 *   module chunks under `dist/chunks/`, reached through `import()`. A bundler
 *   (webpack, Vite, Rollup) that consumes the package turns them into its own
 *   lazy chunks, and a plain `<script type="module">` fetches them relative to
 *   the module URL, so no configuration is needed.
 * - `'inline'` (`dist/agentlet-core.full.min.js`, the bookmarklet and the
 *   browser extension): everything is in one file and registered while the core
 *   initialises, like before on-demand loading existed.
 *
 * The `import()` calls live behind the build constant so that the script
 * builds, where the constant folds to `'script'`, drop the three libraries
 * from the bundle entirely.
 */
import type { OnDemandLibraryName } from './LibraryUrls.js';

declare const __AGENTLET_LIBS__: 'script' | 'split' | 'inline' | undefined;

export type LibraryMode = 'script' | 'split' | 'inline';

/** Loads one embedded library and resolves to the object that belongs on its `window` global. */
export type EmbeddedImporter = () => Promise<unknown>;

export function getLibraryMode(): LibraryMode {
    return typeof __AGENTLET_LIBS__ === 'undefined' ? 'script' : __AGENTLET_LIBS__;
}

export function getEmbeddedImporters(): Partial<Record<OnDemandLibraryName, EmbeddedImporter>> {
    // The condition is written inline (not through getLibraryMode()) so the
    // bundler folds it to a constant and drops the imports below in the
    // script builds.
    if (typeof __AGENTLET_LIBS__ !== 'undefined' && __AGENTLET_LIBS__ !== 'script') {
        return {
            // The namespace object is what `window.XLSX` has always held.
            xlsx: () => import('xlsx'),
            html2canvas: async () => (await import('html2canvas')).default,
            // Loaded lazily: evaluating pdfjs-dist touches browser globals
            // (DOMMatrix, ...), so it must never run while the package is
            // merely required under Node.
            pdfjs: () => import('pdfjs-dist')
        };
    }
    return {};
}
