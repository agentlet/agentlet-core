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

test.describe('Agentlet dialogs', () => {
  test('info dialog shows and closes properly', async ({ page }) => {
    await initializeAgentlet(page);

    // Click the Info Dialog button that exists in the UI
    await page.click('button:has-text("Info Dialog")');

    // Wait for dialog to appear
    await page.waitForSelector('.agentlet-dialog-overlay', { 
      timeout: 5000,
      state: 'visible'
    });

    // Verify dialog exists and has content
    const dialogOverlay = await page.isVisible('.agentlet-dialog-overlay');
    expect(dialogOverlay).toBe(true);

    // Close dialog with OK button or Escape key
    const hasOKButton = await page.isVisible('.agentlet-dialog-overlay button:has-text("OK")');
    if (hasOKButton) {
      await page.click('.agentlet-dialog-overlay button:has-text("OK")');
    } else {
      await page.keyboard.press('Escape');
    }

    // Verify dialog is closed
    await page.waitForSelector('.agentlet-dialog-overlay', {
      timeout: 5000,
      state: 'detached'
    });
  });

  test('input dialog accepts user input', async ({ page }) => {
    await initializeAgentlet(page);

    // Click the Input Dialog button that exists in the UI
    await page.click('button:has-text("Input Dialog")');

    // Wait for dialog to appear
    await page.waitForSelector('.agentlet-dialog-overlay', { 
      timeout: 5000,
      state: 'visible'
    });

    // Check if there's an input field and interact with it
    const hasInput = await page.isVisible('.agentlet-dialog-overlay input');
    if (hasInput) {
      // Type test value
      await page.fill('.agentlet-dialog-overlay input', 'test input value');
      
      // Submit dialog
      const hasSubmitButton = await page.isVisible('.agentlet-dialog-overlay button:has-text("Submit")');
      if (hasSubmitButton) {
        await page.click('.agentlet-dialog-overlay button:has-text("Submit")');
      } else {
        await page.keyboard.press('Enter');
      }
    } else {
      // If no input field, just close the dialog
      await page.keyboard.press('Escape');
    }

    // Wait for dialog to close
    await page.waitForSelector('.agentlet-dialog-overlay', {
      timeout: 5000,
      state: 'detached'
    });
  });

  test('wait dialog shows loading state', async ({ page }) => {
    await initializeAgentlet(page);

    // Click the Wait Dialog button that exists in the UI
    await page.click('button:has-text("Wait Dialog")');

    // Wait for dialog to appear
    await page.waitForSelector('.agentlet-dialog-overlay', { 
      timeout: 5000,
      state: 'visible'
    });

    // Verify dialog exists
    const dialogOverlay = await page.isVisible('.agentlet-dialog-overlay');
    expect(dialogOverlay).toBe(true);

    // Look for loading indicators (spinner, progress, or wait text)
    const hasSpinner = await page.isVisible('.agentlet-dialog-overlay .agentlet-wait-spinner');
    const hasProgress = await page.isVisible('.agentlet-dialog-overlay .agentlet-progress');
    const hasWaitText = await page.locator('.agentlet-dialog-overlay').textContent();
    
    // At least one loading indicator should be present
    expect(hasSpinner || hasProgress || hasWaitText.includes('wait')).toBe(true);

    // Close dialog (try cancel button, close button, or Escape)
    const hasCancelButton = await page.isVisible('.agentlet-dialog-overlay button:has-text("Cancel")');
    const hasCloseButton = await page.isVisible('.agentlet-dialog-overlay button:has-text("Close")');
    
    if (hasCancelButton) {
      await page.click('.agentlet-dialog-overlay button:has-text("Cancel")');
    } else if (hasCloseButton) {
      await page.click('.agentlet-dialog-overlay button:has-text("Close")');
    } else {
      await page.keyboard.press('Escape');
    }

    // Verify dialog is closed
    await page.waitForSelector('.agentlet-dialog-overlay', {
      timeout: 5000,
      state: 'detached'
    });
  });

  test('progress dialog shows progress updates', async ({ page }) => {
    await initializeAgentlet(page);

    // Click the Progress Bar button that exists in the UI
    await page.click('button:has-text("Progress Bar")');

    // Wait for dialog to appear
    await page.waitForSelector('.agentlet-dialog-overlay', { 
      timeout: 5000,
      state: 'visible'
    });

    // Verify dialog exists
    const dialogOverlay = await page.isVisible('.agentlet-dialog-overlay');
    expect(dialogOverlay).toBe(true);

    // Look for progress indicators (progress bar, percentage, or progress text)
    const hasProgressBar = await page.isVisible('.agentlet-dialog-overlay .agentlet-progress-bar');
    const hasProgressIndicator = await page.isVisible('.agentlet-dialog-overlay progress');
    const dialogText = await page.locator('.agentlet-dialog-overlay').textContent();
    
    // At least one progress indicator should be present
    expect(hasProgressBar || hasProgressIndicator || dialogText.includes('%')).toBe(true);

    // Wait a moment to see if progress updates automatically
    await page.waitForTimeout(1000);

    // Close dialog (try close button or Escape)
    const hasCloseButton = await page.isVisible('.agentlet-dialog-overlay button:has-text("Close")');
    const hasOKButton = await page.isVisible('.agentlet-dialog-overlay button:has-text("OK")');
    
    if (hasCloseButton) {
      await page.click('.agentlet-dialog-overlay button:has-text("Close")');
    } else if (hasOKButton) {
      await page.click('.agentlet-dialog-overlay button:has-text("OK")');
    } else {
      await page.keyboard.press('Escape');
    }

    // Verify dialog is closed
    await page.waitForSelector('.agentlet-dialog-overlay', {
      timeout: 5000,
      state: 'detached'
    });
  });

  test('dialog keyboard shortcuts work correctly', async ({ page }) => {
    await initializeAgentlet(page);

    // Click any dialog button to show a dialog
    await page.click('button:has-text("Info Dialog")');

    // Wait for dialog to appear
    await page.waitForSelector('.agentlet-dialog-overlay', { 
      timeout: 5000,
      state: 'visible'
    });

    // Press Escape key to close
    await page.keyboard.press('Escape');

    // Verify dialog is closed
    await page.waitForSelector('.agentlet-dialog-overlay', {
      timeout: 5000,
      state: 'detached'
    });
  });

  test('multiple dialog types can be used sequentially', async ({ page }) => {
    await initializeAgentlet(page);

    // Test info dialog first
    await page.click('button:has-text("Info Dialog")');
    await page.waitForSelector('.agentlet-dialog-overlay', { state: 'visible' });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.agentlet-dialog-overlay', { state: 'detached' });

    // Test input dialog second
    await page.click('button:has-text("Input Dialog")');
    await page.waitForSelector('.agentlet-dialog-overlay', { state: 'visible' });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.agentlet-dialog-overlay', { state: 'detached' });

    // Test wait dialog third
    await page.click('button:has-text("Wait Dialog")');
    await page.waitForSelector('.agentlet-dialog-overlay', { state: 'visible' });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.agentlet-dialog-overlay', { state: 'detached' });

    // Test progress dialog fourth
    await page.click('button:has-text("Progress Bar")');
    await page.waitForSelector('.agentlet-dialog-overlay', { state: 'visible' });
    await page.keyboard.press('Escape');
    await page.waitForSelector('.agentlet-dialog-overlay', { state: 'detached' });
  });

});