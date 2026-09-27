/**
 * Playwright coverage for dialog theming (fix/dialog-theme):
 *
 * 1. A theme that only sets headerBackground/headerTextColor (no
 *    dialog-specific overrides) must still produce a readable dialog
 *    header - background and text colour must come from the same pair
 *    (see ThemeManager.processThemeConfig() and
 *    src/utils/ui/dialog/themeVars.ts).
 * 2. An already-open dialog restyles live when setTheme() is called
 *    (CSS custom properties, not a DOM walk - see themeVars.ts).
 * 3. A dialog opened AFTER setTheme() uses the current theme, not the one
 *    captured when AgentletCore started (GlobalAPI's theme:changed
 *    listener keeps the shared Dialog instance's theme in sync).
 * 4. setTheme() updates the panel content area's background and text
 *    colour, not only the header (a site report that the jest suite
 *    could not fully exercise - see tests/core/ThemeManager.test.js).
 *
 * Uses examples/ui/dialogs.html, whose default `window.agentletConfig`
 * theme is overridden per-test via `page.evaluate()` before clicking
 * "Initialize agentlet", exactly like the real site sets a brand theme
 * before agentlet.io calls `new AgentletCore(config)`.
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

// The two themes documented on the fix/dialog-theme branch: agentlet.io's
// light theme (navy header, white text) and dark theme (orange header,
// navy text) - each sets only the panel header pair, not the
// dialog-specific one.
const LIGHT_THEME = { headerBackground: '#0f3350', headerTextColor: '#ffffff' };
const DARK_THEME = { headerBackground: '#f4a261', headerTextColor: '#0f3350' };

const RGB = {
  navy: 'rgb(15, 51, 80)',
  white: 'rgb(255, 255, 255)',
  orange: 'rgb(244, 162, 97)'
};

test.describe('Dialog theming', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();
    await agentletTest.navigateToExample('ui/dialogs.html');
  });

  async function setInitialTheme(page, theme) {
    await page.evaluate((t) => {
      window.agentletConfig.theme = t;
    }, theme);
  }

  test('a header-only theme produces a readable (non-mixed) dialog header', async ({ page }) => {
    await setInitialTheme(page, LIGHT_THEME);
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    await page.evaluate(() => {
      window.agentlet.utils.Dialog.showInfo({ title: 'Heads up', message: 'Hello' });
    });
    const header = page.locator('.agentlet-info-header');
    await expect(header).toBeVisible();
    const title = header.locator('h3');

    await expect(header).toHaveCSS('background-color', RGB.navy);
    await expect(title).toHaveCSS('color', RGB.white);
  });

  test('an already-open fullscreen dialog restyles live when setTheme() is called', async ({ page }) => {
    await setInitialTheme(page, LIGHT_THEME);
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    await page.evaluate(() => {
      window.agentlet.utils.Dialog.showFullscreen({ title: 'Details', message: 'Some content' });
    });
    const header = page.locator('.agentlet-fullscreen-header');
    const title = header.locator('h2');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', RGB.navy);
    await expect(title).toHaveCSS('color', RGB.white);

    // Switch themes while the dialog is still open.
    await page.evaluate((t) => window.agentlet.setTheme(t), DARK_THEME);

    await expect(header).toHaveCSS('background-color', RGB.orange);
    await expect(title).toHaveCSS('color', RGB.navy);

    // The dialog's own background/content text also follow, not only the
    // header.
    const dialogEl = page.locator('.agentlet-fullscreen-dialog');
    const content = dialogEl.locator('.agentlet-fullscreen-content');
    await page.evaluate((t) => window.agentlet.setTheme(t), { backgroundColor: '#111111', textColor: '#eeeeee' });
    await expect(dialogEl).toHaveCSS('background-color', 'rgb(17, 17, 17)');
    await expect(content).toHaveCSS('color', 'rgb(238, 238, 238)');
  });

  test('a dialog opened AFTER setTheme() uses the current theme, not the one active at init', async ({ page }) => {
    await setInitialTheme(page, LIGHT_THEME);
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Switch themes BEFORE opening any dialog.
    await page.evaluate((t) => window.agentlet.setTheme(t), DARK_THEME);

    await page.evaluate(() => {
      window.agentlet.utils.Dialog.showFullscreen({ title: 'Details', message: 'Some content' });
    });
    const header = page.locator('.agentlet-fullscreen-header');
    const title = header.locator('h2');
    await expect(header).toBeVisible();
    await expect(header).toHaveCSS('background-color', RGB.orange);
    await expect(title).toHaveCSS('color', RGB.navy);
  });

  test('setTheme() updates the panel content area background and text colour, not only the header', async ({ page }) => {
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    const content = page.locator('#agentlet-content');
    await page.evaluate(() => window.agentlet.setTheme({ contentBackground: '#111111', textColor: '#eeeeee' }));

    await expect(content).toHaveCSS('background-color', 'rgb(17, 17, 17)');
    await expect(content).toHaveCSS('color', 'rgb(238, 238, 238)');
  });
});
