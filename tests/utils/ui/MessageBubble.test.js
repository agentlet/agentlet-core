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

    // getRoot() falls back to window.agentlet.ui.root before document.body;
    // this suite exercises the document.body fallback, so make sure no
    // stray window.agentlet from another suite/order is left over.
    delete window.agentlet;

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

/**
 * setRoot()/shadow root mounting, exercised against a real jsdom DOM (not the
 * plain-object mocks used above), the same way tests/ui/UIManager.test.js and
 * tests/ui/StyleInjector.test.js restore jsdom's native implementations.
 */
describe('MessageBubble - shadow DOM mounting', () => {
  beforeEach(() => {
    delete document.createElement;
    delete document.head;

    document.body.innerHTML = '';
    delete window.agentlet;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    document.getElementById('agentlet-bubble-styles')?.remove();
    delete window.agentlet;
  });

  function createShadowRoot() {
    const host = document.createElement('div');
    document.body.appendChild(host);
    return host.attachShadow({ mode: 'open' });
  }

  test('setRoot(shadowRoot) mounts the container inside the shadow root, not document.body', () => {
    const shadowRoot = createShadowRoot();
    const messageBubble = new MessageBubble();
    messageBubble.setRoot(shadowRoot);

    messageBubble.show({ message: 'Hello', duration: 0 });

    expect(messageBubble.container).not.toBeNull();
    expect(messageBubble.container.getRootNode()).toBe(shadowRoot);
    expect(shadowRoot.querySelector('#agentlet-message-bubbles')).toBe(messageBubble.container);
    expect(document.body.contains(messageBubble.container)).toBe(false);
  });

  test('falls back to window.agentlet.ui.root when setRoot() was never called', () => {
    const shadowRoot = createShadowRoot();
    window.agentlet = { ui: { root: shadowRoot } };

    const messageBubble = new MessageBubble();
    messageBubble.show({ message: 'Hello', duration: 0 });

    expect(messageBubble.container.getRootNode()).toBe(shadowRoot);
  });

  test('without setRoot and without window.agentlet, mounts on document.body', () => {
    const messageBubble = new MessageBubble();
    messageBubble.show({ message: 'Hello', duration: 0 });

    expect(messageBubble.container.parentNode).toBe(document.body);
  });

  test('no fallback #agentlet-bubble-styles is injected when a core stylesheet is already present', () => {
    const shadowRoot = createShadowRoot();
    const coreStyle = document.createElement('style');
    coreStyle.id = 'agentlet-core-styles';
    shadowRoot.appendChild(coreStyle);

    const messageBubble = new MessageBubble();
    messageBubble.setRoot(shadowRoot);
    messageBubble.show({ message: 'Hello', duration: 0 });

    expect(shadowRoot.querySelector('#agentlet-bubble-styles')).toBeNull();
  });
});