/**
 * Playwright tests for ui/style-isolation example
 * Covers CSS isolation between the shadow-mounted panel and a deliberately
 * hostile host page, in both directions, plus the shadowDom: false escape
 * hatch. See docs/shadow-dom.md.
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Style Isolation Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();

    await agentletTest.navigateToExample('ui/style-isolation.html');
  });

  test('should load the style-isolation page with its hostile host CSS', async ({ page }) => {
    await expect(page).toHaveTitle(/Style isolation - Agentlet Core Example/);
    await expect(page.locator('h1')).toContainText('Style isolation');
    await expect(page.locator('#initShadowBtn')).toBeVisible();
    await expect(page.locator('#initNoShadowBtn')).toBeVisible();

    // The hostile CSS itself is real: the host h3/input keep their forced
    // colors before Agentlet Core is even initialized.
    const hostStyles = await page.evaluate(() => {
      const heading = document.getElementById('hostHeading');
      const input = document.getElementById('hostInput');
      return {
        headingColor: getComputedStyle(heading).color,
        headingTransform: getComputedStyle(heading).textTransform,
        inputBackground: getComputedStyle(input).backgroundColor,
        inputColor: getComputedStyle(input).color
      };
    });
    expect(hostStyles.headingColor).toBe('rgb(255, 0, 0)');
    expect(hostStyles.headingTransform).toBe('uppercase');
    expect(hostStyles.inputBackground).toBe('rgb(0, 0, 0)');
    expect(hostStyles.inputColor).toBe('rgb(255, 255, 0)');
  });

  test('should isolate the panel from the hostile host CSS (shadowDom: true)', async ({ page }) => {
    await page.locator('#initShadowBtn').click();
    await agentletTest.waitForAgentletCore();
    // #panelHeading lives inside the shadow root: Playwright locators pierce
    // open shadow roots, so this works the same as for any other element.
    await expect(page.locator('#panelHeading')).toBeVisible();

    const isolation = await page.evaluate(() => {
      const panel = window.agentlet.ui.query('#agentlet-container');
      const heading = window.agentlet.ui.query('#panelHeading');
      const button = window.agentlet.ui.query('#panelButton');
      const input = window.agentlet.ui.query('#panelInput');
      const content = window.agentlet.ui.query('#agentlet-content');

      return {
        panelFontFamily: getComputedStyle(panel).fontFamily,
        panelPosition: getComputedStyle(panel).position,
        headingColor: getComputedStyle(heading).color,
        headingTransform: getComputedStyle(heading).textTransform,
        buttonBackground: getComputedStyle(button).backgroundColor,
        inputBackground: getComputedStyle(input).backgroundColor,
        inputColor: getComputedStyle(input).color,
        contentPadding: getComputedStyle(content).padding
      };
    });

    // Theme font, not the hostile page's Comic Sans.
    expect(isolation.panelFontFamily).not.toContain('Comic Sans');
    // The panel keeps its own fixed positioning.
    expect(isolation.panelPosition).toBe('fixed');
    // The panel's h3 keeps the theme's default text color, not the
    // hostile page's forced red/uppercase h3 styling.
    expect(isolation.headingColor).not.toBe('rgb(255, 0, 0)');
    expect(isolation.headingTransform).not.toBe('uppercase');
    // The panel's button doesn't pick up the hostile page's lime background.
    expect(isolation.buttonBackground).not.toBe('rgb(0, 255, 0)');
    // The panel's input doesn't pick up the hostile page's black/yellow styling
    // - the clearest possible signal, since the host input right next to it does.
    expect(isolation.inputBackground).not.toBe('rgb(0, 0, 0)');
    expect(isolation.inputColor).not.toBe('rgb(255, 255, 0)');
    // The panel content area keeps the framework's own padding rather than
    // the hostile page's `* { padding: 0; }`.
    expect(isolation.contentPadding).not.toBe('0px');
  });

  test('should not leak the panel CSS out into the host page', async ({ page }) => {
    await page.locator('#initShadowBtn').click();
    await agentletTest.waitForAgentletCore();
    await expect(page.locator('#panelHeading')).toBeVisible();

    const leakage = await page.evaluate(() => {
      const heading = document.getElementById('hostHeading');
      const button = document.getElementById('hostButton');
      return {
        headingColor: getComputedStyle(heading).color,
        headingTransform: getComputedStyle(heading).textTransform,
        buttonBorderStyle: getComputedStyle(button).borderStyle,
        coreStylesInHead: !!document.getElementById('agentlet-core-styles'),
        themeStyleInHead: !!document.getElementById('agentlet-core-theme')
      };
    });

    // The host h3 keeps its hostile red/uppercase styling: the panel's
    // stylesheet did not leak out and restyle it.
    expect(leakage.headingColor).toBe('rgb(255, 0, 0)');
    expect(leakage.headingTransform).toBe('uppercase');
    // The core UI stylesheet lives inside the shadow root, never in <head>,
    // when shadowDom is enabled. The theme <style> (custom properties only)
    // is the one exception, and is expected here.
    expect(leakage.coreStylesInHead).toBe(false);
    expect(leakage.themeStyleInHead).toBe(true);
  });

  test('should be reachable only via window.agentlet.ui.query, not document.*', async ({ page }) => {
    await page.locator('#initShadowBtn').click();
    await agentletTest.waitForAgentletCore();
    await expect(page.locator('#panelHeading')).toBeVisible();

    const reachability = await page.evaluate(() => {
      const host = document.getElementById('agentlet-host');
      return {
        directLookup: document.getElementById('agentlet-container'),
        uiQueryLookup: !!window.agentlet.ui.query('#agentlet-container'),
        hostExists: !!host,
        hostHasOpenShadowRoot: !!(host && host.shadowRoot)
      };
    });

    expect(reachability.directLookup).toBeNull();
    expect(reachability.uiQueryLookup).toBe(true);
    expect(reachability.hostExists).toBe(true);
    expect(reachability.hostHasOpenShadowRoot).toBe(true);
  });

  test('should open a dialog inside the shadow root and close it', async ({ page }) => {
    await page.locator('#initShadowBtn').click();
    await agentletTest.waitForAgentletCore();
    await expect(page.locator('#panelHeading')).toBeVisible();

    await page.locator('#panelInfoBtn').click();
    await agentletTest.waitForDialog();
    await expect(page.locator('.agentlet-info-dialog')).toBeVisible();

    const dialogInShadowRoot = await page.evaluate(() => {
      const dialog = window.agentlet.ui.query('.agentlet-info-dialog');
      const host = document.getElementById('agentlet-host');
      return !!(dialog && host && host.shadowRoot && host.shadowRoot.contains(dialog));
    });
    expect(dialogInShadowRoot).toBe(true);

    await agentletTest.closeDialog();
    await expect(page.locator('.agentlet-info-dialog')).toHaveCount(0);
  });

  test('should mount the panel directly in document.body with shadowDom: false', async ({ page }) => {
    await page.locator('#initNoShadowBtn').click();
    await agentletTest.waitForAgentletCore();
    await expect(page.locator('#agentlet-container')).toBeVisible();

    const noShadowState = await page.evaluate(() => {
      const panel = document.getElementById('agentlet-container');
      return {
        panelExists: !!panel,
        panelParentIsBody: !!panel && panel.parentElement === document.body,
        hostExists: !!document.getElementById('agentlet-host'),
        coreStylesInHead: !!document.getElementById('agentlet-core-styles')
      };
    });

    expect(noShadowState.panelExists).toBe(true);
    expect(noShadowState.panelParentIsBody).toBe(true);
    expect(noShadowState.hostExists).toBe(false);
    expect(noShadowState.coreStylesInHead).toBe(true);
  });
});
