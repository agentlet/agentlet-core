/**
 * Playwright tests for basics/mount-vanilla example
 * Covers Module.mount()/unmount() built with plain DOM APIs: state kept on
 * the module instance survives a refresh-triggered remount, and the mount
 * trigger shown in the panel updates accordingly.
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Mount API (vanilla) Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();
    await agentletTest.navigateToExample('basics/mount-vanilla.html');
  });

  test('should load the mount-vanilla page correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Mount API \(vanilla\) - Agentlet Core Example/);
    await expect(page.locator('h1')).toContainText('Mount API: plain DOM');
    await expect(page.locator('#initBtn')).toBeVisible();
    await expect(page.locator('#refreshBtn')).toBeVisible();
  });

  test('should mount the counter with plain DOM APIs and keep count across a refresh', async ({ page }) => {
    await page.locator('#initBtn').click();
    await agentletTest.waitForAgentletCore();

    // The module mounts asynchronously after registration; Playwright's
    // expect() polls until the element shows up inside the panel content.
    await expect(page.locator('#mountVanillaCount')).toHaveText('0');
    await expect(page.locator('#mountVanillaTrigger')).toHaveText('moduleChange');

    await expect.poll(() => page.evaluate(() => window.__mountDemo.mounts)).toBe(1);
    expect(await page.evaluate(() => window.__mountDemo.unmounts)).toBe(0);

    await page.locator('#mountVanillaPlus').click();
    await page.locator('#mountVanillaPlus').click();
    await expect(page.locator('#mountVanillaCount')).toHaveText('2');

    // Refresh the panel content: unmount() then mount() run again with
    // trigger 'refresh'. The count is read from the module instance, so it
    // is not reset by the remount.
    await page.locator('#refreshBtn').click();

    await expect(page.locator('#mountVanillaTrigger')).toHaveText('refresh');
    await expect(page.locator('#mountVanillaCount')).toHaveText('2');

    await expect.poll(() => page.evaluate(() => window.__mountDemo.mounts)).toBe(2);
    expect(await page.evaluate(() => window.__mountDemo.unmounts)).toBe(1);
  });

  test('should reset the count via the reset button', async ({ page }) => {
    await page.locator('#initBtn').click();
    await agentletTest.waitForAgentletCore();

    await expect(page.locator('#mountVanillaCount')).toHaveText('0');

    await page.locator('#mountVanillaPlus').click();
    await expect(page.locator('#mountVanillaCount')).toHaveText('1');

    await page.locator('#mountVanillaReset').click();
    await expect(page.locator('#mountVanillaCount')).toHaveText('0');
  });
});
