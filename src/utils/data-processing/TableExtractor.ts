/**
 * TableExtractor - Simplified table data extraction with optional Excel export
 * Basic functionality with optional pagination and Excel features
 */
import type {
    TableData,
    TableAllPagesData,
    TableExtractionOptions,
    TableExtractAllOptions,
    TableDownloadOptions,
    TableDownloadResult,
    TableExtractAndDownloadOptions,
    TableExtractorAPI,
    TablesAPI,
    LibrarySetupAPI
} from '../../types/public-api';
import { logger } from '../system/Logger.js';

/**
 * Minimal shape of the SheetJS (`xlsx`) global this file reads - only the
 * members actually called, not the full `@types/...`-style surface.
 * SheetJS is never imported; `LibrarySetup.setupXLSX()` (see
 * `src/libraries/LibrarySetup.js`) assigns it onto `window.XLSX` at
 * runtime, so it is read through `getXLSXGlobal()` (via `globalThis`)
 * rather than a `window.XLSX` typed as part of the global `Window`
 * interface - the same approach `ScriptInjector.ts` uses for the `chrome`
 * global.
 */
interface XLSXWorkbook {
    SheetNames: string[];
    Sheets: Record<string, unknown>;
}

interface XLSXLibrary {
    utils: {
        book_new(): XLSXWorkbook;
        aoa_to_sheet(data: unknown[][]): unknown;
        book_append_sheet(workbook: XLSXWorkbook, worksheet: unknown, sheetName: string): void;
    };
    writeFile(workbook: XLSXWorkbook, filename: string): void;
}

function getXLSXGlobal(): XLSXLibrary | undefined {
    return (globalThis as unknown as { XLSX?: XLSXLibrary }).XLSX;
}

/** The element clicked to change page; matches whatever a pagination selector resolves to, not necessarily a `<button>`. */
interface PaginationTriggerElement extends Element {
    disabled?: boolean;
    click(): void;
}

/** Upper bound on `previousButtonSelector` clicks, in case the control never reports itself disabled. */
const MAX_REWIND_CLICKS = 500;

/**
 * Elements that start a new line of text, used by `cellText: 'blocks'` (and
 * by `'innerText'` where the browser provides no `innerText`, as in jsdom).
 */
const BLOCK_TAGS = new Set([
    'ADDRESS', 'ARTICLE', 'ASIDE', 'BLOCKQUOTE', 'BR', 'DD', 'DETAILS', 'DIV', 'DL', 'DT',
    'FIGCAPTION', 'FIGURE', 'FOOTER', 'FORM', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'HEADER',
    'HR', 'LI', 'MAIN', 'NAV', 'OL', 'P', 'PRE', 'SECTION', 'SUMMARY', 'TABLE', 'TR', 'UL'
]);

function isPaginationControlDisabled(element: PaginationTriggerElement): boolean {
    return !!element.disabled ||
        element.classList.contains('disabled') ||
        element.getAttribute('aria-disabled') === 'true';
}

function wait(ms: number | undefined): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/** Splits a cell's text into the lines a reader would see, based on block-level tags and `<br>`. */
function blockTextLines(root: Node): string[] {
    const lines: string[] = [];
    let current = '';
    const breakLine = () => {
        lines.push(current);
        current = '';
    };
    const walk = (node: Node) => {
        for (const child of Array.from(node.childNodes)) {
            if (child.nodeType === Node.TEXT_NODE) {
                current += child.textContent || '';
            } else if (child.nodeType === Node.ELEMENT_NODE) {
                const isBlock = BLOCK_TAGS.has((child as Element).tagName);
                if (isBlock) breakLine();
                walk(child);
                if (isBlock) breakLine();
            }
        }
    };
    walk(root);
    breakLine();
    return lines;
}

class TableExtractor implements TableExtractorAPI {
    librarySetup: LibrarySetupAPI | null;
    /** Why the last `ensureXLSX()` could not load SheetJS, for error messages. */
    lastLoadError: string | null = null;

    constructor(librarySetup: LibrarySetupAPI | null = null) {
        this.librarySetup = librarySetup;
    }

    /**
     * Check if SheetJS is loaded right now (`window.XLSX` exists)
     */
    isXLSXLoaded(): boolean {
        return typeof getXLSXGlobal() !== 'undefined';
    }

    /**
     * Check if Excel export is available: SheetJS is already loaded, or can be
     * loaded on demand the first time it is needed. A synchronous API such as
     * `createExcelWorkbook()` still needs it loaded; call `await ensureXLSX()`
     * first (or list `'xlsx'` in the `preloadLibraries` config).
     */
    isExcelExportAvailable(): boolean {
        if (this.isXLSXLoaded()) {
            return true;
        }
        const librarySetup = this.librarySetup;
        return !!librarySetup && typeof librarySetup.canLoadLibrary === 'function' && librarySetup.canLoadLibrary('xlsx');
    }

