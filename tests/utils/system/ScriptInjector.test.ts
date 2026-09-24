/**
 * Characterization tests for ScriptInjector.
 *
 * These tests pin down the CURRENT behaviour of
 * `src/utils/system/ScriptInjector.js` (the DOM-manipulation injection path
 * in jsdom, `injectModule`, `_resolveInjection`, the extension/content-script
 * code paths behind a mocked `chrome` global, the static environment
 * detection helpers, and `cleanup()`) before it is converted to
 * `ScriptInjector.ts`. Nothing here should change when the conversion
 * lands - if an assertion needs to change, the conversion changed
 * behaviour and that is a bug in the conversion, not in this file.
 *
 * The global Jest setup (`tests/setup.js`) replaces `document.createElement`
 * with a bare-bones mock and shadows `document.head` with a mock object
 * that isn't part of the live document tree, to keep other suites (which
 * assert only on call counts) fast and simple. ScriptInjector's DOM
 * injection path relies on real DOM structure (parentNode, appendChild,
 * load/error events), so this file restores the genuine jsdom
 * implementations before any test runs, following the same pattern as
 * Dialog.test.ts.
 *
 * `isExtensionEnvironment`/`isContentScript`(Environment) currently return
 * whatever the underlying `chrome.*` expression evaluates to (e.g. the
 * `chrome.scripting` object itself, not strictly `true`), not a coerced
 * boolean - see the `toBeTruthy`/`toBeFalsy` assertions below rather than
 * `toBe(true)`/`toBe(false)`.
 */

import ScriptInjector from '../../../src/utils/system/ScriptInjector.js';

/** Minimal shape of the `chrome.scripting`/`chrome.runtime` surface ScriptInjector reads. */
interface ChromeMock {
    scripting?: {
        executeScript: jest.Mock;
    };
    runtime?: {
        sendMessage?: jest.Mock;
        lastError?: { message?: string } | null;
    };
}

function setChromeGlobal(chrome: ChromeMock | undefined): void {
    (globalThis as unknown as { chrome?: ChromeMock }).chrome = chrome;
}

interface PendingInjectionEntry {
    resolve: (value: unknown) => void;
    reject: (reason?: unknown) => void;
    timeout: ReturnType<typeof setTimeout>;
}

/** The full instance surface this file needs, including the private (underscore) helpers under test. */
interface ScriptInjectorInstance {
    inject(options: Record<string, unknown>): Promise<unknown>;
    injectModule(options: { moduleCode?: string; moduleUrl?: string; tabId?: number }): Promise<unknown>;
    cleanup(): void;
    isExtensionEnvironment: unknown;
    isContentScript: unknown;
    pendingInjections: Map<string, PendingInjectionEntry>;
    injectionCounter: number;
    _resolveInjection(injectionId: string, result: unknown, error?: unknown): void;
}

interface ScriptInjectorClassShape {
    new (): ScriptInjectorInstance;
    isExtensionEnvironment(): unknown;
    isContentScriptEnvironment(): unknown;
    createFunctionInjection(
        func: (...args: unknown[]) => unknown,
        ...args: unknown[]
    ): { func: (...args: unknown[]) => unknown; args: unknown[] };
}

const TypedScriptInjector = ScriptInjector as unknown as ScriptInjectorClassShape;

function makeInjector(): ScriptInjectorInstance {
    return new TypedScriptInjector();
}

function injectedScript(): HTMLScriptElement | null {
    return document.head.querySelector<HTMLScriptElement>('script[data-agentlet-injected="true"]');
}

