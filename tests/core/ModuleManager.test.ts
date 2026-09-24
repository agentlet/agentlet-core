/**
 * Behaviour characterization tests for ModuleManager.
 *
 * No existing test file covers `src/core/ModuleManager.js` (confirmed via
 * `grep -rli modulemanager tests`), so this file pins down its CURRENT
 * behaviour ahead of its conversion to TypeScript: the single-registration
 * choke point in front of `ModuleRegistry`, its duplicate-detection /
 * source-tracking rules, and its other public methods
 * (unregister/get/getAll/activate/getStatistics/initialize).
 *
 * Nothing here should change when the conversion lands - if an assertion
 * needs to change, the conversion changed behaviour and that is a bug in
 * the conversion, not in this file.
 */

import ModuleManagerCtor from '../../src/core/ModuleManager.js';
import Module from '../../src/core/Module.js';
import type { AgentletModule, ModuleActivationContext } from '../../src/types/public-api';

/**
 * ModuleManager.js is untyped, plain JS at this point (pre-conversion), so
 * `tsc` only infers a weak shape for it. This local type describes the real
 * runtime surface exercised here; the conversion's own `.ts` file provides
 * the exhaustive/authoritative version (`ModuleManagerAPI` in
 * `src/types/public-api.d.ts`).
 */
interface ModuleRegistryStub {
    register: jest.Mock<void, [AgentletModule]>;
    unregister: jest.Mock<Promise<boolean>, [string]>;
    activateModule: jest.Mock<Promise<void>, [AgentletModule, ModuleActivationContext?]>;
    getStatistics: jest.Mock<Record<string, unknown>, []>;
}

interface ModuleManagerTestInstance {
    moduleRegistry: ModuleRegistryStub;
    modules: Map<string, AgentletModule>;
    activeModule: AgentletModule | null;
    _isInitialized: boolean;
    _registrationSources: Map<string, string>;
    register(module: AgentletModule, source?: string): void;
    unregister(moduleName: string): Promise<boolean>;
    get(moduleName: string): AgentletModule | undefined;
    getAll(): string[];
    activate(module: AgentletModule, context?: ModuleActivationContext): Promise<void>;
    getStatistics(): Record<string, unknown> & { registrationSources: Record<string, string> };
    initialize(): void;
}

const ModuleManager = ModuleManagerCtor as unknown as new (moduleRegistry: ModuleRegistryStub) => ModuleManagerTestInstance;

function createRegistryStub(): ModuleRegistryStub {
    return {
        register: jest.fn(),
        unregister: jest.fn().mockResolvedValue(true),
        activateModule: jest.fn().mockResolvedValue(undefined),
        getStatistics: jest.fn().mockReturnValue({ totalModules: 0, activationCount: 0 })
    };
}

