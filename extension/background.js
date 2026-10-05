/**
 * Agentlet Core - background service worker
 *
 * Least-privilege design: the extension has no host permissions and no
 * content script. When the user clicks "Activate on this page" in the popup,
 * or presses the keyboard shortcut, `activeTab` grants temporary access to
 * that one tab and this worker injects the bundled agentlet core into it with
 * chrome.scripting.executeScript. Only files shipped inside the extension
 * package are ever injected. Nothing is fetched, and no code is built from
 * strings.
 */

import { BUNDLED_MODULES } from './bundled-modules.js';

export const CORE_FILE = 'agentlet-core.js';
export const BOOTSTRAP_FILE = 'bootstrap.js';
export const MODULES_DIR = 'modules/';
export const SETTINGS_KEY = 'agentletSettings';
export const ACTIVATE_MESSAGE = 'ACTIVATE_TAB';
export const TOGGLE_COMMAND = 'toggle-agentlet';
export const DEFAULT_SETTINGS = Object.freeze({ debugMode: false, startMinimized: false });

const MODULE_FILE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*\.js$/;

/**
 * Functions below that start with "page" are serialized by
 * chrome.scripting.executeScript and run inside the page. They must not
 * reference anything outside their own body.
 */

/** Show or hide the panel if agentlet core is already running in the page. */
function pageToggle() {
    const agentlet = window.agentlet;
    if (!agentlet || !agentlet.ui) {
        return window.__agentletReady ? 'pending' : 'absent';
    }
    const container = agentlet.ui.container;
    const hidden = !container || container.style.display === 'none';
    if (hidden) {
        agentlet.ui.show();
        return 'shown';
    }
    agentlet.ui.hide();
    return 'hidden';
}

/** Hand the (data only) settings to bootstrap.js. */
function pageSetConfig(config) {
    window.agentletConfig = config;
}

/** Resolve once the core started by bootstrap.js has finished init(). */
async function pageWaitUntilReady() {
    try {
        await window.__agentletReady;
        return { ok: Boolean(window.agentlet) };
    } catch (error) {
        return { ok: false, error: String(error && error.message ? error.message : error) };
    }
}

/**
 * Keep only the known boolean settings, so nothing else stored (for example
 * by an older version) ever reaches the page.
 */
export function sanitizeSettings(raw) {
    const source = raw && typeof raw === 'object' ? raw : {};
    return {
        debugMode: source.debugMode === true,
        startMinimized: source.startMinimized === true
    };
}

export async function readSettings(api = globalThis.chrome) {
    const stored = await api.storage.sync.get(SETTINGS_KEY);
    return sanitizeSettings(stored && stored[SETTINGS_KEY]);
}

function moduleFiles(modules) {
    return modules.map((name) => {
        if (typeof name !== 'string' || !MODULE_FILE_PATTERN.test(name)) {
            throw new Error(`Invalid bundled module name: ${String(name)}`);
        }
        return MODULES_DIR + name;
    });
}

function runInPage(api, tabId, details) {
    return api.scripting.executeScript({ target: { tabId }, world: 'MAIN', ...details });
}

/**
 * Activate agentlet core on a tab: show or hide the panel when it is already
 * there, otherwise inject the bundled core, start it, then inject the bundled
 * modules. Resolves to { success: true, state } or throws.
 */
export async function activateTab(tabId, api = globalThis.chrome, modules = BUNDLED_MODULES) {
    if (!Number.isInteger(tabId) || tabId < 0) {
        throw new Error('A valid tab id is required');
    }
    const files = moduleFiles(modules);

    const [probe] = await runInPage(api, tabId, { func: pageToggle });
    const state = probe && probe.result;
    if (state === 'shown' || state === 'hidden' || state === 'pending') {
        return { success: true, state };
    }

    const settings = await readSettings(api);
    await runInPage(api, tabId, { func: pageSetConfig, args: [settings] });
    await runInPage(api, tabId, { files: [CORE_FILE, BOOTSTRAP_FILE] });

    const [ready] = await runInPage(api, tabId, { func: pageWaitUntilReady });
    if (!ready || !ready.result || !ready.result.ok) {
        const reason = ready && ready.result && ready.result.error;
        throw new Error(reason ? `Agentlet core failed to start: ${reason}` : 'Agentlet core failed to start');
    }

    if (files.length > 0) {
        await runInPage(api, tabId, { files });
    }
    return { success: true, state: 'injected' };
}

/** Make a failure visible on the toolbar icon of the tab (no extra permission needed). */
async function reportFailure(tabId, error, api) {
    console.warn('Agentlet core could not be activated:', error && error.message);
    try {
        await api.action.setBadgeText({ tabId, text: '!' });
        await api.action.setTitle({
            tabId,
            title: 'Agentlet core could not run on this page: ' + (error && error.message ? error.message : 'unknown error')
        });
    } catch (badgeError) {
        console.warn('Could not set the toolbar badge:', badgeError && badgeError.message);
    }
}

export async function handleCommand(command, tab, api = globalThis.chrome) {
    if (command !== TOGGLE_COMMAND) {
        return;
    }
    let tabId = tab && tab.id;
    if (tabId === undefined) {
        const [active] = await api.tabs.query({ active: true, currentWindow: true });
        tabId = active && active.id;
    }
    try {
        await activateTab(tabId, api);
    } catch (error) {
        if (Number.isInteger(tabId)) {
            await reportFailure(tabId, error, api);
        }
    }
}

/**
 * Only messages from this extension's own pages (the popup) are accepted.
 * Returns true when the response is sent asynchronously.
 */
export function handleMessage(message, sender, sendResponse, api = globalThis.chrome) {
    if (!sender || sender.id !== api.runtime.id) {
        sendResponse({ success: false, error: 'Unexpected sender' });
        return false;
    }
    if (!message || message.type !== ACTIVATE_MESSAGE) {
        sendResponse({ success: false, error: 'Unknown message type' });
        return false;
    }
    activateTab(message.tabId, api)
        .then((result) => sendResponse(result))
        .catch((error) => sendResponse({ success: false, error: error.message }));
    return true;
}

export async function handleInstalled(details, api = globalThis.chrome) {
    if (details.reason === 'install') {
        await api.tabs.create({ url: api.runtime.getURL('welcome.html') });
    } else if (details.reason === 'update') {
        // Drop anything an older version stored (a module registry with URLs,
        // trusted domains, and so on) and keep only the known settings.
        const settings = await readSettings(api);
        await api.storage.sync.set({ [SETTINGS_KEY]: settings });
    }
}

export function register(api = globalThis.chrome) {
    api.runtime.onInstalled.addListener((details) => handleInstalled(details, api));
    api.runtime.onMessage.addListener((message, sender, sendResponse) =>
        handleMessage(message, sender, sendResponse, api)
    );
    api.commands.onCommand.addListener((command, tab) => handleCommand(command, tab, api));
}

if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.id) {
    register(chrome);
}
