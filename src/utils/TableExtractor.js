/**
 * Table Extractor - Extract structured data from HTML tables with Excel export
 * Handles pagination and provides Excel download functionality using SheetJS
 */

class TableExtractor {
    constructor() {
        // Manual pagination controls (user-selected)
        this.manualNextButton = null;
        this.manualPageCounter = null;
        
        this.paginationSelectors = [
            'button[aria-label*="next"]',
            'button[class*="next"]',
            'a[class*="next"]',
            '.pagination .next',
            '.pager .next',
            '[data-testid*="next"]',
            '.page-next',
            '.btn-next'
        ];
        
        this.loadMoreSelectors = [
            'button[class*="load-more"]',
            'button[class*="show-more"]',
            'a[class*="load-more"]',
            '[data-testid*="load-more"]',
            '.load-more-btn'
        ];
        
        // Text-based selectors for manual checking
        this.paginationTextPatterns = [
            /next/i,
            /forward/i,
            /→/,
            />/,
            /more/i,
            /continue/i
        ];
        
        this.loadMoreTextPatterns = [
            /load\s*more/i,
            /show\s*more/i,
            /view\s*more/i,
            /see\s*more/i
        ];
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
            includeBoundingBoxes: false,
            handleSpannedCells: true,
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
                tableId: tableElement.id || null,
                tableClasses: Array.from(tableElement.classList),
                hasPagination: this.detectPagination(tableElement)
            }
        };

        // Extract headers
        const headerRows = tableElement.querySelectorAll('thead tr, tr:first-child');
        if (headerRows.length > 0 && config.includeHeaderRow) {
            const headerRow = headerRows[0];
            const headers = Array.from(headerRow.querySelectorAll('th, td')).map(cell => {
                const text = this.extractCellText(cell, config);
                const result = { text };
                
                if (config.includeBoundingBoxes) {
                    result.boundingBox = this.getCellBoundingBox(cell);
                }
                
                if (config.handleSpannedCells) {
                    result.colspan = parseInt(cell.getAttribute('colspan')) || 1;
                    result.rowspan = parseInt(cell.getAttribute('rowspan')) || 1;
                }
                
                return result;
            });
            data.headers = headers;
        }

        // Extract data rows
        let bodyRows = tableElement.querySelectorAll('tbody tr, tr:not(:first-child)');
        if (bodyRows.length === 0) {
            // If no tbody, get all rows except first (header)
            const allRows = tableElement.querySelectorAll('tr');
            bodyRows = Array.from(allRows).slice(config.includeHeaderRow ? 1 : 0);
        }

        data.rows = Array.from(bodyRows).map((row, rowIndex) => {
            const cells = Array.from(row.querySelectorAll('td, th')).map(cell => {
                const text = this.extractCellText(cell, config);
                const result = { text };
                
                if (config.includeBoundingBoxes) {
                    result.boundingBox = this.getCellBoundingBox(cell);
                }
                
                if (config.handleSpannedCells) {
                    result.colspan = parseInt(cell.getAttribute('colspan')) || 1;
                    result.rowspan = parseInt(cell.getAttribute('rowspan')) || 1;
                }
                
                return result;
            });
            
            return {
                index: rowIndex,
                cells,
                element: row
            };
        });

        data.metadata.totalRows = data.rows.length;
        data.metadata.totalColumns = Math.max(
            data.headers.length,
            ...data.rows.map(row => row.cells.length)
        );

        return data;
    }

    /**
     * Extract text content from a cell
     */
    extractCellText(cell, config) {
        let text = cell.textContent || cell.innerText || '';
        
        if (config.trimWhitespace) {
            text = text.trim().replace(/\s+/g, ' ');
        }
        
        return text;
    }

    /**
     * Get bounding box of a cell
     */
    getCellBoundingBox(cell) {
        const rect = cell.getBoundingClientRect();
        return {
            x: rect.left,
            y: rect.top,
            width: rect.width,
            height: rect.height
        };
    }

    /**
     * Detect if table has pagination
     */
    detectPagination(tableElement) {
        const container = tableElement.closest('[class*="table"]') || 
                         tableElement.parentElement || 
                         document;
        
        // Check for pagination elements using CSS selectors
        for (const selector of this.paginationSelectors) {
            try {
                if (container.querySelector(selector)) {
                    return true;
                }
            } catch (error) {
                console.warn('Invalid pagination selector:', selector, error);
            }
        }
        
        // Check for load more buttons using CSS selectors
        for (const selector of this.loadMoreSelectors) {
            try {
                if (container.querySelector(selector)) {
                    return true;
                }
            } catch (error) {
                console.warn('Invalid load more selector:', selector, error);
            }
        }
        
        // Check for buttons/links with pagination text content
        const buttons = container.querySelectorAll('button, a, input[type="button"]');
        for (const button of buttons) {
            const text = (button.textContent || button.value || '').trim();
            
            // Check pagination patterns
            for (const pattern of this.paginationTextPatterns) {
                if (pattern.test(text)) {
                    return true;
                }
            }
            
            // Check load more patterns
            for (const pattern of this.loadMoreTextPatterns) {
                if (pattern.test(text)) {
                    return true;
                }
            }
        }
        
        return false;
    }

    /**
     * Set manual pagination controls
     * @param {HTMLElement} nextButton - User-selected next button element
     * @param {HTMLElement} pageCounter - User-selected page counter element (optional)
     */
    setManualPaginationControls(nextButton, pageCounter = null) {
        this.manualNextButton = nextButton;
        this.manualPageCounter = pageCounter;
        
        if (nextButton) {
            console.log('📊 Manual next button set:', nextButton.textContent?.trim() || nextButton.outerHTML.substring(0, 100));
        }
        if (pageCounter) {
            console.log('📊 Manual page counter set:', pageCounter.textContent?.trim() || pageCounter.outerHTML.substring(0, 100));
        }
    }

    /**
     * Clear manual pagination controls
     */
    clearManualPaginationControls() {
        this.manualNextButton = null;
        this.manualPageCounter = null;
        console.log('📊 Manual pagination controls cleared');
    }

    /**
     * Check if manual pagination controls are available
     */
    hasManualPaginationControls() {
        return !!this.manualNextButton;
    }

    /**
     * Extract all data from a paginated table
     * @param {HTMLElement} tableElement - The table element
     * @param {Object} options - Extraction options
     * @returns {Promise<Object>} Complete table data from all pages
     */
    async extractAllPages(tableElement, options = {}) {
        const config = {
            maxPages: 50,
            delay: 1000,
            stopOnError: true,
            preferManualPagination: true,
            ...options
        };

        // Use manual pagination if available and preferred
        if (config.preferManualPagination && this.hasManualPaginationControls()) {
            console.log('📊 Using manual pagination controls');
            return await this.extractWithManualPagination(tableElement, config);
        }

        // Fall back to automatic detection
        console.log('📊 Using automatic pagination detection');
        return await this.extractWithAutomaticPagination(tableElement, config);
    }

    /**
     * Extract all pages using manual pagination controls
     * @param {HTMLElement} tableElement - The table element
     * @param {Object} config - Configuration options
     * @returns {Promise<Object>} Complete table data from all pages
     */
    async extractWithManualPagination(tableElement, config) {
        const allData = {
            headers: [],
            rows: [],
            metadata: {
                totalPages: 0,
                totalRows: 0,
                totalColumns: 0,
                extractedAt: new Date().toISOString(),
                paginationMethod: 'manual'
            }
        };

        let currentPage = 1;

        // Extract first page
        const firstPageData = this.extractTableData(tableElement, config);
        allData.headers = firstPageData.headers;
        allData.rows = [...firstPageData.rows];

        console.log(`📊 Manual pagination: Extracted page ${currentPage} (${firstPageData.rows.length} rows)`);
        this.updateManualPageCounterDisplay(currentPage);

        // Continue with pagination if next button is available
        while (currentPage < config.maxPages && this.isManualNextButtonAvailable()) {
            try {
                // Click the next button
                console.log(`📊 Manual pagination: Clicking next button for page ${currentPage + 1}...`);
                this.manualNextButton.click();
                
                // Wait for page to load
                await this.waitForPageLoadWithLoadingDetection(config.delay);
                
                currentPage++;
                
                // Extract data from new page
                const pageData = this.extractTableData(tableElement, config);
                allData.rows = [...allData.rows, ...pageData.rows];
                
                console.log(`📊 Manual pagination: Extracted page ${currentPage} (${pageData.rows.length} rows)`);
                this.updateManualPageCounterDisplay(currentPage);
                
            } catch (error) {
                console.warn(`📊 Manual pagination: Error on page ${currentPage}:`, error);
                if (config.stopOnError) {
                    break;
                }
            }
        }

        allData.metadata.totalPages = currentPage;
        allData.metadata.totalRows = allData.rows.length;
        allData.metadata.totalColumns = Math.max(
            allData.headers.length,
            ...allData.rows.map(row => row.cells.length)
        );

        console.log(`📊 Manual pagination completed: ${currentPage} pages, ${allData.rows.length} total rows`);
        return allData;
    }

    /**
     * Extract all pages using automatic pagination detection
     * @param {HTMLElement} tableElement - The table element
     * @param {Object} config - Configuration options
     * @returns {Promise<Object>} Complete table data from all pages
     */
    async extractWithAutomaticPagination(tableElement, config) {
        const allData = {
            headers: [],
            rows: [],
            metadata: {
                totalPages: 0,
                totalRows: 0,
                totalColumns: 0,
                extractedAt: new Date().toISOString(),
                paginationMethod: null
            }
        };

        let currentPage = 1;
        const hasNextPage = true;

        // Extract first page
        const firstPageData = this.extractTableData(tableElement, config);
        allData.headers = firstPageData.headers;
        allData.rows = [...firstPageData.rows];

        if (!firstPageData.metadata.hasPagination) {
            allData.metadata.totalPages = 1;
            allData.metadata.totalRows = firstPageData.rows.length;
            allData.metadata.totalColumns = firstPageData.metadata.totalColumns;
            return allData;
        }

        // Find pagination controls
        const paginationInfo = this.findPaginationControls(tableElement);
        allData.metadata.paginationMethod = paginationInfo.method;

        while (hasNextPage && currentPage < config.maxPages) {
            try {
                const nextPageTriggered = await this.goToNextPage(paginationInfo, config.delay);
                
                if (!nextPageTriggered) {
                    break;
                }

                currentPage++;
                
                // Wait for content to load
                await this.waitForTableUpdate(tableElement, config.delay);
                
                // Extract data from new page
                const pageData = this.extractTableData(tableElement, config);
                
                // Append new rows (skip headers as they should be the same)
                allData.rows = [...allData.rows, ...pageData.rows];
                
            } catch (error) {
                console.warn(`Error extracting page ${currentPage}:`, error);
                if (config.stopOnError) {
                    break;
                }
            }
        }

        allData.metadata.totalPages = currentPage;
        allData.metadata.totalRows = allData.rows.length;
        allData.metadata.totalColumns = Math.max(
            allData.headers.length,
            ...allData.rows.map(row => row.cells.length)
        );

        return allData;
    }

    /**
     * Check if manual next button is available and clickable
     */
    isManualNextButtonAvailable() {
        if (!this.manualNextButton) return false;
        
        // Check if button is disabled
        return !this.manualNextButton.disabled && 
               !this.manualNextButton.classList.contains('disabled') &&
               this.manualNextButton.getAttribute('aria-disabled') !== 'true';
    }

    /**
     * Update page counter display for manual pagination
     */
    updateManualPageCounterDisplay(currentPage) {
        if (this.manualPageCounter) {
            const currentText = this.manualPageCounter.textContent?.trim() || '';
            console.log(`📊 Page counter shows: "${currentText}" (on page ${currentPage})`);
        }
    }

    /**
     * Wait for page load with enhanced loading detection
     */
    async waitForPageLoadWithLoadingDetection(delay) {
        // Wait for the basic delay
        await new Promise(resolve => setTimeout(resolve, delay));
        
        // Additional wait for any loading indicators to disappear
        let attempts = 0;
        const maxAttempts = 10;
        
        while (attempts < maxAttempts) {
            const loadingElements = document.querySelectorAll('.loading, .spinner, [class*="loading"], [class*="spinner"]');
            if (loadingElements.length === 0) {
                break;
            }
            await new Promise(resolve => setTimeout(resolve, 200));
            attempts++;
        }
    }

    /**
     * Find pagination controls
     */
    findPaginationControls(tableElement) {
        const container = tableElement.closest('[class*="table"]') || 
                         tableElement.parentElement || 
                         document;

        // Check for next button pagination using CSS selectors
        for (const selector of this.paginationSelectors) {
            try {
                const element = container.querySelector(selector);
                if (element) {
                    return {
                        method: 'next-button',
                        element,
                        selector
                    };
                }
            } catch (error) {
                console.warn('Invalid pagination selector in findPaginationControls:', selector, error);
            }
        }

        // Check for load more buttons using CSS selectors
        for (const selector of this.loadMoreSelectors) {
            try {
                const element = container.querySelector(selector);
                if (element) {
                    return {
                        method: 'load-more',
                        element,
                        selector
                    };
                }
            } catch (error) {
                console.warn('Invalid load more selector in findPaginationControls:', selector, error);
            }
        }

        // Check for buttons/links with pagination text content
        const buttons = container.querySelectorAll('button, a, input[type="button"]');
        for (const button of buttons) {
            const text = (button.textContent || button.value || '').trim();
            
            // Check pagination patterns
            for (const pattern of this.paginationTextPatterns) {
                if (pattern.test(text)) {
                    return {
                        method: 'next-button',
                        element: button,
                        selector: 'text-based'
                    };
                }
            }
            
            // Check load more patterns
            for (const pattern of this.loadMoreTextPatterns) {
                if (pattern.test(text)) {
                    return {
                        method: 'load-more',
                        element: button,
                        selector: 'text-based'
                    };
                }
            }
        }

        return { method: 'none', element: null, selector: null };
    }

    /**
     * Go to next page
     */
    async goToNextPage(paginationInfo, delay) {
        if (!paginationInfo.element) {
            return false;
        }

        // Check if button is disabled
        if (paginationInfo.element.disabled || 
            paginationInfo.element.classList.contains('disabled') ||
            paginationInfo.element.getAttribute('aria-disabled') === 'true') {
            return false;
        }

        // Click the pagination element
        paginationInfo.element.click();
        
        // Wait for the action to take effect
        await new Promise(resolve => setTimeout(resolve, delay));
        
        return true;
    }

    /**
     * Wait for table to update after pagination
     */
    async waitForTableUpdate(tableElement, delay) {
        const originalRowCount = tableElement.querySelectorAll('tbody tr, tr').length;
        let attempts = 0;
        const maxAttempts = 10;

        while (attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, delay / 5));
            
            const currentRowCount = tableElement.querySelectorAll('tbody tr, tr').length;
            
            // If row count changed or we see loading indicators are gone
            if (currentRowCount !== originalRowCount || 
                !this.hasLoadingIndicators(tableElement)) {
                break;
            }
            
            attempts++;
        }
    }

    /**
     * Check for loading indicators
     */
    hasLoadingIndicators(tableElement) {
        const container = tableElement.closest('[class*="table"]') || 
                         tableElement.parentElement || 
                         document;
        
        const loadingSelectors = [
            '.loading',
            '.spinner',
            '[class*="loading"]',
            '[class*="spinner"]',
            '.fa-spinner',
            '.fa-loading'
        ];

        return loadingSelectors.some(selector => 
            container.querySelector(selector) !== null
        );
    }

    /**
     * Convert table data to Excel workbook
     * @param {Object|Array} tableData - Data from extractTableData/extractAllPages or array of sheet objects
     * @param {Object} options - Export options
     * @returns {Object} Excel workbook object
     */
    createExcelWorkbook(tableData, options = {}) {
        const config = {
            sheetName: 'Table Data',
            includeMetadata: true,
            dateFormat: 'yyyy-mm-dd hh:mm:ss',
            ...options
        };

        // Load XLSX dynamically if not already loaded
        if (typeof window.XLSX === 'undefined') {
            throw new Error('XLSX library not loaded. Please include SheetJS in your page.');
        }

        const workbook = window.XLSX.utils.book_new();
        
        // Check if this is multi-sheet data (array of sheet objects)
        if (Array.isArray(tableData)) {
            // Handle multi-sheet workbook
            tableData.forEach(sheetInfo => {
                const sheetData = sheetInfo.data;
                const sheetName = sheetInfo.name || 'Sheet';
                
                // Prepare data for this sheet
                const excelData = [];
                
                // Add headers if they exist
                if (sheetData.headers && sheetData.headers.length > 0) {
                    const headerRow = sheetData.headers.map(header => 
                        typeof header === 'object' ? header.text : header
                    );
                    excelData.push(headerRow);
                }
                
                // Add data rows
                if (sheetData.rows && sheetData.rows.length > 0) {
                    sheetData.rows.forEach(row => {
                        const rowData = row.cells.map(cell => 
                            typeof cell === 'object' ? cell.text : cell
                        );
                        excelData.push(rowData);
                    });
                }

                // Create worksheet for this sheet
                const worksheet = window.XLSX.utils.aoa_to_sheet(excelData);
                window.XLSX.utils.book_append_sheet(workbook, worksheet, sheetName);
            });
            
            // Add global metadata sheet if requested
            if (config.includeMetadata) {
                const metadataData = [
                    ['Property', 'Value'],
                    ['Created At', new Date().toISOString()],
                    ['Total Sheets', tableData.length],
                    ['Export Type', 'Multi-sheet workbook']
                ];
                
                tableData.forEach((sheetInfo, index) => {
                    metadataData.push([`Sheet ${index + 1} Name`, sheetInfo.name || 'Sheet']);
                    metadataData.push([`Sheet ${index + 1} Rows`, sheetInfo.data.rows?.length || 0]);
                });
                
                const metadataSheet = window.XLSX.utils.aoa_to_sheet(metadataData);
                window.XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Metadata');
            }
        } else {
            // Handle single table data
            const excelData = [];
            
            // Add headers if they exist
            if (tableData.headers && tableData.headers.length > 0) {
                const headerRow = tableData.headers.map(header => 
                    typeof header === 'object' ? header.text : header
                );
                excelData.push(headerRow);
            }
            
            // Add data rows
            if (tableData.rows && tableData.rows.length > 0) {
                tableData.rows.forEach(row => {
                    const rowData = row.cells.map(cell => 
                        typeof cell === 'object' ? cell.text : cell
                    );
                    excelData.push(rowData);
                });
            }

            // Create worksheet
            const worksheet = window.XLSX.utils.aoa_to_sheet(excelData);
            
            // Add metadata sheet if requested
            if (config.includeMetadata && tableData.metadata) {
                const metadataData = [
                    ['Property', 'Value'],
                    ['Extracted At', tableData.metadata.extractedAt],
                    ['Total Rows', tableData.metadata.totalRows],
                    ['Total Columns', tableData.metadata.totalColumns],
                    ['Total Pages', tableData.metadata.totalPages || 1],
                    ['Has Pagination', tableData.metadata.hasPagination || false],
                    ['Pagination Method', tableData.metadata.paginationMethod || 'none']
                ];
                
                if (tableData.metadata.tableId) {
                    metadataData.push(['Table ID', tableData.metadata.tableId]);
                }
                
                if (tableData.metadata.tableClasses && tableData.metadata.tableClasses.length > 0) {
                    metadataData.push(['Table Classes', tableData.metadata.tableClasses.join(', ')]);
                }
                
                const metadataSheet = window.XLSX.utils.aoa_to_sheet(metadataData);
                window.XLSX.utils.book_append_sheet(workbook, metadataSheet, 'Metadata');
            }
            
            window.XLSX.utils.book_append_sheet(workbook, worksheet, config.sheetName);
        }
        
        return workbook;
    }

    /**
     * Download table data as Excel file
     * @param {Object|Array} tableData - Data from extractTableData/extractAllPages or array of sheet objects
     * @param {Object} options - Download options
     */
    downloadAsExcel(tableData, options = {}) {
        const config = {
            filename: `table-data-${new Date().toISOString().split('T')[0]}.xlsx`,
            sheetName: 'Table Data',
            includeMetadata: true,
            ...options
        };

        try {
            const workbook = this.createExcelWorkbook(tableData, config);
            window.XLSX.writeFile(workbook, config.filename);
            
            // Calculate result info based on data type
            let rowCount, columnCount, sheetCount;
            
            if (Array.isArray(tableData)) {
                // Multi-sheet workbook
                sheetCount = tableData.length;
                rowCount = tableData.reduce((total, sheet) => total + (sheet.data.rows?.length || 0), 0);
                columnCount = Math.max(...tableData.map(sheet => sheet.data.metadata?.totalColumns || 0));
            } else {
                // Single table
                sheetCount = 1;
                rowCount = tableData.rows?.length || 0;
                columnCount = tableData.metadata?.totalColumns || 0;
            }
            
            return {
                success: true,
                filename: config.filename,
                rowCount,
                columnCount,
                sheetCount
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
            includePagination = true,
            filename,
            ...extractOptions
        } = options;

        try {
            let tableData;
            
            if (includePagination) {
                tableData = await this.extractAllPages(tableElement, extractOptions);
            } else {
                tableData = this.extractTableData(tableElement, extractOptions);
            }
            
            const downloadOptions = { filename, ...options };
            return this.downloadAsExcel(tableData, downloadOptions);
            
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
            toExcel: (tableData, options) => this.createExcelWorkbook(tableData, options),
            download: (tableData, options) => this.downloadAsExcel(tableData, options),
            extractAndDownload: (element, options) => this.extractAndDownload(element, options),
            
            // Manual pagination controls
            setManualPagination: (nextButton, pageCounter) => this.setManualPaginationControls(nextButton, pageCounter),
            clearManualPagination: () => this.clearManualPaginationControls(),
            hasManualPagination: () => this.hasManualPaginationControls(),
            
            // Direct access to utility
            extractor: this
        };
    }
}

export default TableExtractor;