describe('ScriptInjector', () => {
    beforeAll(() => {
        // Undo tests/setup.js's global document.createElement mock and
        // document.head shadow so ScriptInjector gets a real DOM to build into.
        document.createElement = Document.prototype.createElement.bind(document);
        const realHead = document.querySelector('head') ?? document.getElementsByTagName('head')[0];
        Object.defineProperty(document, 'head', {
            value: realHead,
            writable: true,
            configurable: true
        });
    });

    afterEach(() => {
        setChromeGlobal(undefined);
        jest.useRealTimers();
        injectedScript()?.remove();
    });

    describe('DOM manipulation injection (no chrome global)', () => {
        test('injects inline code as a <script> element with the right attributes and content', async () => {
            const injector = makeInjector();
            const promise = injector.inject({ code: 'window.__x = 1;' });

            const script = injectedScript();
            expect(script).not.toBeNull();
            expect(script?.type).toBe('text/javascript');
            expect(script?.textContent).toBe('window.__x = 1;');
            expect(script?.getAttribute('data-injection-timestamp')).toMatch(/^\d+$/);

            await promise;
        });

        test('appends the script under document.head, resolves undefined, and removes it once resolved', async () => {
            const injector = makeInjector();
            const promise = injector.inject({ code: 'window.__y = 1;' });

            expect(document.head.contains(injectedScript())).toBe(true);

            await expect(promise).resolves.toBeUndefined();

            expect(injectedScript()).toBeNull();
        });

        test('builds an IIFE invocation string for func + args injection', async () => {
            const injector = makeInjector();
            const fn = (a: number, b: string) => `${a}-${b}`;
            const promise = injector.inject({ func: fn, args: [1, 'two'] });

            const script = injectedScript();
            expect(script?.textContent).toBe(`(${fn.toString()})(1,"two");`);

            await promise;
        });

        test('rejects when none of code, file, or func is provided', async () => {
            const injector = makeInjector();
            await expect(injector.inject({})).rejects.toThrow(
                'ScriptInjector: Must provide code, file, or func parameter'
            );
        });

        describe('file injection (resolution depends on load/error events)', () => {
            test('does not resolve or reject until load/error fires', async () => {
                const injector = makeInjector();
                let settled = false;
                injector.inject({ file: 'https://example.test/script.js' }).then(
                    () => { settled = true; },
                    () => { settled = true; }
                );

                await new Promise(resolve => setTimeout(resolve, 0));
                expect(settled).toBe(false);

                const script = injectedScript();
                expect(script?.src).toBe('https://example.test/script.js');
                expect(script?.textContent).toBe('');

                // Manually settle so the dangling script/listener don't leak into later tests.
                script?.onload?.(new Event('load'));
            });

            test('resolves and cleans up the script element when onload fires', async () => {
                const injector = makeInjector();
                const promise = injector.inject({ file: 'https://example.test/ok.js' });

                const script = injectedScript();
                expect(script).not.toBeNull();
                script?.onload?.(new Event('load'));

                await expect(promise).resolves.toBeUndefined();
                expect(injectedScript()).toBeNull();
            });

            test('rejects using the error message when the error event carries one', async () => {
                const injector = makeInjector();
                const promise = injector.inject({ file: 'https://example.test/fail.js' });

                const script = injectedScript();
                script?.onerror?.(new ErrorEvent('error', { message: 'network fail' }));

                await expect(promise).rejects.toThrow(
                    'ScriptInjector: DOM injection failed - network fail'
                );
                expect(injectedScript()).toBeNull();
            });

            test('falls back to "Unknown error" when the error event carries no message', async () => {
                const injector = makeInjector();
                const promise = injector.inject({ file: 'https://example.test/fail2.js' });

                const script = injectedScript();
                script?.onerror?.(new Event('error'));

                await expect(promise).rejects.toThrow(
                    'ScriptInjector: DOM injection failed - Unknown error'
                );
            });
        });

        test('falls back to DOM manipulation when the extension environment lacks a tabId', async () => {
            setChromeGlobal({ scripting: { executeScript: jest.fn() } });
            const injector = makeInjector();

            const promise = injector.inject({ code: 'window.__noTab = 1;' });
            expect(injectedScript()).not.toBeNull();

            await promise;
        });
    });

    describe('injectModule', () => {
        test('wraps the module code in an IIFE and delegates to inject() with target "main"', async () => {
            const injector = makeInjector();
            const injectSpy = jest.spyOn(injector, 'inject').mockResolvedValue('ok');

            const moduleCode = 'console.log("hi");';
            const moduleUrl = 'my-module.js';
            const result = await injector.injectModule({ moduleCode, moduleUrl, tabId: 7 });

            expect(result).toBe('ok');
            expect(injectSpy).toHaveBeenCalledTimes(1);

            const expectedCode = `
(function() {
    'use strict';
    console.log('Loading module: ${moduleUrl}');
    try {
        ${moduleCode}
        console.log('Module loaded successfully: ${moduleUrl}');
    } catch (error) {
        console.error('Module loading failed: ${moduleUrl}', error);
        throw error;
    }
})();
//# sourceURL=${moduleUrl}
`;
            expect(injectSpy).toHaveBeenCalledWith({
                code: expectedCode,
                tabId: 7,
                target: 'main'
            });
        });
    });

    describe('_resolveInjection', () => {
        test('resolves the pending entry and removes it from the map', () => {
            const injector = makeInjector();
            const resolve = jest.fn();
            const reject = jest.fn();
            const timeout = setTimeout(() => {}, 100000);
            injector.pendingInjections.set('id-1', { resolve, reject, timeout });

            injector._resolveInjection('id-1', 'the-result');

            expect(resolve).toHaveBeenCalledWith('the-result');
            expect(reject).not.toHaveBeenCalled();
            expect(injector.pendingInjections.has('id-1')).toBe(false);
        });

        test('rejects using error.message when the error is Error-like', () => {
            const injector = makeInjector();
            const resolve = jest.fn();
            const reject = jest.fn();
            const timeout = setTimeout(() => {}, 100000);
            injector.pendingInjections.set('id-2', { resolve, reject, timeout });

            injector._resolveInjection('id-2', null, new Error('boom'));

            expect(resolve).not.toHaveBeenCalled();
            expect(reject).toHaveBeenCalledTimes(1);
            const rejectedWith = reject.mock.calls[0][0] as Error;
            expect(rejectedWith.message).toBe('ScriptInjector: boom');
        });

        test('falls back to the raw error value when it has no message', () => {
            const injector = makeInjector();
            const resolve = jest.fn();
            const reject = jest.fn();
            const timeout = setTimeout(() => {}, 100000);
            injector.pendingInjections.set('id-3', { resolve, reject, timeout });

            injector._resolveInjection('id-3', null, 'plain-string-error');

            const rejectedWith = reject.mock.calls[0][0] as Error;
            expect(rejectedWith.message).toBe('ScriptInjector: plain-string-error');
        });

        test('is a no-op when the injection id is not pending', () => {
            const injector = makeInjector();
            expect(() => injector._resolveInjection('missing-id', 'x')).not.toThrow();
            expect(injector.pendingInjections.size).toBe(0);
        });
    });

    describe('static isExtensionEnvironment / isContentScriptEnvironment', () => {
        test('isExtensionEnvironment() reflects the chrome.scripting global', () => {
            expect(TypedScriptInjector.isExtensionEnvironment()).toBeFalsy();

            setChromeGlobal({ scripting: { executeScript: jest.fn() } });
            expect(TypedScriptInjector.isExtensionEnvironment()).toBeTruthy();
        });

        test('isContentScriptEnvironment() reflects chrome.runtime.sendMessage', () => {
            expect(TypedScriptInjector.isContentScriptEnvironment()).toBeFalsy();

            setChromeGlobal({ runtime: {} });
            expect(TypedScriptInjector.isContentScriptEnvironment()).toBeFalsy();

            setChromeGlobal({ runtime: { sendMessage: jest.fn() } });
            expect(TypedScriptInjector.isContentScriptEnvironment()).toBeTruthy();
        });
    });

    describe('static createFunctionInjection', () => {
        test('bundles the function together with its args', () => {
            const fn = (...args: unknown[]): number => (args[0] as number) + (args[1] as number);
            expect(TypedScriptInjector.createFunctionInjection(fn, 1, 2)).toEqual({
                func: fn,
                args: [1, 2]
            });
        });
    });

    describe('extension API injection (chrome.scripting)', () => {
        test('injects code via new Function() and returns the executeScript result', async () => {
            const executeScript = jest.fn().mockResolvedValue([{ result: 42 }]);
            setChromeGlobal({ scripting: { executeScript } });
            const injector = makeInjector();

            const result = await injector.inject({ code: '1+1', tabId: 5 });

            expect(result).toBe(42);
            expect(executeScript).toHaveBeenCalledTimes(1);
            const callOptions = executeScript.mock.calls[0][0];
            // Note: `_injectViaExtensionAPI` destructures `allFrames` straight off
            // `options` with no default, so an omitted `allFrames` stays `undefined`
            // here (unlike the JSDoc's documented `[options.allFrames=false]`).
            expect(callOptions.target).toEqual({ tabId: 5, allFrames: undefined });
            expect(callOptions.world).toBe('MAIN');
            expect(typeof callOptions.function).toBe('function');
        });

        test('uses world "ISOLATED" when target is "isolated"', async () => {
            const executeScript = jest.fn().mockResolvedValue([{ result: undefined }]);
            setChromeGlobal({ scripting: { executeScript } });
            const injector = makeInjector();

            await injector.inject({ code: '1+1', tabId: 5, target: 'isolated' });

            expect(executeScript.mock.calls[0][0].world).toBe('ISOLATED');
        });

        test('passes func/args through directly instead of wrapping with new Function()', async () => {
            const executeScript = jest.fn().mockResolvedValue([{ result: 'ok' }]);
            setChromeGlobal({ scripting: { executeScript } });
            const injector = makeInjector();
            const fn = (): number => 1;

            await injector.inject({ func: fn, args: [1, 2], tabId: 5 });

            const callOptions = executeScript.mock.calls[0][0];
            expect(callOptions.func).toBe(fn);
            expect(callOptions.args).toEqual([1, 2]);
            expect(callOptions.function).toBeUndefined();
        });

        test('sets files: [file] when a file path is provided', async () => {
            const executeScript = jest.fn().mockResolvedValue([{ result: undefined }]);
            setChromeGlobal({ scripting: { executeScript } });
            const injector = makeInjector();

            await injector.inject({ file: '/injected.js', tabId: 5, allFrames: true });

            const callOptions = executeScript.mock.calls[0][0];
            expect(callOptions.files).toEqual(['/injected.js']);
            expect(callOptions.target).toEqual({ tabId: 5, allFrames: true });
        });
    });

    describe('content script injection (chrome.runtime.sendMessage)', () => {
        test('sends an INJECT_SCRIPT message and resolves with the response', async () => {
            const sendMessage = jest.fn((message: unknown, callback: (response: unknown) => void) => {
                callback('the-response');
            });
            setChromeGlobal({ runtime: { sendMessage, lastError: null } });
            const injector = makeInjector();

            const result = await injector.inject({ code: 'inline' });

            expect(result).toBe('the-response');
            expect(sendMessage).toHaveBeenCalledTimes(1);
            const [message] = sendMessage.mock.calls[0];
            const typedMessage = message as { type: string; injectionId: string; options: Record<string, unknown> };
            expect(typedMessage.type).toBe('INJECT_SCRIPT');
            expect(typedMessage.injectionId).toMatch(/^injection_\d+$/);
            expect(typedMessage.options).toEqual({ code: 'inline', tabId: undefined });
        });

        test('rejects with the prefixed lastError message when the background reports one', async () => {
            const sendMessage = jest.fn((message: unknown, callback: (response: unknown) => void) => {
                callback(undefined);
            });
            setChromeGlobal({ runtime: { sendMessage, lastError: { message: 'oops' } } });
            const injector = makeInjector();

            await expect(injector.inject({ code: 'inline' })).rejects.toThrow('ScriptInjector: oops');
        });

        test('rejects with a timeout error if the background never responds', async () => {
            jest.useFakeTimers();
            setChromeGlobal({ runtime: { sendMessage: jest.fn(), lastError: null } });
            const injector = makeInjector();

            const promise = injector.inject({ code: 'inline' });
            const assertion = expect(promise).rejects.toThrow(
                'ScriptInjector: Content script injection timeout'
            );

            jest.advanceTimersByTime(10000);
            await assertion;

            expect(injector.pendingInjections.size).toBe(0);
        });
    });

    describe('cleanup()', () => {
        test('rejects all pending injections and clears internal state', async () => {
            setChromeGlobal({ runtime: { sendMessage: jest.fn(), lastError: null } });
            const injector = makeInjector();

            const promise = injector.inject({ code: 'inline' });
            const assertion = expect(promise).rejects.toThrow(
                'ScriptInjector: Cleanup - operation cancelled'
            );
            expect(injector.pendingInjections.size).toBe(1);

            injector.cleanup();
            await assertion;

            expect(injector.pendingInjections.size).toBe(0);
        });
    });
});