    /**
     * Ensure XLSX library is loaded. Resolves false when it cannot be loaded;
     * the reason is then in `lastLoadError`.
     */
    async ensureXLSX(): Promise<boolean> {
        if (this.isXLSXLoaded()) {
            return true;
        }

        if (this.librarySetup) {
            try {
                logger.log('📊 Loading XLSX library for Excel export...');
                this.lastLoadError = null;
                return await this.librarySetup.ensureLibrary('xlsx');
            } catch (error) {
                this.lastLoadError = (error as Error).message;
                console.warn('📊 Failed to load XLSX library:', this.lastLoadError);
                return false;
            }
        }

        return false;
    }

    /**
     * Reads one cell's text according to `config.cellText`.
     * - `'textContent'` (default): the raw `textContent`, so text from
     *   stacked elements is glued together ("John Davis" + "CTO" gives
     *   "John DavisCTO").
     * - `'innerText'`: the browser's rendered text, which follows CSS
     *   (`display: block`, `<br>`, hidden elements); its lines are joined
     *   with `cellSeparator`. Falls back to `'blocks'` where `innerText` is
     *   not implemented.
     * - `'blocks'`: lines split on block-level tags and `<br>`, whatever the
     *   CSS, joined with `cellSeparator`.
     */
    private readCellText(cell: HTMLTableCellElement, config: TableExtractionOptions): string {
        const mode = config.cellText || 'textContent';
        if (mode === 'textContent') {
            let text = cell.textContent || cell.innerText || '';
            if (config.trimWhitespace) {
                text = text.trim().replace(/\s+/g, ' ');
            }
            return text;
        }

        const separator = config.cellSeparator ?? ' ';
        const lines = mode === 'innerText' && typeof cell.innerText === 'string'
            ? cell.innerText.split('\n')
            : blockTextLines(cell);

        if (!config.trimWhitespace) {
            return lines.filter(line => line !== '').join(separator);
        }
        return lines
            .map(line => line.trim().replace(/\s+/g, ' '))
            .filter(line => line !== '')
            .join(separator);
    }

    /**
     * Resolves `excludeColumns` to zero-based column indexes: numbers are
     * used as is, strings match a header case-insensitively after trimming,
     * and a RegExp is tested against each header. Strings and RegExps can
     * only match when headers were extracted (`includeHeaderRow`).
     */
    private resolveExcludedColumns(headers: string[], excludeColumns: TableExtractionOptions['excludeColumns']): Set<number> {
        const excluded = new Set<number>();
        if (!excludeColumns || excludeColumns.length === 0) {
            return excluded;
        }
        const normalise = (text: string) => text.trim().replace(/\s+/g, ' ').toLowerCase();
        for (const matcher of excludeColumns) {
            if (typeof matcher === 'number') {
                excluded.add(matcher);
                continue;
            }
            headers.forEach((header, index) => {
                const matches = matcher instanceof RegExp
                    ? matcher.test(header)
                    : normalise(header) === normalise(matcher);
                if (matches) excluded.add(index);
            });
        }
        return excluded;
    }

    /**
     * Navigates back to the first page before `extractAllPages()` reads
     * anything: clicks `firstPageSelector` once, or else clicks
     * `previousButtonSelector` until it is missing or disabled. Does nothing
     * when neither is set, or when the control is already disabled.
     */
    private async rewindToFirstPage(config: TableExtractAllOptions): Promise<void> {
        if (config.firstPageSelector) {
            const firstButton = document.querySelector<PaginationTriggerElement>(config.firstPageSelector);
            if (firstButton && !isPaginationControlDisabled(firstButton)) {
                logger.log('📊 Going to the first page...');
                firstButton.click();
                await wait(config.delay);
            }
            return;
        }

        if (config.previousButtonSelector) {
            for (let clicks = 0; clicks < MAX_REWIND_CLICKS; clicks++) {
                const previousButton = document.querySelector<PaginationTriggerElement>(config.previousButtonSelector);
                if (!previousButton || isPaginationControlDisabled(previousButton)) {
                    break;
                }
                previousButton.click();
                await wait(config.delay);
            }
        }
    }

