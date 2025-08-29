/**
 * Tests for ElementSelector class
 */

import ElementSelector from '../../src/utils/ElementSelector.js';

describe('ElementSelector', () => {
  let elementSelector;

  beforeEach(() => {

    // Mock document methods
    global.document = {
      body: {
        style: {},
        appendChild: jest.fn(),
        removeChild: jest.fn()
      },
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      elementFromPoint: jest.fn(() => ({ id: 'test-element', matches: jest.fn(() => true) })),
      getElementById: jest.fn(() => null)
    };

    // Mock console methods
    global.console = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    elementSelector = new ElementSelector();
  });

  afterEach(() => {
    // Clean up any active selector
    if (elementSelector.isActive) {
      elementSelector.stop();
    }
  });

  describe('Constructor', () => {
    test('should initialize with default state', () => {
      expect(elementSelector.isActive).toBe(false);
      expect(elementSelector.callback).toBeNull();
      expect(elementSelector.overlay).toBeNull();
      expect(elementSelector.highlightBox).toBeNull();
      expect(elementSelector.currentElement).toBeNull();
      expect(elementSelector.originalCursor).toBeNull();
      expect(elementSelector.allowedSelector).toBeNull();
    });

    test('should bind event handler methods', () => {
      expect(typeof elementSelector.handleMouseMove).toBe('function');
      expect(typeof elementSelector.handleClick).toBe('function');
      expect(typeof elementSelector.handleKeydown).toBe('function');
    });
  });

  describe('Start Selection', () => {
    test('should start element selection', () => {
      const callback = jest.fn();

      elementSelector.start(callback);

      expect(elementSelector.isActive).toBe(true);
      expect(elementSelector.callback).toBe(callback);
      expect(document.body.style.cursor).toBe('crosshair');
      expect(document.body.style.userSelect).toBe('none');
      expect(console.log).toHaveBeenCalledWith('🎯 Element selector activated. Click an element to select it, ESC to cancel.');
    });

    test('should warn if already active', () => {
      elementSelector.isActive = true;

      elementSelector.start(jest.fn());

      expect(console.warn).toHaveBeenCalledWith('Element selector is already active');
    });
  });

  describe('Stop Selection', () => {
    beforeEach(() => {
      elementSelector.start(jest.fn());
    });

    test('should stop element selection', () => {
      elementSelector.stop();

      expect(elementSelector.isActive).toBe(false);
      expect(elementSelector.callback).toBeNull();
      expect(elementSelector.currentElement).toBeNull();
      expect(elementSelector.allowedSelector).toBeNull();
      expect(document.body.style.userSelect).toBe('');
      expect(console.log).toHaveBeenCalledWith('🎯 Element selector deactivated');
    });
  });

  describe('Element Selection Logic', () => {
    test('should check if element is selectable without restrictions', () => {
      const element = { matches: jest.fn(() => true), id: 'test' };
      elementSelector.allowedSelector = null;

      const result = elementSelector.isElementSelectable(element);

      expect(result).toBe(true);
    });

    test('should check selector restrictions', () => {
      const element = { matches: jest.fn(() => true), id: 'test' };
      elementSelector.allowedSelector = 'button';

      const result = elementSelector.isElementSelectable(element);

      expect(result).toBe(true);
      expect(element.matches).toHaveBeenCalledWith('button');
    });

    test('should exclude overlay elements', () => {
      const element = { 
        id: 'agentlet-element-selector-overlay', 
        closest: jest.fn(() => null),
        matches: jest.fn(() => true)
      };

      const result = elementSelector.isInternalElement(element);

      expect(result).toBe(true);
    });
  });

  describe('Event Handlers', () => {
    beforeEach(() => {
      elementSelector.start(jest.fn());
    });

    test('should handle escape key to stop selection', () => {
      const event = {
        key: 'Escape',
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };
      const stopSpy = jest.spyOn(elementSelector, 'stop');

      elementSelector.handleKeydown(event);

      expect(event.preventDefault).toHaveBeenCalled();
      expect(stopSpy).toHaveBeenCalled();
    });

    test('should ignore other keys', () => {
      const event = {
        key: 'Enter',
        preventDefault: jest.fn(),
        stopPropagation: jest.fn()
      };
      const stopSpy = jest.spyOn(elementSelector, 'stop');

      elementSelector.handleKeydown(event);

      expect(stopSpy).not.toHaveBeenCalled();
    });
  });
});