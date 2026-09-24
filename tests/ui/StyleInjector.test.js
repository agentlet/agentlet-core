/**
 * Tests for StyleInjector's shadow-DOM-aware style injection:
 *  - theme CSS custom properties always land in <head> (#agentlet-core-theme)
 *  - UI rules (panel/component/dialog/animation + :host reset) land in the
 *    configured root, via adoptedStyleSheets when available or a fallback
 *    <style id="agentlet-core-styles"> element otherwise
 *  - shadowDom disabled (root === document.body) reproduces the exact legacy
 *    single combined <style id="agentlet-core-styles"> in <head>
 *
 * tests/setup.js globally mocks document.createElement/document.head with
 * lightweight doubles; these tests restore jsdom's real implementations so
 * real <style> elements actually land in a real <head>/ShadowRoot.
 */

import { StyleInjector } from '../../src/ui/StyleInjector.js';
import { ThemeManager } from '../../src/core/ThemeManager.js';

function createStyleInjector() {
  const themeManager = new ThemeManager({});
  return new StyleInjector(themeManager);
}

describe('StyleInjector', () => {
  beforeEach(() => {
    // Restore jsdom's real Document.prototype implementations by removing the
    // own-property mocks installed by tests/setup.js.
    delete document.createElement;
    delete document.head;
    document.body.innerHTML = '';
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.getElementById('agentlet-core-theme')?.remove();
    document.getElementById('agentlet-core-styles')?.remove();
  });

  describe('shadowDom disabled (legacy combined stylesheet)', () => {
    test('injects one combined #agentlet-core-styles element into <head>, with no separate theme element', () => {
      const injector = createStyleInjector();
      injector.setRoot(document.body);
      injector.injectStyles();

      const style = document.getElementById('agentlet-core-styles');
      expect(style).not.toBeNull();
      expect(style.parentNode).toBe(document.head);
      expect(style.textContent).toContain(':root');
      expect(style.textContent).toContain('--agentlet-primary-color:');
      expect(style.textContent).toContain('.agentlet-panel');
      expect(style.textContent).toContain('.agentlet-dialog-overlay');
      expect(style.textContent).not.toContain(':host {');

      expect(document.getElementById('agentlet-core-theme')).toBeNull();
    });

    test('a null root also falls back to the legacy combined stylesheet', () => {
      const injector = createStyleInjector();
      // setRoot() never called - this.root stays null
      injector.injectStyles();

      const style = document.getElementById('agentlet-core-styles');
      expect(style).not.toBeNull();
      expect(style.textContent).toContain('--agentlet-primary-color:');
    });

    test('regenerateStyles() replaces the single element rather than duplicating it', () => {
      const injector = createStyleInjector();
      injector.setRoot(document.body);
      injector.injectStyles();
      injector.regenerateStyles();

      const styles = document.querySelectorAll('#agentlet-core-styles');
      expect(styles.length).toBe(1);
    });
  });

  describe('shadow mode with adoptedStyleSheets support (stubbed)', () => {
    let originalCSSStyleSheet;

    beforeEach(() => {
      originalCSSStyleSheet = global.CSSStyleSheet;
      global.CSSStyleSheet = class FakeCSSStyleSheet {
        constructor() {
          this.cssText = '';
          this.replaceSyncCalls = 0;
        }

        replaceSync(css) {
          this.cssText = css;
          this.replaceSyncCalls += 1;
        }
      };
    });

    afterEach(() => {
      global.CSSStyleSheet = originalCSSStyleSheet;
    });

    test('creates a single adopted stylesheet and reuses it (no duplication) on regenerate', () => {
      const injector = createStyleInjector();
      const fakeRoot = {
        adoptedStyleSheets: [],
        querySelector: jest.fn(() => null)
      };

      injector.setRoot(fakeRoot);
      injector.injectStyles();

      // Theme variables still go to <head>, separately from the adopted sheet
      const themeStyle = document.getElementById('agentlet-core-theme');
      expect(themeStyle).not.toBeNull();
      expect(themeStyle.textContent).toContain('--agentlet-primary-color:');
      expect(document.getElementById('agentlet-core-styles')).toBeNull();

      expect(fakeRoot.adoptedStyleSheets.length).toBe(1);
      const sheet = fakeRoot.adoptedStyleSheets[0];
      expect(sheet.cssText).toContain(':host');
      expect(sheet.cssText).toContain('.agentlet-panel');
      expect(sheet.replaceSyncCalls).toBe(1);

      injector.regenerateStyles();

      // Same sheet instance, updated in place - never duplicated
      expect(fakeRoot.adoptedStyleSheets.length).toBe(1);
      expect(fakeRoot.adoptedStyleSheets[0]).toBe(sheet);
      expect(sheet.replaceSyncCalls).toBe(2);
    });

    test('does not touch adoptedStyleSheets of an unrelated root when regenerating a different one', () => {
      const injector = createStyleInjector();
      const rootA = { adoptedStyleSheets: [], querySelector: jest.fn(() => null) };

      injector.setRoot(rootA);
      injector.injectStyles();
      expect(rootA.adoptedStyleSheets.length).toBe(1);
    });
  });

  describe('shadow mode fallback (no adoptedStyleSheets support - real jsdom ShadowRoot)', () => {
    test('injects theme variables into <head> and UI rules (with :host reset) into the shadow root', () => {
      const injector = createStyleInjector();

      const host = document.createElement('div');
      document.body.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: 'open' });

      // Sanity check on the assumption this fallback path relies on: jsdom
      // exposes ShadowRoot but not the adoptedStyleSheets API.
      expect(shadowRoot.adoptedStyleSheets).toBeUndefined();

      injector.setRoot(shadowRoot);
      injector.injectStyles();

      const themeStyle = document.getElementById('agentlet-core-theme');
      expect(themeStyle).not.toBeNull();
      expect(themeStyle.parentNode).toBe(document.head);
      expect(themeStyle.textContent).toContain('--agentlet-primary-color:');

      expect(document.getElementById('agentlet-core-styles')).toBeNull();

      const uiStyle = shadowRoot.querySelector('#agentlet-core-styles');
      expect(uiStyle).not.toBeNull();
      expect(uiStyle.textContent).toContain(':host');
      expect(uiStyle.textContent).toContain('.agentlet-panel');
      expect(uiStyle.textContent).not.toContain(':root {');
    });

    test('regenerateStyles() replaces the fallback <style> in the shadow root rather than duplicating it', () => {
      const injector = createStyleInjector();

      const host = document.createElement('div');
      document.body.appendChild(host);
      const shadowRoot = host.attachShadow({ mode: 'open' });

      injector.setRoot(shadowRoot);
      injector.injectStyles();
      injector.regenerateStyles();

      const uiStyles = shadowRoot.querySelectorAll('#agentlet-core-styles');
      expect(uiStyles.length).toBe(1);

      const themeStyles = document.querySelectorAll('#agentlet-core-theme');
      expect(themeStyles.length).toBe(1);
    });
  });
});
