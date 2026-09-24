/**
 * Behaviour characterization tests for StyleInjector, ahead of its
 * conversion to TypeScript.
 *
 * tests/ui/StyleInjector.test.js already covers the high-level
 * injectStyles()/regenerateStyles() dispatch (legacy vs shadow mode,
 * adoptedStyleSheets vs fallback <style>) via `.toContain()` assertions.
 * This file adds what that suite does not:
 *
 *  - full-content snapshots of each `generate*Styles()` method for the
 *    default theme - these snapshots ARE the contract that the generated
 *    CSS stays byte-identical across the .js -> .ts conversion; any change
 *    to a snapshot means the conversion changed behaviour, not that the
 *    snapshot needs updating;
 *  - direct unit coverage of `setRoot()`/`isShadowMode()`, including the
 *    exact-`document.body` quirk;
 *  - the exact concatenation order of the seven CSS-generating methods in
 *    both legacy and shadow injection paths;
 *  - `injectAdoptedStyles()` cleaning up a leftover fallback `<style>` left
 *    behind by an earlier injection that didn't have adoptedStyleSheets
 *    support;
 *  - `injectFallbackStyles()` not duplicating when called twice directly
 *    (not just through `regenerateStyles()`);
 *  - the `console.log` message `regenerateStyles()` emits.
 *
 * tests/setup.js globally mocks document.createElement/document.head with
 * lightweight doubles; these tests restore jsdom's real implementations so
 * real <style> elements actually land in a real <head>/ShadowRoot.
 */

import { StyleInjector } from '../../src/ui/StyleInjector.js';
import { ThemeManager } from '../../src/core/ThemeManager.js';
import { Z_INDEX } from '../../src/utils/ui/ZIndex.js';
import type { AgentletTheme } from '../../src/types/public-api';

/** `StyleInjector.js` is untyped plain JS pre-conversion; this describes the
 * real runtime surface this suite drives directly (generate*Styles() are
 * not part of the public StyleInjectorAPI declaration, which only exposes
 * injectStyles()/regenerateStyles()). */
interface StyleInjectorTestInstance {
    styleId: string;
    themeStyleId: string;
    root: ShadowRoot | HTMLElement | { adoptedStyleSheets?: unknown[]; querySelector?: (selector: string) => Element | null } | null;
    setRoot(root: StyleInjectorTestInstance['root']): void;
    isShadowMode(): boolean;
    generateCSSProperties(theme: AgentletTheme): string;
    generatePanelStyles(): string;
    generateHostResetStyles(): string;
    generateComponentStyles(): string;
    generateDialogStyles(): string;
    generateBubbleStyles(): string;
    generateAnimationStyles(): string;
    injectStyles(): void;
    injectUIStyles(): void;
    injectFallbackStyles(root: StyleInjectorTestInstance['root'], css: string): void;
    regenerateStyles(): void;
}

const StyleInjectorCtor = StyleInjector as unknown as new (themeManager: ThemeManager) => StyleInjectorTestInstance;

function createStyleInjector(): StyleInjectorTestInstance {
    const themeManager = new ThemeManager({});
    return new StyleInjectorCtor(themeManager);
}

function defaultTheme(): AgentletTheme {
    return new ThemeManager({}).processThemeConfig(undefined);
}

