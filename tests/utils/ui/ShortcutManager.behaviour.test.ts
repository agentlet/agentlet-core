/**
 * Characterization tests for ShortcutManager's general-purpose API surface.
 *
 * These tests pin down the CURRENT behaviour of
 * `src/utils/ui/ShortcutManager.js` before it is converted to
 * `ShortcutManager.ts`. Nothing here should change when the conversion
 * lands - if an assertion needs to change, the conversion changed
 * behaviour and that is a bug in the conversion, not in this file.
 *
 * `tests/utils/ui/ShortcutManager.test.js` already covers the shadow-DOM
 * target-resolution regression (getEventTarget()/isEditableTarget()) end
 * to end through real hotkeys-js keydown dispatch. This file covers the
 * rest of the public surface it does not: register()'s option defaults and
 * duplicate-registration behaviour, unregister()/setEnabled()/
 * getShortcuts()/isRegistered()/clear(), registerDefaultShortcuts(),
 * showHelp(), createProxy() and the hotkeys-js-unavailable path - without
 * dispatching real keyboard events.
 */

import hotkeys from 'hotkeys-js';
import ShortcutManager from '../../../src/utils/ui/ShortcutManager.js';
import type { ShortcutRegisterOptions } from '../../../src/types/public-api';

/**
 * `ShortcutManager.js`'s current (pre-conversion) JSDoc has no
 * `[options.x]` optionality markers, so TypeScript's JS inference treats
 * every `register()` option as required - the exact gap
 * `ShortcutRegisterOptions` (and this conversion) closes. Bridges the two
 * so these characterization tests can pass partial options the same way
 * real consumers do.
 */
function register(
    manager: ShortcutManager,
    keys: string,
    callback: (event: KeyboardEvent, handler: Record<string, unknown>) => void,
    options?: ShortcutRegisterOptions
): Promise<boolean> {
    return (manager.register as (
        keys: string,
        callback: (event: KeyboardEvent, handler: Record<string, unknown>) => void,
        options?: ShortcutRegisterOptions
    ) => Promise<boolean>)(keys, callback, options);
}

/** Minimal shape of `window.agentlet.utils.Dialog` these tests need. */
interface DialogMock {
    show: jest.Mock;
    isActive: boolean;
    hide: jest.Mock;
    quickCommand: jest.Mock;
}

function installDialogMock(): DialogMock {
    const dialog: DialogMock = {
        show: jest.fn(),
        isActive: false,
        hide: jest.fn(),
        quickCommand: jest.fn()
    };
    (window as unknown as { agentlet: { utils: { Dialog: DialogMock } } }).agentlet = {
        utils: { Dialog: dialog }
    };
    return dialog;
}

describe('ShortcutManager - register()', () => {
    let manager: ShortcutManager;

    beforeEach(() => {
        manager = new ShortcutManager();
        manager.init(hotkeys);
    });

    afterEach(() => {
        hotkeys.unbind();
        manager.clear();
    });

    test('defaults description to "Shortcut for <keys>" when omitted', async () => {
        await manager.register('ctrl+k', jest.fn());

        const [info] = manager.getShortcuts();
        expect(info.description).toBe('Shortcut for ctrl+k');
    });

    test('defaults scope to "all" and allowInInputs to false when omitted', async () => {
        await manager.register('ctrl+k', jest.fn());

        const [info] = manager.getShortcuts();
        expect(info.scope).toBe('all');
        expect(info.allowInInputs).toBe(false);
    });

    test('rejects registration when keys is falsy', async () => {
        const result = await manager.register('', jest.fn());

        expect(result).toBe(false);
        expect(manager.getShortcuts()).toHaveLength(0);
    });

    test('rejects registration when callback is not a function', async () => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- deliberately passing an invalid callback to exercise the runtime guard
        const result = await manager.register('ctrl+k', 'not-a-function' as any);

        expect(result).toBe(false);
    });

    test('duplicate registration under the same keys overwrites the stored entry (last config wins)', async () => {
        await register(manager, 'ctrl+k', jest.fn(), { scope: 'first' });
        await register(manager, 'ctrl+k', jest.fn(), { scope: 'second' });

        expect(manager.getShortcuts()).toHaveLength(1);
        expect(manager.getShortcuts()[0].scope).toBe('second');
    });
});

