/**
 * Playwright tests for basics/panel-basics example
 * Tests panel operations, resizing, and event bus functionality
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Panel Basics Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();

    // Navigate to the panel-basics example
    await agentletTest.navigateToExample('basics/panel-basics.html');
  });

  test('should load the panel-basics page correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Panel Basics - Agentlet Core Example/);

    // Check main heading
    await expect(page.locator('h1')).toContainText('Panel basics');

    // Check that key sections are present
    await expect(page.locator('text=What this example shows:')).toBeVisible();
    await expect(page.locator('text=Panel controls')).toBeVisible();
    await expect(page.locator('text=Panel resizing')).toBeVisible();
    await expect(page.locator('text=Event bus demo')).toBeVisible();

    // Check that all control buttons are present
    await expect(page.locator('button:has-text("Initialize agentlet")')).toBeVisible();
    await expect(page.locator('button:has-text("Minimize panel")')).toBeVisible();
    await expect(page.locator('button:has-text("Maximize panel")')).toBeVisible();
    await expect(page.locator('button:has-text("Toggle panel")')).toBeVisible();
    await expect(page.locator('button:has-text("Check panel state")')).toBeVisible();
  });

  test('should show panel sizing controls', async ({ page }) => {
    // Check that resizing buttons are present
    await expect(page.locator('button:has-text("Small (320px)")')).toBeVisible();
    await expect(page.locator('button:has-text("Medium (480px)")')).toBeVisible();
    await expect(page.locator('button:has-text("Large (640px)")')).toBeVisible();
    await expect(page.locator('button:has-text("Custom width")')).toBeVisible();
    await expect(page.locator('button:has-text("Check width")')).toBeVisible();
  });

  test('should show event bus controls', async ({ page }) => {
    // Check that event bus buttons are present
    await expect(page.locator('button:has-text("Setup event listeners")')).toBeVisible();
    await expect(page.locator('button:has-text("Trigger custom event")')).toBeVisible();
  });

  test('should initialize Agentlet and update panel state', async ({ page }) => {
    // Check initial panel state
    await expect(page.locator('text=Panel initialized: No')).toBeVisible();
    await expect(page.locator('text=Panel minimized: Unknown')).toBeVisible();

    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Wait for state to update
    await page.waitForTimeout(2000);

    // Check that panel is now initialized
    const panelStateSection = page.locator('.panel-state-section, #panelState');
    if (await panelStateSection.isVisible()) {
      // Panel state should show as initialized
      const panelState = await panelStateSection.textContent();
      expect(panelState).toMatch(/Panel initialized.*Yes|initialized.*true/i);
    }

    // Check that the agentlet panel is visible
    const isPanelVisible = await agentletTest.isPanelVisible();
    expect(isPanelVisible).toBe(true);
  });

  test('should handle panel minimize and maximize', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Test minimize button
    await page.locator('button:has-text("Minimize panel")').click();
    await page.waitForTimeout(1000);

    // Test maximize button
    await page.locator('button:has-text("Maximize panel")').click();
    await page.waitForTimeout(1000);

    // Test toggle button
    await page.locator('button:has-text("Toggle panel")').click();
    await page.waitForTimeout(1000);

    // Test check panel state button
    await page.locator('button:has-text("Check panel state")').click();
    await page.waitForTimeout(500);

    // Should update console output or stats
    const consoleOutput = await page.locator('.console-section').textContent();
    expect(consoleOutput.length).toBeGreaterThan(0);
  });

  test('should handle panel resizing controls', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Test different size buttons
    await page.locator('button:has-text("Small (320px)")').click();
    await page.waitForTimeout(500);

    await page.locator('button:has-text("Medium (480px)")').click();
    await page.waitForTimeout(500);

    await page.locator('button:has-text("Large (640px)")').click();
    await page.waitForTimeout(500);

    // Test custom width (might show a prompt)
    await page.locator('button:has-text("Custom width")').click();
    await page.waitForTimeout(500);

    // Test check width
    await page.locator('button:has-text("Check width")').click();
    await page.waitForTimeout(500);

    // Should update console output
    const consoleOutput = await page.locator('.console-section').textContent();
    expect(consoleOutput.length).toBeGreaterThan(0);
  });

  test('should handle event bus functionality', async ({ page }) => {
    // Initialize first
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Setup event listeners
    await page.locator('button:has-text("Setup event listeners")').click();
    await page.waitForTimeout(500);

    // Trigger custom event
    await page.locator('button:has-text("Trigger custom event")').click();
    await page.waitForTimeout(500);

    // Should update console output or event statistics
    const consoleOutput = await page.locator('.console-section').textContent();
    expect(consoleOutput.length).toBeGreaterThan(0);

    // Check if event listeners status updated
    const eventListenersStatus = await page.locator('text=Event listeners:').textContent();
    // Status might change from "Not setup" to something else
  });

  test('should display code examples correctly', async ({ page }) => {
    // Check that code blocks are present and contain expected content
    const codeBlocks = page.locator('code');
    const codeCount = await codeBlocks.count();
    expect(codeCount).toBeGreaterThan(0);

    // Check for specific API examples
    const allCodeText = await page.locator('code').allTextContents();
    const combinedCode = allCodeText.join(' ');

    expect(combinedCode).toContain('window.agentlet.minimize');
    expect(combinedCode).toContain('window.agentlet.maximize');
    expect(combinedCode).toContain('window.agentlet.ui.resizePanel');
    expect(combinedCode).toContain('window.agentlet.eventBus');
  });

  test('should update statistics correctly', async ({ page }) => {
    // Check initial statistics
    await expect(page.locator('text=Messages logged:')).toBeVisible();
    await expect(page.locator('text=Errors:')).toBeVisible();
    await expect(page.locator('text=Warnings:')).toBeVisible();

    // Initialize and perform some actions
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Click a few buttons to generate activity
    await page.locator('button:has-text("Check panel state")').click();
    await page.waitForTimeout(500);

    await page.locator('button:has-text("Setup event listeners")').click();
    await page.waitForTimeout(500);

    // Statistics should update
    const statisticsSection = await page.locator('.statistics-section, #statistics').textContent();
    // Messages logged count should increase
    expect(statisticsSection).toMatch(/Messages logged:\s*[1-9]/);
  });

  test('should handle clear console functionality', async ({ page }) => {
    // Initialize to get some output
    await agentletTest.initializeAgentlet();

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