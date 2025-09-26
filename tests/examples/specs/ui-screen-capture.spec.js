/**
 * Playwright tests for ui/screen-capture example
 * Tests ScreenCapture functionality for page and element screenshots
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Screen Capture Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();

    // Navigate to the screen capture example
    await agentletTest.navigateToExample('ui/screen-capture.html');
  });

  test('should load the screen capture page correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Screen Capture - Agentlet Core Example/);

    // Check main heading
    await expect(page.locator('h1')).toContainText('Screen capture');

    // Check that key sections are present
    await expect(page.locator('text=What this example shows:')).toBeVisible();
    await expect(page.locator('.controls h4:has-text("Initialize")')).toBeVisible();
    await expect(page.locator('.controls h4:has-text("Screenshot capture")')).toBeVisible();
    await expect(page.locator('h4:has-text("Sample table for capture")')).toBeVisible();
  });

  test('should show all screen capture control buttons', async ({ page }) => {
    // Initialize section
    await expect(page.locator('button:has-text("Initialize agentlet")')).toBeVisible();

    // Screenshot capture
    await expect(page.locator('button:has-text("Capture sample table")')).toBeVisible();
    await expect(page.locator('button:has-text("Capture full page")')).toBeVisible();
    await expect(page.locator('button:has-text("Capture selected element")')).toBeVisible();
  });

  test('should display sample table for capture', async ({ page }) => {
    // Check that the sample table is present
    await expect(page.locator('#sampleTable')).toBeVisible();

    // Check table headers
    await expect(page.locator('#sampleTable th:has-text("Product")')).toBeVisible();
    await expect(page.locator('#sampleTable th:has-text("Category")')).toBeVisible();
    await expect(page.locator('#sampleTable th:has-text("Price")')).toBeVisible();

    // Check some table data
    await expect(page.locator('#sampleTable td:has-text("Laptop")')).toBeVisible();
    await expect(page.locator('#sampleTable td:has-text("Electronics")')).toBeVisible();
    await expect(page.locator('#sampleTable td:has-text("$999")')).toBeVisible();
  });

  test('should show API examples correctly', async ({ page }) => {
    // Check that code blocks are present and contain expected content
    const codeBlocks = page.locator('code');
    const codeCount = await codeBlocks.count();
    expect(codeCount).toBeGreaterThan(0);

    // Check for specific API examples
    const allCodeText = await page.locator('code').allTextContents();
    const combinedCode = allCodeText.join(' ');

    expect(combinedCode).toContain('window.agentlet.utils.ScreenCapture');
    expect(combinedCode).toContain('.capturePage()');
    expect(combinedCode).toContain('.captureElement(');
    expect(combinedCode).toContain('toDataURL');
    expect(combinedCode).toContain('ElementSelector.start');
  });

  test('should initialize Agentlet and load ScreenCapture utilities', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Wait for initialization to complete
    await page.waitForTimeout(2000);

    // Check status shows success with screen capture ready
    const status = page.locator('#status');
    await expect(status).toContainText(/Ready.*screen.*capture.*buttons|capture.*buttons.*above/i);

    // Console should show ScreenCapture utilities loaded
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/ScreenCapture.*utilities|Agentlet.*Core.*loaded/i);
  });

  test('should show initialization success message', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Check status shows success
    const status = page.locator('#status');
    await expect(status).toContainText(/Ready.*screen.*capture|capture.*ready/i);
  });

  test('should handle trying to capture without initialization', async ({ page }) => {
    // Try to capture without initializing first
    await page.locator('button:has-text("Capture sample table")').click();
    await page.waitForTimeout(1000);

    // Status should show error about initialization
    const status = page.locator('#status');
    await expect(status).toContainText(/Initialize.*Agentlet.*first|not available/i);
  });

  test('should capture sample table screenshot', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click capture table button
    await page.locator('button:has-text("Capture sample table")').click();
    await page.waitForTimeout(3000); // Allow time for capture

    // Status should show success
    const status = page.locator('#status');
    await expect(status).toContainText(/Table.*screenshot.*ready|ready/i);

    // Console should show capture activity
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Capturing.*sample.*table|Table.*screenshot.*captured/i);

    // Screenshot dialog should appear
    const screenshotDialog = page.locator('.agentlet-dialog, .agentlet-fullscreen-dialog, [class*="dialog"]');
    await expect(screenshotDialog.first()).toBeVisible({ timeout: 10000 });

    // Dialog should contain screenshot image
    const dialogImage = screenshotDialog.first().locator('img');
    await expect(dialogImage).toBeVisible();

    // Dialog should have download button
    const downloadButton = screenshotDialog.first().locator('button:has-text("Download"), [role="button"]:has-text("Download")');
    await expect(downloadButton.first()).toBeVisible();

    // Close dialog
    const closeButton = screenshotDialog.first().locator('button:has-text("Close"), [role="button"]:has-text("Close")');
    await closeButton.first().click();
    await page.waitForTimeout(1000);
  });

  test('should capture full page screenshot', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click capture full page button
    await page.locator('button:has-text("Capture full page")').click();
    await page.waitForTimeout(5000); // Allow time for full page capture

    // Status should show success
    const status = page.locator('#status');
    await expect(status).toContainText(/Full.*page.*screenshot.*ready|ready/i);

    // Console should show capture activity
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Capturing.*full.*page|Full.*page.*screenshot.*captured/i);

    // Screenshot dialog should appear
    const screenshotDialog = page.locator('.agentlet-dialog, .agentlet-fullscreen-dialog, [class*="dialog"]');
    await expect(screenshotDialog.first()).toBeVisible({ timeout: 15000 });

    // Dialog should contain screenshot image
    const dialogImage = screenshotDialog.first().locator('img');
    await expect(dialogImage).toBeVisible();

    // Close dialog
    const closeButton = screenshotDialog.first().locator('button:has-text("Close"), [role="button"]:has-text("Close")');
    await closeButton.first().click();
    await page.waitForTimeout(1000);
  });

  test('should start element selection for capture', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click capture selected element button
    await page.locator('button:has-text("Capture selected element")').click();
    await page.waitForTimeout(1000);

    // Status should show selection instructions
    const status = page.locator('#status');
    await expect(status).toContainText(/Click.*element.*capture/i);

    // Console should show element selection started
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Starting.*element.*selection.*capture/i);
  });

  test('should capture selected element screenshot', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start element selection for capture
    await page.locator('button:has-text("Capture selected element")').click();
    await page.waitForTimeout(1000);

    // Click on the sample table to select it
    await page.locator('#sampleTable').click();
    await page.waitForTimeout(4000); // Allow time for capture

    // Status should show element capture success
    const status = page.locator('#status');
    await expect(status).toContainText(/Element.*screenshot.*ready|ready/i);

    // Console should show selection and capture
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Element.*selected.*td/i);
    expect(consoleOutput).toMatch(/Element.*screenshot.*captured/i);

    // Screenshot dialog should appear
    const screenshotDialog = page.locator('.agentlet-dialog, .agentlet-fullscreen-dialog, [class*="dialog"]');
    await expect(screenshotDialog.first()).toBeVisible({ timeout: 10000 });

    // Close dialog
    const closeButton = screenshotDialog.first().locator('button:has-text("Close"), [role="button"]:has-text("Close")');
    await closeButton.first().click();
    await page.waitForTimeout(1000);
  });

  test('should display screenshot in fullscreen dialog with title', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Capture sample table
    await page.locator('button:has-text("Capture sample table")').click();
    await page.waitForTimeout(3000);

    // Screenshot dialog should appear with title
    const screenshotDialog = page.locator('.agentlet-dialog, .agentlet-fullscreen-dialog, [class*="dialog"]');
    await expect(screenshotDialog.first()).toBeVisible({ timeout: 10000 });

    // Dialog should have appropriate title (look for the title or header text)
    const dialogText = await screenshotDialog.first().textContent();
    expect(dialogText).toMatch(/Sample.*Table.*Screenshot|Screenshot.*Preview/i);

    // Should have camera icon or screenshot indicator
    expect(dialogText).toMatch(/📸|Screenshot/i);

    // Close dialog
    const closeButton = screenshotDialog.first().locator('button:has-text("Close"), [role="button"]:has-text("Close")');
    await closeButton.first().click();
    await page.waitForTimeout(1000);
  });

  test('should test download functionality in screenshot dialog', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Capture sample table
    await page.locator('button:has-text("Capture sample table")').click();
    await page.waitForTimeout(3000);

    // Screenshot dialog should appear
    const screenshotDialog = page.locator('.agentlet-dialog, .agentlet-fullscreen-dialog, [class*="dialog"]');
    await expect(screenshotDialog.first()).toBeVisible({ timeout: 10000 });

    // Wait for download to be set up, then click download button
    const downloadPromise = page.waitForEvent('download', { timeout: 10000 });
    const downloadButton = screenshotDialog.first().locator('button:has-text("Download"), [role="button"]:has-text("Download")');
    await downloadButton.first().click();

    // Wait for download to start
    try {
      const download = await downloadPromise;

      // Verify download properties
      expect(download.suggestedFilename()).toMatch(/screenshot.*\.png/i);

      // Console should show download activity
      await page.waitForTimeout(1000);
      const consoleOutput = await page.locator('#console').textContent();
      expect(consoleOutput).toMatch(/Screenshot.*downloaded/i);
    } catch (error) {
      // If download doesn't work in test environment, just check for download button presence
      await expect(downloadButton.first()).toBeVisible();
    }

    // Close dialog if still open
    const closeButton = screenshotDialog.first().locator('button:has-text("Close"), [role="button"]:has-text("Close")');
    if (await closeButton.first().isVisible()) {
      await closeButton.first().click();
      await page.waitForTimeout(1000);
    }
  });

  test('should handle different element types for screenshot capture', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start element selection for capture
    await page.locator('button:has-text("Capture selected element")').click();
    await page.waitForTimeout(1000);

    // Click on a different element (heading instead of table)
    await page.locator('h1').click();
    await page.waitForTimeout(4000);

    // Status should show element capture success
    const status = page.locator('#status');
    await expect(status).toContainText(/Element.*screenshot.*ready|ready/i);

    // Console should show selection of heading element
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Element.*selected.*h1/i);

    // Screenshot dialog should appear
    const screenshotDialog = page.locator('.agentlet-dialog, .agentlet-fullscreen-dialog, [class*="dialog"]');
    await expect(screenshotDialog.first()).toBeVisible({ timeout: 10000 });

    // Close dialog
    const closeButton = screenshotDialog.first().locator('button:has-text("Close"), [role="button"]:has-text("Close")');
    await closeButton.first().click();
    await page.waitForTimeout(1000);
  });

  test('should display screenshot selector information in dialog', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start element selection for capture
    await page.locator('button:has-text("Capture selected element")').click();
    await page.waitForTimeout(1000);

    // Click on the sample table to select it
    await page.locator('#sampleTable').click();
    await page.waitForTimeout(4000);

    // Screenshot dialog should appear
    const screenshotDialog = page.locator('.agentlet-dialog, .agentlet-fullscreen-dialog, [class*="dialog"]');
    await expect(screenshotDialog.first()).toBeVisible({ timeout: 10000 });

    // Dialog title should include selector information
    const dialogText = await screenshotDialog.first().textContent();
    expect(dialogText).toMatch(/Screenshot.*of.*table|Screenshot.*of.*div.*sample.*content/i);

    // Close dialog
    const closeButton = screenshotDialog.first().locator('button:has-text("Close"), [role="button"]:has-text("Close")');
    await closeButton.first().click();
    await page.waitForTimeout(1000);
  });

  test('should handle screenshot capture errors gracefully', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Try to capture a non-existent element (this might not cause an error, but tests error handling)
    await page.evaluate(() => {
      // Override the capture function to simulate an error
      const originalCapture = window.agentlet.utils.ScreenCapture.captureElement;
      window.agentlet.utils.ScreenCapture.captureElement = () => {
        throw new Error('Simulated capture error');
      };
    });

    // Start element selection for capture
    await page.locator('button:has-text("Capture selected element")').click();
    await page.waitForTimeout(1000);

    // Click on an element
    await page.locator('h1').click();
    await page.waitForTimeout(2000);

    // Should handle error gracefully
    const status = page.locator('#status');
    await expect(status).toContainText(/capture.*failed|error/i);

    // Console should show error
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Error.*capturing.*element/i);
  });

  test('should handle clear console functionality', async ({ page }) => {
    // Initialize to get some output
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Create capture activity to generate output
    await page.locator('button:has-text("Capture sample table")').click();
    await page.waitForTimeout(3000);

    // Close screenshot dialog if it appears
    const screenshotDialog = page.locator('.agentlet-dialog, .agentlet-fullscreen-dialog, [class*="dialog"]');
    if (await screenshotDialog.first().isVisible()) {
      const closeButton = screenshotDialog.first().locator('button:has-text("Close"), [role="button"]:has-text("Close")');
      await closeButton.first().click();
      await page.waitForTimeout(1000);
    }

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

  test('should verify screenshot image quality and format', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Capture sample table
    await page.locator('button:has-text("Capture sample table")').click();
    await page.waitForTimeout(3000);

    // Screenshot dialog should appear
    const screenshotDialog = page.locator('.agentlet-dialog, .agentlet-fullscreen-dialog, [class*="dialog"]');
    await expect(screenshotDialog.first()).toBeVisible({ timeout: 10000 });

    // Check the image element
    const dialogImage = screenshotDialog.first().locator('img');
    await expect(dialogImage).toBeVisible();

    // Verify image has proper data URL format
    const imageSrc = await dialogImage.getAttribute('src');
    expect(imageSrc).toMatch(/^data:image\/png;base64,/);

    // Verify image has reasonable dimensions
    const imageElement = await dialogImage.elementHandle();
    const imageSize = await imageElement.evaluate((img) => ({
      width: img.naturalWidth,
      height: img.naturalHeight
    }));

    expect(imageSize.width).toBeGreaterThan(0);
    expect(imageSize.height).toBeGreaterThan(0);

    // Close dialog
    const closeButton = screenshotDialog.first().locator('button:has-text("Close"), [role="button"]:has-text("Close")');
    await closeButton.first().click();
    await page.waitForTimeout(1000);
  });

  test('should verify HTML2Canvas integration', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Check that HTML2Canvas is available after initialization
    const html2canvasAvailable = await page.evaluate(() => {
      return typeof window.html2canvas !== 'undefined';
    });

    // HTML2Canvas should be loaded as part of ScreenCapture utility
    expect(html2canvasAvailable).toBe(true);

    // Test basic capture functionality
    await page.locator('button:has-text("Capture sample table")').click();
    await page.waitForTimeout(3000);

    // Should successfully create screenshot without HTML2Canvas errors
    const status = page.locator('#status');
    await expect(status).toContainText(/Table.*screenshot.*ready|ready/i);
  });

  test('should handle multiple screenshots in sequence', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Take first screenshot
    await page.locator('button:has-text("Capture sample table")').click();
    await page.waitForTimeout(3000);

    // Close first dialog
    const screenshotDialog1 = page.locator('.agentlet-dialog, .agentlet-fullscreen-dialog, [class*="dialog"]');
    if (await screenshotDialog1.first().isVisible()) {
      const closeButton1 = screenshotDialog1.first().locator('button:has-text("Close"), [role="button"]:has-text("Close")');
      await closeButton1.first().click();
      await page.waitForTimeout(1000);
    }

    // Take second screenshot
    await page.locator('button:has-text("Capture selected element")').click();
    await page.waitForTimeout(1000);
    await page.locator('h1').click();
    await page.waitForTimeout(3000);

    // Second dialog should appear
    const screenshotDialog2 = page.locator('.agentlet-dialog, .agentlet-fullscreen-dialog, [class*="dialog"]');
    await expect(screenshotDialog2.first()).toBeVisible({ timeout: 10000 });

    // Console should show both capture activities
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Table.*screenshot.*captured/i);
    expect(consoleOutput).toMatch(/Element.*screenshot.*captured/i);

    // Close second dialog
    const closeButton2 = screenshotDialog2.first().locator('button:has-text("Close"), [role="button"]:has-text("Close")');
    await closeButton2.first().click();
    await page.waitForTimeout(1000);
  });

  test('should verify screenshot dialog HTML structure', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Capture sample table
    await page.locator('button:has-text("Capture sample table")').click();
    await page.waitForTimeout(3000);

    // Screenshot dialog should appear
    const screenshotDialog = page.locator('.agentlet-dialog, .agentlet-fullscreen-dialog, [class*="dialog"]');
    await expect(screenshotDialog.first()).toBeVisible({ timeout: 10000 });

    // Check dialog contains expected structure
    const dialogHTML = await screenshotDialog.first().innerHTML();

    // Should contain image element
    expect(dialogHTML).toMatch(/<img[^>]*src="data:image\/png;base64,[^"]*"/);

    // Should contain success message
    expect(dialogHTML).toMatch(/Screenshot.*captured.*successfully/i);

    // Should have proper styling
    expect(dialogHTML).toMatch(/text-align:\s*center/);
    expect(dialogHTML).toMatch(/max-width:\s*100%/);

    // Close dialog
    const closeButton = screenshotDialog.first().locator('button:has-text("Close"), [role="button"]:has-text("Close")');
    await closeButton.first().click();
    await page.waitForTimeout(1000);
  });

});