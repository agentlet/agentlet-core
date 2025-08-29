/**
 * Tests for PageHighlighter utility
 * @jest-environment jsdom
 */

import PageHighlighter from '../../src/utils/PageHighlighter.js';

describe('PageHighlighter', () => {
    let pageHighlighter;

    beforeEach(() => {
        // Mock DOM methods for basic functionality
        global.document = {
            ...global.document,
            head: { 
                appendChild: jest.fn() 
            },
            body: {
                appendChild: jest.fn(),
                removeChild: jest.fn()
            },
            createElement: jest.fn().mockReturnValue({
                className: '',
                style: {},
                textContent: '',
                appendChild: jest.fn(),
                classList: {
                    add: jest.fn(),
                    remove: jest.fn(),
                    contains: jest.fn().mockReturnValue(false)
                },
                addEventListener: jest.fn(),
                parentNode: null
            }),
            querySelector: jest.fn().mockReturnValue(null),
            querySelectorAll: jest.fn().mockReturnValue([])
        };

        // Mock window methods
        global.window = {
            ...global.window,
            pageYOffset: 0,
            pageXOffset: 0
        };

        // Mock setTimeout/clearTimeout
        global.setTimeout = jest.fn((fn, delay) => {
            if (typeof fn === 'function') fn();
            return 123;
        });
        global.clearTimeout = jest.fn();

        pageHighlighter = new PageHighlighter();
    });

    afterEach(() => {
        if (pageHighlighter) {
            pageHighlighter.clearAll();
        }
        jest.clearAllMocks();
    });

    describe('Initialization', () => {
        test('should initialize with default values', () => {
            expect(pageHighlighter.overlays.size).toBe(0);
            expect(pageHighlighter.highlights.size).toBe(0);
            expect(pageHighlighter.nextId).toBe(1);
            expect(pageHighlighter.styleInjected).toBe(true);
        });

        test('should inject CSS styles on initialization', () => {
            // Verify head.appendChild was called (for styles)
            expect(document.head.appendChild).toHaveBeenCalled();
        });
    });

    describe('Basic API', () => {
        test('should have required methods', () => {
            expect(typeof pageHighlighter.showOverlay).toBe('function');
            expect(typeof pageHighlighter.highlight).toBe('function');
            expect(typeof pageHighlighter.createTour).toBe('function');
            expect(typeof pageHighlighter.clearAll).toBe('function');
            expect(typeof pageHighlighter.getStats).toBe('function');
        });

        test('should return stats object', () => {
            const stats = pageHighlighter.getStats();
            expect(stats).toHaveProperty('overlays');
            expect(stats).toHaveProperty('highlights');
            expect(stats).toHaveProperty('total');
            expect(stats.overlays).toBe(0);
            expect(stats.highlights).toBe(0);
            expect(stats.total).toBe(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle invalid element selector gracefully', () => {
            const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
            
            const highlight = pageHighlighter.highlight('.invalid-selector');
            
            expect(highlight).toBeNull();
            expect(consoleSpy).toHaveBeenCalledWith('PageHighlighter: Element not found', '.invalid-selector');
            
            consoleSpy.mockRestore();
        });

        test('should handle destroying non-existent overlay', () => {
            expect(() => {
                pageHighlighter.destroyOverlay('non-existent-id');
            }).not.toThrow();
        });

        test('should handle destroying non-existent highlight', () => {
            expect(() => {
                pageHighlighter.destroyHighlight('non-existent-id');
            }).not.toThrow();
        });
    });

    describe('Tour Creation', () => {
        test('should create tour with multiple steps', () => {
            const steps = [
                { element: '#step1', message: 'Step 1' },
                { element: '#step2', message: 'Step 2' }
            ];
            
            const tour = pageHighlighter.createTour(steps);
            
            expect(tour.steps).toBe(steps);
            expect(tour.currentStep).toBe(0);
            expect(typeof tour.start).toBe('function');
            expect(typeof tour.next).toBe('function');
            expect(typeof tour.previous).toBe('function');
            expect(typeof tour.end).toBe('function');
        });

        test('should handle empty tour', () => {
            const tour = pageHighlighter.createTour([]);
            expect(tour.steps).toEqual([]);
            expect(tour.currentStep).toBe(0);
        });
    });

    describe('Clear All Functionality', () => {
        test('should clear all overlays and highlights without errors', () => {
            expect(() => {
                pageHighlighter.clearAll();
            }).not.toThrow();
        });
    });

    describe('Configuration Options', () => {
        test('should accept highlight configuration options', () => {
            // Test that the method handles null elements gracefully
            const result = pageHighlighter.highlight(null, {
                type: 'border',
                style: 'primary',
                message: 'Test highlight'
            });

            // Should return null for invalid element
            expect(result).toBeNull();
        });
    });

    describe('Utility Methods', () => {
        test('should provide positioning methods', () => {
            const mockRect = { left: 100, top: 100, width: 50, height: 50 };
            const mockElement = document.createElement('div');
            
            expect(() => {
                pageHighlighter.positionArrow(mockElement, mockRect, 0, 0, 'top');
            }).not.toThrow();
            
            expect(() => {
                pageHighlighter.positionSticker(mockElement, mockRect, 0, 0, 'top-right');
            }).not.toThrow();
        });

        test('should handle overlay lifecycle methods', () => {
            // Test that methods exist and don't throw with invalid IDs
            expect(() => {
                pageHighlighter.hideOverlay('invalid-id');
            }).not.toThrow();
            
            expect(() => {
                pageHighlighter.destroyOverlay('invalid-id');
            }).not.toThrow();
        });

        test('should handle highlight lifecycle methods', () => {
            // Test that methods exist and don't throw with invalid IDs
            expect(() => {
                pageHighlighter.destroyHighlight('invalid-id');
            }).not.toThrow();
        });
    });
});