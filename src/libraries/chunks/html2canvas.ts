/**
 * Entry point of dist/agentlet-html2canvas.min.js: html2canvas as a classic
 * script that exposes `window.html2canvas`, loaded on first use by
 * LibraryLoader. Built by tools/build.js; nothing in src/ imports this file.
 */
import html2canvas from 'html2canvas';

const target = globalThis as unknown as { html2canvas?: unknown };

// Never replace an html2canvas the host page already provides.
if (typeof target.html2canvas === 'undefined') {
    target.html2canvas = html2canvas;
}
