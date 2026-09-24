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
 *   (`trigger`/`oldUrl`/`newUrl`), including a pre-existing quirk in the
 *   `url:changed` event (see the dedicated test below).
 * - startUrlMonitoring()'s `popstate` listener and its `history.pushState`/
 *   `replaceState` overrides.
 * - activateModule()'s already-active no-op, its cascade-prevention guard,
 *   and `init()` only running once per module.
 * - unregister() propagating a rejecting `module.cleanup()` (unlike
 *   activateModule()/deactivateModule(), it has no try/catch around it).
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

interface ModuleRegistryTestInstance {
    modules: Map<string, AgentletModule>;
    activeModule: AgentletModule | null;
    lastUrl: string;
    eventBus?: EventBusStub;
    registryUrl?: string;
    loadedRegistries: Set<string>;
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
    setModuleChangeCallback(callback: (module: AgentletModule | null, context?: ModuleActivationContext) => void): void;
    loadFromRegistry(registryUrl?: string | null): Promise<void>;
    loadRegistryScript(url: string): Promise<unknown>;
    loadAgentletModule(config: { name: string; url: string; module: string }): Promise<void>;
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

// The constructor calls startUrlMonitoring(), which sets a 1s setInterval
// that is never cleared (a pre-existing quirk - see tests/core/ModuleRegistry.test.js's
// own top-level jest.useFakeTimers() for precedent); fake timers keep that
// from leaving real dangling timers across every test in this file.
jest.useFakeTimers();

// Captured once, before any ModuleRegistry instance can wrap them, so every
// test starts from jsdom's real implementations regardless of how many
// registries earlier tests constructed (each constructor call wraps
// whatever pushState/replaceState currently is).
const nativePushState = history.pushState;
const nativeReplaceState = history.replaceState;

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
            history.pushState({}, '', '/undetected-page');
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const activeModule = new Module({ name: 'was-active', patterns: ['never-matches.example'] });
            activeModule.cleanup = jest.fn().mockResolvedValue(undefined);
            registry.activeModule = activeModule;

            registry.checkUrlChange();
            await Promise.resolve();

            expect(mockEventBus.emit).toHaveBeenCalledWith('application:notDetected', { url: window.location.href });
            expect(activeModule.cleanup).toHaveBeenCalled();
        });

        test('quirk: the "url:changed" event\'s oldUrl already equals the new URL, because lastUrl is reassigned before the event is built', () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            history.pushState({}, '', '/quirk-page');

            registry.checkUrlChange();

            expect(mockEventBus.emit).toHaveBeenCalledWith('url:changed', {
                oldUrl: window.location.href,
                newUrl: window.location.href
            });
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
        test('propagates a rejecting module.cleanup() (no try/catch around it, unlike activateModule()/deactivateModule())', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const module = new Module({ name: 'boom', patterns: ['x'] });
            const error = new Error('cleanup boom');
            module.cleanup = jest.fn().mockRejectedValue(error);
            registry.register(module);

            await expect(registry.unregister('boom')).rejects.toThrow('cleanup boom');
            // The rejection happens before `this.modules.delete()` runs, so the module is still registered.
            expect(registry.modules.has('boom')).toBe(true);
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

        test('getStatistics() tracks registriesLoaded/registryLoadFailures after loadFromRegistry() runs', async () => {
            const registry = new ModuleRegistry({ eventBus: mockEventBus });
            const promise = registry.loadFromRegistry('https://example.com/stats-registry.js');
            window.dispatchEvent(new CustomEvent('agentletRegistryLoaded', { detail: { agentlets: [] } }));
            await promise;

            const stats = registry.getStatistics();
            expect(stats.registriesLoaded).toBe(1);
            expect(stats.registryLoadFailures).toBe(0);
        });
    });
});
