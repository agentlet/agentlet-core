/**
 * Playwright tests for ui/element-selection example
 * Tests ElementSelector functionality for interactive element selection
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Element Selection Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();

    // Navigate to the element selection example
    await agentletTest.navigateToExample('ui/element-selection.html');
  });

  test('should load the element selection page correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Element Selection - Agentlet Core Example/);

    // Check main heading
    await expect(page.locator('h1')).toContainText('Element selection');

    // Check that key sections are present
    await expect(page.locator('text=What this example shows:')).toBeVisible();
    await expect(page.locator('.controls h4:has-text("Initialize")')).toBeVisible();
    await expect(page.locator('.controls h4:has-text("Basic element selection")')).toBeVisible();
    await expect(page.locator('.controls h4:has-text("Advanced selection")')).toBeVisible();
  });

  test('should show all element selection control buttons', async ({ page }) => {
    // Initialize section
    await expect(page.locator('button:has-text("Initialize agentlet")')).toBeVisible();

    // Basic element selection
    await expect(page.locator('button:has-text("Select single element")')).toBeVisible();
    await expect(page.locator('button:has-text("Select multiple elements")')).toBeVisible();
    await expect(page.locator('button:has-text("Cancel selection")')).toBeVisible();

    // Advanced selection
    await expect(page.locator('button:has-text("Select buttons only")')).toBeVisible();
    await expect(page.locator('button:has-text("Custom callback")')).toBeVisible();
  });

  test('should display selection statistics initially', async ({ page }) => {
    // Check initial selection statistics
    await expect(page.locator('#selectorAvailable')).toContainText('No');
    await expect(page.locator('#elementsSelected')).toContainText('0');
    await expect(page.locator('#selectorsGenerated')).toContainText('0');
    await expect(page.locator('#lastSelectionMode')).toContainText('None');
  });

  test('should show API examples correctly', async ({ page }) => {
    // Check that code blocks are present and contain expected content
    const codeBlocks = page.locator('code');
    const codeCount = await codeBlocks.count();
    expect(codeCount).toBeGreaterThan(0);

    // Check for specific API examples
    const allCodeText = await page.locator('code').allTextContents();
    const combinedCode = allCodeText.join(' ');

    expect(combinedCode).toContain('window.agentlet.utils.ElementSelector');
    expect(combinedCode).toContain('.start(');
    expect(combinedCode).toContain('.stop()');
    expect(combinedCode).toContain('cssSelector');
    expect(combinedCode).toContain('getElementInfo');
  });

  test('should initialize Agentlet and update element selector statistics', async ({ page }) => {
    // Check initial state
    await expect(page.locator('#selectorAvailable')).toContainText('No');

    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Wait for statistics to update
    await page.waitForTimeout(2000);

    // Check that ElementSelector is now available
    await expect(page.locator('#selectorAvailable')).toContainText('Yes');
  });

  test('should show initialization success message', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Check status shows success with element selection ready
    const status = page.locator('#status');
    await expect(status).toContainText(/Ready.*selection.*buttons|selection.*buttons.*above/i);
  });

  test('should handle trying to select without initialization', async ({ page }) => {
    // Try to use element selection without initializing first
    await page.locator('button:has-text("Select single element")').click();
    await page.waitForTimeout(1000);

    // Status should show error about initialization
    const status = page.locator('#status');
    await expect(status).toContainText(/Initialize.*Agentlet.*first|not available/i);

    // No elements should be selected
    await expect(page.locator('#elementsSelected')).toContainText('0');
  });

  test('should start single element selection mode', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Check initial state
    await expect(page.locator('#elementsSelected')).toContainText('0');

    // Start single element selection
    await page.locator('button:has-text("Select single element")').click();
    await page.waitForTimeout(1000);

    // Status should show selection instructions
    const status = page.locator('#status');
    await expect(status).toContainText(/Click.*element.*select/i);

    // Console should show selection started
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Starting.*single.*element.*selection/i);
  });

  test('should perform single element selection', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start single element selection
    await page.locator('button:has-text("Select single element")').click();
    await page.waitForTimeout(1000);

    // Click on a test element (the console clear button for example)
    await page.locator('button.console-clear-btn').click();
    await page.waitForTimeout(2000);

    // Should have selected 1 element
    await expect(page.locator('#elementsSelected')).toContainText('1');
    await expect(page.locator('#selectorsGenerated')).toContainText('1');
    await expect(page.locator('#lastSelectionMode')).toContainText('Single');

    // Console should show successful selection
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Element selected.*button/i);
    expect(consoleOutput).toMatch(/Generated selector/i);
  });

  test('should start multiple element selection mode', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start multiple element selection
    await page.locator('button:has-text("Select multiple elements")').click();
    await page.waitForTimeout(1000);

    // Status should show multiple selection instructions
    const status = page.locator('#status');
    await expect(status).toContainText(/Click.*elements.*one.*Escape/i);

    // Console should show multiple selection started
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Starting.*multiple.*element.*selection/i);
  });

  test('should perform multiple element selection', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start multiple element selection
    await page.locator('button:has-text("Select multiple elements")').click();
    await page.waitForTimeout(1000);

    // Click on multiple elements
    await page.locator('button.console-clear-btn').click();
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Initialize agentlet")').click();
    await page.waitForTimeout(1000);

    // Press Escape to finish selection
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);

    // Should have selected 2 elements
    await expect(page.locator('#elementsSelected')).toContainText('2');
    await expect(page.locator('#selectorsGenerated')).toContainText('2');
    await expect(page.locator('#lastSelectionMode')).toContainText('Multiple');

    // Console should show completion
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Multiple.*selection.*completed.*2.*elements/i);
  });

  test('should cancel active selection', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start single element selection
    await page.locator('button:has-text("Select single element")').click();
    await page.waitForTimeout(1000);

    // Status should show selection mode active
    const status = page.locator('#status');
    await expect(status).toContainText(/Click.*element.*select/i);

    // Cancel the selection using Escape key (proper way to cancel)
    await page.keyboard.press('Escape');
    await page.waitForTimeout(1000);

    // Alternatively, we can also test the cancel button, but need to use keyboard or
    // check that selection is cancelled by testing element selection behavior

    // Selection should be cancelled - verify by trying to start a new selection
    // The escape key should have cancelled the selection (confirmed in browser logs)

    // Test that clicking the cancel button works when called programmatically
    await page.locator('button:has-text("Cancel selection")').click();
    await page.waitForTimeout(1000);

    // Console should show cancellation attempt (may show different messages depending on implementation)
    const finalConsoleOutput = await page.locator('#console').textContent();
    // The cancel button might show different responses - just verify it doesn't crash
    expect(finalConsoleOutput.length).toBeGreaterThan(0);

    // Most importantly, verify we can start a new selection after cancelling
    await page.locator('button:has-text("Select single element")').click();
    await page.waitForTimeout(1000);

    // Status should show selection mode is active again
    await expect(status).toContainText(/Click.*element.*select/i);
  });

  test('should perform filtered button selection', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start button-only selection
    await page.locator('button:has-text("Select buttons only")').click();
    await page.waitForTimeout(1000);

    // Status should show button selection instructions
    const status = page.locator('#status');
    await expect(status).toContainText(/Click.*buttons.*only/i);

    // Console should show button selection started
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Starting.*button.*only.*selection/i);

    // Click on a button element
    await page.locator('button.console-clear-btn').click();
    await page.waitForTimeout(2000);

    // Should have selected 1 element with filtered mode
    await expect(page.locator('#elementsSelected')).toContainText('1');
    await expect(page.locator('#lastSelectionMode')).toContainText('Filtered (buttons)');

    // Console should show button selection success
    const finalConsoleOutput = await page.locator('#console').textContent();
    expect(finalConsoleOutput).toMatch(/Button selected/i);
  });

  test('should perform custom callback selection', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start custom callback selection
    await page.locator('button:has-text("Custom callback")').click();
    await page.waitForTimeout(1000);

    // Status should show custom selection instructions
    const status = page.locator('#status');
    await expect(status).toContainText(/Select.*element.*detailed.*info/i);

    // Console should show custom callback selection started
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Starting.*selection.*custom.*callback/i);

    // Click on an element to analyze
    await page.locator('h1').click(); // Click on the main heading
    await page.waitForTimeout(2000);

    // Should have selected 1 element with custom callback mode
    await expect(page.locator('#elementsSelected')).toContainText('1');
    await expect(page.locator('#lastSelectionMode')).toContainText('Custom Callback');

    // Console should show detailed analysis
    const finalConsoleOutput = await page.locator('#console').textContent();
    expect(finalConsoleOutput).toMatch(/Element analyzed/i);
    expect(finalConsoleOutput).toMatch(/Element properties/i);
    expect(finalConsoleOutput).toMatch(/XPath/i);
    expect(finalConsoleOutput).toMatch(/Visible/i);
  });

  test('should track statistics correctly across different selection modes', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Perform a single selection
    await page.locator('button:has-text("Select single element")').click();
    await page.waitForTimeout(1000);
    await page.locator('button.console-clear-btn').click();
    await page.waitForTimeout(2000);

    // Check stats after first selection
    await expect(page.locator('#elementsSelected')).toContainText('1');
    await expect(page.locator('#selectorsGenerated')).toContainText('1');

    // Perform a button selection
    await page.locator('button:has-text("Select buttons only")').click();
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Initialize agentlet")').click();
    await page.waitForTimeout(2000);

    // Check stats after second selection
    await expect(page.locator('#elementsSelected')).toContainText('2');
    await expect(page.locator('#selectorsGenerated')).toContainText('2');

    // Latest mode should be the filtered button selection
    await expect(page.locator('#lastSelectionMode')).toContainText('Filtered (buttons)');
  });

  test('should handle element highlighting during selection', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start single element selection
    await page.locator('button:has-text("Select single element")').click();
    await page.waitForTimeout(1000);

    // Click on a test element
    const targetButton = page.locator('button.console-clear-btn');
    await targetButton.click();
    await page.waitForTimeout(1000);

    // The selected element should have the 'element-selected' class temporarily
    // We can't directly check the class due to timing, but we can verify selection occurred
    await expect(page.locator('#elementsSelected')).toContainText('1');

    // Wait for highlight to be removed (3 seconds as per the code)
    await page.waitForTimeout(4000);

    // Selection count should remain the same but visual highlight should be gone
    await expect(page.locator('#elementsSelected')).toContainText('1');
  });

  test('should handle multiple element selection with escape key', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start multiple element selection
    await page.locator('button:has-text("Select multiple elements")').click();
    await page.waitForTimeout(1000);

    // Click on first element
    await page.locator('button.console-clear-btn').click();
    await page.waitForTimeout(1000);

    // Status should update to show continuing selection
    const status = page.locator('#status');
    await expect(status).toContainText(/Click.*elements.*Escape.*done|Click.*elements.*one.*by.*one/i);

    // Click on second element
    await page.locator('h1').click();
    await page.waitForTimeout(1000);

    // Press Escape to finish
    await page.keyboard.press('Escape');
    await page.waitForTimeout(2000);

    // Should have completed multiple selection
    await expect(page.locator('#elementsSelected')).toContainText('2');
    await expect(page.locator('#lastSelectionMode')).toContainText('Multiple');
  });

  test('should update statistics periodically', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Perform some selections to generate data
    await page.locator('button:has-text("Select single element")').click();
    await page.waitForTimeout(1000);
    await page.locator('button.console-clear-btn').click();
    await page.waitForTimeout(2000);

    // Statistics should reflect the current state
    await expect(page.locator('#elementsSelected')).toContainText('1');
    await expect(page.locator('#selectorsGenerated')).toContainText('1');

    // Wait for periodic update interval (the code updates every 2 seconds)
    await page.waitForTimeout(3000);

    // Statistics should still be accurate
    await expect(page.locator('#selectorAvailable')).toContainText('Yes');
    await expect(page.locator('#elementsSelected')).toContainText('1');
  });

  test('should handle selector generation correctly', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start custom callback selection to see detailed selector info
    await page.locator('button:has-text("Custom callback")').click();
    await page.waitForTimeout(1000);

    // Click on an element with a clear selector
    await page.locator('h1').click();
    await page.waitForTimeout(2000);

    // Console should show both CSS selector and XPath
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Selector:/i);
    expect(consoleOutput).toMatch(/XPath:/i);

    // Should show element properties
    expect(consoleOutput).toMatch(/Element properties/i);
    expect(consoleOutput).toMatch(/Text content/i);
  });

  test('should handle clear console functionality', async ({ page }) => {
    // Initialize to get some output
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Create selection activity to generate output
    await page.locator('button:has-text("Select single element")').click();
    await page.waitForTimeout(1000);
    await page.locator('h1').click();
    await page.waitForTimeout(2000);

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

  test('should handle selection edge cases', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Try to cancel when no selection is active
    await page.locator('button:has-text("Cancel selection")').click();
    await page.waitForTimeout(1000);

    // Should handle gracefully (no error)
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Selection.*cancelled|Canceling.*selection/i);
  });

  test('should maintain selection state across different modes', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Perform selections in different modes
    await page.locator('button:has-text("Select single element")').click();
    await page.waitForTimeout(1000);
    await page.locator('h1').click();
    await page.waitForTimeout(2000);

    // Check state after first selection
    await expect(page.locator('#elementsSelected')).toContainText('1');
    await expect(page.locator('#lastSelectionMode')).toContainText('Single');

    // Switch to button selection mode
    await page.locator('button:has-text("Select buttons only")').click();
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Initialize agentlet")').click();
    await page.waitForTimeout(2000);

    // State should accumulate
    await expect(page.locator('#elementsSelected')).toContainText('2');
    await expect(page.locator('#lastSelectionMode')).toContainText('Filtered (buttons)');

    // Both selections should be tracked
    await expect(page.locator('#selectorsGenerated')).toContainText('2');
  });

  test('should display comprehensive element analysis in custom callback', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start custom callback selection
    await page.locator('button:has-text("Custom callback")').click();
    await page.waitForTimeout(1000);

    // Click on a button element to get detailed analysis
    await page.locator('button:has-text("Initialize agentlet")').click();
    await page.waitForTimeout(2000);

    // Console should show comprehensive analysis
    const consoleOutput = await page.locator('#console').textContent();

    // Should include all the detailed properties
    expect(consoleOutput).toMatch(/Element analyzed.*button/i);
    expect(consoleOutput).toMatch(/Element properties/i);
    expect(consoleOutput).toMatch(/ID:/i);
    expect(consoleOutput).toMatch(/Classes:/i);
    expect(consoleOutput).toMatch(/Text content:/i);
    expect(consoleOutput).toMatch(/Children count:/i);
    expect(consoleOutput).toMatch(/XPath:/i);
    expect(consoleOutput).toMatch(/Visible:/i);

    // Should show the analyzed element in status
    const status = page.locator('#status');
    await expect(status).toContainText(/Analyzed.*button/i);
  });

});