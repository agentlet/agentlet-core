/**
 * Playwright tests for ui/highlighting example
 * Tests PageHighlighter functionality for overlays and element highlighting
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Highlighting Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();

    // Navigate to the highlighting example
    await agentletTest.navigateToExample('ui/highlighting.html');
  });

  test('should load the highlighting page correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Page Highlighting - Agentlet Core UI Components/);

    // Check main heading
    await expect(page.locator('h1')).toContainText('Page highlighting');

    // Check that key sections are present
    await expect(page.locator('text=What this example shows:')).toBeVisible();
    await expect(page.locator('.controls h4:has-text("Initialize")')).toBeVisible();
    await expect(page.locator('.controls h4:has-text("Overlay examples")')).toBeVisible();
    await expect(page.locator('.controls h4:has-text("Progress examples")')).toBeVisible();
    await expect(page.locator('.controls h4:has-text("Element highlighting examples")')).toBeVisible();
    await expect(page.locator('.controls h4:has-text("Scroll controls")')).toBeVisible();
  });

  test('should show all overlay control buttons', async ({ page }) => {
    // Initialize section
    await expect(page.locator('button:has-text("Initialize Agentlet Core")')).toBeVisible();
    await expect(page.locator('button:has-text("Check Status")')).toBeVisible();

    // Overlay examples
    await expect(page.locator('button:has-text("Top Banner")')).toBeVisible();
    await expect(page.locator('button:has-text("Bottom Banner")')).toBeVisible();
    await expect(page.locator('button:has-text("Centered Banner")')).toBeVisible();
    await expect(page.locator('button:has-text("With Background Overlay")')).toBeVisible();
    await expect(page.locator('button:has-text("Closeable Message")')).toBeVisible();
  });

  test('should show all progress control buttons', async ({ page }) => {
    // Progress examples
    await expect(page.locator('button:has-text("Center Progress")')).toBeVisible();
    await expect(page.locator('button:has-text("Top Progress Banner")')).toBeVisible();
    await expect(page.locator('button:has-text("Bottom Progress Banner")')).toBeVisible();
    await expect(page.locator('button:has-text("Clear All Overlays")')).toBeVisible();
  });

  test('should show all highlighting control buttons', async ({ page }) => {
    // Element highlighting examples
    await expect(page.locator('button:has-text("Border Highlight")')).toBeVisible();
    await expect(page.locator('button:has-text("Arrow Pointer")')).toBeVisible();
    await expect(page.locator('button:has-text("Sticker Badge")')).toBeVisible();
    await expect(page.locator('button:has-text("Clickable Highlight")')).toBeVisible();
    await expect(page.locator('button:has-text("Update Highlight")')).toBeVisible();
    await expect(page.locator('button:has-text("Clear All Highlights")')).toBeVisible();

    // Scroll controls
    await expect(page.locator('button:has-text("Scroll to Top")')).toBeVisible();
    await expect(page.locator('button:has-text("Scroll to Bottom")')).toBeVisible();
    await expect(page.locator('button:has-text("Scroll + Highlight Demo")')).toBeVisible();
  });

  test('should display highlighting statistics initially', async ({ page }) => {
    // Check initial highlighting statistics
    await expect(page.locator('#highlighterAvailable')).toContainText('No');
    await expect(page.locator('#activeHighlights')).toContainText('0');
    await expect(page.locator('#activeOverlays')).toContainText('0');
    await expect(page.locator('#lastHighlightType')).toContainText('None');
  });

  test('should initialize Agentlet and update highlighting statistics', async ({ page }) => {
    // Check initial state
    await expect(page.locator('#highlighterAvailable')).toContainText('No');

    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Wait for statistics to update
    await page.waitForTimeout(2000);

    // Check that PageHighlighter is now available
    await expect(page.locator('#highlighterAvailable')).toContainText('Yes');
  });

  test('should show initialization success message', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Check status shows success with PageHighlighter ready
    const status = page.locator('#status');
    await expect(status).toContainText(/PageHighlighter.*ready|ready.*PageHighlighter/i);
  });

  test('should handle check status functionality', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click check status button
    await page.locator('button:has-text("Check Status")').click();
    await page.waitForTimeout(1000);

    // Console should show status information
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/PageHighlighter.*available|checking.*status/i);

    // Status should be updated
    const status = page.locator('#status');
    await expect(status).toContainText(/PageHighlighter.*ready|ready.*use/i);
  });

  test('should create border highlight', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Check initial highlights count
    await expect(page.locator('#activeHighlights')).toContainText('0');

    // Click border highlight button
    await page.locator('button:has-text("Border Highlight")').click();
    await page.waitForTimeout(2000);

    // Active highlights should increase
    await expect(page.locator('#activeHighlights')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Border');

    // Console should show creation activity
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Border.*highlight.*created/i);
  });

  test('should create arrow highlight', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click arrow highlight button
    await page.locator('button:has-text("Arrow Pointer")').click();
    await page.waitForTimeout(2000);

    // Active highlights should be 1
    await expect(page.locator('#activeHighlights')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Arrow');

    // Console should show creation activity
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Arrow.*highlight.*created/i);
  });

  test('should create sticker highlight', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click sticker highlight button
    await page.locator('button:has-text("Sticker Badge")').click();
    await page.waitForTimeout(2000);

    // Active highlights should be 1
    await expect(page.locator('#activeHighlights')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Sticker');

    // Console should show creation activity
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Sticker.*highlight.*created/i);
  });

  test('should create clickable highlight', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click clickable highlight button
    await page.locator('button:has-text("Clickable Highlight")').click();
    await page.waitForTimeout(2000);

    // Active highlights should be 1
    await expect(page.locator('#activeHighlights')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Clickable');

    // The clickable area should be highlighted - we can test by looking for highlight elements
    // or check console output for creation
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Clickable.*highlight.*created/i);
  });

  test('should clear all highlights', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Create some highlights first
    await page.locator('button:has-text("Border Highlight")').click();
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Arrow Pointer")').click();
    await page.waitForTimeout(1000);

    // Should have 2 highlights
    await expect(page.locator('#activeHighlights')).toContainText('2');

    // Clear all highlights
    await page.locator('button:has-text("Clear All Highlights")').click();
    await page.waitForTimeout(1000);

    // Should have 0 highlights
    await expect(page.locator('#activeHighlights')).toContainText('0');

    // Console should show clearing activity
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Clearing.*highlights/i);
  });

  test('should update existing highlights', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Create a highlight first
    await page.locator('button:has-text("Border Highlight")').click();
    await page.waitForTimeout(1000);

    // Should have 1 highlight
    await expect(page.locator('#activeHighlights')).toContainText('1');

    // Update the highlight
    await page.locator('button:has-text("Update Highlight")').click();
    await page.waitForTimeout(1000);

    // Should still have 1 highlight (updated, not new)
    await expect(page.locator('#activeHighlights')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Updated');

    // Console should show update activity
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/highlight.*updated.*message/i);
  });

  test('should handle update highlight with no existing highlights', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Try to update with no highlights
    await page.locator('button:has-text("Update Highlight")').click();
    await page.waitForTimeout(1000);

    // Console should show warning about no highlights
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/No highlights.*update.*Create.*highlights.*first/i);
  });

  test('should show top banner overlay', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Check initial overlays count
    await expect(page.locator('#activeOverlays')).toContainText('0');

    // Click top banner button
    await page.locator('button:has-text("Top Banner")').click();
    await page.waitForTimeout(2000);

    // Active overlays should increase
    await expect(page.locator('#activeOverlays')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Top Banner');

    // Wait for overlay to auto-hide (duration: 5000)
    await page.waitForTimeout(6000);

    // Overlay should be gone
    await expect(page.locator('#activeOverlays')).toContainText('0');
  });

  test('should show bottom banner overlay', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click bottom banner button
    await page.locator('button:has-text("Bottom Banner")').click();
    await page.waitForTimeout(2000);

    // Active overlays should be 1
    await expect(page.locator('#activeOverlays')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Bottom Banner');
  });

  test('should show centered banner overlay', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click centered banner button
    await page.locator('button:has-text("Centered Banner")').click();
    await page.waitForTimeout(2000);

    // Active overlays should be 1
    await expect(page.locator('#activeOverlays')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Centered Banner');
  });

  test('should show background overlay', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click background overlay button
    await page.locator('button:has-text("With Background Overlay")').click();
    await page.waitForTimeout(2000);

    // Active overlays should be 1
    await expect(page.locator('#activeOverlays')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Background Overlay');
  });

  test('should show closeable message overlay', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click closeable message button
    await page.locator('button:has-text("Closeable Message")').click();
    await page.waitForTimeout(2000);

    // Active overlays should be 1
    await expect(page.locator('#activeOverlays')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Closeable Message');

    // This overlay should be persistent (not auto-hide)
    await page.waitForTimeout(3000);
    await expect(page.locator('#activeOverlays')).toContainText('1');
  });

  test('should show progress overlays', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click center progress button
    await page.locator('button:has-text("Center Progress")').click();
    await page.waitForTimeout(2000);

    // Active overlays should be 1
    await expect(page.locator('#activeOverlays')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Center Progress');

    // Wait for progress to complete (simulates 100% in about 10 seconds)
    await page.waitForTimeout(12000);

    // Should eventually clear itself after completion
    await expect(page.locator('#activeOverlays')).toContainText('0');
  });

  test('should clear all overlays', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Create some overlays first
    await page.locator('button:has-text("Top Banner")').click();
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Closeable Message")').click();
    await page.waitForTimeout(1000);

    // Should have 2 overlays
    await expect(page.locator('#activeOverlays')).toContainText('2');

    // Clear all overlays
    await page.locator('button:has-text("Clear All Overlays")').click();
    await page.waitForTimeout(1000);

    // Should have 0 overlays
    await expect(page.locator('#activeOverlays')).toContainText('0');

    // Console should show clearing activity
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Clearing.*overlays/i);
  });

  test('should handle scroll controls', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Test scroll to top
    await page.locator('button:has-text("Scroll to Top")').click();
    await page.waitForTimeout(2000);

    // Console should show scroll activity
    let consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Scrolling.*top/i);

    // Test scroll to bottom
    await page.locator('button:has-text("Scroll to Bottom")').click();
    await page.waitForTimeout(2000);

    // Console should show scroll activity
    consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Scrolling.*bottom/i);
  });

  test('should handle scroll and highlight demo', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Test scroll and highlight
    await page.locator('button:has-text("Scroll + Highlight Demo")').click();
    await page.waitForTimeout(3000);

    // Console should show scroll and highlight activity
    const consoleOutput = await page.locator('#console').textContent();
    expect(consoleOutput).toMatch(/Scrolling.*API.*Reference.*highlighting/i);

    // Should create a highlight
    await expect(page.locator('#activeHighlights')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Scroll + Highlight');
  });

  test('should display API examples correctly', async ({ page }) => {
    // Check that code blocks are present and contain expected content
    const codeBlocks = page.locator('code');
    const codeCount = await codeBlocks.count();
    expect(codeCount).toBeGreaterThan(0);

    // Check for specific API examples
    const allCodeText = await page.locator('code').allTextContents();
    const combinedCode = allCodeText.join(' ');

    expect(combinedCode).toContain('window.agentlet.utils.PageHighlighter');
    expect(combinedCode).toContain('.showOverlay(');
    expect(combinedCode).toContain('.highlight(');
    expect(combinedCode).toContain('position:');
    expect(combinedCode).toContain('type:');
    expect(combinedCode).toContain('message:');
  });

  test('should handle clear console functionality', async ({ page }) => {
    // Initialize to get some output
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Create highlighting activity to generate output
    await page.locator('button:has-text("Border Highlight")').click();
    await page.waitForTimeout(1000);

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

  test('should handle trying to use highlighting without initialization', async ({ page }) => {
    // Try to use highlighting without initializing first
    await page.locator('button:has-text("Border Highlight")').click();
    await page.waitForTimeout(1000);

    // Status should show error about initialization
    const status = page.locator('#status');
    await expect(status).toContainText(/initialize.*Agentlet.*first|Please.*initialize/i);

    // No highlights should be created
    await expect(page.locator('#activeHighlights')).toContainText('0');
  });

  test('should update statistics periodically', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Create some highlights and overlays
    await page.locator('button:has-text("Border Highlight")').click();
    await page.waitForTimeout(1000);
    await page.locator('button:has-text("Top Banner")').click();
    await page.waitForTimeout(1000);

    // Statistics should reflect the current state
    await expect(page.locator('#activeHighlights')).toContainText('1');
    await expect(page.locator('#activeOverlays')).toContainText('1');

    // Wait for periodic update interval (the code updates every 2 seconds)
    await page.waitForTimeout(3000);

    // Statistics should still be accurate
    await expect(page.locator('#highlighterAvailable')).toContainText('Yes');
  });

});