describe('ModuleManager behaviour characterization', () => {
    let registryStub: ModuleRegistryStub;
    let manager: ModuleManagerTestInstance;

    beforeEach(() => {
        registryStub = createRegistryStub();
        manager = new ModuleManager(registryStub);
    });

    describe('register()', () => {
        test('delegates to moduleRegistry.register(), tracks the module and its source', () => {
            const module = new Module({ name: 'module-a', patterns: ['a.example'] });
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            manager.register(module, 'my-source');

            expect(registryStub.register).toHaveBeenCalledWith(module);
            expect(manager.modules.get('module-a')).toBe(module);
            expect(manager._registrationSources.get('module-a')).toBe('my-source');
            expect(consoleSpy).toHaveBeenCalledWith('📦 ModuleManager: module-a registered from my-source');
            consoleSpy.mockRestore();
        });

        test('throws for an invalid module (no name)', () => {
            expect(() => {
                manager.register({} as AgentletModule);
            }).toThrow('Invalid module: name is required');
            expect(registryStub.register).not.toHaveBeenCalled();
        });

        test('re-registering the exact same instance from a different source warns and is ignored', () => {
            const module = new Module({ name: 'module-a', patterns: ['a.example'] });
            manager.register(module, 'source1');
            registryStub.register.mockClear();
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            manager.register(module, 'source2');

            expect(consoleSpy).toHaveBeenCalledWith(
                'ModuleManager: Module module-a already registered with same instance from source1, ignoring registration from source2'
            );
            // Ignored: registry.register() is not called again and the tracked source is unchanged.
            expect(registryStub.register).not.toHaveBeenCalled();
            expect(manager._registrationSources.get('module-a')).toBe('source1');
            consoleSpy.mockRestore();
        });

        test('registering a different instance under the same name replaces it and re-delegates to the registry', () => {
            const first = new Module({ name: 'module-a', patterns: ['a.example'] });
            const second = new Module({ name: 'module-a', patterns: ['a.example'] });
            manager.register(first, 'source1');
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            manager.register(second, 'source2');

            expect(consoleSpy).toHaveBeenCalledWith('ModuleManager: Module module-a already registered with different instance, replacing...');
            expect(consoleSpy).toHaveBeenCalledWith('Module module-a already registered from source1, now registering from source2');
            expect(registryStub.register).toHaveBeenCalledWith(second);
            expect(manager.get('module-a')).toBe(second);
            expect(manager._registrationSources.get('module-a')).toBe('source2');
            consoleSpy.mockRestore();
        });
    });

    describe('unregister()', () => {
        test('removes local tracking and delegates to moduleRegistry.unregister(), returning its result', async () => {
            const module = new Module({ name: 'module-a', patterns: ['a.example'] });
            manager.register(module, 'source1');

            const result = await manager.unregister('module-a');

            expect(result).toBe(true);
            expect(registryStub.unregister).toHaveBeenCalledWith('module-a');
            expect(manager.modules.has('module-a')).toBe(false);
            expect(manager._registrationSources.has('module-a')).toBe(false);
        });

        test('propagates whatever moduleRegistry.unregister() resolves to, even for a name never registered locally', async () => {
            registryStub.unregister.mockResolvedValue(false);

            const result = await manager.unregister('never-registered');

            expect(result).toBe(false);
            expect(registryStub.unregister).toHaveBeenCalledWith('never-registered');
        });
    });

    describe('get() / getAll()', () => {
        test('reflect ModuleManager\'s own local map, not modules registered directly on moduleRegistry', () => {
            const managed = new Module({ name: 'managed', patterns: ['x'] });
            manager.register(managed, 'source1');

            // Registered directly on the underlying registry, bypassing the manager.
            expect(manager.get('managed')).toBe(managed);
            expect(manager.getAll()).toEqual(['managed']);
            expect(manager.get('unmanaged-elsewhere')).toBeUndefined();
        });
    });

    describe('activate()', () => {
        test('delegates to moduleRegistry.activateModule() with the module and context, returning its result', async () => {
            const module = new Module({ name: 'module-a', patterns: ['a.example'] });
            const context: ModuleActivationContext = { trigger: 'test' };

            await manager.activate(module, context);

            expect(registryStub.activateModule).toHaveBeenCalledWith(module, context);
        });
    });

    describe('getStatistics()', () => {
        test('merges moduleRegistry.getStatistics() with a registrationSources map keyed by module name', () => {
            const moduleA = new Module({ name: 'module-a', patterns: ['a.example'] });
            const moduleB = new Module({ name: 'module-b', patterns: ['b.example'] });
            manager.register(moduleA, 'source1');
            manager.register(moduleB, 'source2');

            const stats = manager.getStatistics();

            expect(registryStub.getStatistics).toHaveBeenCalled();
            expect(stats.totalModules).toBe(0); // passed through verbatim from the (stubbed) registry stats
            expect(stats.registrationSources).toEqual({ 'module-a': 'source1', 'module-b': 'source2' });
        });
    });

    describe('initialize()', () => {
        test('sets _isInitialized to true and logs', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

            manager.initialize();

            expect(manager._isInitialized).toBe(true);
            expect(consoleSpy).toHaveBeenCalledWith('📦 ModuleManager initialized');
            consoleSpy.mockRestore();
        });

        test('warns and is a no-op when called again after already being initialized', () => {
            manager.initialize();
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            manager.initialize();

            expect(consoleSpy).toHaveBeenCalledWith('ModuleManager already initialized');
            consoleSpy.mockRestore();
        });
    });
});
