/**
 * Tests for AgentletCore main application (index.js)
 */

// Mock jQuery
jest.mock('jquery', () => {
  const mockElement = {
    style: {},
    classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn(), toggle: jest.fn() },
    appendChild: jest.fn(),
    removeChild: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    setAttribute: jest.fn(),
    getAttribute: jest.fn(),
    innerHTML: '',
    textContent: '',
    id: '',
    onclick: null,
    remove: jest.fn()
  };

  const mockJQuery = jest.fn(() => {
    const arr = [mockElement];
    arr.remove = jest.fn();
    arr.append = jest.fn();
    return arr;
  });
  mockJQuery.noConflict = jest.fn(() => mockJQuery);
  mockJQuery.fn = {};
  return mockJQuery;
});

import AgentletCore from '../src/index.js';

describe('AgentletCore', () => {
  let agentlet;

  beforeEach(() => {
    // Reset window.agentlet
    delete window.agentlet;
    
    // Setup DOM mocks
    document.createElement = jest.fn(() => ({
      style: {},
      classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn() },
      appendChild: jest.fn(),
      removeChild: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      setAttribute: jest.fn(),
      getAttribute: jest.fn(),
      innerHTML: '',
      textContent: '',
      id: ''
    }));
    document.body.appendChild = jest.fn();
    document.body.removeChild = jest.fn();
  });

  describe('Constructor', () => {
    test('should create AgentletCore with default configuration', () => {
      agentlet = new AgentletCore();

      expect(agentlet.initialized).toBe(false);
      expect(agentlet.config.enablePlugins).toBe(true);
      expect(agentlet.config.debugMode).toBe(false);
    });

    test('should create AgentletCore with custom configuration', () => {
      const config = {
        enablePlugins: false,
        debugMode: true
      };

      agentlet = new AgentletCore(config);

      expect(agentlet.config.enablePlugins).toBe(false);
      expect(agentlet.config.debugMode).toBe(true);
    });

    test('should initialize managers and utilities', () => {
      agentlet = new AgentletCore();

      expect(agentlet.envManager).toBeDefined();
      expect(agentlet.cookieManager).toBeDefined();
      expect(agentlet.storageManager).toBeDefined();
      expect(agentlet.moduleLoader).toBeDefined();
    });

    test('should set up global access', () => {
      agentlet = new AgentletCore();

      expect(window.agentlet).toBe(agentlet);
      expect(window.agentlet.utils).toBeDefined();
      expect(window.agentlet.env).toBeDefined();
      expect(window.agentlet.storage).toBeDefined();
    });
  });

  describe('Event Bus', () => {
    beforeEach(() => {
      agentlet = new AgentletCore();
    });

    test('should create event bus with core methods', () => {
      expect(agentlet.eventBus.emit).toBeDefined();
      expect(agentlet.eventBus.on).toBeDefined();
      expect(agentlet.eventBus.off).toBeDefined();
      expect(agentlet.eventBus.request).toBeDefined();
    });

    test('should emit events and call listeners', () => {
      const listener = jest.fn();
      agentlet.eventBus.on('test-event', listener);

      agentlet.eventBus.emit('test-event', 'test-data');

      expect(listener).toHaveBeenCalledWith('test-data');
    });

    test('should remove event listeners', () => {
      const listener = jest.fn();
      agentlet.eventBus.on('test-event', listener);
      agentlet.eventBus.off('test-event', listener);

      agentlet.eventBus.emit('test-event', 'test-data');

      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('Initialization', () => {
    beforeEach(() => {
      agentlet = new AgentletCore();
    });

    test('should initialize successfully', async () => {
      await agentlet.init();

      expect(agentlet.initialized).toBe(true);
    });

    test('should set up UI', async () => {
      agentlet = new AgentletCore();
      const setupBaseUISpy = jest.spyOn(agentlet, 'setupBaseUI');
      
      await agentlet.init();

      expect(setupBaseUISpy).toHaveBeenCalled();
    });
  });

  describe('UI Management', () => {
    beforeEach(() => {
      agentlet = new AgentletCore();
    });

    test('should show and hide UI', () => {
      agentlet.ui.container = { style: {} };
      
      agentlet.show();
      expect(agentlet.ui.container.style.display).toBe('flex');
      
      agentlet.hide();
      expect(agentlet.ui.container.style.display).toBe('none');
    });

    test('should toggle minimize state', () => {
      agentlet.ui.container = { style: {} };
      agentlet.isMinimized = false;
      
      // Ensure jQuery is available for this test
      window.agentlet.$ = window.agentlet.$ || jest.fn(() => ({ 0: null, length: 0 }));
      
      agentlet.minimize();
      expect(agentlet.isMinimized).toBe(true);
      
      agentlet.maximize();
      expect(agentlet.isMinimized).toBe(false);
    });
  });

  describe('Error Handling', () => {
    test('should show error messages', () => {
      agentlet = new AgentletCore();
      const eventEmitSpy = jest.spyOn(agentlet.eventBus, 'emit');
      
      agentlet.showError('Test error');
      
      expect(eventEmitSpy).toHaveBeenCalledWith('ui:error', { message: 'Test error' });
    });
  });

  describe('Performance Metrics', () => {
    test('should track performance metrics', () => {
      agentlet = new AgentletCore();
      const metrics = agentlet.getPerformanceMetrics();
      
      expect(metrics).toHaveProperty('core');
      expect(metrics.core).toHaveProperty('initTime');
    });
  });
}); 