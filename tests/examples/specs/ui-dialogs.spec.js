/**
 * Playwright tests for ui/dialogs example
 * Tests dialog functionality and message bubbles
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Dialogs Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();

    // Navigate to the dialogs example
    await agentletTest.navigateToExample('ui/dialogs.html');
  });

  test('should load the dialogs page correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Dialogs and Message Bubbles - Agentlet Core Example/);

    // Check main heading
    await expect(page.locator('h1')).toContainText('Dialogs and message bubbles');

    // Check that key sections are present
    await expect(page.locator('text=What this example shows:')).toBeVisible();
    await expect(page.locator('text=Basic dialogs')).toBeVisible();
    await expect(page.locator('text=Custom dialogs')).toBeVisible();
    await expect(page.locator('text=Advanced examples')).toBeVisible();
    await expect(page.locator('text=Message bubbles')).toBeVisible();
  });

  test('should show all dialog buttons', async ({ page }) => {
    // Basic dialogs
    await expect(page.locator('button:has-text("Info dialog")')).toBeVisible();
    await expect(page.locator('button:has-text("Success dialog")')).toBeVisible();
    await expect(page.locator('button:has-text("Warning dialog")')).toBeVisible();
    await expect(page.locator('button:has-text("Error dialog")')).toBeVisible();

    // Custom dialogs
    await expect(page.locator('button:has-text("Custom HTML dialog")')).toBeVisible();
    await expect(page.locator('button:has-text("Multiple buttons")')).toBeVisible();
    await expect(page.locator('button:has-text("With callback")')).toBeVisible();

    // Advanced examples
    await expect(page.locator('button:has-text("Custom styled")')).toBeVisible();
    await expect(page.locator('button:has-text("Sequential dialogs")')).toBeVisible();
    await expect(page.locator('button:has-text("Form-like dialog")')).toBeVisible();
    await expect(page.locator('button:has-text("Fullscreen dialog")')).toBeVisible();

    // Message bubbles
    await expect(page.locator('button:has-text("Info bubble")')).toBeVisible();
    await expect(page.locator('button:has-text("Success bubble")')).toBeVisible();
    await expect(page.locator('button:has-text("Warning bubble")')).toBeVisible();
    await expect(page.locator('button:has-text("Error bubble")')).toBeVisible();
  });

  test('should initialize Agentlet and update dialog activity', async ({ page }) => {
    // Check initial dialog activity
    await expect(page.locator('text=Dialog API available: No')).toBeVisible();
    await expect(page.locator('text=Dialogs shown: 0')).toBeVisible();

    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Wait for state to update
    await page.waitForTimeout(2000);

    // Check that dialog API is now available
    const dialogActivity = await page.locator('.dialog-activity-section, #dialogActivity').textContent();
    if (dialogActivity) {
      expect(dialogActivity).toMatch(/Dialog API available.*Yes|available.*true/i);
    }
  });

  test('should show basic info dialog', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click info dialog button
    await page.locator('button:has-text("Info dialog")').click();

    // Wait for dialog to appear
    await agentletTest.waitForDialog();

    // Check that dialog is visible with expected content
    const dialog = page.locator('.agentlet-dialog');
    await expect(dialog).toBeVisible();

    // Dialog should have a close button
    await expect(dialog.locator('button:has-text("OK"), button:has-text("Close")')).toBeVisible();

    // Close dialog
    await agentletTest.closeDialog();
    await page.waitForTimeout(500);
  });

  test('should show success dialog', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click success dialog button
    await page.locator('button:has-text("Success dialog")').click();

    // Wait for dialog to appear
    await agentletTest.waitForDialog();

    // Check that dialog is visible
    const dialog = page.locator('.agentlet-dialog');
    await expect(dialog).toBeVisible();

    // Close dialog
    await agentletTest.closeDialog();
    await page.waitForTimeout(500);
  });

  test('should show warning dialog', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click warning dialog button
    await page.locator('button:has-text("Warning dialog")').click();

    // Wait for dialog to appear
    await agentletTest.waitForDialog();

    // Check that dialog is visible
    const dialog = page.locator('.agentlet-dialog');
    await expect(dialog).toBeVisible();

    // Close dialog
    await agentletTest.closeDialog();
    await page.waitForTimeout(500);
  });

  test('should show error dialog', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click error dialog button
    await page.locator('button:has-text("Error dialog")').click();

    // Wait for dialog to appear
    await agentletTest.waitForDialog();

    // Check that dialog is visible
    const dialog = page.locator('.agentlet-dialog');
    await expect(dialog).toBeVisible();

    // Close dialog
    await agentletTest.closeDialog();
    await page.waitForTimeout(500);
  });

  test('should show fullscreen dialog', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click fullscreen dialog button
    await page.locator('button:has-text("Fullscreen dialog")').click();

    // Wait for fullscreen dialog to appear
    await page.waitForSelector('.agentlet-fullscreen-dialog', { timeout: 5000 });

    // Check that fullscreen dialog is visible
    const dialog = page.locator('.agentlet-fullscreen-dialog');
    await expect(dialog).toBeVisible();

    // Should have a close button
    await expect(dialog.locator('button:has-text("Close")')).toBeVisible();

    // Close dialog
    await dialog.locator('button:has-text("Close")').click();
    await page.waitForTimeout(500);
  });

  test('should show custom HTML dialog', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click custom HTML dialog button
    await page.locator('button:has-text("Custom HTML dialog")').click();

    // Wait for dialog to appear
    await agentletTest.waitForDialog();

    // Check that dialog is visible
    const dialog = page.locator('.agentlet-dialog');
    await expect(dialog).toBeVisible();

    // Custom HTML dialog might have specific content or styling
    // Close dialog
    await agentletTest.closeDialog();
    await page.waitForTimeout(500);
  });

  test('should show multiple buttons dialog', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click multiple buttons dialog
    await page.locator('button:has-text("Multiple buttons")').click();

    // Wait for dialog to appear
    await agentletTest.waitForDialog();

    // Check that dialog is visible
    const dialog = page.locator('.agentlet-dialog');
    await expect(dialog).toBeVisible();

    // Should have multiple buttons (exact number depends on implementation)
    const buttons = dialog.locator('button');
    const buttonCount = await buttons.count();
    expect(buttonCount).toBeGreaterThan(1);

    // Close dialog by clicking first button
    await buttons.first().click();
    await page.waitForTimeout(500);
  });

  test('should show message bubbles', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Test info bubble
    await page.locator('button:has-text("Info bubble")').click();
    await page.waitForTimeout(1000);

    // Test success bubble
    await page.locator('button:has-text("Success bubble")').click();
    await page.waitForTimeout(1000);

    // Test warning bubble
    await page.locator('button:has-text("Warning bubble")').click();
    await page.waitForTimeout(1000);

    // Test error bubble
    await page.locator('button:has-text("Error bubble")').click();
    await page.waitForTimeout(1000);

    // Message bubbles typically auto-dismiss, so we just verify they don't crash
    // and that the console shows activity
    const consoleOutput = await page.locator('.console-section').textContent();
    expect(consoleOutput.length).toBeGreaterThan(0);
  });

  test('should update dialog activity statistics', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Show a few dialogs to generate activity
    await page.locator('button:has-text("Info dialog")').click();
    await agentletTest.waitForDialog();
    await agentletTest.closeDialog();
    await page.waitForTimeout(500);

    await page.locator('button:has-text("Success dialog")').click();
    await agentletTest.waitForDialog();
    await agentletTest.closeDialog();
    await page.waitForTimeout(500);

    // Check that dialog activity statistics updated
    const dialogActivity = await page.locator('.dialog-activity-section, #dialogActivity').textContent();
    if (dialogActivity) {
      // Dialogs shown should be > 0
      expect(dialogActivity).toMatch(/Dialogs shown:\s*[1-9]/);
    }
  });

  test('should display API examples correctly', async ({ page }) => {
    // Check that code blocks are present and contain expected content
    const codeBlocks = page.locator('code');
    const codeCount = await codeBlocks.count();
    expect(codeCount).toBeGreaterThan(0);

    // Check for specific API examples
    const allCodeText = await page.locator('code').allTextContents();
    const combinedCode = allCodeText.join(' ');

    expect(combinedCode).toContain('window.agentlet.utils.Dialog');
    expect(combinedCode).toContain('MessageBubble');
    expect(combinedCode).toContain('.info(');
    expect(combinedCode).toContain('.success(');
    expect(combinedCode).toContain('.warning(');
    expect(combinedCode).toContain('.error(');
  });

  test('should handle sequential dialogs', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click sequential dialogs button (if available)
    const sequentialButton = page.locator('button:has-text("Sequential dialogs")');
    if (await sequentialButton.isVisible()) {
      await sequentialButton.click();

      // Wait for first dialog
      await agentletTest.waitForDialog();

      // Close first dialog which might trigger the next
      await agentletTest.closeDialog();
      await page.waitForTimeout(1000);

      // There might be a second dialog, try to close it if present
      const secondDialog = page.locator('.agentlet-dialog');
      if (await secondDialog.isVisible()) {
        await agentletTest.closeDialog();
      }
    }
  });

  test('should handle clear console functionality', async ({ page }) => {
    // Initialize to get some output
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Show a dialog to generate activity
    await page.locator('button:has-text("Info dialog")').click();
    await agentletTest.waitForDialog();
    await agentletTest.closeDialog();

    // Verify there is output
    let consoleOutput = await page.locator('.console-section').textContent();
    expect(consoleOutput.length).toBeGreaterThan(0);

    // Clear console
    await page.locator('button:has-text("🗑️ Clear")').click();
    await page.waitForTimeout(500);

    // Console should be cleared or show clear message
    consoleOutput = await page.locator('.console-section').textContent();
    const isClearOrEmpty = consoleOutput.trim() === '' ||
                          consoleOutput.includes('cleared') ||
                          consoleOutput.includes('Console cleared');
    expect(isClearOrEmpty).toBe(true);
  });
});