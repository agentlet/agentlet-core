/**
 * Unit tests for the extension's background worker, with a mocked `chrome`
 * API. The worker never touches the global `chrome` in these tests: every
 * function takes the API as a parameter.
 */
import {
    activateTab,
    handleCommand,
    handleInstalled,
    handleMessage,
    readSettings,
    register,
    sanitizeSettings,
    ACTIVATE_MESSAGE,
    CORE_FILE,
    BOOTSTRAP_FILE,
    SETTINGS_KEY,
    TOGGLE_COMMAND
} from '../../extension/background.js';
import { BUNDLED_MODULES } from '../../extension/bundled-modules.js';

function createChrome({ probeResult = 'absent', settings, readyResult = { ok: true } } = {}) {
    const calls = [];
    const api = {
        runtime: {
            id: 'extension-id',
            getURL: jest.fn((p) => `chrome-extension://extension-id/${p}`),
            onInstalled: { addListener: jest.fn() },
            onMessage: { addListener: jest.fn() }
        },
        commands: { onCommand: { addListener: jest.fn() } },
        action: {
            setBadgeText: jest.fn().mockResolvedValue(undefined),
            setTitle: jest.fn().mockResolvedValue(undefined)
        },
        tabs: {
            create: jest.fn().mockResolvedValue({}),
            query: jest.fn().mockResolvedValue([{ id: 99 }])
        },
        storage: {
            sync: {
                get: jest.fn().mockResolvedValue(settings === undefined ? {} : { [SETTINGS_KEY]: settings }),
                set: jest.fn().mockResolvedValue(undefined)
            }
        },
        scripting: {
            executeScript: jest.fn(async (details) => {
                calls.push(details);
                if (details.func && details.func.name === 'pageToggle') {
                    return [{ result: probeResult }];
                }
                if (details.func && details.func.name === 'pageWaitUntilReady') {
                    return [{ result: readyResult }];
                }
                return [{ result: undefined }];
            })
        }
    };
    return { api, calls };
}

