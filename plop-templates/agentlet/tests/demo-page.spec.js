import { test, expect } from '@playwright/test';

test.describe('Agentlet scaffolded repo demo page', () => {
  test('bookmarklet link exists and is clickable', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the production bookmarklet link with proper selector
    const productionLink = page.getByRole('link', { name: '📎 {{kebabCase name}} (Production)' });
    await productionLink.waitFor({ timeout: 5000 });
    
    // Check that the link exists and is visible
    const linkExists = await productionLink.isVisible();
    expect(linkExists).toBe(true);
    
    // Check that the link is clickable
    const linkClickable = await productionLink.isEnabled();
    expect(linkClickable).toBe(true);
  });
});