    /**
     * Extract data from a table element
     * @param tableElement - The table element to extract from
     * @param options - Extraction options
     * @returns Extracted table data with headers and rows
     */
    extractTableData(tableElement: HTMLTableElement, options: TableExtractionOptions = {}): TableData {
        const config: TableExtractionOptions = {
            includeHeaderRow: true,
            trimWhitespace: true,
            ...options
        };

        if (!tableElement || tableElement.tagName !== 'TABLE') {
            throw new Error('Invalid table element provided');
        }

        const data: TableData = {
            headers: [],
            rows: [],
            metadata: {
                totalRows: 0,
                totalColumns: 0,
                extractedAt: new Date().toISOString(),
                tableId: tableElement.id || null
            }
        };

        // Extract headers
        const headerRows = tableElement.querySelectorAll<HTMLTableRowElement>('thead tr, tr:first-child');
        if (headerRows.length > 0 && config.includeHeaderRow) {
            const headerRow = headerRows[0];
            data.headers = Array.from(headerRow.querySelectorAll<HTMLTableCellElement>('th, td')).map(cell => this.readCellText(cell, config));
        }

        // Extract data rows
        let bodyRows: HTMLTableRowElement[] | NodeListOf<HTMLTableRowElement> = tableElement.querySelectorAll<HTMLTableRowElement>('tbody tr');
        if (bodyRows.length === 0) {
            // If no tbody, get all rows except first (header)
            const allRows = tableElement.querySelectorAll<HTMLTableRowElement>('tr');
            bodyRows = Array.from(allRows).slice(config.includeHeaderRow ? 1 : 0);
        }

        data.rows = Array.from(bodyRows).map((row) => {
            const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td, th')).map(cell => this.readCellText(cell, config));

            return cells;
        });

        const excluded = this.resolveExcludedColumns(data.headers, config.excludeColumns);
        if (excluded.size > 0) {
            const keep = (_cell: string, index: number) => !excluded.has(index);
            data.headers = data.headers.filter(keep);
            data.rows = data.rows.map(row => row.filter(keep));
        }

        data.metadata.totalRows = data.rows.length;
        data.metadata.totalColumns = Math.max(
            data.headers.length,
            ...data.rows.map(row => row.length)
        );

        return data;
    }

    /**
     * Extract all data from a paginated table (basic implementation)
     * @param tableElement - The table element
     * @param options - Extraction options
     * @returns Complete table data from all pages
     */
    async extractAllPages(tableElement: HTMLTableElement, options: TableExtractAllOptions = {}): Promise<TableAllPagesData> {
        const config: TableExtractAllOptions = {
            maxPages: 10,
            delay: 1000,
            nextButtonSelector: null, // User must provide if pagination is needed
            firstPageSelector: null,
            previousButtonSelector: null,
            ...options
        };

        const allData: TableAllPagesData = {
            headers: [],
            rows: [],
            metadata: {
                totalPages: 1,
                totalRows: 0,
                totalColumns: 0,
                extractedAt: new Date().toISOString(),
                paginationMethod: 'basic'
            }
        };

        await this.rewindToFirstPage(config);

        // Extract first page
        const firstPageData = this.extractTableData(tableElement, config);
        allData.headers = firstPageData.headers;
        allData.rows = [...firstPageData.rows];

        // Only handle pagination if nextButtonSelector is provided
        if (config.nextButtonSelector) {
            let currentPage = 1;

            logger.log(`📊 Extracted page ${currentPage} (${firstPageData.rows.length} rows)`);

            while (currentPage < (config.maxPages as number)) {
                const nextButton = document.querySelector<PaginationTriggerElement>(config.nextButtonSelector);

                if (!nextButton || isPaginationControlDisabled(nextButton)) {
                    break;
                }

                try {
                    // Click next button
                    logger.log(`📊 Going to page ${currentPage + 1}...`);
                    nextButton.click();

                    // Wait for page to load
                    await wait(config.delay);

                    currentPage++;

                    // Extract data from new page
                    const pageData = this.extractTableData(tableElement, config);
                    allData.rows = [...allData.rows, ...pageData.rows];

                    logger.log(`📊 Extracted page ${currentPage} (${pageData.rows.length} rows)`);

                } catch (error) {
                    console.warn(`📊 Error on page ${currentPage}:`, error);
                    break;
                }
            }

            allData.metadata.totalPages = currentPage;
        }

        allData.metadata.totalRows = allData.rows.length;
        allData.metadata.totalColumns = Math.max(
            allData.headers.length,
            ...allData.rows.map(row => row.length)
        );

        logger.log(`📊 Extraction completed: ${allData.metadata.totalPages} pages, ${allData.rows.length} total rows`);
        return allData;
    }

