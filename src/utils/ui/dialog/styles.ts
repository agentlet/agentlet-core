/**
 * CSS keyframe animations shared by every dialog type (spinner, pulsing
 * wait icon, animated progress-bar stripes).
 *
 * These normally live in AgentletCore's own stylesheet (see
 * StyleInjector.generateAnimationStyles()), injected once for the whole UI.
 * addDialogStyles() below is only a fallback for standalone use of the
 * Dialog class (no AgentletCore instance around it, e.g. `new Dialog()`
 * used directly by an agentlet author) and is a no-op whenever a core
 * stylesheet already covers the mount root.
 */
const DIALOG_STYLE_ELEMENT_ID = 'agentlet-dialog-styles';
const CORE_STYLE_ELEMENT_ID = 'agentlet-core-styles';

const DIALOG_STYLES_CSS = `
    @keyframes pulse {
        0%, 100% { transform: scale(1); opacity: 1; }
        50% { transform: scale(1.1); opacity: 0.7; }
    }

    @keyframes spin {
        0% { transform: rotate(0deg); }
        100% { transform: rotate(360deg); }
    }

    @keyframes agentlet-progress-animate {
        0% { background-position: 200% 0; }
        100% { background-position: -200% 0; }
    }
`;

/**
 * Injects the fallback dialog `<style>` element, idempotently per root.
 *
 * A no-op whenever a core stylesheet already covers `root` - checked via
 * adopted stylesheets (a real `ShadowRoot` with AgentletCore's styles
 * applied through `StyleInjector`) or an `#agentlet-core-styles` element,
 * either inside `root` itself or in `<head>` (legacy/no-root mode).
 *
 * Otherwise injects into a fallback target: `<head>` when `root` is
 * `document.body` (legacy mode / no root yet), or `root` itself (a shadow
 * root) - and only once per target, since it is safe to call on every
 * show*() call.
 */
export function addDialogStyles(root: ShadowRoot | HTMLElement): void {
    // A real `ShadowRoot` has `adoptedStyleSheets`; `document.body` (an
    // `HTMLElement`) does not, so this only ever matches a shadow root.
    const hasAdoptedCoreStyles = 'adoptedStyleSheets' in root &&
        Array.isArray((root as ShadowRoot).adoptedStyleSheets) &&
        (root as ShadowRoot).adoptedStyleSheets.length > 0;
    const hasCoreStyleInRoot = typeof root.querySelector === 'function' &&
        !!root.querySelector(`#${CORE_STYLE_ELEMENT_ID}`);
    const hasCoreStyleInHead = typeof document !== 'undefined' &&
        !!document.getElementById(CORE_STYLE_ELEMENT_ID);
    if (hasAdoptedCoreStyles || hasCoreStyleInRoot || hasCoreStyleInHead) {
        return;
    }

    const target: ShadowRoot | HTMLElement = root === document.body ? document.head : root;
    if (!target || typeof target.querySelector !== 'function' || target.querySelector(`#${DIALOG_STYLE_ELEMENT_ID}`)) {
        return;
    }

    const style = document.createElement('style');
    style.id = DIALOG_STYLE_ELEMENT_ID;
    style.textContent = DIALOG_STYLES_CSS;

    target.appendChild(style);
}
