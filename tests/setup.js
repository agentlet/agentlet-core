/**
 * Jest test setup for Agentlet Core
 * Configures global mocks and test environment
 */

// Create functional storage mocks that actually store data
const createStorageMock = () => {
  const store = {};
  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => { store[key] = String(value); }),
    removeItem: jest.fn((key) => { delete store[key]; }),
    clear: jest.fn(() => { 
      Object.keys(store).forEach(key => delete store[key]); 
    }),
    key: jest.fn((index) => Object.keys(store)[index] || null),
    get length() { return Object.keys(store).length; }
  };
};

// Mock localStorage and sessionStorage
const localStorageMock = createStorageMock();
const sessionStorageMock = createStorageMock();

// Mock document.cookie
let cookieStore = {};
Object.defineProperty(document, 'cookie', {
  get: jest.fn(() => {
    return Object.entries(cookieStore)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
  }),
  set: jest.fn((cookie) => {
    const [pair] = cookie.split(';');
    const [key, value] = pair.split('=');
    cookieStore[key.trim()] = value ? value.trim() : '';
  })
});

// Mock window properties
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true
});

Object.defineProperty(window, 'sessionStorage', {
  value: sessionStorageMock,
  writable: true
});

// Store original console.error for fallback
const originalError = console.error;

// Mock console methods to reduce noise in tests
global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn((message, ...args) => {
    // Suppress JSDOM navigation warnings
    if (typeof message === 'string' && message.includes('Not implemented: navigation')) {
      return;
    }
    if (message && message.message && message.message.includes('Not implemented: navigation')) {
      return;
    }
    // Suppress expected test error messages
    if (typeof message === 'string') {
      if (message.includes('Failed to load environment variables from localStorage')) {
        return; // Expected EnvManager test error
      }
      if (message.includes('❌ Test error')) {
        return; // Expected showError test
      }
    }
    originalError(message, ...args);
  }),
  info: jest.fn(),
  debug: jest.fn()
};

// Additional JSDOM navigation error suppression
const originalVirtualConsoleError = console.error;
if (typeof process !== 'undefined' && process.stderr && process.stderr.write) {
  const originalStderrWrite = process.stderr.write;
  process.stderr.write = function(string, encoding, fd) {
    if (string && typeof string === 'string' && string.includes('Not implemented: navigation')) {
      return true; // Suppress the output
    }
    return originalStderrWrite.call(process.stderr, string, encoding, fd);
  };
}

// Mock document.head with proper appendChild
const mockHead = {
  appendChild: jest.fn((child) => {
    // Mock appendChild - just return the child for compatibility
    return child;
  }),
  removeChild: jest.fn((child) => {
    // Mock removeChild - just return the child
    return child;
  })
};

// Override document.head if it exists, or create it
if (typeof global.document.head !== 'undefined') {
  Object.defineProperty(global.document, 'head', {
    value: mockHead,
    writable: true,
    configurable: true
  });
} else {
  global.document.head = mockHead;
}

// Mock DOM methods
global.document.createElement = jest.fn(() => ({
  style: {},
  classList: {
    add: jest.fn(),
    remove: jest.fn(),
    contains: jest.fn()
  },
  appendChild: jest.fn((child) => {
    // Mock appendChild - just return the child for compatibility
    return child;
  }),
  removeChild: jest.fn((child) => {
    // Mock removeChild - just return the child
    return child;
  }),
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  setAttribute: jest.fn(),
  getAttribute: jest.fn(),
  innerHTML: '',
  textContent: ''
}));

// Mock window.confirm
window.confirm = jest.fn(() => true);

// Mock jQuery-like window.agentlet.$ for utility classes
global.window = global.window || {};
global.window.agentlet = global.window.agentlet || {};

const createMockElement = () => ({
  style: {},
  id: '',
  className: '',
  innerHTML: '',
  textContent: '',
  appendChild: jest.fn((child) => {
    // Mock appendChild - just return the child for compatibility
    return child;
  }),
  removeChild: jest.fn((child) => {
    // Mock removeChild - just return the child
    return child;
  }),
  remove: jest.fn(),
  parentNode: { removeChild: jest.fn() },
  addEventListener: jest.fn(),
  removeEventListener: jest.fn(),
  querySelector: jest.fn(() => ({ 
    innerHTML: '', 
    focus: jest.fn(),
    click: jest.fn(),
    disabled: false,
    value: '',
    tagName: 'INPUT'
  })),
  querySelectorAll: jest.fn(() => []),
  getBoundingClientRect: jest.fn(() => ({ width: 100, height: 100, top: 0, left: 0, right: 100, bottom: 100 })),
  matches: jest.fn(() => true),
  closest: jest.fn(() => null),
  focus: jest.fn(),
  click: jest.fn(),
  disabled: false,
  nodeType: 1, // Element node
  dispatchEvent: jest.fn()
});

