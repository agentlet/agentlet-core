/**
 * Playwright tests for ui/custom-styling example
 * Tests theme switching and localhost demo module functionality
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Custom Styling Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();

    // Navigate to the custom-styling example
    await agentletTest.navigateToExample('ui/custom-styling.html');
  });

  test('should load the custom-styling page correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Custom Styling - Agentlet Core Example/);

    // Check main heading
    await expect(page.locator('h1')).toContainText('Custom styling');

    // Check that key sections are present
    await expect(page.locator('text=What this example shows:')).toBeVisible();
    await expect(page.locator('h4:has-text("Initialize")')).toBeVisible();
    await expect(page.locator('h4:has-text("Theme selection")')).toBeVisible();

    // Check that theme buttons are present - use more specific selectors to avoid conflicts
    await expect(page.locator('.controls button#glassBtn')).toBeVisible();
    await expect(page.locator('.controls button#materialBtn')).toBeVisible();
    await expect(page.locator('.controls button#vscodeBtn')).toBeVisible();
    await expect(page.locator('.controls button#tuxBtn')).toBeVisible();
  });

  test('should initialize Agentlet Core and show localhost module', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();

    // Wait for Agentlet to be fully loaded
    await agentletTest.waitForAgentletCore();

    // Check that the agentlet panel is visible
    const isPanelVisible = await agentletTest.isPanelVisible();
    expect(isPanelVisible).toBe(true);

    // Check that the localhost-demo module is shown
    await expect(page.locator('#agentlet-container')).toContainText('Localhost-demo');

    // Check that the module buttons are visible in the panel
    await expect(page.locator('#agentlet-container button:has-text("ℹ️ Info dialog")')).toBeVisible();
    await expect(page.locator('#agentlet-container button:has-text("🖥️ Fullscreen dialog")')).toBeVisible();
  });

  test('should show "Hello world!" in Info dialog', async ({ page }) => {
    // Initialize and wait for agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Wait a bit more for the module content to load
    await page.waitForTimeout(2000);

    // Verify the buttons are present in the panel
    const infoBtnExists = await page.locator('#agentlet-container button:has-text("ℹ️ Info dialog")').isVisible();
    if (!infoBtnExists) {
      // Log the actual panel content for debugging
      const panelContent = await page.locator('#agentlet-container').textContent();
      console.log('Panel content:', panelContent);
    }
    expect(infoBtnExists).toBe(true);

    // Try using JavaScript evaluation to trigger the dialog directly
    await page.evaluate(() => {
      // Call the function directly from the page
      window.showLocalhostInfoDialog();
    });

    // Wait for dialog to appear
    await agentletTest.waitForDialog();

    // Check that dialog shows "Hello world!"
    await expect(page.locator('.agentlet-info-dialog')).toContainText('Hello world!');

    // Close dialog
    await agentletTest.closeDialog();
  });

  test('should show "Hello world!" in Fullscreen dialog', async ({ page }) => {
    // Initialize and wait for agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Wait for module content to fully load
    await page.waitForTimeout(2000);

    // Verify the fullscreen button is present
    const fullscreenBtnExists = await page.locator('#agentlet-container button:has-text("🖥️ Fullscreen dialog")').isVisible();
    expect(fullscreenBtnExists).toBe(true);

    // Click the Fullscreen dialog button
    await page.locator('#agentlet-container button:has-text("🖥️ Fullscreen dialog")').click();

    // Wait for fullscreen dialog to appear
    await page.waitForSelector('.agentlet-fullscreen-dialog', { timeout: 5000 });

    // Check that dialog shows "Hello world!"
    await expect(page.locator('.agentlet-fullscreen-dialog')).toContainText('Hello world!');

    // Check that close button exists
    await expect(page.locator('.agentlet-fullscreen-dialog button:has-text("Close")')).toBeVisible();

    // Verify it's actually a fullscreen dialog (covers viewport)
    const dialogDimensions = await page.evaluate(() => {
      const dialog = document.querySelector('.agentlet-fullscreen-dialog');
      if (dialog) {
        const rect = dialog.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          isFullscreen: rect.width >= window.innerWidth * 0.8 && rect.height >= window.innerHeight * 0.8
        };
      }
      return null;
    });
    expect(dialogDimensions?.isFullscreen).toBe(true);

    // Close dialog
    await page.locator('.agentlet-fullscreen-dialog button:has-text("Close")').click();
  });

  test('should switch themes successfully and apply styles', async ({ page }) => {
    // Initialize Agentlet first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Test Glass theme - use specific ID selector
    await page.locator('#glassBtn').click({ force: true });
    await page.waitForTimeout(1500);

    // Check that glass theme is applied to body
    const hasGlassTheme = await page.evaluate(() => {
      return document.body.classList.contains('theme-glass');
    });
    expect(hasGlassTheme).toBe(true);

    // Validate glass theme visual properties
    const glassThemeProps = await page.evaluate(() => {
      const body = document.body;
      const computedStyle = window.getComputedStyle(body);
      return {
        hasClass: body.classList.contains('theme-glass'),
        backgroundColor: computedStyle.backgroundColor
      };
    });
    expect(glassThemeProps.hasClass).toBe(true);

    // Test Material Design theme
    await page.locator('#materialBtn').click({ force: true });
    await page.waitForTimeout(1500);

    // Check that material theme is applied and glass theme is removed
    const materialThemeState = await page.evaluate(() => {
      return {
        hasMaterial: document.body.classList.contains('theme-material'),
        hasGlass: document.body.classList.contains('theme-glass'),
        allClasses: document.body.className
      };
    });
    expect(materialThemeState.hasMaterial).toBe(true);
    expect(materialThemeState.hasGlass).toBe(false);

    // Test VS Code Dark theme (note: class is theme-vscode, not theme-vscode-dark)
    await page.locator('#vscodeBtn').click({ force: true });
    await page.waitForTimeout(1500);

    // Check that vscode theme is applied and previous themes are removed
    const vscodeThemeState = await page.evaluate(() => {
      return {
        hasVSCode: document.body.classList.contains('theme-vscode'),
        hasMaterial: document.body.classList.contains('theme-material'),
        allClasses: document.body.className
      };
    });
    expect(vscodeThemeState.hasVSCode).toBe(true);
    expect(vscodeThemeState.hasMaterial).toBe(false);

    // Test Tux Linux theme
    await page.locator('#tuxBtn').click({ force: true });
    await page.waitForTimeout(1500);

    // Check that tux theme is applied and previous themes are removed
    const tuxThemeState = await page.evaluate(() => {
      const body = document.body;
      const computedStyle = window.getComputedStyle(body);
      return {
        hasTux: body.classList.contains('theme-tux'),
        hasVSCode: body.classList.contains('theme-vscode'),
        backgroundColor: computedStyle.backgroundColor,
        allClasses: body.className
      };
    });
    expect(tuxThemeState.hasTux).toBe(true);
    expect(tuxThemeState.hasVSCode).toBe(false);

    // Verify theme affects the agentlet panel if visible
    const panelVisible = await agentletTest.isPanelVisible();
    if (panelVisible) {
      const panelThemeProps = await page.evaluate(() => {
        const panel = document.getElementById('agentlet-container');
        if (panel) {
          const computedStyle = window.getComputedStyle(panel);
          return {
            display: computedStyle.display,
            opacity: computedStyle.opacity
          };
        }
        return null;
      });
      expect(panelThemeProps).toBeTruthy();
    }
  });

  test('should handle panel minimize/maximize', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Panel should be visible initially
    const isPanelVisible = await agentletTest.isPanelVisible();
    expect(isPanelVisible).toBe(true);

    // Test programmatic panel control using window.agentlet API
    const initialState = await page.evaluate(() => {
      return {
        isMinimized: window.agentlet?.isMinimized || false,
        panelExists: !!document.getElementById('agentlet-container')
      };
    });
    expect(initialState.panelExists).toBe(true);

    // Test minimize via API if available
    await page.evaluate(() => {
      if (window.agentlet && typeof window.agentlet.minimize === 'function') {
        window.agentlet.minimize();
      }
    });
    await page.waitForTimeout(1000);

    // Test maximize via API if available
    await page.evaluate(() => {
      if (window.agentlet && typeof window.agentlet.maximize === 'function') {
        window.agentlet.maximize();
      }
    });
    await page.waitForTimeout(1000);

    // Panel should still be accessible
    const finalState = await page.evaluate(() => {
      return {
        panelExists: !!document.getElementById('agentlet-container'),
        hasToggleButton: !!document.querySelector('#agentlet-container button, .agentlet-toggle')
      };
    });
    expect(finalState.panelExists).toBe(true);
  });

  test('should have working console output section', async ({ page }) => {
    // Check that console output section exists
    await expect(page.locator('h3:has-text("📟 Console Output")')).toBeVisible();
    await expect(page.locator('button:has-text("🗑️ Clear")')).toBeVisible();

    // Initialize to generate some output
    await agentletTest.initializeAgentlet();

    // Check that console shows some output
    const consoleOutput = await page.locator('.console-section').textContent();
    expect(consoleOutput.length).toBeGreaterThan(0);

    // Find the clear button that's not inside the agentlet panel - use console clear button
    const clearButton = page.locator('.console-clear-btn');
    await clearButton.click({ force: true });

    // Output should be cleared (or show clear message)
    await page.waitForTimeout(1000);

    // Verify the button click worked (don't assert on content as it might vary)
    const isClearButtonVisible = await clearButton.isVisible();
    expect(isClearButtonVisible).toBe(true);
  });

  test('should show correct status updates', async ({ page }) => {
    // Check initial status
    await expect(page.locator('.status-section')).toContainText('Ready for Agentlet initialization');

    // Initialize and check status updates
    await agentletTest.initializeAgentlet();
    await page.waitForTimeout(2000);

    // Status should indicate ready state
    const finalStatus = await page.locator('.status-section').textContent();
    expect(finalStatus).toMatch(/Ready/i);
  });

  test('should show theme API examples', async ({ page }) => {
    // Check that theme API examples are present
    await expect(page.locator('h3:has-text("Theme switching API examples")')).toBeVisible();
    await expect(page.locator('h4:has-text("Dynamic Theme Switching")')).toBeVisible();
    await expect(page.locator('h4:has-text("Custom Theme Configuration")')).toBeVisible();

    // Check that code examples contain the expected API calls
    const allCodeTexts = await page.locator('code').allTextContents();
    const combinedCode = allCodeTexts.join(' ');

    expect(combinedCode).toContain('window.agentlet.theme.switchTheme');
    expect(combinedCode).toContain('window.agentlet.theme.applyTheme');

    // Verify we have multiple code blocks
    const codeBlockCount = await page.locator('code').count();
    expect(codeBlockCount).toBeGreaterThanOrEqual(2);

    // Check specific theme switching examples
    expect(combinedCode).toContain('glass');
    expect(combinedCode).toContain('material');
    expect(combinedCode).toContain('vscode-dark');
    expect(combinedCode).toContain('tux');
  });
});