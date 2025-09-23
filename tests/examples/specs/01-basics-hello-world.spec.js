/**
 * Playwright tests for 01-basics/hello-world example
 * Tests basic Agentlet Core initialization and panel functionality
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Hello World Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();
    
    // Navigate to the hello-world example
    await agentletTest.navigateToExample('basics/hello-world.html');
  });

  test('should load the hello-world page correctly', async ({ page }) => {
    // Check page title
    await expect(page).toHaveTitle(/Hello World - Agentlet Core Example/);
    
    // Check main heading
    await expect(page.locator('h1')).toContainText('Hello World - Agentlet Core');
    
    // Check navigation breadcrumb
    await expect(page.locator('.nav-breadcrumb')).toContainText('Examples → 01-basics → hello-world');
    
    // Check that key sections are present
    await expect(page.locator('text=What this example shows:')).toBeVisible();
    await expect(page.locator('text=Simple Integration Code:')).toBeVisible();
    
    // Check that controls are present
    await expect(page.locator('text=🚀 Initialize Agentlet')).toBeVisible();
    await expect(page.locator('text=📊 Check Status')).toBeVisible();
    await expect(page.locator('text=🗑️ Clear')).toBeVisible();
  });

  test('should display code examples with syntax highlighting', async ({ page }) => {
    // Check that code blocks are present
    const codeBlocks = page.locator('.code-block');
    await expect(codeBlocks).toHaveCount(1);
    
    // Check that syntax highlighting is applied
    const javaScriptCodeBlocks = page.locator('code.language-javascript');
    await expect(javaScriptCodeBlocks).toHaveCount(3);
  });

  test('should initialize Agentlet Core successfully', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    
    // Wait for Agentlet to be fully loaded
    await agentletTest.waitForAgentletCore();
    
    // Check that status shows success
    const status = await agentletTest.getStatusMessage();
    expect(status).toContain('successfully');
    
    // Check that console output shows initialization steps
    await agentletTest.waitForConsoleMessage('Agentlet Core initialized successfully');
    
    const output = await agentletTest.getConsoleOutput();
    expect(output).toContain('Starting Agentlet Core initialization...');
    expect(output).toContain('Agentlet Core script loaded successfully');
    expect(output).toContain('Creating AgentletCore instance...');
    expect(output).toContain('Starting initialization...');
    expect(output).toContain('Agentlet Core initialized successfully');
  });

  test('should create and display the Agentlet panel', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();
    
    // Check that the panel is visible
    const isPanelVisible = await agentletTest.isPanelVisible();
    expect(isPanelVisible).toBe(true);
    
    // Check panel structure
    await expect(page.locator('#agentlet-container')).toBeVisible();
    await expect(page.locator('.agentlet-header')).toBeVisible();
    await expect(page.locator('.agentlet-content')).toBeVisible();
    
    // Check that panel is not minimized initially
    const isMinimized = await agentletTest.isPanelMinimized();
    expect(isMinimized).toBe(false);
  });

  test('should make window.agentlet available with expected APIs', async ({ page }) => {
    // Initialize Agentlet
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();
    
    // Check that window.agentlet is available
    const agentletExists = await agentletTest.getWindowVariable('window.agentlet');
    expect(agentletExists).toBeTruthy();
    
    // Check that key APIs are available
    const hasFormsAPI = await page.evaluate(() => {
      return window.agentlet && window.agentlet.forms && typeof window.agentlet.forms.extract === 'function';
    });
    expect(hasFormsAPI).toBe(true);
    
    const hasTablesAPI = await page.evaluate(() => {
      return window.agentlet && window.agentlet.tables && typeof window.agentlet.tables.extract === 'function';
    });
    expect(hasTablesAPI).toBe(true);
    
    const hasUtilsAPI = await page.evaluate(() => {
      return (
        window.agentlet !== null && typeof window.agentlet !== 'undefined' &&
        window.agentlet.utils !== null && typeof window.agentlet.utils !== 'undefined' &&
        window.agentlet.utils.Dialog !== null && typeof window.agentlet.utils.Dialog !== 'undefined'
      );
    });
    expect(hasUtilsAPI).toBe(true);
  });


  test('should handle Clear Output button correctly', async ({ page }) => {
    // Initialize to get some output
    await agentletTest.initializeAgentlet();
    
    // Verify there is output
    let output = await agentletTest.getConsoleOutput();
    expect(output.length).toBeGreaterThan(0);
    
    // Clear output
    await page.click('text=🗑️ Clear');
    
    // Verify output is cleared
    output = await agentletTest.getConsoleOutput();
    expect(output.trim()).toBe('');
    
    // Verify status message
    const status = await agentletTest.getStatusMessage();
    expect(status).toContain('Output cleared');
  });

  test('should handle re-initialization gracefully', async ({ page }) => {
    // Initialize once
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();
    
    // Initialize again - should handle gracefully
    await page.click('text=🚀 Initialize Agentlet');
    
    // Should still work and show success
    await agentletTest.waitForStatusMessage('successfully');
    
    // Panel should still be visible
    const isPanelVisible = await agentletTest.isPanelVisible();
    expect(isPanelVisible).toBe(true);
  });

  test('should show proper error handling for missing files', async ({ page }) => {
    // Mock a scenario where the agentlet-core.js file fails to load
    await page.route('**/dist/agentlet-core.js*', route => {
      route.abort('failed');
    });
    
    // Try to initialize
    await page.click('text=🚀 Initialize Agentlet');
    
    // Should show error
    await agentletTest.waitForStatusMessage('Failed to load Agentlet Core', 5000);
    
    const status = await agentletTest.getStatusMessage();
    expect(status).toContain('Failed to load Agentlet Core');
  });

});