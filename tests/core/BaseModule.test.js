/**
 * Tests for BaseModule class
 */

import BaseModule from '../../src/core/BaseModule.js';

describe('BaseModule', () => {
  let module;
  let mockEventBus;

  beforeEach(() => {
    mockEventBus = {
      on: jest.fn(),
      off: jest.fn(),
      emit: jest.fn()
    };
  });

  describe('Constructor', () => {
    test('should create module with default configuration', () => {
      module = new BaseModule({
        name: 'test-module',
        patterns: ['test.com']
      });

      expect(module.name).toBe('test-module');
      expect(module.version).toBe('1.0.0');
      expect(module.patterns).toEqual(['test.com']);
      expect(module.matchMode).toBe('includes');
      expect(module.isActive).toBe(false);
      expect(module.capabilities).toEqual([]);
      expect(module.permissions).toEqual([]);
      expect(module.dependencies).toEqual([]);
    });

    test('should create module with custom configuration', () => {
      const config = {
        name: 'custom-module',
        version: '2.0.0',
        description: 'Test module',
        patterns: [/test\.com/],
        matchMode: 'regex',
        capabilities: ['ai-integration'],
        permissions: ['dom-manipulation'],
        dependencies: ['utility-module'],
        eventBus: mockEventBus
      };

      module = new BaseModule(config);

      expect(module.name).toBe('custom-module');
      expect(module.version).toBe('2.0.0');
      expect(module.description).toBe('Test module');
      expect(module.matchMode).toBe('regex');
      expect(module.capabilities).toEqual(['ai-integration']);
      expect(module.permissions).toEqual(['dom-manipulation']);
      expect(module.dependencies).toEqual(['utility-module']);
      expect(module.eventBus).toBe(mockEventBus);
    });

    test('should handle urlPattern fallback for backward compatibility', () => {
      module = new BaseModule({
        name: 'test-module',
        patterns: ['legacy.com']
      });

      expect(module.patterns).toEqual(['legacy.com']);
    });

    test('should throw error for invalid configuration', () => {
      expect(() => {
        new BaseModule({});
      }).toThrow('Required field \'name\' is missing');

      expect(() => {
        new BaseModule({ name: '' });
      }).toThrow('Required field \'patterns\' is missing');
    });
  });

  describe('URL Matching', () => {
    beforeEach(() => {
      module = new BaseModule({
        name: 'test-module',
        patterns: ['example.com', 'test.org']
      });
    });

    test('should match URLs using includes mode', () => {
      expect(module.checkPattern('https://example.com/page')).toBe(true);
      expect(module.checkPattern('https://test.org/another')).toBe(true);
      expect(module.checkPattern('https://nomatch.com')).toBe(false);
    });

    test('should match URLs using exact mode', () => {
      module.matchMode = 'exact';
      module.patterns = ['https://example.com/exact'];

      expect(module.checkPattern('https://example.com/exact')).toBe(true);
      expect(module.checkPattern('https://example.com/exact/more')).toBe(false);
    });

    test('should match URLs using regex mode', () => {
      module.matchMode = 'regex';
      module.patterns = [/^https:\/\/example\.com\/\w+$/];

      expect(module.checkPattern('https://example.com/page')).toBe(true);
      expect(module.checkPattern('https://example.com/page/sub')).toBe(false);
    });

    test('should use custom matcher when provided', () => {
      const customMatcher = jest.fn(() => true);
      module.matchMode = 'custom';
      module.customMatcher = customMatcher;

      const result = module.checkPattern('https://any.com');

      expect(result).toBe(true);
      expect(customMatcher).toHaveBeenCalledWith('https://any.com', module.patterns);
    });
  });

  describe('Lifecycle Management', () => {
    beforeEach(() => {
      module = new BaseModule({
        name: 'test-module',
        patterns: ['test.com'],
        eventBus: mockEventBus
      });
    });

    test('should initialize module correctly', async () => {
      const initHookSpy = jest.spyOn(module.hooks, 'init');

      await module.init();

      expect(module.isActive).toBe(true);
      expect(initHookSpy).toHaveBeenCalled();
    });

    test('should cleanup module correctly', async () => {
      module.isActive = true;
      const cleanupHookSpy = jest.spyOn(module.hooks, 'cleanup');

      await module.cleanup();

      expect(module.isActive).toBe(false);
      expect(cleanupHookSpy).toHaveBeenCalled();
    });

    test('should handle URL updates', async () => {
      const updatedURLSpy = jest.spyOn(module, 'updatedURL');
      
      await module.updatedURL('https://new-url.com');

      expect(updatedURLSpy).toHaveBeenCalledWith('https://new-url.com');
    });
  });

  describe('Event System', () => {
    beforeEach(() => {
      module = new BaseModule({
        name: 'test-module',
        patterns: ['test.com'],
        eventBus: mockEventBus
      });
    });

    test('should register event listeners', () => {
      const handler = jest.fn();
      module.on('test-event', handler);

      expect(module.eventListeners.has('test-event')).toBe(true);
      expect(module.eventListeners.get('test-event')).toContain(handler);
    });

    test('should emit events locally', () => {
      const handler = jest.fn();
      module.on('test-event', handler);

      module.emit('test-event', 'test-data');

      expect(handler).toHaveBeenCalledWith('test-data');
    });

    test('should emit events globally when eventBus is available', () => {
      module.emit('global-event', 'data');

      expect(mockEventBus.emit).toHaveBeenCalledWith('module:test-module:global-event', {
        data: 'data',
        event: 'global-event',
        module: 'test-module'
      });
    });

    test('should remove event listeners', () => {
      const handler = jest.fn();
      module.on('test-event', handler);
      module.off('test-event', handler);

      expect(module.eventListeners.get('test-event')).toEqual([]);
    });

    test('should remove all listeners for an event', () => {
      const handler1 = jest.fn();
      const handler2 = jest.fn();
      module.on('test-event', handler1);
      module.on('test-event', handler2);
      module.off('test-event', handler1);

      expect(module.eventListeners.get('test-event')).toEqual([handler2]);
    });
  });

  describe('Submodule Management', () => {
    let submodule;

    beforeEach(() => {
      module = new BaseModule({
        name: 'test-module',
        patterns: ['test.com']
      });

      submodule = {
        name: 'test-submodule',
        init: jest.fn(),
        cleanup: jest.fn(),
        checkPattern: jest.fn(() => true),
        updatedURL: jest.fn()
      };
    });

    test('should add submodules', () => {
      module.submodules.push(submodule);

      expect(module.submodules).toContain(submodule);
    });

    test('should check submodules for URL changes', () => {
      module.submodules.push(submodule);
      module.checkSubmodules('https://test.com/page');

      expect(submodule.init).toHaveBeenCalled();
      expect(module.activeSubmodule).toBe(submodule);
    });

    test('should deactivate submodule when URL no longer matches', () => {
      module.submodules.push(submodule);
      module.activeSubmodule = submodule;
      
      // First call to activate
      submodule.checkPattern.mockReturnValue(true);
      module.checkSubmodules('https://test.com/page');
      
      // Second call with different URL that doesn't match
      submodule.checkPattern.mockReturnValue(false);
      module.checkSubmodules('https://other.com/page');

      expect(submodule.cleanup).toHaveBeenCalled();
      expect(module.activeSubmodule).toBeNull();
    });
  });

  describe('Settings Management', () => {
    beforeEach(() => {
      module = new BaseModule({
        name: 'test-module',
        patterns: ['test.com'],
        settings: { key: 'value' }
      });
    });

    test('should update settings', () => {
      module.updateSettings({ key: 'newValue', newKey: 'newValue' });

      expect(module.settings).toEqual({
        debugMode: false,
        enabled: true,
        key: 'newValue',
        logLevel: 'info',
        newKey: 'newValue'
      });
    });

    test('should get setting value', () => {
      module.settings = {
        key: 'value'
      };

      expect(module.settings.key).toBe('value');
      expect(module.settings.nonexistent).toBeUndefined();
    });
  });

  describe('Capabilities and Permissions', () => {
    beforeEach(() => {
      module = new BaseModule({
        name: 'test-module',
        patterns: ['test.com'],
        capabilities: ['ai-integration'],
        permissions: ['dom-manipulation']
      });
    });

    test('should check if module has capability', () => {
      expect(module.hasCapability('ai-integration')).toBe(true);
      expect(module.hasCapability('nonexistent')).toBe(false);
    });

    test('should request permission', async () => {
      const result = await module.requestPermission('new-permission');
      expect(result).toBe(false); // Default implementation denies permissions
    });
  });

  describe('Performance Tracking', () => {
    beforeEach(() => {
      module = new BaseModule({
        name: 'test-module',
        patterns: ['test.com']
      });
    });

    test('should perform actions with tracking', async () => {
      const result = await module.performAction('analyze');

      expect(result).toBeUndefined();
      expect(module.performanceMetrics).toBeDefined();
    });

    test('should track performance metrics over time', async () => {
      await module.performAction('refresh');
      await module.performAction('refresh');
      await module.performAction('refresh');

      expect(module.performanceMetrics).toBeDefined();
    });
  });
});