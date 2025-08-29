/**
 * Base class for Agentlet Core example tests
 * Provides common utilities and setup for testing examples
 */

import { expect } from '@playwright/test';

export class AgentletTestBase {
  constructor(page) {
    this.page = page;
  }

  /**
   * Navigate to an example page
   * @param {string} examplePath - Path relative to examples/ (e.g., '01-basics/hello-world')
   */
  async navigateToExample(examplePath) {
    const fullPath = `/examples/${examplePath}/index.html`;
    await this.page.goto(fullPath);
    
    // Wait for the page to load
    await this.page.waitForLoadState('networkidle');
    
    // Verify basic page structure
    await expect(this.page.locator('h1')).toBeVisible();
    await expect(this.page.locator('.container')).toBeVisible();
  }

  /**
   * Click the "Initialize Agentlet" button and wait for completion
   */
  async initializeAgentlet() {
    // Click the initialize button
    await this.page.click('text=🚀 Initialize Agentlet');
    
    // Wait for initialization to complete
    await this.page.waitForSelector('#status.success', { timeout: 15000 });
    
    // Verify Agentlet was initialized
    const statusText = await this.page.locator('#status').textContent();
    expect(statusText).toContain('successfully');
  }

  /**
   * Wait for Agentlet Core to be available in the window
   */
  async waitForAgentletCore() {
    await this.page.waitForFunction(
      () => window.agentlet && window.agentlet.initialized,
      { timeout: 15000 }
    );
  }

  /**
   * Check if the Agentlet panel is visible
   */
  async isPanelVisible() {
    try {
      const panel = await this.page.locator('#agentlet-container');
      return await panel.isVisible();
    } catch {
      return false;
    }
  }

  /**
   * Check if the Agentlet panel is minimized
   */
  async isPanelMinimized() {
    return await this.page.evaluate(() => {
      return window.agentlet && window.agentlet.isMinimized;
    });
  }

  /**
   * Get console output from the example page
   */
  async getConsoleOutput() {
    const outputElement = this.page.locator('#output');
    if (await outputElement.isVisible()) {
      return await outputElement.textContent();
    }
    return '';
  }

  /**
   * Wait for a specific message to appear in the console output
   * @param {string} message - Message to wait for
   * @param {number} timeout - Timeout in milliseconds
   */
  async waitForConsoleMessage(message, timeout = 10000) {
    await this.page.waitForFunction(
      (expectedMessage) => {
        const output = document.getElementById('output');
        return output && output.textContent.includes(expectedMessage);
      },
      message,
      { timeout }
    );
  }

  /**
   * Get the current status message
   */
  async getStatusMessage() {
    return await this.page.locator('#status').textContent();
  }

  /**
   * Wait for a specific status message
   * @param {string} message - Message to wait for (partial match)
   * @param {number} timeout - Timeout in milliseconds
   */
  async waitForStatusMessage(message, timeout = 10000) {
    await this.page.waitForFunction(
      (expectedMessage) => {
        const status = document.getElementById('status');
        return status && status.textContent.includes(expectedMessage);
      },
      message,
      { timeout }
    );
  }

  /**
   * Check if an element has a specific CSS class
   * @param {string} selector - Element selector
   * @param {string} className - CSS class name
   */
  async hasClass(selector, className) {
    return await this.page.evaluate(
      ([sel, cls]) => {
        const element = document.querySelector(sel);
        return element && element.classList.contains(cls);
      },
      [selector, className]
    );
  }

  /**
   * Get the value of a window variable
   * @param {string} variablePath - Path to the variable (e.g., 'window.agentlet.version')
   */
  async getWindowVariable(variablePath) {
    return await this.page.evaluate((path) => {
      const parts = path.split('.');
      let current = window;
      for (const part of parts) {
        if (part === 'window') continue;
        current = current[part];
        if (current === undefined) return undefined;
      }
      return current;
    }, variablePath);
  }

  /**
   * Execute a function in the browser context
   * @param {Function} fn - Function to execute
   * @param {...any} args - Arguments to pass to the function
   */
  async executeBrowserFunction(fn, ...args) {
    return await this.page.evaluate(fn, ...args);
  }

  /**
   * Take a screenshot with a descriptive name
   * @param {string} name - Screenshot name
   */
  async takeScreenshot(name) {
    await this.page.screenshot({ 
      path: `test-results/screenshots/${name}.png`,
      fullPage: true 
    });
  }

  /**
   * Log console messages from the browser
   */
  setupConsoleLogging() {
    this.page.on('console', msg => {
      console.log(`Browser ${msg.type()}: ${msg.text()}`);
    });
    
    this.page.on('pageerror', err => {
      console.error(`Browser error: ${err.message}`);
    });
  }
}