/**
 * Shared test helpers for reaching inside the AgentletCore UI mount root -
 * the shadow root when shadowDom is enabled (the default), or document.body
 * when it is disabled via `shadowDom: false`. See docs/shadow-dom.md.
 *
 * Mirrors the same core.ui.root/query()/queryAll() surface application code
 * uses (see UIManager.ensureRoot() and GlobalAPI.setupGlobalAccess()), so
 * tests exercise the real public shape rather than reaching past it.
 */

/**
 * @param {import('../../src/index.js').default} core - an AgentletCore instance
 * @returns {ShadowRoot|HTMLElement|null} the UI mount root
 */
export function getUiRoot(core) {
  return core.ui.root;
}

/**
 * @param {import('../../src/index.js').default} core
 * @param {string} selector
 * @returns {Element|null}
 */
export function queryUi(core, selector) {
  return core.ui.query(selector);
}

/**
 * @param {import('../../src/index.js').default} core
 * @param {string} selector
 * @returns {NodeListOf<Element>}
 */
export function queryAllUi(core, selector) {
  return core.ui.queryAll(selector);
}
