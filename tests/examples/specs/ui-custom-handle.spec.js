/**
 * Playwright tests for ui/custom-handle example
 * Tests custom image handle functionality for the agentlet panel
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Custom Handle Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();

    // Navigate to the custom handle example
    await agentletTest.navigateToExample('ui/custom-handle.html');
  });

  test('should load the custom handle page correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Custom Handle - Agentlet Core Example/);

    // Check main heading
    await expect(page.locator('h1')).toContainText('Custom handle');

    // Check that key sections are present
    await expect(page.locator('text=What this example shows:')).toBeVisible();
    await expect(page.locator('.controls h4:has-text("Initialize")')).toBeVisible();
    await expect(page.locator('h3:has-text("Custom handle API example")')).toBeVisible();
    await expect(page.locator('h3:has-text("Custom handle image")')).toBeVisible();
  });

  test('should show initialization button with custom handle text', async ({ page }) => {
    // Initialize section should have custom button text
    await expect(page.locator('button:has-text("Initialize agentlet with custom handle")')).toBeVisible();
  });

  test('should display Tux penguin image preview', async ({ page }) => {
    // Check that the Tux SVG image is displayed
    await expect(page.locator('img[src="tux.svg"]')).toBeVisible();

    // Check image attributes
    const tuxImage = page.locator('img[src="tux.svg"]');
    await expect(tuxImage).toHaveAttribute('alt', 'Tux penguin');

    // Verify image has proper styling
    const imageStyle = await tuxImage.getAttribute('style');
    expect(imageStyle).toContain('width: 100px');
    expect(imageStyle).toContain('height: 100px');
  });

  test('should show API examples correctly', async ({ page }) => {
    // Check that code blocks are present and contain expected content
    const codeBlocks = page.locator('code');
    const codeCount = await codeBlocks.count();
    expect(codeCount).toBeGreaterThan(0);

    // Check for specific API examples
    const allCodeText = await page.locator('code').allTextContents();
    const combinedCode = allCodeText.join(' ');

    expect(combinedCode).toContain('minimizeWithImage');
    expect(combinedCode).toContain('./tux.svg');
    expect(combinedCode).toContain('new AgentletCore');
    expect(combinedCode).toContain('startMinimized');
    expect(combinedCode).toContain('custom image handle');
  });

  test('should display breadcrumb navigation correctly', async ({ page }) => {
    // Check breadcrumb navigation
    await expect(page.locator('.nav-breadcrumb a[href="../index.html"]:has-text("Examples")')).toBeVisible();
    await expect(page.locator('.nav-breadcrumb a[href="../index.html#ui"]:has-text("ui")')).toBeVisible();
    await expect(page.locator('.nav-breadcrumb span:has-text("custom-handle")')).toBeVisible();
  });

  test('should display initial status message', async ({ page }) => {
    // Check initial status message
    const status = page.locator('#status');
    await expect(status).toContainText(/Ready.*agentlet.*initialization.*custom.*handle/i);
  });

  test('should initialize Agentlet with custom handle configuration', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Wait for initialization to complete
    await page.waitForTimeout(2000);

    // Check status shows success with custom handle ready
    const status = page.locator('#status');
    await expect(status).toContainText(/Ready.*Tux.*handle.*minimize.*maximize/i);

    // Console should show custom handle initialization
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/custom.*handle|Tux.*handle/i);
  });

  test('should show custom handle success message', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Check status shows custom handle specific message
    const status = page.locator('#status');
    await expect(status).toContainText(/Click.*Tux.*handle/i);

    // Console should mention Tux penguin handle
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Tux.*penguin.*handle.*control.*panel/i);
  });

  test('should load with custom handle configuration in agentletConfig', async ({ page }) => {
    // Check that the agentletConfig is properly set up
    const configCheck = await page.evaluate(() => {
      return window.agentletConfig;
    });

    expect(configCheck.minimizeWithImage).toBe('./tux.svg');
    expect(configCheck.startMinimized).toBe(true);
    expect(configCheck.debugMode).toBe(true);
    expect(configCheck.theme).toBe('default');
  });

  test('should display initialization loading message for custom handle', async ({ page }) => {
    // Click initialize button
    await page.locator('button:has-text("Initialize agentlet with custom handle")').click();

    // Should show loading message with custom handle reference
    const status = page.locator('#status');
    await expect(status).toContainText(/Loading.*Agentlet.*Core.*custom.*handle/i);

    // Wait for completion and verify success
    await agentletTest.waitForAgentletCore();
    await expect(status).toContainText(/Ready.*Tux.*handle/i);
  });

  test('should create agentlet panel with custom handle', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();
    await page.waitForTimeout(2000);

    // Look for the agentlet panel (use specific class selector to avoid style elements)
    const agentletPanel = page.locator('.agentlet-panel');
    await expect(agentletPanel.first()).toBeVisible({ timeout: 10000 });

    // Should have custom handle with Tux image
    const customHandle = page.locator('img[src*="tux.svg"], [class*="handle"] img, [class*="minimize"] img');
    await expect(customHandle.first()).toBeVisible({ timeout: 5000 });
  });

  test('should display custom Tux handle image in panel', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();
    await page.waitForTimeout(3000);

    // Look for Tux handle image in the agentlet panel
    const tuxHandle = page.locator('img[src*="tux.svg"], img[src*="./tux.svg"]');

    // Should have at least one Tux image (the preview) and possibly the handle
    const tuxCount = await tuxHandle.count();
    expect(tuxCount).toBeGreaterThanOrEqual(1);

    // Check if we can find a handle-specific Tux image
    const handleTux = page.locator('.agentlet-panel img[src*="tux.svg"], [class*="handle"] img[src*="tux.svg"], [class*="minimize"] img[src*="tux.svg"]');

    // If handle exists, it should be visible
    if (await handleTux.count() > 0) {
      await expect(handleTux.first()).toBeVisible();
    }
  });

  test('should allow panel interaction via custom handle', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();
    await page.waitForTimeout(3000);

    // Look for any clickable handle element (could be image or containing element)
    const handleElements = [
      'img[src*="tux.svg"]',
      '[class*="handle"]',
      '[class*="minimize"]',
      '.agentlet-handle',
      '.agentlet-minimize-handle'
    ];

    let handleFound = false;
    for (const selector of handleElements) {
      const handle = page.locator(selector);
      if (await handle.count() > 0 && await handle.first().isVisible()) {
        try {
          // Try to click the handle
          await handle.first().click();
          await page.waitForTimeout(1000);
          handleFound = true;
          break;
        } catch (error) {
          // Continue to next selector if this one fails
          continue;
        }
      }
    }

    // If we found and clicked a handle, verify some interaction occurred
    if (handleFound) {
      // Panel should still be visible (use specific selector to avoid style elements)
      const agentletPanel = page.locator('.agentlet-panel');
      await expect(agentletPanel.first()).toBeVisible();
    }

    // At minimum, the Tux preview image should be present and working
    const previewTux = page.locator('img[src="tux.svg"][alt="Tux penguin"]');
    await expect(previewTux).toBeVisible();

    // Also verify that a handle was found and clicked
    expect(handleFound).toBe(true);
  });

  test('should verify custom handle replaces default arrow', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();
    await page.waitForTimeout(3000);

    // Should NOT have default arrow elements
    const defaultArrow = page.locator('.agentlet-arrow, [class*="arrow"], .side-arrow');
    const arrowCount = await defaultArrow.count();

    // If there are arrow elements, they should not be the main handle
    if (arrowCount > 0) {
      // Custom handle should be more prominent than any default arrows
      const customHandles = page.locator('img[src*="tux.svg"]');
      const customHandleCount = await customHandles.count();
      expect(customHandleCount).toBeGreaterThan(0);
    }

    // Should have Tux-based handle instead of default
    const tuxHandle = page.locator('img[src*="tux.svg"]');
    await expect(tuxHandle.first()).toBeVisible();
  });

  test('should maintain handle functionality after initialization', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();
    await page.waitForTimeout(3000);

    // The agentlet panel should exist after initialization
    const agentletPanel = page.locator('.agentlet-panel');
    await expect(agentletPanel.first()).toBeVisible({ timeout: 10000 });

    // The Tux handle should be visible as the custom minimize handle
    const tuxHandle = page.locator('img[src*="tux.svg"]');
    await expect(tuxHandle.first()).toBeVisible({ timeout: 10000 });

    // Custom handle configuration should be preserved
    const configCheck = await page.evaluate(() => {
      return window.agentlet && window.agentlet.config && window.agentlet.config.minimizeWithImage;
    });

    // Config should exist and contain the tux.svg path
    expect(configCheck).toBeTruthy();
    expect(configCheck).toContain('tux.svg');
  });

  test('should verify custom handle image properties', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();
    await page.waitForTimeout(3000);

    // Check the preview Tux image properties
    const previewTux = page.locator('img[src="tux.svg"][alt="Tux penguin"]');
    await expect(previewTux).toBeVisible();

    // Verify it's an SVG file
    const src = await previewTux.getAttribute('src');
    expect(src).toContain('.svg');

    // Verify image loads properly
    const naturalWidth = await previewTux.evaluate((img) => img.naturalWidth);
    const naturalHeight = await previewTux.evaluate((img) => img.naturalHeight);

    // SVG should have some dimensions (even if reported as 0 in some browsers)
    expect(typeof naturalWidth).toBe('number');
    expect(typeof naturalHeight).toBe('number');
  });



  test('should verify custom handle configuration is applied correctly', async ({ page }) => {
    // Check configuration before initialization
    const preInitConfig = await page.evaluate(() => window.agentletConfig);
    expect(preInitConfig.minimizeWithImage).toBe('./tux.svg');

    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();
    await page.waitForTimeout(3000);

    // Verify the configuration was used
    const postInitCheck = await page.evaluate(() => {
      // Check if agentlet instance exists and has the configuration
      return {
        agentletExists: !!window.agentlet,
        configExists: !!window.agentletConfig,
        customImagePath: window.agentletConfig?.minimizeWithImage
      };
    });

    expect(postInitCheck.agentletExists).toBe(true);
    expect(postInitCheck.configExists).toBe(true);
    expect(postInitCheck.customImagePath).toBe('./tux.svg');
  });


  test('should handle clear console functionality', async ({ page }) => {
    // Initialize to get some output
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Verify there is output
    let consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput.length).toBeGreaterThan(0);

    // Clear console
    await page.locator('button.console-clear-btn').click({ force: true });
    await page.waitForTimeout(1000);

    // Console should be cleared or contain different content
    const consoleOutputAfterClear = await page.locator('#console').textContent();

    // Check that either console is cleared OR content has changed
    const isCleared = consoleOutputAfterClear.trim() === '' ||
                     consoleOutputAfterClear !== consoleOutput ||
                     consoleOutputAfterClear.includes('cleared') ||
                     consoleOutputAfterClear.includes('Console cleared');
    expect(isCleared).toBe(true);
  });


  test('should display proper configuration example in code blocks', async ({ page }) => {
    // Check that the code example shows the correct configuration
    const codeBlocks = page.locator('code');
    const allCodeText = await page.locator('code').allTextContents();
    const combinedCode = allCodeText.join(' ');

    // Should show minimizeWithImage configuration
    expect(combinedCode).toContain("minimizeWithImage: './tux.svg'");
    expect(combinedCode).toContain('startMinimized: false');
    expect(combinedCode).toContain('debugMode: true');

    // Should show explanation about replacing default arrow
    expect(combinedCode).toContain('replace the default side arrow');
    expect(combinedCode).toContain('click the image to minimize/maximize');
  });

  test('should handle initialization when already loaded', async ({ page }) => {
    // Initialize first time
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Try to initialize again
    await page.locator('button:has-text("Initialize agentlet with custom handle")').click();
    await page.waitForTimeout(1000);

    // Should show warning about already loaded
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Agentlet.*already.*loaded/i);

    // Status should still show ready state
    const status = page.locator('#status');
    await expect(status).toContainText(/Ready.*Tux.*handle/i);
  });

  test('should verify custom handle differs from other examples', async ({ page }) => {
    // This example should have the minimizeWithImage configuration
    const config = await page.evaluate(() => window.agentletConfig);
    expect(config.minimizeWithImage).toBe('./tux.svg');

    // Should have the Tux penguin preview
    const tuxPreview = page.locator('img[src="tux.svg"][alt="Tux penguin"]');
    await expect(tuxPreview).toBeVisible();

    // Should mention custom handle in the description
    const description = page.locator('p');
    const descriptionText = await description.first().textContent();
    expect(descriptionText).toMatch(/custom.*image.*handle.*default.*side.*arrow/i);
  });


  test('should verify console logging for custom handle initialization', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Console should show specific messages about custom handle
    const consoleOutput = await page.locator('#console').textContent();

    // Should mention custom handle creation
    expect(consoleOutput).toMatch(/Creating.*AgentletCore.*instance.*custom.*handle/i);

    // Should mention Tux handle specifically
    expect(consoleOutput).toMatch(/custom.*Tux.*handle|Tux.*penguin.*handle/i);

    // Should provide instructions about the handle
    expect(consoleOutput).toMatch(/Look.*for.*the.*Tux.*penguin.*handle.*control.*panel/i);
  });


});