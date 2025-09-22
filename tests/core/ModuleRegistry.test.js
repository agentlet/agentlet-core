/**
 * Test suite for ModuleRegistry class
 */

import ModuleRegistry from '../../src/core/ModuleRegistry.js';
import Module from '../../src/core/Module.js';

// Mock setTimeout and clearInterval for URL monitoring
jest.useFakeTimers();

describe('ModuleRegistry', () => {
    let registry;
    let mockEventBus;
    let testModule;

    beforeEach(() => {
        // Create mock event bus
        mockEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            off: jest.fn()
        };

        // Create test module
        testModule = new Module({
            name: 'test-module',
            patterns: ['test.com']
        });

        // Mock module methods
        testModule.init = jest.fn();
        testModule.activate = jest.fn();
        testModule.cleanup = jest.fn();
        testModule.checkPattern = jest.fn();

        // Create registry
        registry = new ModuleRegistry({
            eventBus: mockEventBus
        });
    });

    afterEach(() => {
        jest.clearAllMocks();
    });

    describe('Constructor', () => {
        test('should initialize with empty modules map', () => {
            expect(registry.modules.size).toBe(0);
            expect(registry.activeModule).toBe(null);
            expect(registry.eventBus).toBe(mockEventBus);
        });
    });

    describe('Module Registration', () => {
        test('should register a module', () => {
            registry.register(testModule);

            expect(registry.modules.has('test-module')).toBe(true);
            expect(registry.modules.get('test-module')).toBe(testModule);
            expect(testModule.eventBus).toBe(mockEventBus);
            expect(mockEventBus.emit).toHaveBeenCalledWith('module:registered', { module: 'test-module' });
        });

        test('should throw error for invalid module', () => {
            expect(() => {
                registry.register({});
            }).toThrow('Invalid module: name is required');
        });

        test('should warn when registering same module instance', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

            registry.register(testModule);
            registry.register(testModule);

            expect(consoleSpy).toHaveBeenCalledWith('Module test-module already registered with same instance, ignoring');

            consoleSpy.mockRestore();
        });
    });

    describe('Module Unregistration', () => {
        test('should unregister a module', async () => {
            registry.register(testModule);
            
            const result = await registry.unregister('test-module');

            expect(result).toBe(true);
            expect(registry.modules.has('test-module')).toBe(false);
            expect(mockEventBus.emit).toHaveBeenCalledWith('module:unregistered', { module: 'test-module' });
        });

        test('should return false for non-existent module', async () => {
            const result = await registry.unregister('non-existent');
            expect(result).toBe(false);
        });

        test('should cleanup active module when unregistering', async () => {
            registry.register(testModule);
            registry.activeModule = testModule;
            
            await registry.unregister('test-module');

            expect(registry.activeModule).toBe(null);
        });
    });

    describe('Module Finding', () => {
        test('should find matching module', () => {
            testModule.checkPattern.mockReturnValue(true);
            registry.register(testModule);

            const found = registry.findMatchingModule('https://test.com/page');

            expect(found).toBe(testModule);
            expect(testModule.checkPattern).toHaveBeenCalledWith('https://test.com/page');
        });

        test('should return null if no match found', () => {
            testModule.checkPattern.mockReturnValue(false);
            registry.register(testModule);

            const found = registry.findMatchingModule('https://other.com/page');

            expect(found).toBe(null);
        });
    });

    describe('Module Activation', () => {
        test('should activate a module successfully', async () => {
            registry.register(testModule);

            await registry.activateModule(testModule, { trigger: 'test' });

            expect(testModule.init).toHaveBeenCalled();
            expect(testModule.activate).toHaveBeenCalledWith({ trigger: 'test' });
            expect(registry.activeModule).toBe(testModule);
            expect(testModule.isInitialized).toBe(true);
            expect(mockEventBus.emit).toHaveBeenCalledWith('module:activated', { 
                module: 'test-module', 
                context: { trigger: 'test' } 
            });
        });

        test('should deactivate current module before activating new one', async () => {
            const currentModule = new Module({ name: 'current', patterns: ['current.com'] });
            currentModule.cleanup = jest.fn();
            
            registry.activeModule = currentModule;
            
            await registry.activateModule(testModule);

            expect(currentModule.cleanup).toHaveBeenCalled();
            expect(registry.activeModule).toBe(testModule);
        });

        test('should handle activation errors', async () => {
            const error = new Error('Activation failed');
            testModule.activate.mockRejectedValue(error);
            
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            
            await registry.activateModule(testModule);

            expect(consoleSpy).toHaveBeenCalledWith('❌ Module activation failed: test-module', error);
            expect(mockEventBus.emit).toHaveBeenCalledWith('module:activationFailed', { 
                module: 'test-module', 
                error: 'Activation failed' 
            });
            
            consoleSpy.mockRestore();
        });
    });

    describe('Module Deactivation', () => {
        test('should deactivate current module', async () => {
            testModule.cleanup = jest.fn();
            registry.activeModule = testModule;

            await registry.deactivateModule();

            expect(testModule.cleanup).toHaveBeenCalled();
            expect(registry.activeModule).toBe(null);
            expect(mockEventBus.emit).toHaveBeenCalledWith('module:deactivated', { module: 'test-module' });
        });

        test('should handle deactivation errors', async () => {
            const error = new Error('Cleanup failed');
            testModule.cleanup.mockRejectedValue(error);
            registry.activeModule = testModule;
            
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

            await registry.deactivateModule();

            expect(consoleSpy).toHaveBeenCalledWith('❌ Module deactivation failed: test-module', error);
            expect(registry.activeModule).toBe(null);
            
            consoleSpy.mockRestore();
        });
    });

    describe('Registry API', () => {
        test('should get all module names', () => {
            registry.register(testModule);
            
            const names = registry.getAll();
            
            expect(names).toEqual(['test-module']);
        });

        test('should get module by name', () => {
            registry.register(testModule);
            
            const module = registry.get('test-module');
            
            expect(module).toBe(testModule);
        });

        test('should return null for non-existent module', () => {
            const module = registry.get('non-existent');
            
            expect(module).toBe(null);
        });

        test('should return statistics', () => {
            registry.register(testModule);
            
            const stats = registry.getStatistics();
            
            expect(stats).toEqual({
                totalModules: 1,
                activationCount: 0,
                failedActivations: 0,
                activeModule: null,
                moduleList: ['test-module'],
                registriesLoaded: 0,
                registryLoadFailures: 0
            });
        });
    });

    describe('Cleanup', () => {
        test('should cleanup all modules', async () => {
            const anotherModule = new Module({ name: 'another', patterns: ['another.com'] });
            anotherModule.cleanup = jest.fn();
            
            registry.register(testModule);
            registry.register(anotherModule);
            registry.activeModule = testModule;

            await registry.cleanup();

            expect(testModule.cleanup).toHaveBeenCalled();
            expect(anotherModule.cleanup).toHaveBeenCalled();
            expect(registry.modules.size).toBe(0);
            expect(registry.activeModule).toBe(null);
        });
    });
});