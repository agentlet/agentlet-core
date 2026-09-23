/**
 * Playwright tests for basics/mount-lit example
 * Covers Module.mount()/unmount() built with a Lit custom element loaded as
 * an ES module from a CDN: unmount() is called exactly once on a
 * refresh-triggered remount, and the count (kept on the module instance,
 * not as a reactive property) survives it.
 *
 * Skipped (not failed) when the Lit CDN is unreachable from the test
 * environment, since that is an environment/network condition rather than a
 * bug in the example or the mount API.
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Mount API (Lit) Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();
    await agentletTest.navigateToExample('basics/mount-lit.html');

    const litAvailable = await page.waitForFunction(
      () => window.__litReady === true || window.__litLoadError !== null,
      { timeout: 5000 }
    ).then(() => page.evaluate(() => window.__litReady === true)).catch(() => false);

    test.skip(!litAvailable, 'Lit CDN (cdn.jsdelivr.net) unreachable from this environment');
  });

  test('should load the mount-lit page correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Mount API \(Lit\) - Agentlet Core Example/);
    await expect(page.locator('h1')).toContainText('Mount API: Lit');
    await expect(page.locator('#initBtn')).toBeVisible();
    await expect(page.locator('#refreshBtn')).toBeVisible();
  });

  test('should mount the Lit custom element and keep count across a refresh', async ({ page }) => {
    await page.locator('#initBtn').click();
    await agentletTest.waitForAgentletCore();

    await expect(page.locator('#mountLitCount')).toHaveText('0');
    await expect(page.locator('#mountLitTrigger')).toHaveText('moduleChange');

    await expect.poll(() => page.evaluate(() => window.__mountDemo.mounts)).toBe(1);
    expect(await page.evaluate(() => window.__mountDemo.unmounts)).toBe(0);

    await page.locator('#mountLitPlus').click();
    await page.locator('#mountLitPlus').click();
    await expect(page.locator('#mountLitCount')).toHaveText('2');

    await page.locator('#refreshBtn').click();

    await expect(page.locator('#mountLitTrigger')).toHaveText('refresh');
    await expect(page.locator('#mountLitCount')).toHaveText('2');

    // unmount() must have been called exactly once for this refresh.
    await expect.poll(() => page.evaluate(() => window.__mountDemo.unmounts)).toBe(1);
    expect(await page.evaluate(() => window.__mountDemo.mounts)).toBe(2);
  });

  test('should reset the count via the reset button', async ({ page }) => {
    await page.locator('#initBtn').click();
    await agentletTest.waitForAgentletCore();

    await expect(page.locator('#mountLitCount')).toHaveText('0');

    await page.locator('#mountLitPlus').click();
    await expect(page.locator('#mountLitCount')).toHaveText('1');

    await page.locator('#mountLitReset').click();
    await expect(page.locator('#mountLitCount')).toHaveText('0');
  });
});
