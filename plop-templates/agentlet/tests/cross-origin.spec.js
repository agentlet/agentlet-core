import { test, expect } from '@playwright/test';

// Injects the core bundle into a page served from another origin, the way
// the bookmarklet runs on a real application. The registry, the module
// bundle and the PDF worker must all load from the dev server, not from
// the host page.
const HOST_PAGE = 'http://localhost:8123/crm/';
const DEV_SERVER = 'http://localhost:8080/';

test.describe('Injection into another origin', () => {
  test.beforeEach(async ({ page }) => {
    await page.route(`${HOST_PAGE}**`, route => route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!DOCTYPE html><html><head><title>Host page</title></head><body><h1>Host page</h1></body></html>'
    }));
  });

  test('loads the registry and module bundle from the dev server', async ({ page }) => {
    const failedRequests = [];
    page.on('requestfailed', request => failedRequests.push(request.url()));
    page.on('response', response => {
      if (response.status() >= 400) failedRequests.push(response.url());
    });

    await page.goto(HOST_PAGE);
    await page.evaluate(src => {
      const script = document.createElement('script');
      script.src = src;
      document.body.appendChild(script);
    }, `${DEV_SERVER}core-bundle.js`);

    await page.waitForFunction(() => window.agentlet?.moduleRegistry?.modules?.size > 0, { timeout: 15000 });

    const loaded = await page.evaluate(() => ({
      modules: Array.from(window.agentlet.moduleRegistry.modules.keys()),
      entryUrls: window.agentlet.moduleRegistry.getRegistryEntries().map(entry => entry.url)
    }));
    expect(loaded.modules).toEqual(['{{kebabCase name}}']);
    expect(loaded.entryUrls).toEqual([`${DEV_SERVER}module-bundle.js`]);

    await expect(page.locator('#agentlet-content')).toBeVisible();
    expect(failedRequests.filter(url => url.startsWith(HOST_PAGE))).toEqual([]);
  });
{{#unless (eq ui 'react')}}

  test('applies the module getStyles() CSS to the panel', async ({ page }) => {
    await page.goto(HOST_PAGE);
    await page.evaluate(src => {
      const script = document.createElement('script');
      script.src = src;
      document.body.appendChild(script);
    }, `${DEV_SERVER}core-bundle.js`);

    await expect(page.locator('.agentlet-{{kebabCase name}}-content')).toBeVisible({ timeout: 15000 });

    const css = await page.evaluate(() => {
      const root = window.agentlet.ui.root;
      const style = root.querySelector('style[data-module="{{kebabCase name}}"]');
      return style ? style.textContent : null;
    });
    expect(css).toContain('.agentlet-{{kebabCase name}}-content');
  });
{{/unless}}
});
