/**
 * Entry point of dist/agentlet-xlsx.min.js: SheetJS as a classic script that
 * exposes `window.XLSX`, loaded on first use by LibraryLoader. Built by
 * tools/build.js; nothing in src/ imports this file.
 */
import * as XLSX from 'xlsx';

const target = globalThis as unknown as { XLSX?: unknown };

// Never replace a SheetJS the host page already provides.
if (typeof target.XLSX === 'undefined') {
    target.XLSX = XLSX;
}
