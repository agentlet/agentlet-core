/**
 * Tests for the runtime theme-switching recipe documented in
 * docs/shadow-dom.md and used by examples/ui/custom-styling.html:
 *
 *   window.agentlet.themeManager.updateTheme({ ... });
 *   window.agentlet.ui.regenerateStyles();
 *
 * Unlike page-level CSS, this is the one way to retheme the panel from
 * JavaScript regardless of whether shadowDom is enabled - it must actually
 * reach the UI mount root (the shadow root, or document.body).
 *
 * tests/setup.js globally replaces document.createElement/document.head
 * with lightweight mocks; these tests restore jsdom's native
 * implementations since they need a real shadow root.
 */

import AgentletCore from '../../src/index.js';
import { getUiRoot, queryUi } from '../utils/ui-helpers.js';

describe('ThemeManager.updateTheme() + ui.regenerateStyles()', () => {
  beforeEach(() => {
    delete document.createElement;
    delete document.head;
    document.body.innerHTML = '';
    delete window.agentlet;
  });

  afterEach(async () => {
    if (window.agentlet && typeof window.agentlet.cleanup === 'function') {
      await window.agentlet.cleanup();
    }
    document.body.innerHTML = '';
    delete window.agentlet;
  });

  test('updateTheme() + ui.regenerateStyles() updates the --agentlet-* custom properties in <head>, in shadow mode', async () => {
    const agentlet = new AgentletCore();
    await agentlet.init();

    const themeStyleBefore = document.getElementById('agentlet-core-theme');
    expect(themeStyleBefore.textContent).toContain('--agentlet-background-color: #ffffff');

    agentlet.themeManager.updateTheme({ backgroundColor: '#1E1E1E' });
    agentlet.ui.regenerateStyles();

    // injectThemeStyles() removes and recreates this element on every call
    // (see StyleInjector.js), so it's not the same instance - but there is
    // still exactly one of it, with the new value.
    const themeStyleAfter = document.getElementById('agentlet-core-theme');
    expect(themeStyleAfter.textContent).toContain('--agentlet-background-color: #1E1E1E');
    expect(document.querySelectorAll('#agentlet-core-theme').length).toBe(1);
  });

  test('the regenerated UI stylesheet still reaches the shadow root (fallback path), via the ui.root/query() helpers', async () => {
    const agentlet = new AgentletCore();
    await agentlet.init();

    // getUiRoot()/queryUi() mirror the same core.ui.root/query() surface
    // application code and window.agentlet.ui use - see docs/shadow-dom.md.
    const root = getUiRoot(agentlet);
    expect(root).toBeInstanceOf(ShadowRoot);

    agentlet.themeManager.updateTheme({ borderRadius: '20px' });
    agentlet.ui.regenerateStyles();

    // jsdom has no adoptedStyleSheets support, so this exercises the
    // fallback <style id="agentlet-core-styles"> path inside the shadow root.
    const uiStyle = queryUi(agentlet, '#agentlet-core-styles');
    expect(uiStyle).not.toBeNull();
    expect(uiStyle.getRootNode()).toBe(root);
    expect(uiStyle.textContent).toContain('.agentlet-panel');
    expect(root.querySelectorAll('#agentlet-core-styles').length).toBe(1);
  });

  test('updateTheme() + ui.regenerateStyles() also works with shadowDom: false, updating the single combined stylesheet', async () => {
    const agentlet = new AgentletCore({ shadowDom: false });
    await agentlet.init();

    expect(getUiRoot(agentlet)).toBe(document.body);

    agentlet.themeManager.updateTheme({ backgroundColor: '#1E1E1E' });
    agentlet.ui.regenerateStyles();

    // In legacy (shadowDom: false) mode the combined stylesheet lives in
    // <head>, outside ui.root (document.body) - so it's looked up directly
    // rather than through queryUi(), same as StyleInjector.test.js does.
    const style = document.getElementById('agentlet-core-styles');
    expect(style).not.toBeNull();
    expect(style.parentNode).toBe(document.head);
    expect(style.textContent).toContain('--agentlet-background-color: #1E1E1E');
    expect(style.textContent).toContain('.agentlet-panel');
  });
});