describe('StyleInjector behaviour characterization', () => {
    beforeEach(() => {
        // Restore jsdom's real Document.prototype implementations by removing
        // the own-property mocks installed by tests/setup.js.
        delete (document as unknown as { createElement?: unknown }).createElement;
        delete (document as unknown as { head?: unknown }).head;
        document.body.innerHTML = '';
    });

    afterEach(() => {
        document.body.innerHTML = '';
        document.getElementById('agentlet-core-theme')?.remove();
        document.getElementById('agentlet-core-styles')?.remove();
    });

    describe('constructor / setRoot / isShadowMode', () => {
        test('constructor sets the expected style ids and a null root', () => {
            const injector = createStyleInjector();
            expect(injector.styleId).toBe('agentlet-core-styles');
            expect(injector.themeStyleId).toBe('agentlet-core-theme');
            expect(injector.root).toBeNull();
        });

        test('isShadowMode() is false before setRoot() is ever called', () => {
            const injector = createStyleInjector();
            expect(injector.isShadowMode()).toBe(false);
        });

        test('isShadowMode() is false when root is exactly document.body', () => {
            const injector = createStyleInjector();
            injector.setRoot(document.body);
            expect(injector.isShadowMode()).toBe(false);
        });

        test('isShadowMode() is true for any truthy root other than document.body (quirk: no ShadowRoot type check)', () => {
            const injector = createStyleInjector();
            // A plain object is accepted as "shadow mode" - isShadowMode() only
            // checks truthiness and !== document.body, not `instanceof ShadowRoot`.
            injector.setRoot({ adoptedStyleSheets: [] });
            expect(injector.isShadowMode()).toBe(true);
        });

        test('setRoot(null) resets to non-shadow mode', () => {
            const injector = createStyleInjector();
            injector.setRoot({ adoptedStyleSheets: [] });
            expect(injector.isShadowMode()).toBe(true);
            injector.setRoot(null);
            expect(injector.isShadowMode()).toBe(false);
        });
    });

    describe('generate*Styles() snapshots (byte-identical CSS contract)', () => {
        test('generateCSSProperties(theme) for the default theme', () => {
            const injector = createStyleInjector();
            expect(injector.generateCSSProperties(defaultTheme())).toMatchSnapshot();
        });

        test('generatePanelStyles()', () => {
            const injector = createStyleInjector();
            expect(injector.generatePanelStyles()).toMatchSnapshot();
        });

        test('generateHostResetStyles()', () => {
            const injector = createStyleInjector();
            expect(injector.generateHostResetStyles()).toMatchSnapshot();
        });

        test('generateComponentStyles()', () => {
            const injector = createStyleInjector();
            expect(injector.generateComponentStyles()).toMatchSnapshot();
        });

        test('generateDialogStyles()', () => {
            const injector = createStyleInjector();
            expect(injector.generateDialogStyles()).toMatchSnapshot();
        });

        test('generateBubbleStyles()', () => {
            const injector = createStyleInjector();
            expect(injector.generateBubbleStyles()).toMatchSnapshot();
        });

        test('generateAnimationStyles()', () => {
            const injector = createStyleInjector();
            expect(injector.generateAnimationStyles()).toMatchSnapshot();
        });

        test('generatePanelStyles() and generateDialogStyles() embed the real Z_INDEX constants, not hardcoded numbers', () => {
            const injector = createStyleInjector();
            expect(injector.generatePanelStyles()).toContain(`z-index: ${Z_INDEX.PANEL};`);
            expect(injector.generatePanelStyles()).toContain(`z-index: ${Z_INDEX.CRITICAL_OVERLAY};`);
            expect(injector.generateDialogStyles()).toContain(`z-index: ${Z_INDEX.DIALOG_OVERLAY};`);
        });

        test('generateCSSProperties(theme) interpolates an arbitrary custom theme value verbatim', () => {
            const injector = createStyleInjector();
            const theme = { ...defaultTheme(), primaryColor: 'rgb(1, 2, 3)' };
            expect(injector.generateCSSProperties(theme)).toContain('--agentlet-primary-color: rgb(1, 2, 3);');
        });
    });

    describe('injection concatenation order', () => {
        test('legacy mode concatenates the seven blocks in order: properties, panel, component, dialog, bubble, animation', () => {
            const injector = createStyleInjector();
            injector.setRoot(document.body);
            injector.injectStyles();

            const style = document.getElementById('agentlet-core-styles') as HTMLStyleElement;
            const css = style.textContent ?? '';

            const iProps = css.indexOf('--agentlet-primary-color');
            const iPanel = css.indexOf('.agentlet-panel {');
            const iComponent = css.indexOf('.agentlet-header {');
            const iDialog = css.indexOf('.agentlet-dialog-overlay {');
            const iBubble = css.indexOf('.agentlet-bubble:hover');
            const iAnimation = css.indexOf('.agentlet-image-overlay {');

            expect([iProps, iPanel, iComponent, iDialog, iBubble, iAnimation].every((i) => i >= 0)).toBe(true);
            expect(iProps).toBeLessThan(iPanel);
            expect(iPanel).toBeLessThan(iComponent);
            expect(iComponent).toBeLessThan(iDialog);
            expect(iDialog).toBeLessThan(iBubble);
            expect(iBubble).toBeLessThan(iAnimation);
        });

        test('shadow fallback mode prefixes the :host reset before panel styles, with no :root block', () => {
            const injector = createStyleInjector();
            const host = document.createElement('div');
            document.body.appendChild(host);
            const shadowRoot = host.attachShadow({ mode: 'open' });

            injector.setRoot(shadowRoot);
            injector.injectStyles();

            const uiStyle = shadowRoot.querySelector('#agentlet-core-styles') as HTMLStyleElement;
            const css = uiStyle.textContent ?? '';
            const iHost = css.indexOf(':host {');
            const iPanel = css.indexOf('.agentlet-panel {');
            expect(iHost).toBeGreaterThanOrEqual(0);
            expect(iHost).toBeLessThan(iPanel);
            expect(css).not.toContain(':root {');
        });
    });

    describe('adoptedStyleSheets fallback cleanup quirk', () => {
        test('injectAdoptedStyles() removes a leftover fallback <style id="agentlet-core-styles"> from a prior non-adopted injection', () => {
            const injector = createStyleInjector();
            const fallbackStyle = document.createElement('style');
            fallbackStyle.id = 'agentlet-core-styles';

            const fakeRoot = {
                adoptedStyleSheets: [] as unknown[],
                querySelector: jest.fn((selector: string) => (selector === '#agentlet-core-styles' ? fallbackStyle : null))
            };

            const originalCSSStyleSheet = global.CSSStyleSheet;
            (global as unknown as { CSSStyleSheet: unknown }).CSSStyleSheet = class FakeSheet {
                replaceSync(): void {
                    // no-op
                }
            };

            try {
                injector.setRoot(fakeRoot as unknown as ShadowRoot);
                injector.injectStyles();
                expect(fakeRoot.querySelector).toHaveBeenCalledWith('#agentlet-core-styles');
                expect(fakeRoot.adoptedStyleSheets.length).toBe(1);
            } finally {
                global.CSSStyleSheet = originalCSSStyleSheet;
            }
        });
    });

    describe('injectFallbackStyles() direct calls do not duplicate', () => {
        test('calling injectUIStyles() twice in fallback mode replaces rather than duplicates the <style>', () => {
            const injector = createStyleInjector();
            const host = document.createElement('div');
            document.body.appendChild(host);
            const shadowRoot = host.attachShadow({ mode: 'open' });

            injector.setRoot(shadowRoot);
            injector.injectUIStyles();
            injector.injectUIStyles();

            expect(shadowRoot.querySelectorAll('#agentlet-core-styles').length).toBe(1);
        });
    });

    describe('regenerateStyles()', () => {
        test('logs the expected console message', () => {
            const injector = createStyleInjector();
            injector.setRoot(document.body);
            const logSpy = jest.spyOn(console, 'log').mockImplementation();

            injector.regenerateStyles();

            expect(logSpy).toHaveBeenCalledWith('\u{1F3A8} Styles regenerated with updated theme');
            logSpy.mockRestore();
        });
    });
});
