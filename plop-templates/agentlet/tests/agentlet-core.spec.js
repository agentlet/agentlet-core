import { test, expect } from '@playwright/test';

test.describe('Agentlet core framework', () => {
  test('agentlet-core initializes with correct bookmarklet selector', async ({ page }) => {
    await page.goto('/');
    
    // Wait for the production bookmarklet link with proper selector
    const productionLink = page.getByRole('link', { name: '📎 {{kebabCase name}} (Production)' });
    await productionLink.waitFor({ timeout: 5000 });
    
    // Click the production bookmarklet link
    await productionLink.click();

    // Wait for the agentlet container to appear
    await page.waitForSelector('#agentlet-container', { 
      timeout: 10000,
      state: 'visible'
    });

    // Verify agentlet is properly initialized
    const isInitialized = await page.evaluate(() => {
      return window.agentlet && 
             window.agentlet.moduleRegistry && 
             window.agentlet.moduleRegistry.modules &&
             window.agentlet.moduleRegistry.modules.size > 0;
    });
    expect(isInitialized).toBe(true);

    // Verify module content is loaded
    const hasModuleContent = await page.locator('#agentlet-content').textContent();
    expect(hasModuleContent).toContain('Welcome to My-Agentlet!');
  });

  test('z-index hierarchy is correct for all UI elements', async ({ page }) => {
    await page.goto('/');
    
    const productionLink = page.getByRole('link', { name: '📎 {{kebabCase name}} (Production)' });
    await productionLink.click();
    await page.waitForSelector('#agentlet-container', { state: 'visible' });

    // Test message bubble z-index is above panel
    await page.click('button:has-text("Message Bubble")');
    await page.waitForTimeout(1000);

    const zIndexComparison = await page.evaluate(() => {
      const panel = document.getElementById('agentlet-container');
      const messageContainer = document.getElementById('agentlet-message-bubbles');
      
      if (!panel || !messageContainer) return null;
      
      const panelZ = parseInt(getComputedStyle(panel).zIndex);
      const messageZ = parseInt(getComputedStyle(messageContainer).zIndex);
      
      return {
        panel: panelZ,
        messages: messageZ,
        messagesAbovePanel: messageZ > panelZ
      };
    });

    expect(zIndexComparison).not.toBeNull();
    expect(zIndexComparison.messagesAbovePanel).toBe(true);
    expect(zIndexComparison.panel).toBe(100100);
    expect(zIndexComparison.messages).toBe(100110);

    // Test dialog overlay z-index is above panel
    await page.click('button:has-text("Info Dialog")');
    await page.waitForSelector('.agentlet-dialog-overlay', { state: 'visible' });

    const dialogZIndex = await page.evaluate(() => {
      const panel = document.getElementById('agentlet-container');
      const overlay = document.querySelector('.agentlet-dialog-overlay');
      
      if (!panel || !overlay) return null;
      
      const panelZ = parseInt(getComputedStyle(panel).zIndex);
      const overlayZ = parseInt(getComputedStyle(overlay).zIndex);
      
      return {
        panel: panelZ,
        overlay: overlayZ,
        overlayAbovePanel: overlayZ > panelZ
      };
    });

    expect(dialogZIndex).not.toBeNull();
    expect(dialogZIndex.overlayAbovePanel).toBe(true);
    expect(dialogZIndex.panel).toBe(100100);
    expect(dialogZIndex.overlay).toBe(100150);

    // Close dialog
    await page.keyboard.press('Escape');
    await page.waitForSelector('.agentlet-dialog-overlay', { state: 'detached' });
  });

});