    /**
     * Convert table data to Excel workbook
     * @param tableData - Data from extractTableData/extractAllPages
     * @param options - Export options
     * @returns Excel workbook object
     */
    createExcelWorkbook(tableData: TableData | TableAllPagesData, options: TableDownloadOptions = {}): XLSXWorkbook {
        // Merge per key with ?? so an option passed as undefined keeps its default.
        const config: TableDownloadOptions = {
            ...options,
            sheetName: options.sheetName ?? 'Table Data',
            includeMetadata: options.includeMetadata ?? false
        };

        if (!this.isXLSXLoaded()) {
            throw new Error(
                'XLSX library not loaded. SheetJS is loaded on demand: await ensureXLSX() (or downloadAsExcel()) first, ' +
                'list \'xlsx\' in the preloadLibraries config, or include SheetJS in your page.'
            );
        }

        const xlsx = getXLSXGlobal() as XLSXLibrary;
        const workbook = xlsx.utils.book_new();
        const excelData: unknown[][] = [];

        // Add headers if they exist
        if (tableData.headers && tableData.headers.length > 0) {
            excelData.push(tableData.headers);
        }

        // Add data rows
        if (tableData.rows && tableData.rows.length > 0) {
            excelData.push(...tableData.rows);
        }

        // Create worksheet
        const worksheet = xlsx.utils.aoa_to_sheet(excelData);
        xlsx.utils.book_append_sheet(workbook, worksheet, config.sheetName as string);

        // Add simple metadata sheet if requested
        if (config.includeMetadata && tableData.metadata) {
            const metadataData: unknown[][] = [
                ['Property', 'Value'],
                ['Extracted At', tableData.metadata.extractedAt],
                ['Total Rows', tableData.metadata.totalRows],
                ['Total Columns', tableData.metadata.totalColumns],
                // Only TableAllPagesData's metadata carries totalPages; TableData's does not.
                ['Total Pages', (tableData.metadata as Partial<TableAllPagesData['metadata']>).totalPages || 1]
            ];

            const metadataSheet = xlsx.utils.aoa_to_sheet(metadataData);
            xlsx.utils.book_append_sheet(workbook, metadataSheet, 'Metadata');
        }

        return workbook;
    }

    /**
     * Download table data as Excel file
     * @param tableData - Data from extractTableData/extractAllPages
     * @param options - Download options
     */
    async downloadAsExcel(tableData: TableData | TableAllPagesData, options: TableDownloadOptions = {}): Promise<TableDownloadResult> {
        // Merge per key with ?? so an option passed as undefined keeps its default.
        const config: TableDownloadOptions = {
            ...options,
            filename: options.filename ?? `table-data-${new Date().toISOString().split('T')[0]}.xlsx`,
            sheetName: options.sheetName ?? 'Table Data',
            includeMetadata: options.includeMetadata ?? false
        };

        try {
            // Ensure XLSX library is available
            const xlsxAvailable = await this.ensureXLSX();
            if (!xlsxAvailable) {
                const reason = this.lastLoadError ? ` ${this.lastLoadError}` : '';
                throw new Error(`Excel export not available. XLSX library could not be loaded.${reason}`);
            }

            const workbook = this.createExcelWorkbook(tableData, config);
            (getXLSXGlobal() as XLSXLibrary).writeFile(workbook, config.filename as string);

            return {
                success: true,
                filename: config.filename as string,
                rowCount: tableData.rows?.length || 0,
                columnCount: tableData.metadata?.totalColumns || 0
            };
        } catch (error) {
            console.error('Error creating Excel file:', error);
            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    /**
     * Extract table and download as Excel in one step
     * @param tableElement - The table element
     * @param options - Combined extraction and download options
     */
    async extractAndDownload(tableElement: HTMLTableElement, options: TableExtractAndDownloadOptions = {}): Promise<TableDownloadResult> {
        const {
            includePagination = false,
            filename,
            nextButtonSelector,
            ...extractOptions
        } = options;

        try {
            let tableData: TableData | TableAllPagesData;

            if (includePagination && nextButtonSelector) {
                tableData = await this.extractAllPages(tableElement, { ...extractOptions, nextButtonSelector });
            } else {
                tableData = this.extractTableData(tableElement, extractOptions);
            }

            const downloadOptions: TableDownloadOptions = {
                filename,
                sheetName: options.sheetName,
                includeMetadata: options.includeMetadata
            };
            return await this.downloadAsExcel(tableData, downloadOptions);

        } catch (error) {
            console.error('Error in extractAndDownload:', error);
            return {
                success: false,
                error: (error as Error).message
            };
        }
    }

    /**
     * Create a proxy object for global access
     */
    createProxy(): TablesAPI {
        return {
            extract: (element, options) => this.extractTableData(element, options),
            extractAll: (element, options) => this.extractAllPages(element, options),
            download: (tableData, options) => this.downloadAsExcel(tableData, options),
            extractAndDownload: (element, options) => this.extractAndDownload(element, options),

            // Direct access to utility
            extractor: this
        };
    }
}

export default TableExtractor;
