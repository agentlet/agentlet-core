/**
 * Behaviour characterization tests for ModuleRegistry.
 *
 * `tests/core/ModuleRegistry.test.js` (19 tests) covers the constructor,
 * the register()/unregister() happy and same-instance-duplicate paths,
 * findMatchingModule(), the basic activate/deactivate flows, getAll()/get(),
 * a basic getStatistics() snapshot, and cleanup(). It stays byte-identical.
 *
 * This file pins down CURRENT behaviour (ahead of the file's conversion to
 * TypeScript) for paths that suite does not exercise:
 * - register() replacing a different instance under the same name, and the
 *   reentrant-registration guard (`_registrationInProgress`).
 * - checkUrlChange()'s emitted events and the activation context it builds
 *   (`trigger`/`oldUrl`/`newUrl`).
 * - startUrlMonitoring()'s `popstate` listener and its `history.pushState`/
 *   `replaceState` overrides.
 * - activateModule()'s already-active no-op, its cascade-prevention guard,
 *   and `init()` only running once per module.
 * - unregister() removing the module and resolving `true` even when
 *   `module.cleanup()` rejects, the same try/catch-and-log pattern used by
 *   activateModule()/deactivateModule()/cleanup().
 * - setModuleChangeCallback().
 * - the registry/script-injection loading path (loadFromRegistry(),
 *   loadRegistryScript(), loadAgentletModule(), loadScript() - the
 *   event-based registry loading from issue #33), plus the registry-related
 *   getStatistics() counters.
 *
 * Nothing here should change when the conversion lands - if an assertion
 * needs to change, the conversion changed behaviour and that is a bug in
 * the conversion, not in this file.
 */

import ModuleRegistryCtor from '../../src/core/ModuleRegistry.js';
import Module from '../../src/core/Module.js';
import type { AgentletModule, ModuleActivationContext } from '../../src/types/public-api';
import { setDebugMode } from '../../src/utils/system/Logger.js';

/**
 * ModuleRegistry.js is untyped, plain JS at this point (pre-conversion), so
 * `tsc` only infers a weak shape for it. This local type describes the real
 * runtime surface exercised here; the conversion's own `.ts` file provides
 * the exhaustive/authoritative version (`ModuleRegistryAPI` in
 * `src/types/public-api.d.ts`).
 */
interface EventBusStub {
    emit: jest.Mock;
    on?: jest.Mock;
    off?: jest.Mock;
}

interface ModuleRegistryConfigStub {
    eventBus?: EventBusStub;
    registryUrl?: string;
    skipRegistryModuleRegistration?: boolean;
}

interface ModuleRegistryStatisticsStub {
    totalModules: number;
    activationCount: number;
    failedActivations: number;
    registriesLoaded: number;
    registryLoadFailures: number;
    activeModule: string | null;
    moduleList: string[];
}

interface RegistryEntryStub {
    name: string;
    url: string;
    module: string;
    lazy?: boolean;
}

interface ModuleRegistryTestInstance {
    modules: Map<string, AgentletModule>;
    activeModule: AgentletModule | null;
    lastUrl: string;
    eventBus?: EventBusStub;
    registryUrl?: string;
    loadedRegistries: Set<string>;
    registryEntries: Map<string, RegistryEntryStub>;
    metrics: {
        totalModules: number;
        activationCount: number;
        failedActivations: number;
        registriesLoaded: number;
        registryLoadFailures: number;
    };
    _registrationInProgress: Set<string>;
    _activationInProgress: Set<string>;
    onModuleChange: ((module: AgentletModule | null, context?: ModuleActivationContext) => void) | null;
    register(module: AgentletModule): void;
    unregister(name: string): Promise<boolean>;
    findMatchingModule(url?: string): AgentletModule | null;
    activateModule(module: AgentletModule, context?: ModuleActivationContext): Promise<void>;
    deactivateModule(context?: ModuleActivationContext): Promise<void>;
    checkUrlChange(): void;
    startUrlMonitoring(): void;
    stopUrlMonitoring(): void;
    setModuleChangeCallback(callback: (module: AgentletModule | null, context?: ModuleActivationContext) => void): void;
    loadFromRegistry(registryUrl?: string | null): Promise<void>;
    loadRegistryScript(url: string): Promise<unknown>;
    loadAgentletModule(config: { name: string; url: string; module: string }): Promise<void>;
    loadModule(entry: RegistryEntryStub): Promise<AgentletModule>;
    getRegistryEntries(): Array<RegistryEntryStub & { loaded: boolean }>;
    loadScript(url: string): Promise<void>;
    initialize(): Promise<void>;
    getAll(): string[];
    get(name: string): AgentletModule | null;
    getStatistics(): ModuleRegistryStatisticsStub;
    emit(event: string, data?: unknown): void;
    cleanup(): Promise<void>;
}

