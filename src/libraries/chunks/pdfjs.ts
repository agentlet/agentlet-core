/**
 * Entry point of dist/agentlet-pdfjs.min.js: pdfjs-dist as a classic script
 * that exposes `window.pdfjsLib`, loaded on first use by LibraryLoader. The
 * worker URL is applied by LibrarySetup once this file has run. Built by
 * tools/build.js; nothing in src/ imports this file.
 */
import * as pdfjsLib from 'pdfjs-dist';

const target = globalThis as unknown as { pdfjsLib?: unknown };

// pdfjs-dist assigns globalThis.pdfjsLib itself while evaluating; this only
// covers a build of it that does not.
if (typeof target.pdfjsLib === 'undefined') {
    target.pdfjsLib = pdfjsLib;
}
