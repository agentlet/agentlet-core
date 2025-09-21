/**
 * TableExtractor - Simplified table data extraction with optional Excel export
 * Basic functionality with optional pagination and Excel features
 */

class TableExtractor {
    constructor(librarySetup = null) {
        this.librarySetup = librarySetup;
    }
    
    /**
     * Check if Excel export is available
     * @returns {boolean}
     */
    isExcelExportAvailable() {
        return typeof window.XLSX !== 'undefined';
    }
    
    /**
     * Ensure XLSX library is loaded
     * @returns {Promise<boolean>}
     */
    async ensureXLSX() {
        if (this.isExcelExportAvailable()) {
            return true;
        }
        
        if (this.librarySetup) {
            try {
                console.log('📊 Loading XLSX library for Excel export...');
                return await this.librarySetup.ensureLibrary('xlsx');
            } catch (error) {
                console.warn('📊 Failed to load XLSX library:', error.message);
                return false;
            }
        }
        
        return false;
    }

    /**
     * Extract data from a table element
     * @param {HTMLElement} tableElement - The table element to extract from
     * @param {Object} options - Extraction options
     * @returns {Object} Extracted table data with headers and rows
     */
    extractTableData(tableElement, options = {}) {
        const config = {
            includeHeaderRow: true,
            trimWhitespace: true,
            ...options
        };

        if (!tableElement || tableElement.tagName !== 'TABLE') {
            throw new Error('Invalid table element provided');
        }

        const data = {
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
        const headerRows = tableElement.querySelectorAll('thead tr, tr:first-child');
        if (headerRows.length > 0 && config.includeHeaderRow) {
            const headerRow = headerRows[0];
            data.headers = Array.from(headerRow.querySelectorAll('th, td')).map(cell => {
                let text = cell.textContent || cell.innerText || '';
                if (config.trimWhitespace) {
                    text = text.trim().replace(/\s+/g, ' ');
                }
                return text;
            });
        }

        // Extract data rows
        let bodyRows = tableElement.querySelectorAll('tbody tr');
        if (bodyRows.length === 0) {
            // If no tbody, get all rows except first (header)
            const allRows = tableElement.querySelectorAll('tr');
            bodyRows = Array.from(allRows).slice(config.includeHeaderRow ? 1 : 0);
        }

        data.rows = Array.from(bodyRows).map((row, rowIndex) => {
            const cells = Array.from(row.querySelectorAll('td, th')).map(cell => {
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
     * @param {HTMLElement} tableElement - The table element
     * @param {Object} options - Extraction options
     * @returns {Promise<Object>} Complete table data from all pages
     */
    async extractAllPages(tableElement, options = {}) {
        const config = {
            maxPages: 10,
            delay: 1000,
            nextButtonSelector: null, // User must provide if pagination is needed
            ...options
        };

        const allData = {
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

            while (currentPage < config.maxPages) {
                const nextButton = document.querySelector(config.nextButtonSelector);
                
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
     * @param {Object} tableData - Data from extractTableData/extractAllPages
     * @param {Object} options - Export options
     * @returns {Object} Excel workbook object
     */
    createExcelWorkbook(tableData, options = {}) {
        const config = {
            sheetName: 'Table Data',
            includeMetadata: false,
            ...options
        };

        if (!this.isExcelExportAvailable()) {
            throw new Error('XLSX library not loaded. Please include SheetJS in your page.');
        }

        const workbook = window.XLSX.utils.book_new();
        const excelData = [];
        
        // Add headers if they exist
        if (tableData.headers && tableData.headers.length > 0) {
            excelData.push(tableData.headers);
        }
        
        // Add data rows
        if (tableData.rows && tableData.rows.length > 0) {
            excelData.push(...tableData.rows);
        }

        // Create worksheet
        const worksheet = window.XLSX.utils.aoa_to_sheet(excelData);
        window.XLSX.utils.book_append_sheet(workbook, worksheet, config.sheetName);
        
        // Add simple metadata sheet if requested
        if (config.includeMetadata && tableData.metadata) {
            const metadataData = [
                ['Property', 'Value'],
                ['Extracted At', tableData.metadata.extractedAt],
                ['Total Rows', tableData.metadata.totalRows],
                ['Total Columns', tableData.metadata.totalColumns],
                ['Total Pages', tableData.metadata.totalPages || 1]
            ];
            
            const metadataSheet = window.XLSX.utils.aoa_to_sheet(metadataData);
            window.XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Metadata');
        }
        
        return workbook;
    }

    /**
     * Download table data as Excel file
     * @param {Object} tableData - Data from extractTableData/extractAllPages
     * @param {Object} options - Download options
     */
    async downloadAsExcel(tableData, options = {}) {
        const config = {
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
            window.XLSX.writeFile(workbook, config.filename);
            
            return {
                success: true,
                filename: config.filename,
                rowCount: tableData.rows?.length || 0,
                columnCount: tableData.metadata?.totalColumns || 0
            };
        } catch (error) {
            console.error('Error creating Excel file:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Extract table and download as Excel in one step
     * @param {HTMLElement} tableElement - The table element
     * @param {Object} options - Combined extraction and download options
     */
    async extractAndDownload(tableElement, options = {}) {
        const {
            includePagination = false,
            filename,
            nextButtonSelector,
            ...extractOptions
        } = options;

        try {
            let tableData;
            
            if (includePagination && nextButtonSelector) {
                tableData = await this.extractAllPages(tableElement, { ...extractOptions, nextButtonSelector });
            } else {
                tableData = this.extractTableData(tableElement, extractOptions);
            }
            
            const downloadOptions = { filename, ...options };
            return await this.downloadAsExcel(tableData, downloadOptions);
            
        } catch (error) {
            console.error('Error in extractAndDownload:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Create a proxy object for global access
     */
    createProxy() {
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