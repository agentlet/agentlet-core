/**
 * Playwright tests for basics/module-registry-activation example.
 *
 * Exercises, in a real page, the module-registry fixes:
 * - a module loaded from a registry script is visible from both
 *   `window.agentlet.modules.get()` and `window.agentlet.moduleRegistry.get()`
 * - activating a module by hand is not reverted by the automatic URL-based
 *   detection, across the periodic poll, pushState navigation and hash
 *   navigation
 * - a `lazy: true` registry entry is not fetched at init(), is listed by
 *   `getRegistryEntries()`, and can be loaded on demand with `loadModule()`
 *   without being activated automatically
 */

import { test, expect } from '@playwright/test';
import { AgentletTestBase } from '../utils/AgentletTestBase.js';

test.describe('Module Registry Activation Example', () => {
  let agentletTest;

  test.beforeEach(async ({ page }) => {
    agentletTest = new AgentletTestBase(page);
    agentletTest.setupConsoleLogging();

    await agentletTest.navigateToExample('basics/module-registry-activation.html');
  });

  test('should load the module-registry-activation page correctly', async ({ page }) => {
    await expect(page).toHaveTitle(/Module registry activation - Agentlet Core Example/);
    await expect(page.locator('h1')).toContainText('Module registry activation');
    await expect(page.locator('button:has-text("Initialize agentlet")')).toBeVisible();
  });

  test('registers both eager modules and activates the first-matching one', async ({ page }) => {
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    const state = await page.evaluate(() => ({
      viaModules: [
        window.agentlet.modules.get('registry-module-a')?.name,
        window.agentlet.modules.get('registry-module-b')?.name
      ],
      viaRegistry: [
        window.agentlet.moduleRegistry.get('registry-module-a')?.name,
        window.agentlet.moduleRegistry.get('registry-module-b')?.name
      ],
      active: window.agentlet.moduleRegistry.activeModule?.name
    }));

    // Bug fix: window.agentlet.modules (ModuleManager) and
    // window.agentlet.moduleRegistry must agree on every registered module,
    // including ones loaded from the registry script.
    expect(state.viaModules).toEqual(['registry-module-a', 'registry-module-b']);
    expect(state.viaRegistry).toEqual(['registry-module-a', 'registry-module-b']);
    expect(state.active).toBe('registry-module-a');
  });

  test('an explicit activateModule() call survives the periodic poll, pushState and hash navigation', async ({ page }) => {
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    await page.locator('#activateBBtn').click();
    await expect.poll(() => page.evaluate(() => window.agentlet.moduleRegistry.activeModule?.name)).toBe('registry-module-b');

    // The URL-based poll runs every second; wait past several ticks. Module A
    // still matches the page too (same pattern), so before the fix this
    // would silently switch back to it.
    await page.waitForTimeout(3500);
    expect(await page.evaluate(() => window.agentlet.moduleRegistry.activeModule?.name)).toBe('registry-module-b');

    // Single-page navigation via pushState: module B's pattern ('localhost')
    // still matches the new URL, so it must stay active.
    await page.locator('#pushStateBtn').click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.agentlet.moduleRegistry.activeModule?.name)).toBe('registry-module-b');

    // Hash-based navigation: same expectation.
    await page.locator('#hashBtn').click();
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.agentlet.moduleRegistry.activeModule?.name)).toBe('registry-module-b');
  });

  test('a lazy registry entry is not fetched at init, is listed, and loads on demand without auto-activating', async ({ page }) => {
    await agentletTest.initializeAgentlet();
    await agentletTest.waitForAgentletCore();

    // Not fetched at init(): registered nowhere yet.
    const beforeLoad = await page.evaluate(() => ({
      module: window.agentlet.modules.get('registry-module-c'),
      entries: window.agentlet.moduleRegistry.getRegistryEntries()
    }));
    expect(beforeLoad.module).toBeFalsy();
    const lazyEntry = beforeLoad.entries.find(e => e.name === 'registry-module-c');
    expect(lazyEntry).toMatchObject({ lazy: true, loaded: false });

    // module-a is active (matches 'localhost'); loading module C (whose
    // pattern also matches) must not steal activation.
    await page.locator('#loadCBtn').click();
    await expect.poll(() => page.evaluate(() => !!window.agentlet.modules.get('registry-module-c'))).toBe(true);

    const afterLoad = await page.evaluate(() => ({
      viaModules: window.agentlet.modules.get('registry-module-c')?.name,
      viaRegistry: window.agentlet.moduleRegistry.get('registry-module-c')?.name,
      active: window.agentlet.moduleRegistry.activeModule?.name,
      entries: window.agentlet.moduleRegistry.getRegistryEntries()
    }));
    expect(afterLoad.viaModules).toBe('registry-module-c');
    expect(afterLoad.viaRegistry).toBe('registry-module-c');
    // Still module-a: loadModule() never activates.
    expect(afterLoad.active).toBe('registry-module-a');
    expect(afterLoad.entries.find(e => e.name === 'registry-module-c')).toMatchObject({ lazy: true, loaded: true });

    // The host can still activate it explicitly afterwards.
    await page.locator('#activateCBtn').click();
    await expect.poll(() => page.evaluate(() => window.agentlet.moduleRegistry.activeModule?.name)).toBe('registry-module-c');
  });
});
