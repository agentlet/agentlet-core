/**
 * Characterization tests for TableExtractor.
 *
 * These tests pin down the CURRENT behaviour of
 * `src/utils/data-processing/TableExtractor.js` before it is converted to
 * `TableExtractor.ts`. Nothing here should change when the conversion
 * lands - if an assertion needs to change, the conversion changed
 * behaviour and that is a bug in the conversion, not in this file.
 *
 * The XLSX (SheetJS) library is read off `window.XLSX` at call time (see
 * `isExcelExportAvailable()`); it is never imported. These tests install a
 * minimal jest-mocked stand-in on `window.XLSX` rather than the real
 * SheetJS package.
 */

import TableExtractor from '../../../src/utils/data-processing/TableExtractor.js';

interface TableData {
    headers: string[];
    rows: string[][];
    metadata: { totalRows: number; totalColumns: number; extractedAt: string; tableId: string | null };
}

interface TableAllPagesData {
    headers: string[];
    rows: string[][];
    metadata: { totalPages: number; totalRows: number; totalColumns: number; extractedAt: string; paginationMethod: string };
}

interface DownloadResult {
    success: boolean;
    filename?: string;
    rowCount?: number;
    columnCount?: number;
    error?: string;
}

interface LibrarySetupMock {
    ensureLibrary: jest.Mock<Promise<boolean>, [string]>;
}

interface TableExtractorInstance {
    isExcelExportAvailable(): boolean;
    ensureXLSX(): Promise<boolean>;
    extractTableData(tableElement: Element, options?: Record<string, unknown>): TableData;
    extractAllPages(tableElement: Element, options?: Record<string, unknown>): Promise<TableAllPagesData>;
    createExcelWorkbook(tableData: TableData | TableAllPagesData, options?: Record<string, unknown>): unknown;
    downloadAsExcel(tableData: TableData | TableAllPagesData, options?: Record<string, unknown>): Promise<DownloadResult>;
    extractAndDownload(tableElement: Element, options?: Record<string, unknown>): Promise<DownloadResult>;
    createProxy(): {
        extract: (element: Element, options?: Record<string, unknown>) => TableData;
        extractAll: (element: Element, options?: Record<string, unknown>) => Promise<TableAllPagesData>;
        download: (tableData: TableData | TableAllPagesData, options?: Record<string, unknown>) => Promise<DownloadResult>;
        extractAndDownload: (element: Element, options?: Record<string, unknown>) => Promise<DownloadResult>;
        extractor: TableExtractorInstance;
    };
}

const TypedTableExtractor = TableExtractor as unknown as { new (librarySetup?: LibrarySetupMock | null): TableExtractorInstance };

function makeExtractor(librarySetup: LibrarySetupMock | null = null): TableExtractorInstance {
    return new TypedTableExtractor(librarySetup);
}

/** Minimal SheetJS stand-in; only the members TableExtractor actually calls. */
function makeXLSXMock(): {
    utils: { book_new: jest.Mock; aoa_to_sheet: jest.Mock; book_append_sheet: jest.Mock };
    writeFile: jest.Mock;
} {
    return {
        utils: {
            book_new: jest.fn(() => ({ SheetNames: [], Sheets: {} })),
            aoa_to_sheet: jest.fn((data: unknown[][]) => ({ __sheetData: data })),
            book_append_sheet: jest.fn()
        },
        writeFile: jest.fn()
    };
}