const mockJQuery = jest.fn((selector) => {
  const mockEl = createMockElement();
  
  if (typeof selector === 'string') {
    if (selector === '<div>' || selector === '<button>' || selector === '<span>' || selector === '<style>') {
      return [mockEl];
    }
    if (selector === 'body' || selector === 'document.body') {
      return { 
        append: jest.fn(),
        appendChild: jest.fn()
      };
    }
    if (selector === 'document.head') {
      return { 
        append: jest.fn(),
        appendChild: jest.fn()
      };
    }
    
    // Return jQuery-like object with chaining methods and array access
    const jQueryObj = {
      0: mockEl,
      length: 1,
      hide: jest.fn().mockReturnThis(),
      show: jest.fn().mockReturnThis(),
      css: jest.fn().mockReturnThis(),
      addClass: jest.fn().mockReturnThis(),
      removeClass: jest.fn().mockReturnThis(),
      html: jest.fn().mockReturnThis(),
      text: jest.fn().mockReturnThis(),
      fadeIn: jest.fn().mockReturnThis(),
      fadeOut: jest.fn().mockReturnThis(),
      remove: jest.fn().mockReturnThis(),
      append: jest.fn((...elements) => {
        // Mock jQuery append - just return this for chaining
        return jQueryObj;
      }).mockReturnThis(),
      each: jest.fn((callback) => {
        callback(0, mockEl);
        return jQueryObj;
      })
    };
    
    // For ID selectors like '#agentlet-toggle', return object with element access
    if (selector.startsWith('#')) {
      jQueryObj.length = 1;
      jQueryObj[0] = mockEl;
    }
    
    return jQueryObj;
  }
  
  // Handle document.body and document.head
  if (selector === document.body) {
    return { 
      append: jest.fn(),
      appendChild: jest.fn()
    };
  }
  
  if (selector === document.head) {
    return { 
      append: jest.fn(),
      appendChild: jest.fn()
    };
  }
  
  // Handle any element passed directly (like container elements)
  if (selector && typeof selector === 'object' && selector.nodeType) {
    return { 
      append: jest.fn(),
      appendChild: jest.fn()
    };
  }
  
  return [mockEl];
});

// Set up initial jQuery mock - this gets overridden when AgentletCore initializes
global.window.agentlet.$ = mockJQuery;
global.window.agentlet.jQuery = mockJQuery;

// Mock window.jQuery to prevent fallback jQuery from being used
global.window.jQuery = mockJQuery;
global.window.jQuery.fn = { jquery: '3.7.1' }; // Mock version check

// Ensure the mock persists even when window.agentlet is reassigned
Object.defineProperty(global.window, 'agentlet', {
  set: function(value) {
    this._agentlet = value;
    // Restore jQuery mocks when agentlet is reassigned
    if (value && typeof value === 'object') {
      value.$ = mockJQuery;
      value.jQuery = mockJQuery;
    }
  },
  get: function() {
    return this._agentlet || { $: mockJQuery, jQuery: mockJQuery };
  },
  configurable: true
});

// Mock CustomEvent for bubble events
global.CustomEvent = jest.fn((type, options) => ({
  type,
  detail: options?.detail
}));

// Reset mocks before each test
beforeEach(() => {
  jest.clearAllMocks();

  // Fresh localStorage mock for each test
  const freshLocalStorageMock = createStorageMock();
  Object.defineProperty(window, 'localStorage', {
    value: freshLocalStorageMock,
    writable: true
  });

  // Fresh sessionStorage mock for each test
  const freshSessionStorageMock = createStorageMock();
  Object.defineProperty(window, 'sessionStorage', {
    value: freshSessionStorageMock,
    writable: true
  });
  
  cookieStore = {};
});

// Global test utilities
global.testUtils = {
  createMockModule: (config = {}) => ({
    name: 'test-module',
    version: '1.0.0',
    patterns: ['test.com'],
    capabilities: [],
    permissions: [],
    dependencies: [],
    settings: {},
    ...config
  }),
  
  createMockElement: (tagName = 'div', attributes = {}) => {
    const element = document.createElement(tagName);
    Object.entries(attributes).forEach(([key, value]) => {
      element.setAttribute(key, value);
    });
    return element;
  },
  
  mockLocalStorage: (data = {}) => {
    Object.entries(data).forEach(([key, value]) => {
      localStorageMock.getItem.mockImplementation((k) => k === key ? JSON.stringify(value) : null);
    });
  },
  
  mockCookies: (cookies = {}) => {
    cookieStore = { ...cookies };
  }
};