describe('ShortcutManager - hotkeys-js availability', () => {
    // Importing 'hotkeys-js' assigns itself to `window.hotkeys` as a side
    // effect (see its UMD bundle), so `isHotkeysAvailable()` would
    // otherwise see it as available throughout this whole test file. These
    // tests specifically exercise the "not available" path, so they must
    // remove it first and restore it afterward.
    let originalWindowHotkeys: unknown;

    beforeEach(() => {
        originalWindowHotkeys = (window as unknown as { hotkeys?: unknown }).hotkeys;
        delete (window as unknown as { hotkeys?: unknown }).hotkeys;
    });

    afterEach(() => {
        hotkeys.unbind();
        (window as unknown as { hotkeys?: unknown }).hotkeys = originalWindowHotkeys;
    });

    test('register() returns false and warns when hotkeys-js was never made available', async () => {
        const manager = new ShortcutManager();

        const result = await manager.register('ctrl+k', jest.fn());

        expect(result).toBe(false);
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Hotkeys library not available')
        );
    });

    test('ensureHotkeys() resolves false and warns when librarySetup.ensureLibrary() rejects', async () => {
        const librarySetup = { ensureLibrary: jest.fn().mockRejectedValue(new Error('network down')) };
        // ShortcutManager.js's constructor default (`librarySetup = null`)
        // has no JSDoc type, so TS infers its parameter as `null` only -
        // the same pre-existing inference gap GlobalAPI.ts documents for
        // ScreenCapture/PDFProcessor's own `librarySetup` parameter.
        const manager = new ShortcutManager(librarySetup as never);

        const result = await manager.ensureHotkeys();

        expect(result).toBe(false);
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Failed to load hotkeys-js library'),
            'network down'
        );
    });

    test('ensureHotkeys() does not call init() when the library resolves true but window.hotkeys is still unset', async () => {
        const librarySetup = { ensureLibrary: jest.fn().mockResolvedValue(true) };
        const manager = new ShortcutManager(librarySetup as never);

        const result = await manager.ensureHotkeys();

        expect(result).toBe(true);
        expect(manager.isHotkeysAvailable()).toBe(false);
    });
});

describe('ShortcutManager - unregister()/setEnabled()/getShortcuts()/isRegistered()/clear()', () => {
    let manager: ShortcutManager;

    beforeEach(() => {
        manager = new ShortcutManager();
        manager.init(hotkeys);
    });

    afterEach(() => {
        hotkeys.unbind();
        manager.clear();
    });

    test('unregister() unbinds via hotkeys.unbind(keys, scope) and drops the registry entry', async () => {
        const unbindSpy = jest.spyOn(hotkeys, 'unbind');
        await register(manager, 'ctrl+u', jest.fn(), { scope: 'my-scope' });

        const result = manager.unregister('ctrl+u', 'my-scope');

        expect(result).toBe(true);
        expect(unbindSpy).toHaveBeenCalledWith('ctrl+u', 'my-scope');
        expect(manager.isRegistered('ctrl+u')).toBe(false);
    });

    test('unregister() defaults scope to "all" when omitted', async () => {
        const unbindSpy = jest.spyOn(hotkeys, 'unbind');
        await manager.register('ctrl+u', jest.fn());

        manager.unregister('ctrl+u');

        expect(unbindSpy).toHaveBeenCalledWith('ctrl+u', 'all');
    });

    test('unregister() warns and returns false when hotkeys-js was never initialized', () => {
        const freshManager = new ShortcutManager();

        const result = freshManager.unregister('ctrl+u');

        expect(result).toBe(false);
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Hotkeys library not initialized')
        );
    });

    test('setEnabled(false) updates the enabled flag', () => {
        expect(manager.enabled).toBe(true);

        manager.setEnabled(false);

        expect(manager.enabled).toBe(false);
    });

    test('getShortcuts() maps registry entries to {keys, description, scope, registered, allowInInputs}', async () => {
        await register(manager, 'g', jest.fn(), { description: 'Go', scope: 'nav', allowInInputs: true });

        const [info] = manager.getShortcuts();
        expect(info).toEqual({
            keys: 'g',
            description: 'Go',
            scope: 'nav',
            registered: expect.any(Date),
            allowInInputs: true
        });
    });

    test('isRegistered() reflects presence and absence', async () => {
        expect(manager.isRegistered('x')).toBe(false);

        await manager.register('x', jest.fn());

        expect(manager.isRegistered('x')).toBe(true);
    });

    test('clear() unbinds every shortcut with its own scope and empties the registry', async () => {
        const unbindSpy = jest.spyOn(hotkeys, 'unbind');
        await register(manager, 'a', jest.fn(), { scope: 'scope-a' });
        await register(manager, 'b', jest.fn(), { scope: 'scope-b' });

        manager.clear();

        expect(unbindSpy).toHaveBeenCalledWith('a', 'scope-a');
        expect(unbindSpy).toHaveBeenCalledWith('b', 'scope-b');
        expect(manager.getShortcuts()).toHaveLength(0);
    });

    test('clear() is a no-op (does not throw) when hotkeys-js was never initialized', () => {
        const freshManager = new ShortcutManager();

        expect(() => freshManager.clear()).not.toThrow();
    });
});

