import { test, expect } from '@playwright/test';

test.describe('Agentlet scaffolded repo demo page', () => {
  test('bookmarklet link exists and is clickable', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the bookmarklet link to be available
    await page.waitForSelector('a.bookmarklet-link', { timeout: 5000 });
    
    // Check that the link exists and is visible
    const linkExists = await page.isVisible('a.bookmarklet-link');
    expect(linkExists).toBe(true);
    
    // Check that the link is clickable
    const linkClickable = await page.isEnabled('a.bookmarklet-link');
    expect(linkClickable).toBe(true);
  });
});