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
    await expect(page.locator('#status')).toContainText('Click on any element to select it');

    // Status should show selection instructions
    const status = page.locator('#status');
    await expect(status).toContainText(/Click.*element.*select/i);

    // Console should show selection started
    await agentletTest.expectTextToMatch(/Starting.*single.*element.*selection/i);
  });

  test('should perform single element selection', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start single element selection
    await page.locator('button:has-text("Select single element")').click();
    await expect(page.locator('#status')).toContainText('Click on any element to select it');

    // Click on a test element (the console clear button for example)
    await page.locator('button.console-clear-btn').click();

    // Should have selected 1 element
    await expect(page.locator('#elementsSelected')).toContainText('1');
    await expect(page.locator('#selectorsGenerated')).toContainText('1');
    await expect(page.locator('#lastSelectionMode')).toContainText('Single');

    // Console should show successful selection
    await agentletTest.expectTextToMatch(/Element selected.*button/i);
    await agentletTest.expectTextToMatch(/Generated selector/i);
  });

  test('should start multiple element selection mode', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start multiple element selection
    await page.locator('button:has-text("Select multiple elements")').click();
    await expect(page.locator('#status')).toContainText('Click elements one by one, press Escape when done');

    // Status should show multiple selection instructions
    const status = page.locator('#status');
    await expect(status).toContainText(/Click.*elements.*one.*Escape/i);

    // Console should show multiple selection started
    await agentletTest.expectTextToMatch(/Starting.*multiple.*element.*selection/i);
  });

  test('should perform multiple element selection', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start multiple element selection
    await page.locator('button:has-text("Select multiple elements")').click();
    await expect(page.locator('#status')).toContainText('Click elements one by one, press Escape when done');

    // Click on multiple elements
    await page.locator('button.console-clear-btn').click();
    await expect(page.locator('#console')).toContainText('Element 1 selected');
    await page.locator('button:has-text("Initialize agentlet")').click();
    await expect(page.locator('#console')).toContainText('Element 2 selected');

    // Press Escape to finish selection
    await page.keyboard.press('Escape');

    // Should have selected 2 elements
    await expect(page.locator('#elementsSelected')).toContainText('2');
    await expect(page.locator('#selectorsGenerated')).toContainText('2');
    await expect(page.locator('#lastSelectionMode')).toContainText('Multiple');

    // Console should show completion
    await agentletTest.expectTextToMatch(/Multiple.*selection.*completed.*2.*elements/i);
  });

  test('should cancel active selection', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start single element selection
    await page.locator('button:has-text("Select single element")').click();
    await expect(page.locator('#status')).toContainText('Click on any element to select it');

    // Status should show selection mode active
    const status = page.locator('#status');
    await expect(status).toContainText(/Click.*element.*select/i);

    // Cancel the selection using Escape key (proper way to cancel)
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.agentlet.utils.ElementSelector.isActive);

    // Alternatively, we can also test the cancel button, but need to use keyboard or
    // check that selection is cancelled by testing element selection behavior

    // Selection should be cancelled - verify by trying to start a new selection
    // The escape key should have cancelled the selection (confirmed in browser logs)

    // Test that clicking the cancel button works when called programmatically
    await page.locator('button:has-text("Cancel selection")').click();
    await expect(page.locator('#console')).toContainText('Selection cancelled');

    // Console should show cancellation attempt (may show different messages depending on implementation)
    const finalConsoleOutput = await page.locator('#console').textContent();
    // The cancel button might show different responses - just verify it doesn't crash
    expect(finalConsoleOutput.length).toBeGreaterThan(0);

    // Most importantly, verify we can start a new selection after cancelling
    await page.locator('button:has-text("Select single element")').click();
    await expect(page.locator('#status')).toContainText('Click on any element to select it');

    // Status should show selection mode is active again
    await expect(status).toContainText(/Click.*element.*select/i);
  });

  test('should perform filtered button selection', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start button-only selection
    await page.locator('button:has-text("Select buttons only")').click();
    await expect(page.locator('#status')).toContainText('Click on buttons only');

    // Status should show button selection instructions
    const status = page.locator('#status');
    await expect(status).toContainText(/Click.*buttons.*only/i);

    // Console should show button selection started
    await agentletTest.expectTextToMatch(/Starting.*button.*only.*selection/i);

    // Click on a button element
    await page.locator('button.console-clear-btn').click();

    // Should have selected 1 element with filtered mode
    await expect(page.locator('#elementsSelected')).toContainText('1');
    await expect(page.locator('#lastSelectionMode')).toContainText('Filtered (buttons)');

    // Console should show button selection success
    await agentletTest.expectTextToMatch(/Button selected/i);
  });

  test('should perform custom callback selection', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start custom callback selection
    await page.locator('button:has-text("Custom callback")').click();
    await expect(page.locator('#status')).toContainText('Select any element to see detailed info');

    // Status should show custom selection instructions
    const status = page.locator('#status');
    await expect(status).toContainText(/Select.*element.*detailed.*info/i);

    // Console should show custom callback selection started
    await agentletTest.expectTextToMatch(/Starting.*selection.*custom.*callback/i);

    // Click on an element to analyze
    await page.locator('h1').click(); // Click on the main heading

    // Should have selected 1 element with custom callback mode
    await expect(page.locator('#elementsSelected')).toContainText('1');
    await expect(page.locator('#lastSelectionMode')).toContainText('Custom Callback');

    // Console should show detailed analysis
    await agentletTest.expectTextToMatch(/Element analyzed/i);
    await agentletTest.expectTextToMatch(/Element properties/i);
    await agentletTest.expectTextToMatch(/XPath/i);
    await agentletTest.expectTextToMatch(/Visible/i);
  });

  test('should track statistics correctly across different selection modes', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Perform a single selection
    await page.locator('button:has-text("Select single element")').click();
    await expect(page.locator('#status')).toContainText('Click on any element to select it');
    await page.locator('button.console-clear-btn').click();

    // Check stats after first selection
    await expect(page.locator('#elementsSelected')).toContainText('1');
    await expect(page.locator('#selectorsGenerated')).toContainText('1');

    // Perform a button selection
    await page.locator('button:has-text("Select buttons only")').click();
    await expect(page.locator('#status')).toContainText('Click on buttons only');
    await page.locator('button:has-text("Initialize agentlet")').click();

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
    await expect(page.locator('#status')).toContainText('Click on any element to select it');

    // Click on a test element
    const targetButton = page.locator('button.console-clear-btn');
    await targetButton.click();
    await expect(targetButton).toHaveClass(/element-selected/);

    // The selected element gets the 'element-selected' class temporarily
    // (set synchronously by the example), and the selection is counted
    await expect(page.locator('#elementsSelected')).toContainText('1');

    // The example removes the highlight class after 3 seconds: wait for the class to go
    await expect(targetButton).not.toHaveClass(/element-selected/, { timeout: 6000 });

    // Selection count should remain the same but visual highlight should be gone
    await expect(page.locator('#elementsSelected')).toContainText('1');
  });

  test('should handle multiple element selection with escape key', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Start multiple element selection
    await page.locator('button:has-text("Select multiple elements")').click();
    await expect(page.locator('#status')).toContainText('Click elements one by one, press Escape when done');

    // Click on first element
    await page.locator('button.console-clear-btn').click();
    await expect(page.locator('#console')).toContainText('Element 1 selected');

    // Status should update to show continuing selection
    const status = page.locator('#status');
    await expect(status).toContainText(/Click.*elements.*Escape.*done|Click.*elements.*one.*by.*one/i);

    // Click on second element
    await page.locator('h1').click();
    await expect(page.locator('#console')).toContainText('Element 2 selected');

    // Press Escape to finish
    await page.keyboard.press('Escape');

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
    await expect(page.locator('#status')).toContainText('Click on any element to select it');
    await page.locator('button.console-clear-btn').click();

    // Statistics should reflect the current state
    await expect(page.locator('#elementsSelected')).toContainText('1');
    await expect(page.locator('#selectorsGenerated')).toContainText('1');

    // The example refreshes its statistics every 2 seconds: overwrite a value
    // and wait for the next refresh to put it back
    await page.evaluate(() => { document.getElementById('selectorAvailable').textContent = 'stale'; });

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
    await expect(page.locator('#status')).toContainText('Select any element to see detailed info');

    // Click on an element with a clear selector
    await page.locator('h1').click();

    // Console should show both CSS selector and XPath
    await agentletTest.expectTextToMatch(/Selector:/i);
    await agentletTest.expectTextToMatch(/XPath:/i);

    // Should show element properties
    await agentletTest.expectTextToMatch(/Element properties/i);
    await agentletTest.expectTextToMatch(/Text content/i);
  });

  test('should handle clear console functionality', async ({ page }) => {
    // Initialize to get some output
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Create selection activity to generate output
    await page.locator('button:has-text("Select single element")').click();
    await expect(page.locator('#status')).toContainText('Click on any element to select it');
    await page.locator('h1').click();
    await expect(page.locator('#elementsSelected')).toContainText('1');

    // Verify there is output
    let consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput.length).toBeGreaterThan(0);

    // Clear console
    await page.locator('button.console-clear-btn').click({ force: true });

    // Console should be cleared or contain different content: check that
    // either console is cleared OR content has changed
    await expect.poll(async () => {
      const consoleOutputAfterClear = await page.locator('#console').textContent();
      return consoleOutputAfterClear.trim() === '' ||
             consoleOutputAfterClear !== consoleOutput ||
             consoleOutputAfterClear.includes('cleared') ||
             consoleOutputAfterClear.includes('Console cleared');
    }).toBe(true);
  });

  test('should handle selection edge cases', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Try to cancel when no selection is active
    await page.locator('button:has-text("Cancel selection")').click();
    await expect(page.locator('#console')).toContainText('Selection cancelled');

    // Should handle gracefully (no error)
    await agentletTest.expectTextToMatch(/Selection.*cancelled|Canceling.*selection/i);
  });

  test('should maintain selection state across different modes', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Perform selections in different modes
    await page.locator('button:has-text("Select single element")').click();
    await expect(page.locator('#status')).toContainText('Click on any element to select it');
    await page.locator('h1').click();

    // Check state after first selection
    await expect(page.locator('#elementsSelected')).toContainText('1');
    await expect(page.locator('#lastSelectionMode')).toContainText('Single');

    // Switch to button selection mode
    await page.locator('button:has-text("Select buttons only")').click();
    await expect(page.locator('#status')).toContainText('Click on buttons only');
    await page.locator('button:has-text("Initialize agentlet")').click();

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
    await expect(page.locator('#status')).toContainText('Select any element to see detailed info');

    // Click on a button element to get detailed analysis
    await page.locator('button:has-text("Initialize agentlet")').click();

    // Console should show comprehensive analysis, including all the detailed properties
    await agentletTest.expectTextToMatch(/Element analyzed.*button/i);
    await agentletTest.expectTextToMatch(/Element properties/i);
    await agentletTest.expectTextToMatch(/ID:/i);
    await agentletTest.expectTextToMatch(/Classes:/i);
    await agentletTest.expectTextToMatch(/Text content:/i);
    await agentletTest.expectTextToMatch(/Children count:/i);
    await agentletTest.expectTextToMatch(/XPath:/i);
    await agentletTest.expectTextToMatch(/Visible:/i);

    // Should show the analyzed element in status
    const status = page.locator('#status');
    await expect(status).toContainText(/Analyzed.*button/i);
  });

});