describe('ShortcutManager - registerDefaultShortcuts()', () => {
    let manager: ShortcutManager;

    beforeEach(() => {
        delete (window as unknown as { agentlet?: unknown }).agentlet;
        manager = new ShortcutManager();
    });

    test('warns and registers nothing when window.agentlet.utils.Dialog is unavailable', async () => {
        const registerSpy = jest.spyOn(manager, 'register');

        await manager.registerDefaultShortcuts({});

        expect(registerSpy).not.toHaveBeenCalled();
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Dialog not available, skipping default shortcuts')
        );
    });

    test('registers only "esc" when quickCommandDialogShortcut is omitted', async () => {
        installDialogMock();
        const registerSpy = jest.spyOn(manager, 'register').mockResolvedValue(true);

        await manager.registerDefaultShortcuts({});

        expect(registerSpy).toHaveBeenCalledTimes(1);
        expect(registerSpy).toHaveBeenCalledWith('esc', expect.any(Function), {
            description: 'Close active dialog',
            allowInInputs: true
        });
    });

    test('also registers the quick-command shortcut when quickCommandDialogShortcut is true', async () => {
        installDialogMock();
        const registerSpy = jest.spyOn(manager, 'register').mockResolvedValue(true);

        await manager.registerDefaultShortcuts({ quickCommandDialogShortcut: true });

        expect(registerSpy).toHaveBeenCalledTimes(2);
        expect(registerSpy).toHaveBeenCalledWith('ctrl+;,cmd+;', expect.any(Function), {
            description: 'Open quick command dialog',
            allowInInputs: false
        });
    });

    test('the quick-command shortcut invokes the configured quickCommandCallback with the dialog result', async () => {
        const dialog = installDialogMock();
        dialog.quickCommand.mockImplementation((_placeholder: string, callback: (value: string | null) => void) => {
            callback('do-thing');
        });
        const quickCommandCallback = jest.fn();
        jest.spyOn(manager, 'register').mockImplementation((_keys, callback) => {
            // Simulate the shortcut firing immediately, the way the real
            // hotkeys-js binding would when the key combo is pressed.
            (callback as () => void)();
            return Promise.resolve(true);
        });

        await manager.registerDefaultShortcuts({ quickCommandDialogShortcut: true, quickCommandCallback });

        expect(dialog.quickCommand).toHaveBeenCalledWith('Enter command...', expect.any(Function));
        expect(quickCommandCallback).toHaveBeenCalledWith('do-thing');
    });
});

describe('ShortcutManager - showHelp()', () => {
    let manager: ShortcutManager;

    beforeEach(() => {
        delete (window as unknown as { agentlet?: unknown }).agentlet;
        manager = new ShortcutManager();
        manager.init(hotkeys);
    });

    afterEach(() => {
        hotkeys.unbind();
        manager.clear();
    });

    test('warns and does not throw when Dialog is unavailable', () => {
        expect(() => manager.showHelp()).not.toThrow();
        expect(console.warn).toHaveBeenCalledWith(
            expect.stringContaining('Dialog not available for shortcuts help')
        );
    });

    test('renders a table row per registered shortcut and shows it via Dialog', async () => {
        const dialog = installDialogMock();
        await register(manager, 'g', jest.fn(), { description: 'Go somewhere' });

        manager.showHelp();

        expect(dialog.show).toHaveBeenCalledTimes(1);
        const [type, options] = dialog.show.mock.calls[0];
        expect(type).toBe('info');
        expect(options.title).toBe('Keyboard Shortcuts');
        expect(options.allowHtml).toBe(true);
        expect(options.message).toContain('Go somewhere');
        expect(options.message).toMatch(/<kbd[^>]*>\s*g\s*<\/kbd>/);
    });

    test('shows the "No shortcuts registered" placeholder when nothing is registered', () => {
        const dialog = installDialogMock();

        manager.showHelp();

        const [, options] = dialog.show.mock.calls[0];
        expect(options.message).toContain('No shortcuts registered');
    });
});

describe('ShortcutManager - createProxy()', () => {
    test('exposes register/unregister/setEnabled/getShortcuts/isRegistered/clear/showHelp plus a static enabled snapshot', () => {
        const manager = new ShortcutManager();
        const proxy = manager.createProxy();

        expect(typeof proxy.register).toBe('function');
        expect(typeof proxy.unregister).toBe('function');
        expect(typeof proxy.setEnabled).toBe('function');
        expect(typeof proxy.getShortcuts).toBe('function');
        expect(typeof proxy.isRegistered).toBe('function');
        expect(typeof proxy.clear).toBe('function');
        expect(typeof proxy.showHelp).toBe('function');
        expect(proxy.enabled).toBe(true);

        // Quirk: `enabled` is a one-time snapshot, not a live binding - it
        // does not reflect later setEnabled() calls on the same proxy.
        manager.setEnabled(false);
        expect(proxy.enabled).toBe(true);
    });

    test('proxy methods delegate to the underlying manager', () => {
        const manager = new ShortcutManager();
        const registerSpy = jest.spyOn(manager, 'register').mockResolvedValue(true);
        const clearSpy = jest.spyOn(manager, 'clear').mockImplementation(() => undefined);
        const proxy = manager.createProxy();

        proxy.register('x', jest.fn(), { scope: 'all' });
        proxy.clear();

        expect(registerSpy).toHaveBeenCalledWith('x', expect.any(Function), { scope: 'all' });
        expect(clearSpy).toHaveBeenCalledTimes(1);
    });
});