describe('TableExtractor', () => {
    let extractor: TableExtractorInstance;

    beforeAll(() => {
        // Undo tests/setup.js's global document.createElement mock (a
        // bare-bones fake object, not a real Node) so tests that build a
        // table via raw DOM APIs get genuine jsdom elements.
        document.createElement = Document.prototype.createElement.bind(document);
    });

    beforeEach(() => {
        extractor = makeExtractor();
        document.body.innerHTML = '';
        delete (window as unknown as { XLSX?: unknown }).XLSX;
    });

    describe('extractTableData: input validation', () => {
        it('throws for a non-table element', () => {
            document.body.innerHTML = '<div id="d"></div>';
            const el = document.getElementById('d') as unknown as Element;
            expect(() => extractor.extractTableData(el)).toThrow('Invalid table element provided');
        });

        it('throws for a null/undefined element', () => {
            expect(() => extractor.extractTableData(null as unknown as Element)).toThrow('Invalid table element provided');
        });
    });

    describe('extractTableData: headers', () => {
        it('reads headers from <thead> when present', () => {
            document.body.innerHTML = `
                <table id="t">
                    <thead><tr><th>Name</th><th>Age</th></tr></thead>
                    <tbody><tr><td>Alice</td><td>30</td></tr></tbody>
                </table>
            `;
            const table = document.getElementById('t') as unknown as Element;
            const data = extractor.extractTableData(table);
            expect(data.headers).toEqual(['Name', 'Age']);
            expect(data.rows).toEqual([['Alice', '30']]);
        });

        it('falls back to the first row as headers when there is no <thead> and no <tbody>', () => {
            // NOTE: built via raw DOM APIs (createElement/appendChild), not
            // innerHTML - the HTML parser implicitly wraps bare <tr> children
            // in a <tbody> per the HTML5 spec, which would take the
            // `tbody tr` branch instead of the fallback this test targets.
            const table = document.createElement('table');
            table.id = 't';
            const makeRow = (cells: string[]): HTMLTableRowElement => {
                const tr = document.createElement('tr');
                cells.forEach((text) => {
                    const td = document.createElement('td');
                    td.textContent = text;
                    tr.appendChild(td);
                });
                return tr;
            };
            table.appendChild(makeRow(['Name', 'Age']));
            table.appendChild(makeRow(['Alice', '30']));
            table.appendChild(makeRow(['Bob', '25']));
            document.body.appendChild(table);

            expect(table.querySelectorAll('tbody')).toHaveLength(0);
            const data = extractor.extractTableData(table);
            expect(data.headers).toEqual(['Name', 'Age']);
            expect(data.rows).toEqual([['Alice', '30'], ['Bob', '25']]);
        });

        it('QUIRK: includeHeaderRow only gates headers[] when a real <tbody> exists - the header text is NOT duplicated into rows, because <tbody> rows are used regardless of the flag', () => {
            document.body.innerHTML = `
                <table id="t"><thead><tr><th>Name</th></tr></thead><tbody><tr><td>Alice</td></tr></tbody></table>
            `;
            const table = document.getElementById('t') as unknown as Element;
            const data = extractor.extractTableData(table, { includeHeaderRow: false });
            expect(data.headers).toEqual([]);
            expect(data.rows).toEqual([['Alice']]);
        });

        it('QUIRK: with a genuinely tbody-less table, includeHeaderRow: false leaves the header row IN the data rows too', () => {
            // Built via raw DOM APIs, same reasoning as the fallback-headers
            // test above: innerHTML parsing would auto-insert a <tbody> and
            // take the other branch instead.
            const table = document.createElement('table');
            table.id = 't';
            const nameRow = document.createElement('tr');
            const nameCell = document.createElement('td');
            nameCell.textContent = 'Name';
            nameRow.appendChild(nameCell);
            const aliceRow = document.createElement('tr');
            const aliceCell = document.createElement('td');
            aliceCell.textContent = 'Alice';
            aliceRow.appendChild(aliceCell);
            table.appendChild(nameRow);
            table.appendChild(aliceRow);
            document.body.appendChild(table);

            expect(table.querySelectorAll('tbody')).toHaveLength(0);
            const data = extractor.extractTableData(table, { includeHeaderRow: false });
            expect(data.headers).toEqual([]);
            expect(data.rows).toEqual([['Name'], ['Alice']]);
        });
    });

    describe('extractTableData: whitespace trimming', () => {
        it('trims and collapses internal whitespace by default', () => {
            document.body.innerHTML = `
                <table id="t"><thead><tr><th>  Name  </th></tr></thead>
                <tbody><tr><td>  Alice   Smith  </td></tr></tbody></table>
            `;
            const table = document.getElementById('t') as unknown as Element;
            const data = extractor.extractTableData(table);
            expect(data.headers).toEqual(['Name']);
            expect(data.rows).toEqual([['Alice Smith']]);
        });

        it('preserves raw whitespace when trimWhitespace is false', () => {
            document.body.innerHTML = `
                <table id="t"><thead><tr><th>  Name  </th></tr></thead>
                <tbody><tr><td>  Alice   Smith  </td></tr></tbody></table>
            `;
            const table = document.getElementById('t') as unknown as Element;
            const data = extractor.extractTableData(table, { trimWhitespace: false });
            expect(data.headers).toEqual(['  Name  ']);
            expect(data.rows).toEqual([['  Alice   Smith  ']]);
        });
    });

    describe('extractTableData: cells and metadata', () => {
        it('QUIRK: colspan is not expanded - only the actual <td>/<th> elements present are counted', () => {
            document.body.innerHTML = `
                <table id="t">
                    <thead><tr><th>A</th><th>B</th><th>C</th></tr></thead>
                    <tbody><tr><td colspan="2">merged</td><td>c</td></tr></tbody>
                </table>
            `;
            const table = document.getElementById('t') as unknown as Element;
            const data = extractor.extractTableData(table);
            expect(data.rows).toEqual([['merged', 'c']]);
            expect(data.metadata.totalColumns).toBe(3); // max(headers.length=3, row.length=2)
        });

        it('handles an empty table (no rows at all)', () => {
            document.body.innerHTML = '<table id="t"></table>';
            const table = document.getElementById('t') as unknown as Element;
            const data = extractor.extractTableData(table);
            expect(data.headers).toEqual([]);
            expect(data.rows).toEqual([]);
            expect(data.metadata.totalRows).toBe(0);
            expect(data.metadata.totalColumns).toBe(0);
        });

        it('handles empty cells as empty strings', () => {
            document.body.innerHTML = `
                <table id="t"><thead><tr><th>A</th><th>B</th></tr></thead>
                <tbody><tr><td>x</td><td></td></tr></tbody></table>
            `;
            const table = document.getElementById('t') as unknown as Element;
            const data = extractor.extractTableData(table);
            expect(data.rows).toEqual([['x', '']]);
        });

        it('reports tableId from the id attribute, or null', () => {
            document.body.innerHTML = '<table id="myTable"><tbody><tr><td>x</td></tr></tbody></table><table><tbody><tr><td>y</td></tr></tbody></table>';
            const withId = document.getElementById('myTable') as unknown as Element;
            const withoutId = document.querySelectorAll('table')[1] as unknown as Element;
            expect(extractor.extractTableData(withId).metadata.tableId).toBe('myTable');
            expect(extractor.extractTableData(withoutId).metadata.tableId).toBeNull();
        });

        it('stamps extractedAt with a parseable ISO-ish timestamp', () => {
            document.body.innerHTML = '<table id="t"><tbody><tr><td>x</td></tr></tbody></table>';
            const table = document.getElementById('t') as unknown as Element;
            const data = extractor.extractTableData(table);
            expect(() => new Date(data.metadata.extractedAt).toISOString()).not.toThrow();
        });
    });

    describe('extractAllPages', () => {
        it('extracts only the first page and reports totalPages 1 when no nextButtonSelector is given', async () => {
            document.body.innerHTML = `
                <table id="t"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>
            `;
            const table = document.getElementById('t') as unknown as Element;
            const data = await extractor.extractAllPages(table);
            expect(data.metadata.totalPages).toBe(1);
            expect(data.rows).toEqual([['1']]);
            expect(data.metadata.paginationMethod).toBe('basic');
        });

        it('follows a mocked "next" button across pages, accumulating rows', async () => {
            jest.useFakeTimers();
            try {
                document.body.innerHTML = `
                    <table id="t"><thead><tr><th>A</th></tr></thead><tbody id="body"><tr><td>page1</td></tr></tbody></table>
                    <button id="next">Next</button>
                `;
                const table = document.getElementById('t') as unknown as Element;
                const nextButton = document.getElementById('next') as HTMLButtonElement;
                nextButton.addEventListener('click', () => {
                    // Simulate navigating to the (only) next page and that page
                    // being the last one, both in the same click - this avoids
                    // the extractor re-reading stale content for a "page" that
                    // was never really there (see the maxPages test below for
                    // that scenario pinned deliberately instead).
                    const tbody = document.getElementById('body') as HTMLElement;
                    tbody.innerHTML = '<tr><td>page2</td></tr>';
                    nextButton.remove();
                });

                const promise = extractor.extractAllPages(table, { nextButtonSelector: '#next', delay: 100, maxPages: 5 });
                await jest.advanceTimersByTimeAsync(100);
                const data = await promise;

                expect(data.rows).toEqual([['page1'], ['page2']]);
                expect(data.metadata.totalPages).toBe(2);
            } finally {
                jest.useRealTimers();
            }
        });

        it('stops immediately when the next button is disabled', async () => {
            document.body.innerHTML = `
                <table id="t"><tbody><tr><td>1</td></tr></tbody></table>
                <button id="next" disabled>Next</button>
            `;
            const table = document.getElementById('t') as unknown as Element;
            const data = await extractor.extractAllPages(table, { nextButtonSelector: '#next' });
            expect(data.metadata.totalPages).toBe(1);
        });

        it('stops immediately when the next button has class "disabled"', async () => {
            document.body.innerHTML = `
                <table id="t"><tbody><tr><td>1</td></tr></tbody></table>
                <button id="next" class="disabled">Next</button>
            `;
            const table = document.getElementById('t') as unknown as Element;
            const data = await extractor.extractAllPages(table, { nextButtonSelector: '#next' });
            expect(data.metadata.totalPages).toBe(1);
        });

        it('stops when the next button no longer exists in the document', async () => {
            document.body.innerHTML = `<table id="t"><tbody><tr><td>1</td></tr></tbody></table>`;
            const table = document.getElementById('t') as unknown as Element;
            const data = await extractor.extractAllPages(table, { nextButtonSelector: '#missing-next' });
            expect(data.metadata.totalPages).toBe(1);
        });

        it('respects maxPages as an upper bound on the number of "next" clicks', async () => {
            jest.useFakeTimers();
            try {
                document.body.innerHTML = `
                    <table id="t"><tbody id="body"><tr><td>1</td></tr></tbody></table>
                    <button id="next">Next</button>
                `;
                const table = document.getElementById('t') as unknown as Element;
                const nextButton = document.getElementById('next') as HTMLButtonElement;
                let clicks = 0;
                nextButton.addEventListener('click', () => {
                    clicks += 1;
                });

                const promise = extractor.extractAllPages(table, { nextButtonSelector: '#next', delay: 10, maxPages: 3 });
                await jest.advanceTimersByTimeAsync(10);
                await jest.advanceTimersByTimeAsync(10);
                await jest.advanceTimersByTimeAsync(10);
                const data = await promise;

                expect(clicks).toBe(2); // currentPage starts at 1, loop runs while currentPage < maxPages
                expect(data.metadata.totalPages).toBe(3);
            } finally {
                jest.useRealTimers();
            }
        });
    });

    describe('isExcelExportAvailable / ensureXLSX', () => {
        it('is false when window.XLSX is undefined', () => {
            expect(extractor.isExcelExportAvailable()).toBe(false);
        });

        it('is true once window.XLSX is set', () => {
            (window as unknown as { XLSX: unknown }).XLSX = makeXLSXMock();
            expect(extractor.isExcelExportAvailable()).toBe(true);
        });

        it('ensureXLSX resolves true immediately when XLSX is already available', async () => {
            (window as unknown as { XLSX: unknown }).XLSX = makeXLSXMock();
            const ext = makeExtractor();
            await expect(ext.ensureXLSX()).resolves.toBe(true);
        });

        it('ensureXLSX delegates to librarySetup.ensureLibrary("xlsx") when not yet available', async () => {
            const librarySetup: LibrarySetupMock = { ensureLibrary: jest.fn().mockResolvedValue(true) };
            const ext = makeExtractor(librarySetup);
            await expect(ext.ensureXLSX()).resolves.toBe(true);
            expect(librarySetup.ensureLibrary).toHaveBeenCalledWith('xlsx');
        });

        it('ensureXLSX returns false when librarySetup.ensureLibrary rejects', async () => {
            const librarySetup: LibrarySetupMock = { ensureLibrary: jest.fn().mockRejectedValue(new Error('load failed')) };
            const ext = makeExtractor(librarySetup);
            await expect(ext.ensureXLSX()).resolves.toBe(false);
        });

        it('ensureXLSX returns false when there is no librarySetup and XLSX is unavailable', async () => {
            const ext = makeExtractor(null);
            await expect(ext.ensureXLSX()).resolves.toBe(false);
        });
    });

    describe('createExcelWorkbook', () => {
        it('throws when XLSX is not loaded', () => {
            const tableData: TableData = { headers: ['A'], rows: [['1']], metadata: { totalRows: 1, totalColumns: 1, extractedAt: 'now', tableId: null } };
            expect(() => extractor.createExcelWorkbook(tableData)).toThrow('XLSX library not loaded. Please include SheetJS in your page.');
        });

        it('builds a sheet from headers+rows and appends it with the default sheet name', () => {
            const xlsx = makeXLSXMock();
            (window as unknown as { XLSX: unknown }).XLSX = xlsx;
            const tableData: TableData = { headers: ['A', 'B'], rows: [['1', '2']], metadata: { totalRows: 1, totalColumns: 2, extractedAt: 'now', tableId: null } };

            extractor.createExcelWorkbook(tableData);

            expect(xlsx.utils.book_new).toHaveBeenCalledTimes(1);
            expect(xlsx.utils.aoa_to_sheet).toHaveBeenCalledWith([['A', 'B'], ['1', '2']]);
            expect(xlsx.utils.book_append_sheet).toHaveBeenCalledWith(expect.anything(), expect.anything(), 'Table Data');
        });

        it('adds a second "Metadata" sheet when includeMetadata is true', () => {
            const xlsx = makeXLSXMock();
            (window as unknown as { XLSX: unknown }).XLSX = xlsx;
            const tableData: TableData = { headers: ['A'], rows: [['1']], metadata: { totalRows: 1, totalColumns: 1, extractedAt: 'ts', tableId: null } };

            extractor.createExcelWorkbook(tableData, { includeMetadata: true });

            expect(xlsx.utils.book_append_sheet).toHaveBeenCalledTimes(2);
            expect(xlsx.utils.book_append_sheet).toHaveBeenLastCalledWith(expect.anything(), expect.anything(), 'Metadata');
            expect(xlsx.utils.aoa_to_sheet).toHaveBeenLastCalledWith([
                ['Property', 'Value'],
                ['Extracted At', 'ts'],
                ['Total Rows', 1],
                ['Total Columns', 1],
                ['Total Pages', 1]
            ]);
        });
    });

    describe('downloadAsExcel', () => {
        it('calls XLSX.writeFile with a default date-stamped filename on success', async () => {
            const xlsx = makeXLSXMock();
            (window as unknown as { XLSX: unknown }).XLSX = xlsx;
            const tableData: TableData = { headers: ['A'], rows: [['1']], metadata: { totalRows: 1, totalColumns: 1, extractedAt: 'ts', tableId: null } };

            const result = await extractor.downloadAsExcel(tableData);

            expect(result.success).toBe(true);
            expect(xlsx.writeFile).toHaveBeenCalledTimes(1);
            const [, filename] = xlsx.writeFile.mock.calls[0];
            expect(filename).toMatch(/^table-data-\d{4}-\d{2}-\d{2}\.xlsx$/);
            expect(result.rowCount).toBe(1);
            expect(result.columnCount).toBe(1);
        });

        it('uses a custom filename when provided', async () => {
            const xlsx = makeXLSXMock();
            (window as unknown as { XLSX: unknown }).XLSX = xlsx;
            const tableData: TableData = { headers: [], rows: [], metadata: { totalRows: 0, totalColumns: 0, extractedAt: 'ts', tableId: null } };

            const result = await extractor.downloadAsExcel(tableData, { filename: 'custom.xlsx' });
            expect(result.filename).toBe('custom.xlsx');
            expect(xlsx.writeFile.mock.calls[0][1]).toBe('custom.xlsx');
        });

        it('returns success:false when XLSX cannot be loaded at all', async () => {
            const tableData: TableData = { headers: [], rows: [], metadata: { totalRows: 0, totalColumns: 0, extractedAt: 'ts', tableId: null } };
            const result = await extractor.downloadAsExcel(tableData);
            expect(result).toEqual({ success: false, error: 'Excel export not available. XLSX library could not be loaded.' });
        });

        it('returns success:false and the error message when workbook creation throws', async () => {
            const xlsx = makeXLSXMock();
            xlsx.utils.aoa_to_sheet.mockImplementation(() => {
                throw new Error('bad sheet');
            });
            (window as unknown as { XLSX: unknown }).XLSX = xlsx;
            const tableData: TableData = { headers: ['A'], rows: [['1']], metadata: { totalRows: 1, totalColumns: 1, extractedAt: 'ts', tableId: null } };

            const result = await extractor.downloadAsExcel(tableData);
            expect(result).toEqual({ success: false, error: 'bad sheet' });
        });
    });

    describe('extractAndDownload', () => {
        it('extracts a single page and downloads it when pagination is not requested', async () => {
            const xlsx = makeXLSXMock();
            (window as unknown as { XLSX: unknown }).XLSX = xlsx;
            document.body.innerHTML = '<table id="t"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
            const table = document.getElementById('t') as unknown as Element;

            const result = await extractor.extractAndDownload(table);
            expect(result.success).toBe(true);
            expect(xlsx.utils.aoa_to_sheet).toHaveBeenCalledWith([['A'], ['1']]);
        });

        it('extracts across pages and downloads when includePagination + nextButtonSelector are given', async () => {
            const xlsx = makeXLSXMock();
            (window as unknown as { XLSX: unknown }).XLSX = xlsx;
            document.body.innerHTML = '<table id="t"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
            const table = document.getElementById('t') as unknown as Element;

            const result = await extractor.extractAndDownload(table, { includePagination: true, nextButtonSelector: '#missing-next' });
            expect(result.success).toBe(true);
            expect(xlsx.utils.aoa_to_sheet).toHaveBeenCalledWith([['A'], ['1']]);
        });

        it('ignores includePagination when nextButtonSelector is not provided (falls back to single-page extraction)', async () => {
            const xlsx = makeXLSXMock();
            (window as unknown as { XLSX: unknown }).XLSX = xlsx;
            document.body.innerHTML = '<table id="t"><tbody><tr><td>1</td></tr></tbody></table>';
            const table = document.getElementById('t') as unknown as Element;

            const result = await extractor.extractAndDownload(table, { includePagination: true });
            expect(result.success).toBe(true);
        });

        it('returns success:false and logs when extraction itself throws (invalid table element)', async () => {
            const result = await extractor.extractAndDownload(document.createElement('div') as unknown as Element);
            expect(result).toEqual({ success: false, error: 'Invalid table element provided' });
        });
    });

    describe('createProxy', () => {
        it('exposes extract/extractAll/download/extractAndDownload delegating to the instance, plus a direct extractor reference', async () => {
            document.body.innerHTML = '<table id="t"><thead><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table>';
            const table = document.getElementById('t') as unknown as Element;
            const proxy = extractor.createProxy();

            expect(proxy.extractor).toBe(extractor);
            const viaProxy = proxy.extract(table);
            const viaInstance = extractor.extractTableData(table);
            expect(viaProxy.headers).toEqual(viaInstance.headers);
            expect(viaProxy.rows).toEqual(viaInstance.rows);
            expect(viaProxy.metadata.tableId).toBe(viaInstance.metadata.tableId);

            const allPages = await proxy.extractAll(table);
            expect(allPages.metadata.totalPages).toBe(1);

            const xlsx = makeXLSXMock();
            (window as unknown as { XLSX: unknown }).XLSX = xlsx;
            const downloadResult = await proxy.download(proxy.extract(table));
            expect(downloadResult.success).toBe(true);

            const combined = await proxy.extractAndDownload(table);
            expect(combined.success).toBe(true);
        });
    });
});
