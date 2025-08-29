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

test.describe('Agentlet panel', () => {
  test('opens panel when clicking on the demo link', async ({ page }) => {
    await initializeAgentlet(page);
    
    // Validate that the panel is visible
    const panelVisible = await page.isVisible('#agentlet-container');
    expect(panelVisible).toBe(true);
    
    // Validate panel contains expected content
    const panelContent = await page.textContent('#agentlet-container');
    expect(panelContent).toBeTruthy();
  });

  test('opens module help when clicking on the help button', async ({ page}) => {
    // Set up console message interception
    const consoleMessages = [];
    page.on('console', message => {
      consoleMessages.push(message.text());
    });

    await initializeAgentlet(page);

    const helpButtonSelector = '#agentlet-actions > button[title="Help"]';
    await page.waitForSelector(helpButtonSelector, { timeout: 5000 });
    
    // Click help button
    await page.click(helpButtonSelector);

    // Wait for help dialog to appear
    await page.waitForSelector('.agentlet-dialog-overlay', { 
      timeout: 5000,
      state: 'visible'
    });

    // Verify help function was called by checking console messages
    const helpRequestedMessage = consoleMessages.find(msg => msg.includes('❓ Help requested'));
    expect(helpRequestedMessage).toBeTruthy();

    // Verify dialog title contains "Help"
    const dialogTitle = await page.textContent('.agentlet-dialog-overlay .agentlet-info-header');
    expect(dialogTitle).toContain('Help');
    
    // Close the dialog
    const dialogOverlayButtons = page.locator('.agentlet-dialog-overlay .agentlet-info-buttons');
    await dialogOverlayButtons.getByRole('button', { name: 'OK' }).click();

    await page.waitForSelector('.agentlet-dialog-overlay', {
      timeout: 5000,
      state: 'detached'
    });
  });

  test('panel minimize and maximize with toggle button', async ({ page }) => {
    await initializeAgentlet(page);

    // Verify toggle button exists and is visible
    await page.waitForSelector('#agentlet-toggle', { timeout: 5000 });
    const toggleExists = await page.isVisible('#agentlet-toggle');
    expect(toggleExists).toBe(true);

    // Check initial state - panel should be maximized
    let isMinimized = await page.evaluate(() => window.agentlet?.isMinimized);
    expect(isMinimized).toBe(false);

    // Click toggle button to minimize
    await page.click('#agentlet-toggle');

    // Wait for minimize animation and check state
    await page.waitForTimeout(300); // Allow for CSS transition
    isMinimized = await page.evaluate(() => window.agentlet?.isMinimized);
    expect(isMinimized).toBe(true);

    // Verify panel is visually minimized by checking transform
    const transform = await page.evaluate(() => {
      const panel = document.getElementById('agentlet-container');
      const computedTransform = getComputedStyle(panel).transform;
      // Check if it's translated (either translateX or matrix format)
      return computedTransform !== 'none' && computedTransform !== 'matrix(1, 0, 0, 1, 0, 0)';
    });
    expect(transform).toBe(true);

    // Click toggle button to maximize
    await page.click('#agentlet-toggle');

    // Wait for maximize animation and check state
    await page.waitForTimeout(300); // Allow for CSS transition
    isMinimized = await page.evaluate(() => window.agentlet?.isMinimized);
    expect(isMinimized).toBe(false);
  });

  test('panel emits events when minimized and maximized via API', async ({ page }) => {
    await initializeAgentlet(page);

    // Set up event listeners to capture emitted events
    await page.evaluate(() => {
      window.eventsReceived = [];
      window.agentlet.eventBus.on('ui:minimized', () => {
        window.eventsReceived.push('ui:minimized');
      });
      window.agentlet.eventBus.on('ui:maximized', () => {
        window.eventsReceived.push('ui:maximized');
      });
    });

    // Use API to minimize
    await page.evaluate(() => window.agentlet.minimize());
    await page.waitForTimeout(300);

    // Check minimize event was emitted
    let events = await page.evaluate(() => window.eventsReceived);
    expect(events).toContain('ui:minimized');

    // Verify panel is actually minimized
    const isMinimized = await page.evaluate(() => window.agentlet.isMinimized);
    expect(isMinimized).toBe(true);

    // Use API to maximize
    await page.evaluate(() => window.agentlet.maximize());
    await page.waitForTimeout(300);

    // Check maximize event was emitted
    events = await page.evaluate(() => window.eventsReceived);
    expect(events).toContain('ui:maximized');
    
    // Verify panel is actually maximized
    const isMaximized = await page.evaluate(() => !window.agentlet.isMinimized);
    expect(isMaximized).toBe(true);
    
    // Verify both events were emitted in correct order
    expect(events).toEqual(['ui:minimized', 'ui:maximized']);
  });

});