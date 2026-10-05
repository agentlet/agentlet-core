/**
 * Modules bundled inside the extension package.
 *
 * This is the only list of modules the extension will ever inject. Each entry
 * is the file name of a script in `extension/modules/` (no path, no URL). The
 * build copies the listed files into the package and fails if a listed file is
 * missing or if a file in `extension/modules/` is not listed here.
 *
 * To bundle a module: put its script in `extension/modules/`, add its file
 * name below, and rebuild. It runs after agentlet core is ready and is
 * expected to register itself with `window.agentlet.modules.register(...)`.
 *
 * The extension does not load modules from URLs, from storage or from the
 * page. Adding a module means shipping a new version of the extension.
 */
export const BUNDLED_MODULES = [];