const ModuleRegistry = ModuleRegistryCtor as unknown as new (config?: ModuleRegistryConfigStub) => ModuleRegistryTestInstance;

/**
 * tests/setup.js permanently replaces the global `CustomEvent` with a
 * `jest.fn()` returning a plain `{type, detail}` object - not a real
 * `Event` - which breaks a genuine `dispatchEvent()` call. This subclasses
 * the still-intact real `Event` global to provide a working, genuinely
 * dispatchable replacement. Same trick as
 * tests/utils/ui/MessageBubble.behaviour.test.ts.
 */
class RealCustomEvent<T = unknown> extends Event {
    readonly detail: T | null;

    constructor(type: string, params: CustomEventInit<T> = {}) {
        super(type, params);
        this.detail = params.detail ?? null;
    }
}

// The constructor calls startUrlMonitoring(), which sets a 1s setInterval;
// most tests here never call cleanup()/stopUrlMonitoring() to clear it (see
// tests/core/ModuleRegistry.test.js's own top-level jest.useFakeTimers() for
// precedent), so fake timers keep that from leaving real dangling timers
// across every test in this file.
jest.useFakeTimers();

// Captured once, before any ModuleRegistry instance can wrap them, so every
// test starts from jsdom's real implementations regardless of how many
// registries earlier tests constructed (each constructor call wraps
// whatever pushState/replaceState currently is).
const nativePushState = history.pushState;
const nativeReplaceState = history.replaceState;

// Debug-gated logging (see src/utils/system/Logger.ts): this file asserts on
// console.log output, which now only happens while debugMode is on.
beforeAll(() => setDebugMode(true));
afterAll(() => setDebugMode(false));

