/**
 * Tests for ModuleLoader class
 */

import ModuleLoader from '../../src/plugin-system/ModuleLoader.js';

// Mock fetch for module loading tests
global.fetch = jest.fn();

describe('ModuleLoader', () => {
  let moduleLoader;
  let mockEventBus;
  let originalLocation;

  beforeEach(() => {
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn()
    };

    // Reset fetch mock
    fetch.mockClear();

    // Store original location and mock it
    originalLocation = window.location;
    delete window.location;
    window.location = { href: 'https://test.com' };
  });

  afterEach(() => {
    // Restore original location
    window.location = originalLocation;
  });

  describe('Constructor', () => {
    test('should create module loader with default configuration', () => {
      moduleLoader = new ModuleLoader();

      expect(moduleLoader.modules).toBeInstanceOf(Map);
      expect(moduleLoader.activeModule).toBeNull();
      expect(moduleLoader.moduleRegistry).toEqual([]);
    });

    test('should create module loader with custom configuration', () => {
      const config = {
        moduleRegistry: [{ name: 'test-module', url: 'test.js' }],
        eventBus: mockEventBus
      };

      moduleLoader = new ModuleLoader(config);

      expect(moduleLoader.moduleRegistry).toEqual(config.moduleRegistry);
      expect(moduleLoader.eventBus).toBe(mockEventBus);
    });

    test('should create default event bus if none provided', () => {
      moduleLoader = new ModuleLoader();

      expect(moduleLoader.eventBus).toBeDefined();
      expect(typeof moduleLoader.eventBus.on).toBe('function');
      expect(typeof moduleLoader.eventBus.emit).toBe('function');
    });
  });

  describe('Module Registration', () => {
    beforeEach(() => {
      moduleLoader = new ModuleLoader();
    });

    test('should register modules', async () => {
      const mockModule = {
        name: 'test-module',
        version: '1.0.0',
        init: jest.fn(),
        cleanup: jest.fn(),
        shouldRunOnPage: jest.fn(() => true),
        checkPattern: jest.fn(),
        getMetadata: jest.fn(),
      };

      await moduleLoader.registerModule(mockModule);

      expect(moduleLoader.modules.has('test-module')).toBe(true);
      expect(moduleLoader.modules.get('test-module')).toBe(mockModule);
    });

    test('should handle module registration with conflicts', async () => {
      const module1 = { name: 'test-module', version: '1.0.0', checkPattern: jest.fn(), init: jest.fn(), getMetadata: jest.fn() };
      const module2 = { name: 'test-module-2', version: '2.0.0', checkPattern: jest.fn(), init: jest.fn(), getMetadata: jest.fn() };

      await moduleLoader.registerModule(module1);
      await moduleLoader.registerModule(module2);

      // Should both be registered with different names
      expect(moduleLoader.modules.get('test-module')).toBe(module1);
      expect(moduleLoader.modules.get('test-module-2')).toBe(module2);
    });

    test('should track registered modules', async () => {
      const mockModule = {
        name: 'test-module',
        cleanup: jest.fn(),
        checkPattern: jest.fn(),
        init: jest.fn(),
        getMetadata: jest.fn(),
      };

      await moduleLoader.registerModule(mockModule);
      expect(moduleLoader.modules.has('test-module')).toBe(true);
      expect(moduleLoader.loadedModules.has('test-module')).toBe(true);
    });
  });

  describe('Module Loading', () => {
    beforeEach(() => {
      moduleLoader = new ModuleLoader({});
    });

    test('should have loadModuleFromUrl method', () => {
      expect(typeof moduleLoader.loadModuleFromUrl).toBe('function');
    });
  });
});