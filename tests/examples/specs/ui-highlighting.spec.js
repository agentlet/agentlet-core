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
    await expect(page.locator('#status')).toContainText('PageHighlighter is ready for use!');

    // Console should show status information
    await agentletTest.expectTextToMatch(/PageHighlighter.*available|checking.*status/i);

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
    await expect(page.locator('#lastHighlightType')).toContainText('Border');

    // Active highlights should increase
    await expect(page.locator('#activeHighlights')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Border');

    // Console should show creation activity
    await agentletTest.expectTextToMatch(/Border.*highlight.*created/i);
  });

  test('should create arrow highlight', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click arrow highlight button
    await page.locator('button:has-text("Arrow Pointer")').click();
    await expect(page.locator('#lastHighlightType')).toContainText('Arrow');

    // Active highlights should be 1
    await expect(page.locator('#activeHighlights')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Arrow');

    // Console should show creation activity
    await agentletTest.expectTextToMatch(/Arrow.*highlight.*created/i);
  });

  test('should create sticker highlight', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click sticker highlight button
    await page.locator('button:has-text("Sticker Badge")').click();
    await expect(page.locator('#lastHighlightType')).toContainText('Sticker');

    // Active highlights should be 1
    await expect(page.locator('#activeHighlights')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Sticker');

    // Console should show creation activity
    await agentletTest.expectTextToMatch(/Sticker.*highlight.*created/i);
  });

  test('should create clickable highlight', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click clickable highlight button
    await page.locator('button:has-text("Clickable Highlight")').click();
    await expect(page.locator('#lastHighlightType')).toContainText('Clickable');

    // Active highlights should be 1
    await expect(page.locator('#activeHighlights')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Clickable');

    // The clickable area should be highlighted - we can test by looking for highlight elements
    // or check console output for creation
    await agentletTest.expectTextToMatch(/Clickable.*highlight.*created/i);
  });

  test('should clear all highlights', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Create some highlights first
    await page.locator('button:has-text("Border Highlight")').click();
    await expect(page.locator('#lastHighlightType')).toContainText('Border');
    await page.locator('button:has-text("Arrow Pointer")').click();
    await expect(page.locator('#lastHighlightType')).toContainText('Arrow');

    // Should have 2 highlights
    await expect(page.locator('#activeHighlights')).toContainText('2');

    // Clear all highlights
    await page.locator('button:has-text("Clear All Highlights")').click();
    await expect(page.locator('#console')).toContainText('Clearing');

    // Should have 0 highlights
    await expect(page.locator('#activeHighlights')).toContainText('0');

    // Console should show clearing activity
    await agentletTest.expectTextToMatch(/Clearing.*highlights/i);
  });

  test('should update existing highlights', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Create a highlight first
    await page.locator('button:has-text("Border Highlight")').click();
    await expect(page.locator('#lastHighlightType')).toContainText('Border');

    // Should have 1 highlight
    await expect(page.locator('#activeHighlights')).toContainText('1');

    // Update the highlight
    await page.locator('button:has-text("Update Highlight")').click();
    await expect(page.locator('#lastHighlightType')).toContainText('Updated');

    // Should still have 1 highlight (updated, not new)
    await expect(page.locator('#activeHighlights')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Updated');

    // Console should show update activity
    await agentletTest.expectTextToMatch(/highlight.*updated.*message/i);
  });

  test('should handle update highlight with no existing highlights', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Try to update with no highlights
    await page.locator('button:has-text("Update Highlight")').click();
    await expect(page.locator('#console')).toContainText('No highlights');

    // Console should show warning about no highlights
    await agentletTest.expectTextToMatch(/No highlights.*update.*Create.*highlights.*first/i);
  });

  test('should show top banner overlay', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Check initial overlays count
    await expect(page.locator('#activeOverlays')).toContainText('0');

    // Click top banner button
    await page.locator('button:has-text("Top Banner")').click();
    await expect(page.locator('#lastHighlightType')).toContainText('Top Banner');

    // Active overlays should increase
    await expect(page.locator('#activeOverlays')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Top Banner');

    // The banner auto-hides after 5000 ms (the stats refresh every 2 s), so
    // wait for the overlay count to drop instead of sleeping
    await expect(page.locator('#activeOverlays')).toContainText('0', { timeout: 10000 });

    // Overlay should be gone
    await expect(page.locator('#activeOverlays')).toContainText('0');
  });

  test('should show bottom banner overlay', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click bottom banner button
    await page.locator('button:has-text("Bottom Banner")').click();
    await expect(page.locator('#lastHighlightType')).toContainText('Bottom Banner');

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
    await expect(page.locator('#lastHighlightType')).toContainText('Centered Banner');

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
    await expect(page.locator('#lastHighlightType')).toContainText('Background Overlay');

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
    await expect(page.locator('#lastHighlightType')).toContainText('Closeable Message');

    // Active overlays should be 1
    await expect(page.locator('#activeOverlays')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Closeable Message');

    // This overlay should be persistent (not auto-hide). Fixed wait kept on
    // purpose: the behavior under test is the absence of a time-based close,
    // so there is no condition to wait for.
    await page.waitForTimeout(3000);
    await expect(page.locator('#activeOverlays')).toContainText('1');
  });

  test('should show progress overlays', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click center progress button
    await page.locator('button:has-text("Center Progress")').click();
    await expect(page.locator('#lastHighlightType')).toContainText('Center Progress');

    // Active overlays should be 1
    await expect(page.locator('#activeOverlays')).toContainText('1');

    // Last highlight type should be updated
    await expect(page.locator('#lastHighlightType')).toContainText('Center Progress');

    // The simulated progress reaches 100% in about 10 seconds and then clears
    // itself: wait for the overlay count to drop
    await expect(page.locator('#activeOverlays')).toContainText('0', { timeout: 20000 });

    // Should eventually clear itself after completion
    await expect(page.locator('#activeOverlays')).toContainText('0');
  });

  test('should clear all overlays', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Create some overlays first
    await page.locator('button:has-text("Top Banner")').click();
    await expect(page.locator('#lastHighlightType')).toContainText('Top Banner');
    await page.locator('button:has-text("Closeable Message")').click();
    await expect(page.locator('#lastHighlightType')).toContainText('Closeable Message');

    // Should have 2 overlays
    await expect(page.locator('#activeOverlays')).toContainText('2');

    // Clear all overlays
    await page.locator('button:has-text("Clear All Overlays")').click();
    await expect(page.locator('#console')).toContainText('Clearing');

    // Should have 0 overlays
    await expect(page.locator('#activeOverlays')).toContainText('0');

    // Console should show clearing activity
    await agentletTest.expectTextToMatch(/Clearing.*overlays/i);
  });

  test('should handle scroll controls', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Test scroll to top
    await page.locator('button:has-text("Scroll to Top")').click();

    // Console should show scroll activity
    await agentletTest.expectTextToMatch(/Scrolling.*top/i);

    // Test scroll to bottom
    await page.locator('button:has-text("Scroll to Bottom")').click();

    // Console should show scroll activity
    await agentletTest.expectTextToMatch(/Scrolling.*bottom/i);
  });

  test('should handle scroll and highlight demo', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Test scroll and highlight
    await page.locator('button:has-text("Scroll + Highlight Demo")').click();

    // Console should show scroll and highlight activity
    await agentletTest.expectTextToMatch(/Scrolling.*API.*Reference.*highlighting/i);

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
    await expect(page.locator('#lastHighlightType')).toContainText('Border');

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

  test('should handle trying to use highlighting without initialization', async ({ page }) => {
    // Try to use highlighting without initializing first
    await page.locator('button:has-text("Border Highlight")').click();

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
    await expect(page.locator('#lastHighlightType')).toContainText('Border');
    await page.locator('button:has-text("Top Banner")').click();
    await expect(page.locator('#lastHighlightType')).toContainText('Top Banner');

    // Statistics should reflect the current state
    await expect(page.locator('#activeHighlights')).toContainText('1');
    await expect(page.locator('#activeOverlays')).toContainText('1');

    // The example refreshes its statistics every 2 seconds: overwrite a value
    // and wait for the next refresh to put it back
    await page.evaluate(() => { document.getElementById('highlighterAvailable').textContent = 'stale'; });

    // Statistics should still be accurate
    await expect(page.locator('#highlighterAvailable')).toContainText('Yes');
  });

});