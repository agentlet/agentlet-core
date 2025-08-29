import { test, expect } from '@playwright/test';

async function initializeAgentlet(page) {
  await page.goto('/');
  
  // Wait for the bookmarklet link to be available
  await page.waitForSelector('a.bookmarklet-link', { timeout: 5000 });
  
  // Click the bookmarklet link
  await page.click('a.bookmarklet-link');
  
  // Wait for the panel to open
  await page.waitForSelector('#agentlet-container', { 
    timeout: 5000,
    state: 'visible'
  });
}

test.describe('Module loading', () => {
  test('module loads successfully and creates global instance', async ({ page }) => {
    await initializeAgentlet(page);

    // Wait for module to be loaded and available
    await page.waitForTimeout(1000);

    // Check that the module instance is available globally
    const moduleAvailable = await page.evaluate(() => {
      return typeof window.{{camelCase name}}AgentletModule !== 'undefined';
    });
    expect(moduleAvailable).toBe(true);

    // Check that the module class extends BaseModule
    const isBaseModule = await page.evaluate(() => {
      return window.{{camelCase name}}AgentletModule instanceof window.agentlet.BaseModule;
    });
    expect(isBaseModule).toBe(true);

    // Check that the module has expected properties
    const moduleProperties = await page.evaluate(() => {
      const module = window.{{camelCase name}}AgentletModule;
      return {
        name: module.name,
        description: module.description,
        version: module.version,
        hasGetContent: typeof module.getContent === 'function',
        hasGetStyles: typeof module.getStyles === 'function',
        hasShowHelp: typeof module.showHelp === 'function'
      };
    });

    expect(moduleProperties.name).toBe('{{kebabCase name}}');
    expect(moduleProperties.description).toBe('A sample agentlet for {{name}}');
    expect(moduleProperties.version).toBe('1.0.0');
    expect(moduleProperties.hasGetContent).toBe(true);
    expect(moduleProperties.hasGetStyles).toBe(true);
    expect(moduleProperties.hasShowHelp).toBe(true);
  });

  test('module renders content correctly in the panel', async ({ page }) => {
    await initializeAgentlet(page);

    // Wait for module content to be rendered
    await page.waitForTimeout(1000);

    // Check that module content is visible in the panel
    const moduleContentVisible = await page.isVisible('.agentlet-{{kebabCase name}}-content');
    expect(moduleContentVisible).toBe(true);

    // Check that the welcome heading is present
    const welcomeHeading = await page.textContent('.agentlet-{{kebabCase name}}-content h2');
    expect(welcomeHeading).toBe('Welcome to {{titleCase name}}!');

    // Check that action buttons are present
    const actionButtons = await page.locator('.agentlet-{{kebabCase name}}-content button').count();
    expect(actionButtons).toBeGreaterThan(0);

    // Verify specific buttons exist
    const inputButtonExists = await page.isVisible('button#agentlet-btn-input');
    const infoButtonExists = await page.isVisible('button#agentlet-btn-info');
    const bubbleButtonExists = await page.isVisible('button#agentlet-btn-bubble');

    expect(inputButtonExists).toBe(true);
    expect(infoButtonExists).toBe(true);
    expect(bubbleButtonExists).toBe(true);
  });

  test('module action function is available and functional', async ({ page }) => {
    await initializeAgentlet(page);

    // Wait for module to be fully loaded
    await page.waitForTimeout(1000);

    // Check that the global action function is available
    const actionFunctionAvailable = await page.evaluate(() => {
      return typeof window.{{camelCase name}}AgentletAction === 'function';
    });
    expect(actionFunctionAvailable).toBe(true);

    // Test that clicking a button calls the action function
    const consoleMessages = [];
    page.on('console', message => {
      consoleMessages.push(message.text());
    });

    // Click the info button to trigger an action
    await page.click('button#agentlet-btn-info');

    // Wait for the action to process
    await page.waitForTimeout(500);

    // Verify the action function was called
    const infoActionMessage = consoleMessages.find(msg => 
      msg.includes('📋 Opening info dialog...')
    );
    expect(infoActionMessage).toBeTruthy();

    // Verify dialog actually appears
    await page.waitForSelector('.agentlet-dialog-overlay', { 
      timeout: 5000,
      state: 'visible'
    });

    const dialogVisible = await page.isVisible('.agentlet-dialog-overlay');
    expect(dialogVisible).toBe(true);

    // Close the dialog
    await page.keyboard.press('Escape');
    await page.waitForSelector('.agentlet-dialog-overlay', { 
      timeout: 5000,
      state: 'detached'
    });
  });

  test('module lifecycle hooks are properly called', async ({ page }) => {
    // Set up console message interception before initialization
    const consoleMessages = [];
    page.on('console', message => {
      consoleMessages.push(message.text());
    });

    await initializeAgentlet(page);

    // Wait for initialization to complete
    await page.waitForTimeout(2000);

    // Check that initModule was called
    const initMessage = consoleMessages.find(msg => 
      msg.includes('Initializing {{name}} agentlet')
    );
    expect(initMessage).toBeTruthy();

    // Check that activateModule was called
    const activateMessage = consoleMessages.find(msg => 
      msg.includes('🔄 Module activated: {{name}}')
    );
    expect(activateMessage).toBeTruthy();

    // Verify jQuery was refreshed during initialization
    const jqueryRefreshConfirmation = await page.evaluate(() => {
      return window.agentlet.$ !== null && typeof window.agentlet.$ === 'function';
    });
    expect(jqueryRefreshConfirmation).toBe(true);
  });

  test('module styles are applied correctly', async ({ page }) => {
    await initializeAgentlet(page);

    // Wait for module to be loaded and styles applied
    await page.waitForTimeout(1000);

    // Check that module-specific styles are applied
    const buttonStyles = await page.evaluate(() => {
      const button = document.querySelector('.agentlet-{{kebabCase name}}-content button');
      if (!button) return null;
      
      const styles = getComputedStyle(button);
      return {
        padding: styles.padding,
        margin: styles.margin
      };
    });

    expect(buttonStyles).not.toBeNull();
    expect(buttonStyles.padding).toBeTruthy();
    expect(buttonStyles.margin).toBeTruthy();

    // Check heading font size
    const headingStyles = await page.evaluate(() => {
      const heading = document.querySelector('.agentlet-{{kebabCase name}}-content h2');
      if (!heading) return null;
      
      const styles = getComputedStyle(heading);
      return {
        fontSize: styles.fontSize
      };
    });

    expect(headingStyles).not.toBeNull();
    expect(headingStyles.fontSize).toBe('18px');
  });

  test('module help function works correctly', async ({ page }) => {
    await initializeAgentlet(page);

    // Wait for module to be loaded
    await page.waitForTimeout(1000);

    // Test the help function directly
    const helpResult = await page.evaluate(() => {
      if (window.{{camelCase name}}AgentletModule && typeof window.{{camelCase name}}AgentletModule.showHelp === 'function') {
        window.{{camelCase name}}AgentletModule.showHelp();
        return true;
      }
      return false;
    });

    expect(helpResult).toBe(true);

    // Wait for help dialog to appear
    await page.waitForSelector('.agentlet-dialog-overlay', { 
      timeout: 5000,
      state: 'visible'
    });

    // Verify dialog content contains help information
    const dialogTitle = await page.textContent('.agentlet-dialog-overlay .agentlet-info-header');
    expect(dialogTitle).toContain('Help for {{titleCase name}}');

    const dialogContent = await page.textContent('.agentlet-dialog-overlay');
    expect(dialogContent).toContain('Version: 1.0.0');

    // Close the help dialog
    await page.keyboard.press('Escape');
    await page.waitForSelector('.agentlet-dialog-overlay', { 
      timeout: 5000,
      state: 'detached'
    });
  });
});