describe('ModuleRegistry behaviour characterization', () => {
    let mockEventBus: EventBusStub;

    beforeEach(() => {
        mockEventBus = { emit: jest.fn(), on: jest.fn(), off: jest.fn() };
    });

    afterEach(() => {
        history.pushState = nativePushState;
        history.replaceState = nativeReplaceState;
        jest.clearAllTimers();
    });

    describe('Registration', () => {
        test('register() replaces a different instance registered under the same name', () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const first = new Module({ name: 'dup', patterns: ['dup.example'] });
            const second = new Module({ name: 'dup', patterns: ['dup.example'] });
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            registry.register(first);
            registry.register(second);

            expect(consoleSpy).toHaveBeenCalledWith('Module dup already registered, replacing...');
            expect(registry.modules.get('dup')).toBe(second);
            expect(registry.get('dup')).toBe(second);
            consoleSpy.mockRestore();
        });

        test('register() skips and warns when registration for the same name is already in progress', () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const module = new Module({ name: 'reentrant', patterns: ['reentrant.example'] });
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            // Simulate re-entrancy directly, the way a recursive register()
            // call (e.g. triggered from checkUrlChange() side effects) would.
            registry._registrationInProgress.add('reentrant');
            registry.register(module);

            expect(consoleSpy).toHaveBeenCalledWith('Registration already in progress for reentrant, skipping');
            expect(registry.modules.has('reentrant')).toBe(false);
            consoleSpy.mockRestore();
        });

        test('register() triggers checkUrlChange(), activating a module whose pattern matches the current URL', () => {
            history.pushState({}, '', '/auto-activate');
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const module = new Module({ name: 'auto', patterns: ['auto-activate'] });
            const activateSpy = jest.spyOn(registry, 'activateModule').mockResolvedValue(undefined);

            registry.register(module);

            expect(activateSpy).toHaveBeenCalledWith(module, expect.objectContaining({ trigger: 'moduleRegistration' }));
        });
    });

    describe('checkUrlChange()', () => {
        test('emits "application:detected" and activates the matching module', () => {
            history.pushState({}, '', '/detected-page');
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const module = new Module({ name: 'detected', patterns: ['detected-page'] });
            registry.modules.set('detected', module);
            const activateSpy = jest.spyOn(registry, 'activateModule').mockResolvedValue(undefined);

            registry.checkUrlChange();

            expect(activateSpy).toHaveBeenCalledWith(module, expect.objectContaining({ trigger: expect.any(String) }));
            expect(mockEventBus.emit).toHaveBeenCalledWith('application:detected', { module: 'detected', url: window.location.href });
        });

        test('emits "application:notDetected" and deactivates when nothing matches', async () => {
            // registry construction (which captures lastUrl) happens BEFORE
            // the navigation below, so checkUrlChange() sees a genuine URL
            // change - see the "re-detection only on a real URL change" tests
            // further down for why that ordering matters.
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const activeModule = new Module({ name: 'was-active', patterns: ['never-matches.example'] });
            activeModule.cleanup = jest.fn().mockResolvedValue(undefined);
            registry.activeModule = activeModule;

            history.pushState({}, '', '/undetected-page');
            registry.checkUrlChange();
            await Promise.resolve();

            expect(mockEventBus.emit).toHaveBeenCalledWith('application:notDetected', { url: window.location.href });
            expect(activeModule.cleanup).toHaveBeenCalled();
        });

        test('the "url:changed" event carries the real previous URL as oldUrl', () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const oldUrl = window.location.href;
            history.pushState({}, '', '/real-old-url-page');
            const newUrl = window.location.href;

            registry.checkUrlChange();

            expect(mockEventBus.emit).toHaveBeenCalledWith('url:changed', {
                oldUrl,
                newUrl
            });
            expect(oldUrl).not.toBe(newUrl);
        });
    });

    describe('startUrlMonitoring() - browser navigation integration', () => {
        test('a "popstate" event triggers checkUrlChange() after a 100ms delay', () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const checkUrlChangeSpy = jest.spyOn(registry, 'checkUrlChange');
            checkUrlChangeSpy.mockClear(); // clear the call made by the constructor's own initial checkUrlChange-adjacent wiring, if any

            window.dispatchEvent(new Event('popstate'));
            expect(checkUrlChangeSpy).not.toHaveBeenCalled();

            jest.advanceTimersByTime(100);
            expect(checkUrlChangeSpy).toHaveBeenCalled();
        });

        test('history.pushState()/replaceState() still update the URL and each triggers checkUrlChange() after 100ms', () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const checkUrlChangeSpy = jest.spyOn(registry, 'checkUrlChange');
            checkUrlChangeSpy.mockClear();

            history.pushState({}, '', '/pushed-page');
            expect(window.location.pathname).toBe('/pushed-page');
            expect(checkUrlChangeSpy).not.toHaveBeenCalled();
            jest.advanceTimersByTime(100);
            expect(checkUrlChangeSpy).toHaveBeenCalledTimes(1);

            history.replaceState({}, '', '/replaced-page');
            expect(window.location.pathname).toBe('/replaced-page');
            jest.advanceTimersByTime(100);
            expect(checkUrlChangeSpy).toHaveBeenCalledTimes(2);
        });
    });

    describe('startUrlMonitoring() / stopUrlMonitoring() - lifecycle', () => {
        test('a second startUrlMonitoring() call while monitoring is active does not install a second interval', () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const checkUrlChangeSpy = jest.spyOn(registry, 'checkUrlChange');
            checkUrlChangeSpy.mockClear();

            registry.startUrlMonitoring();

            jest.advanceTimersByTime(1000);
            expect(checkUrlChangeSpy).toHaveBeenCalledTimes(1);
        });

        test('cleanup() stops the interval, removes the popstate listener, and restores history.pushState/replaceState', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const checkUrlChangeSpy = jest.spyOn(registry, 'checkUrlChange');

            await registry.cleanup();
            checkUrlChangeSpy.mockClear();

            jest.advanceTimersByTime(5000);
            history.pushState({}, '', '/after-cleanup-push');
            history.replaceState({}, '', '/after-cleanup-replace');
            window.dispatchEvent(new Event('popstate'));
            jest.advanceTimersByTime(1000);

            expect(checkUrlChangeSpy).not.toHaveBeenCalled();
            expect(history.pushState).toBe(nativePushState);
            expect(history.replaceState).toBe(nativeReplaceState);
        });

        test('when another script wraps history.pushState after startUrlMonitoring(), cleanup() leaves that wrapper in place and calling it stays harmless', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const checkUrlChangeSpy = jest.spyOn(registry, 'checkUrlChange');

            // A later script wraps pushState again, on top of ours.
            const ourPushState = history.pushState;
            const outerPushState = function (...args: Parameters<History['pushState']>): void {
                ourPushState.apply(history, args);
            };
            history.pushState = outerPushState;

            await registry.cleanup();
            checkUrlChangeSpy.mockClear();

            // Not restored: it isn't ours to touch.
            expect(history.pushState).toBe(outerPushState);

            // The call still reaches our (now-inert) wrapper through the
            // chain, but the cleaned-up registry no longer reacts to it.
            history.pushState({}, '', '/through-outer-wrapper');
            jest.advanceTimersByTime(1000);

            expect(checkUrlChangeSpy).not.toHaveBeenCalled();
        });
    });

    describe('activateModule()', () => {
        test('is a no-op when the module is already the active module', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const module = new Module({ name: 'already-active', patterns: ['x'] });
            module.init = jest.fn().mockResolvedValue(undefined);
            module.activate = jest.fn().mockResolvedValue(undefined);
            registry.activeModule = module;

            await registry.activateModule(module);

            expect(module.init).not.toHaveBeenCalled();
            expect(module.activate).not.toHaveBeenCalled();
        });

        test('a concurrent call for the same module+trigger while one is in flight is skipped', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const module = new Module({ name: 'cascade', patterns: ['x'] });
            let resolveInit: () => void = () => {};
            module.init = jest.fn(() => new Promise<void>(resolve => { resolveInit = resolve; }));
            module.activate = jest.fn().mockResolvedValue(undefined);
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            const firstCall = registry.activateModule(module, { trigger: 'test' });
            const secondCall = registry.activateModule(module, { trigger: 'test' });
            await secondCall;

            expect(consoleSpy).toHaveBeenCalledWith('Activation already in progress for cascade-test, skipping');
            expect(module.init).toHaveBeenCalledTimes(1);

            resolveInit();
            await firstCall;
            consoleSpy.mockRestore();
        });

        test('only calls module.init() on the first activation; later activations reuse isInitialized', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const module = new Module({ name: 'once', patterns: ['x'] });
            module.init = jest.fn().mockResolvedValue(undefined);
            module.activate = jest.fn().mockResolvedValue(undefined);
            module.cleanup = jest.fn().mockResolvedValue(undefined);

            await registry.activateModule(module, { trigger: 'first' });
            expect(module.init).toHaveBeenCalledTimes(1);
            expect(module.isInitialized).toBe(true);

            await registry.deactivateModule();
            await registry.activateModule(module, { trigger: 'second' });

            expect(module.init).toHaveBeenCalledTimes(1);
            expect(module.activate).toHaveBeenCalledTimes(2);
        });
    });

    describe('unregister()', () => {
        test('resolves true and removes the module even when module.cleanup() rejects, logging the error', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const module = new Module({ name: 'boom', patterns: ['x'] });
            const error = new Error('cleanup boom');
            module.cleanup = jest.fn().mockRejectedValue(error);
            registry.register(module);
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await expect(registry.unregister('boom')).resolves.toBe(true);

            expect(consoleSpy).toHaveBeenCalledWith('Error cleaning up module boom:', error);
            expect(registry.modules.has('boom')).toBe(false);
            expect(mockEventBus.emit).toHaveBeenCalledWith('module:unregistered', { module: 'boom' });
            consoleSpy.mockRestore();
        });
    });

    describe('setModuleChangeCallback()', () => {
        test('is invoked with (module, context) on activation and (null, context) on deactivation', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const module = new Module({ name: 'cb', patterns: ['x'] });
            module.init = jest.fn().mockResolvedValue(undefined);
            module.activate = jest.fn().mockResolvedValue(undefined);
            module.cleanup = jest.fn().mockResolvedValue(undefined);
            const callback = jest.fn();
            registry.setModuleChangeCallback(callback);

            await registry.activateModule(module, { trigger: 'cb-test' });
            expect(callback).toHaveBeenCalledWith(module, { trigger: 'cb-test' });

            await registry.deactivateModule({ trigger: 'cb-deactivate' });
            expect(callback).toHaveBeenCalledWith(null, { trigger: 'cb-deactivate' });
        });
    });

    describe('Registry loading via script injection (issue #33 event-based registry)', () => {
        beforeEach(() => {
            // Restore jsdom's real Document.prototype implementations removed
            // by tests/setup.js's global mocks - see tests/ui/UIManager.test.js
            // for the same trick.
            delete (document as { createElement?: unknown }).createElement;
            delete (document as { head?: unknown }).head;
            (global as unknown as { CustomEvent: unknown }).CustomEvent = RealCustomEvent;
        });

        afterEach(() => {
            document.querySelectorAll('script').forEach(script => script.remove());
            delete (window as unknown as Record<string, unknown>).FakeAgentletClass;
        });

        test('loadFromRegistry() warns and resolves without loading when no registryUrl is configured', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            await registry.loadFromRegistry();

            expect(consoleSpy).toHaveBeenCalledWith('📦 No registry URL configured, skipping registry loading');
            expect(mockEventBus.emit).not.toHaveBeenCalledWith('registry:loaded', expect.anything());
            consoleSpy.mockRestore();
        });

        test('loadFromRegistry() skips a registry URL that was already loaded', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            registry.loadedRegistries.add('https://example.com/registry.js');
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            await registry.loadFromRegistry('https://example.com/registry.js');

            expect(consoleSpy).toHaveBeenCalledWith('📦 Registry already loaded: https://example.com/registry.js');
            consoleSpy.mockRestore();
        });

        test('loadRegistryScript() injects a <script> and resolves with the "agentletRegistryLoaded" event detail', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const promise = registry.loadRegistryScript('https://example.com/registry.js');

            const script = document.head.querySelector('script[src="https://example.com/registry.js"]') as HTMLScriptElement;
            expect(script).not.toBeNull();
            expect(script.type).toBe('text/javascript');
            expect(script.crossOrigin).toBe('anonymous');

            const payload = { agentlets: [] };
            window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', { detail: payload }));

            await expect(promise).resolves.toBe(payload);
        });

        test('loadRegistryScript() rejects with a timeout error when nothing resolves it', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const promise = registry.loadRegistryScript('https://example.com/slow-registry.js');
            promise.catch(() => {}); // avoid an unhandled rejection warning while timers advance below

            jest.advanceTimersByTime(10000);

            await expect(promise).rejects.toThrow('Registry loading timeout after 10000ms: https://example.com/slow-registry.js');
        });

        test('loadAgentletModule() throws when the config is missing name/url/module', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });

            await expect(registry.loadAgentletModule({ name: '', url: '', module: '' }))
                .rejects.toThrow('Agentlet config must have name, url, and module properties');
        });

        test('loadAgentletModule() loads the script, instantiates window[moduleClass], and registers it', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });

            class FakeAgentletClass {
                name = '';
            }
            (window as unknown as Record<string, unknown>).FakeAgentletClass = FakeAgentletClass;

            const promise = registry.loadAgentletModule({ name: 'from-registry', url: 'https://example.com/fake.js', module: 'FakeAgentletClass' });

            const script = document.head.querySelector('script[src="https://example.com/fake.js"]') as HTMLScriptElement;
            expect(script).not.toBeNull();
            script.onload?.(new Event('load'));

            await promise;

            expect(registry.modules.has('from-registry')).toBe(true);
            expect(registry.get('from-registry')?.name).toBe('from-registry');
        });

        test('loadAgentletModule() registers without running checkUrlChange() itself, unlike register()', async () => {
            // Regression test: loadFromRegistry() calls loadAgentletModule()
            // once per eager registry entry, then initialize() (its caller)
            // runs checkUrlChange() exactly once after every entry has
            // loaded. If loadAgentletModule() also ran checkUrlChange() per
            // entry (as it used to, via register()), the SAME best-matching
            // module's activation would race against itself across entries -
            // the second attempt finds the first one still in
            // `_activationInProgress` and logs "Activation already in
            // progress ..., skipping" on every init that eagerly loads more
            // than one registry entry. See loadAgentletModule()'s comment.
            history.pushState({}, '', '/double-activation-check');
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const checkUrlChangeSpy = jest.spyOn(registry, 'checkUrlChange');
            const consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();

            class FirstEagerModule extends Module {
                constructor() {
                    super({ name: 'eager-one', patterns: ['double-activation-check'] });
                }
            }
            class SecondEagerModule extends Module {
                constructor() {
                    super({ name: 'eager-two', patterns: ['never-matches.example'] });
                }
            }
            (window as unknown as Record<string, unknown>).FirstEagerModule = FirstEagerModule;
            (window as unknown as Record<string, unknown>).SecondEagerModule = SecondEagerModule;

            const promise1 = registry.loadAgentletModule({ name: 'eager-one', url: 'https://example.com/eager-one.js', module: 'FirstEagerModule' });
            (document.head.querySelector('script[src="https://example.com/eager-one.js"]') as HTMLScriptElement).onload?.(new Event('load'));
            await promise1;

            const promise2 = registry.loadAgentletModule({ name: 'eager-two', url: 'https://example.com/eager-two.js', module: 'SecondEagerModule' });
            (document.head.querySelector('script[src="https://example.com/eager-two.js"]') as HTMLScriptElement).onload?.(new Event('load'));
            await promise2;

            // Neither loadAgentletModule() call ran URL detection itself.
            expect(checkUrlChangeSpy).not.toHaveBeenCalled();
            expect(registry.activeModule).toBeNull();

            // The single trailing checkUrlChange() initialize() runs after
            // the whole registry has loaded activates the matching module
            // exactly once, with no "already in progress" warning.
            // checkUrlChange() calls activateModule() without awaiting it
            // (see its own doc comment), so flush a few microtask ticks for
            // that fire-and-forget chain (module.init() then
            // module.activate(), each its own await) to actually finish.
            registry.checkUrlChange();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();
            await Promise.resolve();

            expect(registry.activeModule?.name).toBe('eager-one');
            expect(consoleWarnSpy).not.toHaveBeenCalledWith(expect.stringContaining('Activation already in progress'));

            (window as unknown as Record<string, unknown>).FirstEagerModule = undefined;
            (window as unknown as Record<string, unknown>).SecondEagerModule = undefined;
            consoleWarnSpy.mockRestore();
        });

        test('getStatistics() tracks registriesLoaded/registryLoadFailures after loadFromRegistry() runs', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const promise = registry.loadFromRegistry('https://example.com/stats-registry.js');
            window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', { detail: { agentlets: [] } }));
            await promise;

            const stats = registry.getStatistics();
            expect(stats.registriesLoaded).toBe(1);
            expect(stats.registryLoadFailures).toBe(0);
        });

        test('loadRegistryScript() resolves for a synchronous (zero-delay) dispatch of agentletRegistryLoaded', async () => {
            // Regression test for the registry script format's `setTimeout(..., 10)`
            // dispatch, which could lose the race against the 10s timeout on a busy
            // page. The listener is attached before the script is injected (see
            // loadRegistryScript()), so a dispatch with NO delay at all - the fixed
            // examples/*registry.js format - must resolve correctly too.
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const promise = registry.loadRegistryScript('https://example.com/sync-registry.js');

            const script = document.head.querySelector('script[src="https://example.com/sync-registry.js"]') as HTMLScriptElement;
            const payload = { agentlets: [] };
            // Simulate the script's own top-level, undelayed dispatch, firing as
            // part of its (asynchronous) load rather than after any timer.
            script.onload?.(new Event('load'));
            window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', { detail: payload }));

            await expect(promise).resolves.toBe(payload);
        });

        test('loadRegistryScript() resolves if the event arrives just before the 10s timeout, and the timeout never fires', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const promise = registry.loadRegistryScript('https://example.com/slow-but-in-time-registry.js');

            jest.advanceTimersByTime(9999);
            const payload = { agentlets: [] };
            window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', { detail: payload }));
            jest.advanceTimersByTime(1);

            await expect(promise).resolves.toBe(payload);
        });
    });

    describe('checkUrlChange() - explicit activation is not reverted by automatic re-detection', () => {
        // Module.init()/activate() chain several of their own internal
        // `await`s (see src/core/Module.ts), and checkUrlChange() calls
        // activateModule()/deactivateModule() without awaiting them (it is a
        // synchronous method driven by a timer/event callback) - so a test
        // that lets checkUrlChange() itself drive a real activation needs to
        // flush more than one microtask turn before asserting on the result.
        async function flushAsync(turns = 10): Promise<void> {
            for (let i = 0; i < turns; i++) {
                await Promise.resolve();
            }
        }

        test('the 1s poll does not revert an explicit activateModule() call when the URL has not changed', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const moduleA = new Module({ name: 'module-a', patterns: ['*'] });
            const moduleB = new Module({ name: 'module-b', patterns: ['*'] });
            // Registered directly on the map (bypassing register()'s own
            // checkUrlChange() side effect) so the two explicit
            // activateModule() calls below are the only activations in play.
            registry.modules.set('module-a', moduleA);
            registry.modules.set('module-b', moduleB);

            await registry.activateModule(moduleA);
            expect(registry.activeModule?.name).toBe('module-a');

            // Explicit activation, e.g. from a "launcher" module.
            await registry.activateModule(moduleB, { trigger: 'manual' });
            expect(registry.activeModule?.name).toBe('module-b');

            // Advance past several 1s poll ticks. The URL never changed, so
            // findMatchingModule() re-picking module-a must not run.
            jest.advanceTimersByTime(3000);
            await flushAsync();

            expect(registry.activeModule?.name).toBe('module-b');
        });

        test('on a URL change, keeps the active module if its own pattern still matches the new URL', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const moduleA = new Module({ name: 'module-a', patterns: ['*'] });
            const moduleB = new Module({ name: 'module-b', patterns: ['*'] });
            registry.modules.set('module-a', moduleA);
            registry.modules.set('module-b', moduleB);
            await registry.activateModule(moduleB, { trigger: 'manual' });
            expect(registry.activeModule?.name).toBe('module-b');

            const activateSpy = jest.spyOn(registry, 'activateModule');
            history.pushState({}, '', '/after-manual-activation');
            registry.checkUrlChange();
            await flushAsync();

            // module-a would be findMatchingModule()'s first pick (registered
            // first), but module-b is still active and its own pattern ('*')
            // still matches, so it must be left alone - activateModule() is
            // never even called again.
            expect(registry.activeModule?.name).toBe('module-b');
            expect(activateSpy).not.toHaveBeenCalled();
        });

        test('on a URL change, switches away from the active module once it no longer matches', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const onlyOldPath = new Module({ name: 'only-old-path', patterns: ['/old-path'] });
            const onlyNewPath = new Module({ name: 'only-new-path', patterns: ['/new-path'] });
            registry.modules.set('only-old-path', onlyOldPath);
            registry.modules.set('only-new-path', onlyNewPath);

            history.pushState({}, '', '/old-path');
            await registry.activateModule(onlyOldPath);
            expect(registry.activeModule?.name).toBe('only-old-path');

            history.pushState({}, '', '/new-path');
            registry.checkUrlChange();
            await flushAsync();

            expect(registry.activeModule?.name).toBe('only-new-path');
        });

        test('hashchange navigation re-runs checkUrlChange() after 100ms, like popstate', () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const checkUrlChangeSpy = jest.spyOn(registry, 'checkUrlChange');
            checkUrlChangeSpy.mockClear();

            window.location.hash = 'hash-nav';
            window.dispatchEvent(new Event('hashchange'));
            expect(checkUrlChangeSpy).not.toHaveBeenCalled();

            jest.advanceTimersByTime(100);
            expect(checkUrlChangeSpy).toHaveBeenCalled();
        });

        test('stopUrlMonitoring()/cleanup() also removes the hashchange listener', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const checkUrlChangeSpy = jest.spyOn(registry, 'checkUrlChange');

            await registry.cleanup();
            checkUrlChangeSpy.mockClear();

            window.location.hash = 'after-cleanup';
            window.dispatchEvent(new Event('hashchange'));
            jest.advanceTimersByTime(200);

            expect(checkUrlChangeSpy).not.toHaveBeenCalled();
        });
    });

    describe('lazy registry entries and loadModule()', () => {
        beforeEach(() => {
            delete (document as { createElement?: unknown }).createElement;
            delete (document as { head?: unknown }).head;
            (global as unknown as { CustomEvent: unknown }).CustomEvent = RealCustomEvent;
        });

        afterEach(() => {
            document.querySelectorAll('script').forEach(script => script.remove());
            delete (window as unknown as Record<string, unknown>).LazyFakeModuleClass;
        });

        test('loadFromRegistry() skips fetching a lazy entry but records it in getRegistryEntries()', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const promise = registry.loadFromRegistry('https://example.com/lazy-registry.js');
            window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', {
                detail: {
                    agentlets: [
                        { name: 'lazy-one', url: 'https://example.com/lazy-one.js', module: 'LazyFakeModuleClass', lazy: true }
                    ]
                }
            }));
            await promise;

            // Never fetched: no <script src="https://example.com/lazy-one.js">.
            expect(document.head.querySelector('script[src="https://example.com/lazy-one.js"]')).toBeNull();
            expect(registry.get('lazy-one')).toBeNull();

            const entries = registry.getRegistryEntries();
            expect(entries).toEqual([
                { name: 'lazy-one', url: 'https://example.com/lazy-one.js', module: 'LazyFakeModuleClass', lazy: true, loaded: false }
            ]);
        });

        test('loadFromRegistry() resolves a relative entry url against the registry URL, not the host page', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });

            class LazyFakeModuleClass {
                name = '';
            }
            (window as unknown as Record<string, unknown>).LazyFakeModuleClass = LazyFakeModuleClass;

            const promise = registry.loadFromRegistry('http://localhost:8080/dist/agentlets-registry.js');
            window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', {
                detail: {
                    agentlets: [
                        { name: 'relative-eager', url: './module-bundle.js', module: 'LazyFakeModuleClass' }
                    ]
                }
            }));
            // Let loadFromRegistry() reach the entry's loadScript() call.
            await Promise.resolve();
            await Promise.resolve();

            const script = document.head.querySelector('script[src="http://localhost:8080/dist/module-bundle.js"]') as HTMLScriptElement;
            expect(script).not.toBeNull();
            script.onload?.(new Event('load'));
            await promise;

            expect(registry.get('relative-eager')).not.toBeNull();
            expect(registry.getRegistryEntries()[0].url).toBe('http://localhost:8080/dist/module-bundle.js');
        });

        test('loadFromRegistry() stores lazy entries with resolved urls and keeps absolute urls unchanged', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const promise = registry.loadFromRegistry('https://cdn.example.com/agentlets/registry.js');
            window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', {
                detail: {
                    agentlets: [
                        { name: 'lazy-relative', url: 'lazy-relative.js', module: 'LazyFakeModuleClass', lazy: true },
                        { name: 'lazy-parent', url: '../shared/lazy-parent.js', module: 'LazyFakeModuleClass', lazy: true },
                        { name: 'lazy-absolute', url: 'https://other.example.com/lazy.js', module: 'LazyFakeModuleClass', lazy: true }
                    ]
                }
            }));
            await promise;

            expect(registry.getRegistryEntries().map(entry => entry.url)).toEqual([
                'https://cdn.example.com/agentlets/lazy-relative.js',
                'https://cdn.example.com/shared/lazy-parent.js',
                'https://other.example.com/lazy.js'
            ]);
        });

        test('loadFromRegistry() resolves a relative registry URL against the host page first', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const promise = registry.loadFromRegistry('./agentlets/registry.js');
            window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', {
                detail: {
                    agentlets: [
                        { name: 'lazy-page-relative', url: './module-bundle.js', module: 'LazyFakeModuleClass', lazy: true }
                    ]
                }
            }));
            await promise;

            expect(registry.getRegistryEntries()[0].url).toBe(new URL('./agentlets/module-bundle.js', window.location.href).href);
        });

        test('loadModule() loads and registers a lazy entry without activating it, even when its pattern matches the current URL', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });

            class LazyFakeModuleClass {
                name = '';
            }
            (window as unknown as Record<string, unknown>).LazyFakeModuleClass = LazyFakeModuleClass;

            const entry = { name: 'lazy-two', url: 'https://example.com/lazy-two.js', module: 'LazyFakeModuleClass', lazy: true };
            const loadPromise = registry.loadModule(entry);

            const script = document.head.querySelector('script[src="https://example.com/lazy-two.js"]') as HTMLScriptElement;
            expect(script).not.toBeNull();
            script.onload?.(new Event('load'));

            const loaded = await loadPromise;

            expect(loaded.name).toBe('lazy-two');
            expect(registry.get('lazy-two')).toBe(loaded);
            // Loaded, but never activated - even though its pattern ('*' via
            // checkPattern falling back to true for no patterns is NOT assumed
            // here; this instance has no `patterns`/`checkPattern` override at
            // all, so it can't match anything) - the key assertion is that
            // loadModule() itself never calls activateModule().
            expect(registry.activeModule).toBeNull();

            const entries = registry.getRegistryEntries();
            expect(entries).toEqual([{ ...entry, loaded: true }]);
        });

        test('loadModule() never activates even when the loaded module\'s pattern matches the current URL', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });

            class LazyFakeModuleClass extends Module {
                constructor() {
                    super({ name: 'lazy-three', patterns: ['*'] });
                }
            }
            (window as unknown as Record<string, unknown>).LazyFakeModuleClass = LazyFakeModuleClass;

            const entry = { name: 'lazy-three', url: 'https://example.com/lazy-three.js', module: 'LazyFakeModuleClass', lazy: true };
            const loadPromise = registry.loadModule(entry);
            const script = document.head.querySelector('script[src="https://example.com/lazy-three.js"]') as HTMLScriptElement;
            script.onload?.(new Event('load'));
            const loaded = await loadPromise;

            expect(registry.get('lazy-three')).toBe(loaded);
            expect(registry.activeModule).toBeNull();

            // The host activates it explicitly afterwards.
            await registry.activateModule(loaded);
            expect(registry.activeModule).toBe(loaded);
        });

        test('loadModule() resolves with the already-registered instance, without reloading, when called twice', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });

            class LazyFakeModuleClass {
                name = '';
            }
            (window as unknown as Record<string, unknown>).LazyFakeModuleClass = LazyFakeModuleClass;

            const entry = { name: 'lazy-four', url: 'https://example.com/lazy-four.js', module: 'LazyFakeModuleClass' };
            const firstLoad = registry.loadModule(entry);
            (document.head.querySelector('script[src="https://example.com/lazy-four.js"]') as HTMLScriptElement).onload?.(new Event('load'));
            const first = await firstLoad;

            const second = await registry.loadModule(entry);

            expect(second).toBe(first);
            // Still only the one <script> from the first load.
            expect(document.head.querySelectorAll('script[src="https://example.com/lazy-four.js"]').length).toBe(1);
        });
    });
});
