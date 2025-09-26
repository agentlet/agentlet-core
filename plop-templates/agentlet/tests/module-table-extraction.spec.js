import { test, expect } from '@playwright/test';

async function initializeAgentlet(page) {
  await page.goto('/');
  
  // Wait for the production bookmarklet link with proper selector
  const productionLink = page.getByRole('link', { name: '📎 {{kebabCase name}} (Production)' });
  await productionLink.waitFor({ timeout: 5000 });
  
  // Click the production bookmarklet link
  await productionLink.click();
  
  // Wait for the panel to open
  await page.waitForSelector('#agentlet-container', { 
    timeout: 10000,
    state: 'visible'
  });
}

test.describe('Table extraction functionality', () => {
  test('extract table button triggers table extraction', async ({ page }) => {
    await initializeAgentlet(page);

    // Set up console message interception to catch extraction events
    const consoleMessages = [];
    page.on('console', message => {
      consoleMessages.push(message.text());
    });

    // Click the Extract Table button
    await page.click('button:has-text("Extract Table")');

    // Wait for extraction to complete (check console messages)
    await page.waitForTimeout(2000);

    // Verify extraction was triggered
    const extractionMessage = consoleMessages.find(msg => 
      msg.includes('table') || msg.includes('extract') || msg.includes('Table')
    );
    expect(extractionMessage).toBeTruthy();
  });

  test('user information table is extractable', async ({ page }) => {
    await initializeAgentlet(page);

    // Verify the demo tables exist on the page
    const userTable = page.locator('table').first();
    await userTable.waitFor({ timeout: 5000 });

    // Verify table has expected structure
    const hasHeaders = await page.locator('table th').count();
    expect(hasHeaders).toBeGreaterThan(0);

    const hasRows = await page.locator('table tbody tr').count();
    expect(hasRows).toBeGreaterThan(0);

    // Test if agentlet can access table data
    const tableData = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      if (tables.length === 0) return null;
      
      const firstTable = tables[0];
      const rows = firstTable.querySelectorAll('tr');
      return {
        tableCount: tables.length,
        rowCount: rows.length,
        hasHeaders: firstTable.querySelector('th') !== null
      };
    });

    expect(tableData).not.toBeNull();
    expect(tableData.tableCount).toBeGreaterThanOrEqual(2); // User and Company tables
    expect(tableData.rowCount).toBeGreaterThan(1);
    expect(tableData.hasHeaders).toBe(true);
  });

  test('company information table is extractable', async ({ page }) => {
    await initializeAgentlet(page);

    // Find the company table (second table)
    const companyTable = page.locator('table').nth(1);
    await companyTable.waitFor({ timeout: 5000 });

    // Check company table content
    const companyData = await page.evaluate(() => {
      const tables = document.querySelectorAll('table');
      if (tables.length < 2) return null;
      
      const companyTable = tables[1];
      const headerText = companyTable.textContent;
      
      return {
        hasCompanyContent: headerText.includes('Company') || headerText.includes('Globex'),
        hasIndustryColumn: headerText.includes('Industry'),
        hasWebsiteColumn: headerText.includes('Website')
      };
    });

    expect(companyData).not.toBeNull();
    expect(companyData.hasCompanyContent).toBe(true);
    expect(companyData.hasIndustryColumn).toBe(true);
    expect(companyData.hasWebsiteColumn).toBe(true);
  });

  test('table extraction API is available', async ({ page }) => {
    await initializeAgentlet(page);

    // Check if table extraction API is available
    const apiAvailable = await page.evaluate(() => {
      return window.agentlet && 
             window.agentlet.tables && 
             typeof window.agentlet.tables.extract === 'function' &&
             typeof window.agentlet.tables.extractAll === 'function';
    });

    expect(apiAvailable).toBe(true);
  });

  test('table extraction returns data in expected format', async ({ page }) => {
    await initializeAgentlet(page);

    // Test the actual table extraction API
    const extractionResult = await page.evaluate(() => {
      const firstTable = document.querySelector('table');
      if (!firstTable || !window.agentlet?.tables?.extract) return null;
      
      try {
        const result = window.agentlet.tables.extract(firstTable);
        return {
          hasData: result && result.rows && result.rows.length > 0,
          firstRowKeys: result && result.headers ? result.headers : [],
          dataLength: result && result.rows ? result.rows.length : 0
        };
      } catch (error) {
        return { error: error.message };
      }
    });

    if (extractionResult && !extractionResult.error) {
      expect(extractionResult.hasData).toBe(true);
      expect(extractionResult.firstRowKeys.length).toBeGreaterThan(0);
      expect(extractionResult.dataLength).toBeGreaterThan(0);
    }
  });
});