describe('extension background worker', () => {
    describe('activateTab', () => {
        test('injects the bundled core and bootstrap files into the given tab', async () => {
            const { api, calls } = createChrome();
            const result = await activateTab(42, api, []);

            expect(result).toEqual({ success: true, state: 'injected' });
            const fileCalls = calls.filter((c) => c.files);
            expect(fileCalls).toHaveLength(1);
            expect(fileCalls[0].files).toEqual([CORE_FILE, BOOTSTRAP_FILE]);
            expect(fileCalls[0].target).toEqual({ tabId: 42 });
            expect(fileCalls[0].world).toBe('MAIN');
            for (const call of calls) {
                expect(call.target).toEqual({ tabId: 42 });
            }
        });

        test('injects bundled modules after the core is ready, in the same tab', async () => {
            const { api, calls } = createChrome();
            await activateTab(7, api, ['one.js', 'two.js']);

            const names = calls.map((c) => (c.files ? c.files.join(',') : c.func.name));
            expect(names).toEqual([
                'pageToggle',
                'pageSetConfig',
                `${CORE_FILE},${BOOTSTRAP_FILE}`,
                'pageWaitUntilReady',
                'modules/one.js,modules/two.js'
            ]);
        });

        test('only ever injects files that are bundled in the package', async () => {
            const { api, calls } = createChrome();
            await activateTab(7, api, BUNDLED_MODULES);
            for (const call of calls.filter((c) => c.files)) {
                for (const file of call.files) {
                    expect(file).toMatch(/^(agentlet-core\.js|bootstrap\.js|modules\/[A-Za-z0-9][A-Za-z0-9._-]*\.js)$/);
                }
            }
        });

        test('rejects module names that are paths or URLs', async () => {
            const { api } = createChrome();
            for (const bad of ['https://evil.example/x.js', '../x.js', 'a/b.js', '', 'x.txt', 42]) {
                await expect(activateTab(1, api, [bad])).rejects.toThrow('Invalid bundled module name');
            }
            expect(api.scripting.executeScript).not.toHaveBeenCalled();
        });

        test('rejects an invalid tab id without injecting', async () => {
            const { api } = createChrome();
            for (const bad of [undefined, null, '5', -1, 1.5]) {
                await expect(activateTab(bad, api, [])).rejects.toThrow('valid tab id');
            }
            expect(api.scripting.executeScript).not.toHaveBeenCalled();
        });

        test('toggles the panel instead of injecting twice', async () => {
            for (const state of ['shown', 'hidden', 'pending']) {
                const { api, calls } = createChrome({ probeResult: state });
                const result = await activateTab(5, api, ['one.js']);
                expect(result).toEqual({ success: true, state });
                expect(calls).toHaveLength(1);
                expect(calls[0].files).toBeUndefined();
            }
        });

        test('passes only the known boolean settings to the page', async () => {
            const { api, calls } = createChrome({
                settings: {
                    debugMode: true,
                    startMinimized: 'yes',
                    registryUrl: 'https://evil.example/registry.js',
                    moduleRegistry: [{ url: 'https://evil.example/m.js' }]
                }
            });
            await activateTab(3, api, []);
            const configCall = calls.find((c) => c.func && c.func.name === 'pageSetConfig');
            expect(configCall.args).toEqual([{ debugMode: true, startMinimized: false }]);
        });

        test('throws when the core fails to start', async () => {
            const { api } = createChrome({ readyResult: { ok: false, error: 'boom' } });
            await expect(activateTab(3, api, [])).rejects.toThrow('Agentlet core failed to start: boom');
        });

        test('propagates executeScript failures (restricted pages)', async () => {
            const { api } = createChrome();
            api.scripting.executeScript.mockRejectedValueOnce(new Error('Cannot access a chrome:// URL'));
            await expect(activateTab(3, api, [])).rejects.toThrow('Cannot access a chrome:// URL');
        });
    });

    describe('handleCommand', () => {
        test('activates the tab passed with the toggle command', async () => {
            const { api, calls } = createChrome();
            await handleCommand(TOGGLE_COMMAND, { id: 11 }, api);
            expect(calls.some((c) => c.files && c.files.includes(CORE_FILE))).toBe(true);
            expect(api.tabs.query).not.toHaveBeenCalled();
        });

        test('falls back to the active tab when none is passed', async () => {
            const { api, calls } = createChrome();
            await handleCommand(TOGGLE_COMMAND, undefined, api);
            expect(api.tabs.query).toHaveBeenCalledWith({ active: true, currentWindow: true });
            expect(calls[0].target).toEqual({ tabId: 99 });
        });

        test('ignores other commands', async () => {
            const { api } = createChrome();
            await handleCommand('something-else', { id: 11 }, api);
            expect(api.scripting.executeScript).not.toHaveBeenCalled();
        });

        test('marks the toolbar icon when injection fails', async () => {
            const { api } = createChrome();
            api.scripting.executeScript.mockRejectedValue(new Error('Cannot access this page'));
            const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
            await handleCommand(TOGGLE_COMMAND, { id: 11 }, api);
            warn.mockRestore();
            expect(api.action.setBadgeText).toHaveBeenCalledWith({ tabId: 11, text: '!' });
            expect(api.action.setTitle).toHaveBeenCalledWith(
                expect.objectContaining({ tabId: 11, title: expect.stringContaining('Cannot access this page') })
            );
        });
    });

    describe('handleMessage', () => {
        test('activates the requested tab for a message from the popup', async () => {
            const { api, calls } = createChrome();
            const response = await new Promise((resolve) => {
                const keepOpen = handleMessage({ type: ACTIVATE_MESSAGE, tabId: 8 }, { id: 'extension-id' }, resolve, api);
                expect(keepOpen).toBe(true);
            });
            expect(response).toEqual({ success: true, state: 'injected' });
            expect(calls.some((c) => c.target.tabId === 8 && c.files)).toBe(true);
        });

        test('reports an error response when activation fails', async () => {
            const { api } = createChrome();
            api.scripting.executeScript.mockRejectedValue(new Error('nope'));
            const response = await new Promise((resolve) => {
                handleMessage({ type: ACTIVATE_MESSAGE, tabId: 8 }, { id: 'extension-id' }, resolve, api);
            });
            expect(response).toEqual({ success: false, error: 'nope' });
        });

        test('rejects messages from other senders', () => {
            const { api } = createChrome();
            const sendResponse = jest.fn();
            const keepOpen = handleMessage(
                { type: ACTIVATE_MESSAGE, tabId: 8 },
                { id: 'another-extension' },
                sendResponse,
                api
            );
            expect(keepOpen).toBe(false);
            expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Unexpected sender' });
            expect(api.scripting.executeScript).not.toHaveBeenCalled();
        });

        test('rejects unknown message types, including the old module loading messages', () => {
            const { api } = createChrome();
            for (const type of ['LOAD_MODULE', 'INJECT_SCRIPT', 'GET_SETTINGS', undefined]) {
                const sendResponse = jest.fn();
                const keepOpen = handleMessage(
                    { type, moduleUrl: 'https://evil.example/m.js' },
                    { id: 'extension-id' },
                    sendResponse,
                    api
                );
                expect(keepOpen).toBe(false);
                expect(sendResponse).toHaveBeenCalledWith({ success: false, error: 'Unknown message type' });
            }
            expect(api.scripting.executeScript).not.toHaveBeenCalled();
        });
    });

    describe('settings and lifecycle', () => {
        test('sanitizeSettings keeps only known booleans', () => {
            expect(sanitizeSettings(undefined)).toEqual({ debugMode: false, startMinimized: false });
            expect(sanitizeSettings({ debugMode: true, extra: 1 })).toEqual({ debugMode: true, startMinimized: false });
        });

        test('readSettings reads from storage.sync', async () => {
            const { api } = createChrome({ settings: { startMinimized: true } });
            await expect(readSettings(api)).resolves.toEqual({ debugMode: false, startMinimized: true });
        });

        test('opens the welcome page on install', async () => {
            const { api } = createChrome();
            await handleInstalled({ reason: 'install' }, api);
            expect(api.tabs.create).toHaveBeenCalledWith({ url: 'chrome-extension://extension-id/welcome.html' });
        });

        test('drops legacy stored settings on update', async () => {
            const { api } = createChrome({
                settings: { debugMode: true, moduleRegistry: [{ url: 'https://example.com/m.js' }], trustedDomains: ['x'] }
            });
            await handleInstalled({ reason: 'update', previousVersion: '2.2.0' }, api);
            expect(api.storage.sync.set).toHaveBeenCalledWith({
                [SETTINGS_KEY]: { debugMode: true, startMinimized: false }
            });
        });

        test('register adds only the install, message and command listeners', () => {
            const { api } = createChrome();
            register(api);
            expect(api.runtime.onInstalled.addListener).toHaveBeenCalledTimes(1);
            expect(api.runtime.onMessage.addListener).toHaveBeenCalledTimes(1);
            expect(api.commands.onCommand.addListener).toHaveBeenCalledTimes(1);
        });
    });
});
