/**
 * Tests for the shadow DOM UI root (UIManager.ensureRoot/setupBaseUI) and the
 * core.ui.query()/queryAll() helpers.
 *
 * tests/setup.js globally replaces document.createElement and document.head
 * with lightweight mocks (plain objects, no attachShadow/querySelector) so
 * other suites don't need a full DOM. These tests need the real thing - real
 * attachShadow(), real style elements, real querySelector - so each test
 * restores jsdom's native implementations before running.
 */

import AgentletCore from '../../src/index.js';

describe('UIManager - shadow DOM UI root', () => {
  beforeEach(() => {
    // Restore jsdom's real Document.prototype implementations by removing the
    // own-property mocks installed by tests/setup.js.
    delete document.createElement;
    delete document.head;

    document.body.innerHTML = '';
    delete window.agentlet;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    delete window.agentlet;
  });

  test('default config (shadowDom: true) mounts the panel inside an open shadow root', async () => {
    const agentlet = new AgentletCore();
    await agentlet.init();

    const host = document.getElementById('agentlet-host');
    expect(host).not.toBeNull();
    expect(host.parentNode).toBe(document.body);
    expect(host.shadowRoot).not.toBeNull();
    expect(host.shadowRoot.mode).toBe('open');

    expect(agentlet.ui.host).toBe(host);
    expect(agentlet.ui.root).toBe(host.shadowRoot);
    expect(agentlet.ui.root).toBeInstanceOf(ShadowRoot);

    const container = agentlet.ui.root.querySelector('#agentlet-container');
    const toggle = agentlet.ui.root.querySelector('#agentlet-toggle');
    expect(container).not.toBeNull();
    expect(toggle).not.toBeNull();
    expect(container.getRootNode()).toBe(agentlet.ui.root);
    expect(toggle.getRootNode()).toBe(agentlet.ui.root);

    // Not reachable from outside the shadow boundary
    expect(document.getElementById('agentlet-container')).toBeNull();
    expect(document.getElementById('agentlet-toggle')).toBeNull();

    await agentlet.cleanup();
  });

  test('shadowDom: false mounts the panel directly on document.body (unchanged legacy behavior)', async () => {
    const agentlet = new AgentletCore({ shadowDom: false });
    await agentlet.init();

    expect(agentlet.ui.host).toBeNull();
    expect(agentlet.ui.root).toBe(document.body);
    expect(document.getElementById('agentlet-host')).toBeNull();

    const container = document.getElementById('agentlet-container');
    const toggle = document.getElementById('agentlet-toggle');
    expect(container).not.toBeNull();
    expect(toggle).not.toBeNull();
    expect(container.parentNode).toBe(document.body);
    expect(toggle.parentNode).toBe(document.body);

    const coreStyles = document.getElementById('agentlet-core-styles');
    expect(coreStyles).not.toBeNull();
    expect(coreStyles.parentNode).toBe(document.head);

    await agentlet.cleanup();
  });

  test('core.ui.query() and window.agentlet.ui.query() find the toggle button in both modes', async () => {
    const shadowAgentlet = new AgentletCore();
    await shadowAgentlet.init();

    expect(shadowAgentlet.ui.query('#agentlet-toggle')).toBe(shadowAgentlet.ui.root.querySelector('#agentlet-toggle'));
    expect(window.agentlet.ui.query('#agentlet-toggle')).not.toBeNull();
    expect(window.agentlet.ui).toBe(shadowAgentlet.ui);
    expect(shadowAgentlet.ui.queryAll('.agentlet-action-btn').length).toBeGreaterThan(0);

    await shadowAgentlet.cleanup();

    const plainAgentlet = new AgentletCore({ shadowDom: false });
    await plainAgentlet.init();

    expect(plainAgentlet.ui.query('#agentlet-toggle')).toBe(document.getElementById('agentlet-toggle'));

    await plainAgentlet.cleanup();
  });

  test('toggleCollapse() still updates the toggle button when it lives in the shadow root', async () => {
    const agentlet = new AgentletCore();
    await agentlet.init();

    expect(agentlet.isMinimized).toBe(false);

    agentlet.uiManager.toggleCollapse();

    expect(agentlet.isMinimized).toBe(true);
    const toggle = agentlet.ui.query('#agentlet-toggle');
    expect(toggle.innerHTML).toBe('◀');

    agentlet.uiManager.toggleCollapse();
    expect(agentlet.isMinimized).toBe(false);
    expect(agentlet.ui.query('#agentlet-toggle').innerHTML).toBe('▶');

    await agentlet.cleanup();
  });

  test('shadow mode: theme variables are in <head>, UI rules are in the shadow root', async () => {
    const agentlet = new AgentletCore();
    await agentlet.init();

    const themeStyle = document.getElementById('agentlet-core-theme');
    expect(themeStyle).not.toBeNull();
    expect(themeStyle.parentNode).toBe(document.head);
    expect(themeStyle.textContent).toContain('--agentlet-primary-color');
    expect(themeStyle.textContent).toContain(':root');

    // jsdom has no adoptedStyleSheets support, so the UI rules fall back to a
    // plain <style> element appended to the shadow root itself.
    const uiStyle = agentlet.ui.root.querySelector('#agentlet-core-styles');
    expect(uiStyle).not.toBeNull();
    expect(uiStyle.textContent).toContain(':host');
    expect(uiStyle.textContent).toContain('.agentlet-panel');
    // The UI stylesheet references theme variables (var(--agentlet-...)) but
    // must not itself define the :root block - that only lives in <head>.
    expect(uiStyle.textContent).not.toContain(':root {');

    // The combined legacy stylesheet id must not leak into <head> in shadow mode
    expect(document.getElementById('agentlet-core-styles')).toBeNull();

    await agentlet.cleanup();
  });

  test('cleanup/destroy removes the host and every injected style element, and resets ui.root/host', async () => {
    const agentlet = new AgentletCore();
    await agentlet.init();

    expect(document.getElementById('agentlet-host')).not.toBeNull();
    expect(document.getElementById('agentlet-core-theme')).not.toBeNull();

    await agentlet.cleanup();

    expect(document.getElementById('agentlet-host')).toBeNull();
    expect(document.getElementById('agentlet-core-theme')).toBeNull();
    expect(document.getElementById('agentlet-core-styles')).toBeNull();
    expect(agentlet.ui.root).toBeNull();
    expect(agentlet.ui.host).toBeNull();
    expect(agentlet.initialized).toBe(false);
    expect(window.agentlet).toBeUndefined();
  });

  test('cleanup/destroy in shadowDom: false mode removes the container, toggle and combined stylesheet', async () => {
    const agentlet = new AgentletCore({ shadowDom: false });
    await agentlet.init();

    expect(document.getElementById('agentlet-container')).not.toBeNull();

    await agentlet.cleanup();

    expect(document.getElementById('agentlet-container')).toBeNull();
    expect(document.getElementById('agentlet-toggle')).toBeNull();
    expect(document.getElementById('agentlet-core-styles')).toBeNull();
    expect(agentlet.ui.root).toBeNull();
    expect(agentlet.ui.host).toBeNull();
  });

  test('window.agentlet.utils.Dialog.info() mounts the overlay inside core.ui.root (shadow mode) or document.body (shadowDom: false)', async () => {
    const shadowAgentlet = new AgentletCore();
    await shadowAgentlet.init();

    window.agentlet.utils.Dialog.info('Hello there');

    const overlay = shadowAgentlet.ui.root.querySelector('.agentlet-dialog-overlay');
    expect(overlay).not.toBeNull();
    expect(overlay.getRootNode()).toBe(shadowAgentlet.ui.root);
    expect(document.body.contains(overlay)).toBe(false);

    window.agentlet.utils.Dialog.hide();
    await shadowAgentlet.cleanup();

    const plainAgentlet = new AgentletCore({ shadowDom: false });
    await plainAgentlet.init();

    window.agentlet.utils.Dialog.info('Hello there');

    const legacyOverlay = document.body.querySelector('.agentlet-dialog-overlay');
    expect(legacyOverlay).not.toBeNull();
    expect(legacyOverlay.parentNode).toBe(document.body);

    window.agentlet.utils.Dialog.hide();
    await plainAgentlet.cleanup();
  });
});
