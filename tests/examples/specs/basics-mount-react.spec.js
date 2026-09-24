/**
 * Playwright tests for basics/mount-react example
 * Covers Module.mount()/unmount() built with a React 18 root loaded from a
 * CDN: unmount() is called exactly once on a refresh-triggered remount, and
 * the count (kept on the module instance, not in React state) survives it.
 *
 * Skipped (not failed) when the React CDN is unreachable from the test
 * environment, since that is an environment/network condition rather than a
 * bug in the example or the mount API.
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Mount API (React) Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();
    await agentletTest.navigateToExample('basics/mount-react.html');

    const reactAvailable = await page.waitForFunction(
      () => !!(window.React && window.ReactDOM),
      { timeout: 5000 }
    ).then(() => true).catch(() => false);

    test.skip(!reactAvailable, 'React CDN (cdnjs.cloudflare.com) unreachable from this environment');
  });

  test('should load the mount-react page correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Mount API \(React\) - Agentlet Core Example/);
    await expect(page.locator('h1')).toContainText('Mount API: React');
    await expect(page.locator('#initBtn')).toBeVisible();
    await expect(page.locator('#refreshBtn')).toBeVisible();
  });

  test('should mount a React root and keep count across a refresh', async ({ page }) => {
    await page.locator('#initBtn').click();
    await agentletTest.waitForAgentletCore();

    await expect(page.locator('#mountReactCount')).toHaveText('0');
    await expect(page.locator('#mountReactTrigger')).toHaveText('moduleChange');

    await expect.poll(() => page.evaluate(() => window.__mountDemo.mounts)).toBe(1);
    expect(await page.evaluate(() => window.__mountDemo.unmounts)).toBe(0);

    await page.locator('#mountReactPlus').click();
    await page.locator('#mountReactPlus').click();
    await expect(page.locator('#mountReactCount')).toHaveText('2');

    await page.locator('#refreshBtn').click();

    await expect(page.locator('#mountReactTrigger')).toHaveText('refresh');
    await expect(page.locator('#mountReactCount')).toHaveText('2');

    // unmount() must have been called exactly once for this refresh.
    await expect.poll(() => page.evaluate(() => window.__mountDemo.unmounts)).toBe(1);
    expect(await page.evaluate(() => window.__mountDemo.mounts)).toBe(2);
  });

  test('should reset the count via the reset button', async ({ page }) => {
    await page.locator('#initBtn').click();
    await agentletTest.waitForAgentletCore();

    await expect(page.locator('#mountReactCount')).toHaveText('0');

    await page.locator('#mountReactPlus').click();
    await expect(page.locator('#mountReactCount')).toHaveText('1');

    await page.locator('#mountReactReset').click();
    await expect(page.locator('#mountReactCount')).toHaveText('0');
  });
});
