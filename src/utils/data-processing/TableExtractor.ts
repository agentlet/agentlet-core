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

/** The element clicked to advance to the next page; matches whatever `nextButtonSelector` resolves to, not necessarily a `<button>`. */
interface PaginationTriggerElement extends Element {
    disabled?: boolean;
    click(): void;
}

class TableExtractor implements TableExtractorAPI {
    librarySetup: LibrarySetupAPI | null;

    constructor(librarySetup: LibrarySetupAPI | null = null) {
        this.librarySetup = librarySetup;
    }

    /**
     * Check if Excel export is available
     */
    isExcelExportAvailable(): boolean {
        return typeof getXLSXGlobal() !== 'undefined';
    }

    /**
     * Ensure XLSX library is loaded
     */
    async ensureXLSX(): Promise<boolean> {
        if (this.isExcelExportAvailable()) {
            return true;
        }

        if (this.librarySetup) {
            try {
                console.log('📊 Loading XLSX library for Excel export...');
                return await this.librarySetup.ensureLibrary('xlsx');
            } catch (error) {
                console.warn('📊 Failed to load XLSX library:', (error as Error).message);
                return false;
            }
        }

        return false;
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
            data.headers = Array.from(headerRow.querySelectorAll<HTMLTableCellElement>('th, td')).map(cell => {
                let text = cell.textContent || cell.innerText || '';
                if (config.trimWhitespace) {
                    text = text.trim().replace(/\s+/g, ' ');
                }
                return text;
            });
        }

        // Extract data rows
        let bodyRows: HTMLTableRowElement[] | NodeListOf<HTMLTableRowElement> = tableElement.querySelectorAll<HTMLTableRowElement>('tbody tr');
        if (bodyRows.length === 0) {
            // If no tbody, get all rows except first (header)
            const allRows = tableElement.querySelectorAll<HTMLTableRowElement>('tr');
            bodyRows = Array.from(allRows).slice(config.includeHeaderRow ? 1 : 0);
        }

        data.rows = Array.from(bodyRows).map((row) => {
            const cells = Array.from(row.querySelectorAll<HTMLTableCellElement>('td, th')).map(cell => {
                let text = cell.textContent || cell.innerText || '';
                if (config.trimWhitespace) {
                    text = text.trim().replace(/\s+/g, ' ');
                }
                return text;
            });

            return cells;
        });

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

        // Extract first page
        const firstPageData = this.extractTableData(tableElement, config);
        allData.headers = firstPageData.headers;
        allData.rows = [...firstPageData.rows];

        // Only handle pagination if nextButtonSelector is provided
        if (config.nextButtonSelector) {
            let currentPage = 1;

            console.log(`📊 Extracted page ${currentPage} (${firstPageData.rows.length} rows)`);

            while (currentPage < (config.maxPages as number)) {
                const nextButton = document.querySelector<PaginationTriggerElement>(config.nextButtonSelector);

                if (!nextButton || nextButton.disabled || nextButton.classList.contains('disabled')) {
                    break;
                }

                try {
                    // Click next button
                    console.log(`📊 Going to page ${currentPage + 1}...`);
                    nextButton.click();

                    // Wait for page to load
                    await new Promise(resolve => setTimeout(resolve, config.delay));

                    currentPage++;

                    // Extract data from new page
                    const pageData = this.extractTableData(tableElement, config);
                    allData.rows = [...allData.rows, ...pageData.rows];

                    console.log(`📊 Extracted page ${currentPage} (${pageData.rows.length} rows)`);

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

        console.log(`📊 Extraction completed: ${allData.metadata.totalPages} pages, ${allData.rows.length} total rows`);
        return allData;
    }

    /**
     * Convert table data to Excel workbook
     * @param tableData - Data from extractTableData/extractAllPages
     * @param options - Export options
     * @returns Excel workbook object
     */
    createExcelWorkbook(tableData: TableData | TableAllPagesData, options: TableDownloadOptions = {}): XLSXWorkbook {
        const config: TableDownloadOptions = {
            sheetName: 'Table Data',
            includeMetadata: false,
            ...options
        };

        if (!this.isExcelExportAvailable()) {
            throw new Error('XLSX library not loaded. Please include SheetJS in your page.');
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
        const config: TableDownloadOptions = {
            filename: `table-data-${new Date().toISOString().split('T')[0]}.xlsx`,
            sheetName: 'Table Data',
            includeMetadata: false,
            ...options
        };

        try {
            // Ensure XLSX library is available
            const xlsxAvailable = await this.ensureXLSX();
            if (!xlsxAvailable) {
                throw new Error('Excel export not available. XLSX library could not be loaded.');
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

            const downloadOptions: TableDownloadOptions = { filename, ...options };
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
