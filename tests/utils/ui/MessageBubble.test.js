/**
 * Tests for MessageBubble class
 */

import MessageBubble from '../../../src/utils/ui/MessageBubble.js';

describe('MessageBubble', () => {
  let messageBubble;

  beforeEach(() => {
    // Ensure document.head exists for style injection
    if (!document.head) {
      document.head = document.createElement('head');
      document.documentElement.appendChild(document.head);
    }

    // Mock DOM methods to avoid JSDOM issues
    jest.spyOn(document.body, 'appendChild').mockImplementation((child) => {
      // Ensure child has necessary DOM methods
      if (child && typeof child === 'object') {
        child.dispatchEvent = jest.fn();
        child.querySelector = jest.fn(() => ({ innerHTML: '', textContent: '' }));
        child.remove = jest.fn();
        child.classList = { add: jest.fn(), remove: jest.fn(), contains: jest.fn() };
        child.addEventListener = jest.fn();
        child.removeEventListener = jest.fn();
      }
      return child;
    });

    // Mock createElement to return mock elements with necessary methods
    jest.spyOn(document, 'createElement').mockImplementation((tagName) => {
      return {
        tagName: tagName.toUpperCase(),
        id: '',
        style: { cssText: '' },
        innerHTML: '',
        textContent: '',
        dispatchEvent: jest.fn(),
        querySelector: jest.fn(() => ({ innerHTML: '', textContent: '' })),
        querySelectorAll: jest.fn(() => []),
        remove: jest.fn(),
        classList: { add: jest.fn(), remove: jest.fn(), contains: jest.fn() },
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        appendChild: jest.fn()
      };
    });

    // Mock timers
    global.setTimeout = jest.fn((fn, delay) => {
      if (typeof fn === 'function') fn();
      return 123;
    });
    global.clearTimeout = jest.fn();

    messageBubble = new MessageBubble();
  });

  afterEach(() => {
    // Clean up any created DOM elements
    if (messageBubble.container && messageBubble.container.parentNode) {
      messageBubble.container.parentNode.removeChild(messageBubble.container);
    }

    // Restore all mocks
    jest.restoreAllMocks();
  });

  describe('Constructor', () => {
    test('should initialize with default state', () => {
      expect(messageBubble.bubbles).toBeInstanceOf(Map);
      expect(messageBubble.bubbleCounter).toBe(0);
      expect(messageBubble.container).toBeNull();
      expect(messageBubble.initialized).toBe(false);
    });
  });

  describe('Show Message', () => {
    test('should show message with default options', () => {
      const id = messageBubble.show({ message: 'Test message', duration: 0 });

      expect(typeof id).toBe('string');
      expect(id).toMatch(/^bubble-\d+$/);
      expect(messageBubble.bubbles.has(id)).toBe(true);
      expect(messageBubble.initialized).toBe(true);
    });

    test('should show message with custom options', () => {
      const options = {
        message: 'Test message',
        type: 'error',
        duration: 0, // No auto-hide for testing
        position: 'top-left',
        closable: true,
        allowHtml: true
      };

      const id = messageBubble.show(options);

      expect(typeof id).toBe('string');
      expect(id).toMatch(/^bubble-\d+$/);
      expect(messageBubble.bubbles.has(id)).toBe(true);
    });

    test('should auto-hide message after duration', () => {
      messageBubble.show({ message: 'Test message', duration: 3000 });

      expect(setTimeout).toHaveBeenCalledWith(expect.any(Function), 3000);
    });
  });

  describe('Hide Message', () => {
    test('should hide existing message', () => {
      const id = messageBubble.show({ message: 'Test message' });

      messageBubble.hide(id);

      expect(messageBubble.bubbles.has(id)).toBe(false);
    });

    test('should handle hiding non-existent message', () => {
      expect(() => {
        messageBubble.hide(999);
      }).not.toThrow();
    });
  });

  describe('Hide All Messages', () => {
    test('should hide all active messages', () => {
      messageBubble.show({ message: 'Message 1' });
      messageBubble.show({ message: 'Message 2' });

      messageBubble.hideAll();

      expect(messageBubble.bubbles.size).toBe(0);
    });
  });

  describe('Convenience Methods', () => {
    test('should provide info method', () => {
      const showSpy = jest.spyOn(messageBubble, 'show');

      const id = messageBubble.info('Info message');

      expect(showSpy).toHaveBeenCalledWith({
        message: 'Info message',
        type: 'info'
      });
      expect(typeof id).toBe('string');
    });

    test('should provide success method', () => {
      const showSpy = jest.spyOn(messageBubble, 'show');

      const id = messageBubble.success('Success message');

      expect(showSpy).toHaveBeenCalledWith({
        message: 'Success message',
        type: 'success'
      });
      expect(typeof id).toBe('string');
    });

    test('should provide error method', () => {
      const showSpy = jest.spyOn(messageBubble, 'show');

      const id = messageBubble.error('Error message');

      expect(showSpy).toHaveBeenCalledWith({
        message: 'Error message',
        type: 'error'
      });
      expect(typeof id).toBe('string');
    });

    test('should provide warning method', () => {
      const showSpy = jest.spyOn(messageBubble, 'show');

      const id = messageBubble.warning('Warning message');

      expect(showSpy).toHaveBeenCalledWith({
        message: 'Warning message',
        type: 'warning'
      });
      expect(typeof id).toBe('string');
    });
  });

  describe('Container Updates', () => {
    test('should update container position', () => {
      messageBubble.show({ message: 'Test', duration: 0 }); // Initialize container, no auto-hide
      
      messageBubble.updateContainerPosition('bottom-left');

      expect(messageBubble.container.style).toBeDefined();
    });

    test('should get bubble count', () => {
      messageBubble.show({ message: 'Test 1', duration: 0 });
      messageBubble.show({ message: 'Test 2', duration: 0 });

      expect(messageBubble.getCount()).toBe(2);
    });

    test('should check if bubble exists', () => {
      const id = messageBubble.show({ message: 'Test', duration: 0 });

      expect(messageBubble.exists(id)).toBe(true);
      expect(messageBubble.exists(999)).toBe(false);
    });
  });

  describe('Message Updates', () => {
    test('should update existing bubble message', () => {
      const id = messageBubble.show({ message: 'Original message', duration: 0 });

      const result = messageBubble.updateMessage(id, 'Updated message');

      expect(result).toBe(true);
    });

    test('should handle updating non-existent bubble', () => {
      const result = messageBubble.updateMessage(999, 'New message');

      expect(result).toBe(false);
    });
  });
});