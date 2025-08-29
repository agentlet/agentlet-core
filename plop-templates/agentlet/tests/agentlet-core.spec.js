import { test, expect } from '@playwright/test';

test.describe('Agentlet core framework', () => {
  test('agentlet-core initializes', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the bookmarklet link to be available
    await page.waitForSelector('a.bookmarklet-link', { timeout: 5000 });
    
    // Click the bookmarklet link
    await page.click('a.bookmarklet-link');

    // Wait for the page to load and agentlet to be initialized
    await page.waitForFunction(() => {
      return window.agentlet && window.agentlet.initialized;
    }, { timeout: 10000 });
    
  });

});