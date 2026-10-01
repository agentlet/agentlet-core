/**
 * Playwright tests for data-processing/records-copy-paste example
 * Copies a company record from the source pane and pastes it into a supplier
 * form whose field names differ from the record keys: smart paste with
 * window.agentlet.records.onPaste(), the preview dialog, and the "Paste
 * record" button, which reads the clipboard from a click.
 *
 * The keyboard paste works in Chromium, Firefox and WebKit, because the
 * record travels inside the HTML clipboard format (see docs/rfcs/0001).
 * Reading the clipboard from a button needs a permission that only Chromium
 * lets a test grant, so that test is skipped on the other engines.
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

const PASTE_SHORTCUT = process.platform === 'darwin' ? 'Meta+V' : 'Control+V';

test.describe('Records Copy and Paste Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page, browserName }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();

    if (browserName === 'chromium') {
      await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
    }

    await agentletTest.navigateToExample('data-processing/records-copy-paste.html');
  });

  async function initialize(page) {
    await page.locator('#initBtn').click();
    await agentletTest.waitForAgentletCore();
    await expect(page.locator('#status')).toContainText('Ready');
  }

  async function copyCompany(page) {
    await page.locator('#copyCompanyBtn').click();
    await expect(page.locator('#status')).toContainText('Copied organization record');
  }

  async function expectTargetEmpty(page) {
    for (const id of ['sup_nm', 'reg_no', 'addr_l1', 'cp_field', 'town_fld', 'mail_to']) {
      await expect(page.locator(`#${id}`)).toHaveValue('');
    }
    await expect(page.locator('#ctry')).toHaveValue('');
  }

  async function expectTargetFilled(page) {
    await expect(page.locator('#sup_nm')).toHaveValue('Example SAS');
    await expect(page.locator('#reg_no')).toHaveValue('123456789');
    await expect(page.locator('#addr_l1')).toHaveValue('1 rue Exemple');
    await expect(page.locator('#cp_field')).toHaveValue('75001');
    await expect(page.locator('#town_fld')).toHaveValue('Paris');
    await expect(page.locator('#ctry')).toHaveValue('FR');
    await expect(page.locator('#mail_to')).toHaveValue('contact@example.com');
    await expect(page.locator('#portal_pw')).toHaveValue('');
  }

  test('should load the records page correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Records copy and paste - Agentlet Core Example/);
    await expect(page.locator('h1')).toContainText('Records copy and paste');
    await expect(page.locator('#source-pane')).toBeVisible();
    await expect(page.locator('#target-pane')).toBeVisible();
    await expect(page.locator('#copyCompanyBtn')).toBeVisible();
    await expect(page.locator('#copyTableBtn')).toBeVisible();
    await expect(page.locator('#pickBtn')).toBeVisible();
    await expect(page.locator('#pasteBtn')).toBeVisible();
    await expectTargetEmpty(page);
  });

  test('should expose window.agentlet.records after initialization', async ({ page }) => {
    await initialize(page);
    const methods = await page.evaluate(() => Object.keys(window.agentlet.records).sort());
    expect(methods).toEqual(expect.arrayContaining([
      'copy', 'create', 'defineType', 'fill', 'fromElement', 'fromForm', 'fromPasteEvent',
      'fromTable', 'match', 'onPaste', 'pasteFromClipboard', 'pick', 'read', 'validate'
    ]));
    const types = await page.evaluate(() => window.agentlet.records.listTypes().map(type => type.name));
    expect(types).toEqual(expect.arrayContaining(['table', 'fields', 'contact', 'address', 'organization']));
  });

  test('should paste a copied company into the form through the preview', async ({ page }) => {
    await initialize(page);
    await copyCompany(page);

    await page.locator('#sup_nm').click();
    await page.keyboard.press(PASTE_SHORTCUT);

    const preview = page.locator('.agentlet-records-preview');
    await expect(preview).toBeVisible();
    await expect(preview).toContainText('Example SAS');
    await expect(preview).toContainText('Source');
    // Nothing is filled before the user confirms.
    await expectTargetEmpty(page);

    await page.locator('.agentlet-info-buttons button:has-text("Fill")').click();
    await expectTargetFilled(page);
    await expect(page.locator('#status')).toContainText('fields filled');
  });

  test('should leave the form untouched when the preview is cancelled', async ({ page }) => {
    await initialize(page);
    await copyCompany(page);

    await page.locator('#town_fld').click();
    await page.keyboard.press(PASTE_SHORTCUT);
    await expect(page.locator('.agentlet-records-preview')).toBeVisible();
    await page.locator('.agentlet-info-buttons button:has-text("Cancel")').click();

    await expect(page.locator('.agentlet-records-preview')).toHaveCount(0);
    await expectTargetEmpty(page);
    await expect(page.locator('#status')).toContainText('cancelled');
  });

  test('should not intercept a paste of plain text', async ({ page }) => {
    await initialize(page);
    await page.evaluate(() => navigator.clipboard.writeText('plain text'));
    await page.locator('#sup_nm').click();
    await page.keyboard.press(PASTE_SHORTCUT);
    await expect(page.locator('#sup_nm')).toHaveValue('plain text');
    await expect(page.locator('.agentlet-records-preview')).toHaveCount(0);
  });

  test('should pick the card with the element selector and copy it', async ({ page }) => {
    await initialize(page);
    await page.locator('#pickBtn').click();
    await page.locator('#company-card').click({ position: { x: 2, y: 2 } });
    await expect(page.locator('#status')).toContainText('Copied organization record');

    await page.locator('#sup_nm').click();
    await page.keyboard.press(PASTE_SHORTCUT);
    await expect(page.locator('.agentlet-records-preview')).toBeVisible();
    await page.locator('.agentlet-info-buttons button:has-text("Fill")').click();
    await expectTargetFilled(page);
  });

  test('should paste a table copy as a table, not as a company', async ({ page }) => {
    await initialize(page);
    await page.locator('#copyTableBtn').click();
    await expect(page.locator('#status')).toContainText('Copied table record');

    await page.locator('#sup_nm').click();
    await page.keyboard.press(PASTE_SHORTCUT);
    // The form listens for organization records only.
    await expect(page.locator('.agentlet-records-preview')).toHaveCount(0);
  });

  test('should fill from the "Paste record" button by reading the clipboard', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'clipboard.read() needs a permission that only Chromium lets a test grant');

    await initialize(page);
    await copyCompany(page);

    await page.locator('#pasteBtn').click();
    await expect(page.locator('.agentlet-records-preview')).toBeVisible();
    await page.locator('.agentlet-info-buttons button:has-text("Fill")').click();
    await expectTargetFilled(page);
  });

  test('should never submit the form', async ({ page }) => {
    await initialize(page);
    await copyCompany(page);
    await page.locator('#sup_nm').click();
    await page.keyboard.press(PASTE_SHORTCUT);
    await page.locator('.agentlet-info-buttons button:has-text("Fill")').click();
    await expectTargetFilled(page);
    await expect(page.locator('#console')).not.toContainText('Form submitted');
  });
});
