/**
 * Tests for ScreenCapture class
 */

import ScreenCapture from '../../../src/utils/ui/ScreenCapture.js';

describe('ScreenCapture', () => {
  let screenCapture;
  let mockCanvas;
  let mockContext;

  beforeEach(() => {
    // Mock canvas context
    mockContext = {
      drawImage: jest.fn(),
      getImageData: jest.fn(() => ({ data: new Uint8Array(4) })),
      fillRect: jest.fn(),
      clearRect: jest.fn(),
      canvas: { width: 100, height: 100 }
    };

    // Mock canvas element
    mockCanvas = {
      width: 0,
      height: 0,
      getContext: jest.fn(() => mockContext),
      toDataURL: jest.fn(() => 'data:image/png;base64,mockdata'),
      toBlob: jest.fn((callback) => {
        callback(new Blob(['mock'], { type: 'image/png' }));
      })
    };

    // Mock document.createElement
    global.document = {
      createElement: jest.fn((tag) => {
        if (tag === 'canvas') return mockCanvas;
        return { style: {}, appendChild: jest.fn(), removeChild: jest.fn() };
      }),
      body: { appendChild: jest.fn(), removeChild: jest.fn() }
    };

    // Mock basic browser APIs
    global.navigator = {
      mediaDevices: {
        getDisplayMedia: jest.fn(() => Promise.resolve({
          getVideoTracks: jest.fn(() => [{ stop: jest.fn() }]),
          getTracks: jest.fn(() => [{ stop: jest.fn() }])
        })),
        getUserMedia: jest.fn(() => Promise.resolve({}))
      }
    };

    global.HTMLVideoElement = jest.fn(() => ({
      srcObject: null,
      videoWidth: 1920,
      videoHeight: 1080,
      play: jest.fn(() => Promise.resolve()),
      pause: jest.fn(),
      addEventListener: jest.fn(),
      removeEventListener: jest.fn()
    }));

    global.URL = {
      createObjectURL: jest.fn(() => 'blob:mock-url'),
      revokeObjectURL: jest.fn()
    };

    global.window = { innerWidth: 1920, innerHeight: 1080, devicePixelRatio: 1 };
    global.console = { log: jest.fn(), warn: jest.fn(), error: jest.fn() };

    screenCapture = new ScreenCapture();
  });

  describe('Constructor', () => {
    test('should initialize with default state', () => {
      expect(screenCapture.isCapturing).toBe(false);
      expect(screenCapture.defaultOptions).toBeDefined();
      expect(screenCapture.defaultOptions.allowTaint).toBe(false);
      expect(screenCapture.defaultOptions.useCORS).toBe(true);
    });
  });

  describe('Canvas Operations', () => {
    test('should convert canvas to data URL', () => {
      const result = screenCapture.canvasToDataURL(mockCanvas);

      expect(result).toBe('data:image/png;base64,mockdata');
    });

    test('should handle invalid canvas for data URL', () => {
      expect(() => {
        screenCapture.canvasToDataURL(null);
      }).toThrow('Invalid canvas provided');
    });

    test('should convert canvas to blob', async () => {
      const result = await screenCapture.canvasToBlob(mockCanvas);

      expect(result).toBeInstanceOf(Blob);
      expect(mockCanvas.toBlob).toHaveBeenCalled();
    });
  });

  describe('Utility Methods', () => {
    test('should check if capturing is in progress', () => {
      expect(screenCapture.isCapturingInProgress()).toBe(false);
      
      screenCapture.isCapturing = true;
      expect(screenCapture.isCapturingInProgress()).toBe(true);
    });

    test('should have getImageDimensions method', () => {
      expect(typeof screenCapture.getImageDimensions).toBe('function');
    });

    test('should have createPreview method', () => {
      expect(typeof screenCapture.createPreview).toBe('function');
    });
  });

  describe('Capture Methods', () => {
    test('should have capturePage method', () => {
      expect(typeof screenCapture.capturePage).toBe('function');
    });

    test('should have captureAsDataURL method', () => {
      expect(typeof screenCapture.captureAsDataURL).toBe('function');
    });

    test('should have captureAsBlob method', () => {
      expect(typeof screenCapture.captureAsBlob).toBe('function');
    });
  });

  describe('Element Capture', () => {
    test('should handle invalid element', async () => {
      await expect(screenCapture.captureElement(null))
        .rejects.toThrow('Invalid element provided for capture');
    });

    test('should handle missing element', async () => {
      await expect(screenCapture.captureElement(undefined))
        .rejects.toThrow('Invalid element provided for capture');
    });
  });

  describe('Selector Capture', () => {
    test('should handle element not found', async () => {
      global.document = {
        ...global.document,
        querySelector: jest.fn(() => null)
      };

      await expect(screenCapture.captureBySelector('.non-existent'))
        .rejects.toThrow('Element not found with selector: .non-existent');
    });

    test('should have captureBySelector method', () => {
      expect(typeof screenCapture.captureBySelector).toBe('function');
    });
  });

  describe('Download and Clipboard', () => {
    test('should have downloadCapture method', () => {
      expect(typeof screenCapture.downloadCapture).toBe('function');
    });

    test('should handle clipboard not supported', async () => {
      global.navigator = {
        ...global.navigator,
        clipboard: undefined
      };

      await expect(screenCapture.copyToClipboard('page'))
        .rejects.toThrow('Clipboard API not supported in this browser');
    });
  });

  describe('Viewport and Region Capture', () => {
    test('should have captureViewport method', () => {
      expect(typeof screenCapture.captureViewport).toBe('function');
    });

    test('should have captureRegion method', () => {
      expect(typeof screenCapture.captureRegion).toBe('function');
    });

    test('should handle invalid region', async () => {
      await expect(screenCapture.captureRegion({}))
        .rejects.toThrow('Width and height must be specified for region capture');
    });
  });
});