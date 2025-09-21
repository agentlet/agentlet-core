/**
 * Test suite for simplified Module class
 */

import Module from '../../src/core/Module.js';

describe('Module', () => {
    let module;
    let mockEventBus;

    beforeEach(() => {
        // Create mock event bus
        mockEventBus = {
            emit: jest.fn(),
            on: jest.fn(),
            off: jest.fn()
        };

        // Create test module
        module = new Module({
            name: 'test-module',
            patterns: ['test.com'],
            eventBus: mockEventBus
        });
    });

    describe('Constructor', () => {
        test('should create module with required properties', () => {
            expect(module.name).toBe('test-module');
            expect(module.patterns).toEqual(['test.com']);
            expect(module.isActive).toBe(false);
            expect(module.eventBus).toBe(mockEventBus);
        });

        test('should throw error if name is missing', () => {
            expect(() => {
                new Module({ patterns: ['test.com'] });
            }).toThrow('Module name is required');
        });

        test('should throw error if patterns are missing', () => {
            expect(() => {
                new Module({ name: 'test' });
            }).toThrow('Module patterns are required');
        });

        test('should handle string pattern', () => {
            const mod = new Module({
                name: 'test',
                patterns: 'test.com'
            });
            expect(mod.patterns).toEqual(['test.com']);
        });
    });

    describe('Pattern Matching', () => {
        test('should match URL with includes pattern', () => {
            expect(module.checkPattern('https://test.com/page')).toBe(true);
            expect(module.checkPattern('https://other.com/page')).toBe(false);
        });

        test('should handle regex patterns', () => {
            const regexModule = new Module({
                name: 'regex-test',
                patterns: [{ type: 'regex', value: 'https://.*\\.test\\.com' }]
            });
            
            expect(regexModule.checkPattern('https://sub.test.com')).toBe(true);
            expect(regexModule.checkPattern('https://other.com')).toBe(false);
        });

        test('should handle exact patterns', () => {
            const exactModule = new Module({
                name: 'exact-test',
                patterns: [{ type: 'exact', value: 'https://test.com' }]
            });
            
            expect(exactModule.checkPattern('https://test.com')).toBe(true);
            expect(exactModule.checkPattern('https://test.com/page')).toBe(false);
        });
    });

    describe('Lifecycle Methods', () => {
        test('should initialize module', async () => {
            module.initModule = jest.fn();
            
            await module.init();
            
            expect(module.initModule).toHaveBeenCalled();
            expect(mockEventBus.emit).toHaveBeenCalledWith('module:initialized', { module: 'test-module' });
            expect(module.performanceMetrics.initTime).toBeGreaterThan(0);
        });

        test('should activate module', async () => {
            module.activateModule = jest.fn();
            
            await module.activate({ trigger: 'urlChange' });
            
            expect(module.isActive).toBe(true);
            expect(module.activateModule).toHaveBeenCalledWith({ trigger: 'urlChange' });
            expect(mockEventBus.emit).toHaveBeenCalledWith('module:activated', { 
                module: 'test-module', 
                context: { trigger: 'urlChange' } 
            });
        });

        test('should cleanup module', async () => {
            module.cleanupModule = jest.fn();
            module.injectStyles('body { color: red; }');
            module.on('test', () => {});
            
            await module.cleanup();
            
            expect(module.isActive).toBe(false);
            expect(module.cleanupModule).toHaveBeenCalled();
            expect(module.styleElement).toBe(null);
            expect(module.eventListeners.size).toBe(0);
        });
    });

    describe('Event System', () => {
        test('should register and emit local events', () => {
            const callback = jest.fn();
            
            module.on('test-event', callback);
            module.emit('test-event', { data: 'test' });
            
            expect(callback).toHaveBeenCalledWith({ data: 'test' });
        });

        test('should emit to global event bus', () => {
            module.emit('test-event', { data: 'test' });
            
            expect(mockEventBus.emit).toHaveBeenCalledWith('test-event', { data: 'test' });
        });

        test('should remove event listeners', () => {
            const callback = jest.fn();
            
            module.on('test-event', callback);
            module.off('test-event', callback);
            module.emit('test-event', { data: 'test' });
            
            expect(callback).not.toHaveBeenCalled();
        });
    });

    describe('CSS Management', () => {
        test('should inject styles', () => {
            const css = 'body { color: red; }';
            
            module.injectStyles(css);
            
            expect(module.styleElement).not.toBe(null);
            expect(module.styleElement.textContent).toContain(css);
            expect(module.injectedStyles.has(css)).toBe(true);
        });

        test('should remove all styles on cleanup', async () => {
            module.injectStyles('body { color: red; }');
            
            await module.cleanup();
            
            expect(module.styleElement).toBe(null);
            expect(module.injectedStyles.size).toBe(0);
        });
    });

    describe('Utility Methods', () => {
        test('should provide logging methods', () => {
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            module.log('test message');
            
            expect(consoleSpy).toHaveBeenCalledWith('[test-module]', 'test message');
            
            consoleSpy.mockRestore();
        });

        test('should return module metadata', () => {
            const metadata = module.getMetadata();
            
            expect(metadata).toEqual({
                name: 'test-module',
                version: '1.0.0',
                description: '',
                patterns: ['test.com'],
                isActive: false,
                performanceMetrics: module.performanceMetrics
            });
        });

        test('should return default content', () => {
            const content = module.getContent();
            
            expect(content).toContain('test-module');
            expect(content).toContain('agentlet-module-content');
        });
    });
});