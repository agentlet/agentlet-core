/**
 * Tests for AIProvider utility
 */

import { BaseAIProvider, OpenAIProvider, AIManager } from '../../src/utils/AIProvider.js';
import { LocalStorageEnvironmentVariablesManager } from '../../src/utils/EnvManager.js';
import PDFProcessor from '../../src/utils/PDFProcessor.js';

// Mock PDFProcessor
jest.mock('../../src/utils/PDFProcessor.js');

describe('AIProvider', () => {
    let mockEnvManager;

    beforeEach(() => {
        mockEnvManager = new LocalStorageEnvironmentVariablesManager('test-ai');
        mockEnvManager.clear();
    });

    afterEach(() => {
        mockEnvManager.clear();
    });

    describe('BaseAIProvider', () => {
        test('should require API key', () => {
            expect(() => new BaseAIProvider()).toThrow('API key is required');
            expect(() => new BaseAIProvider('')).toThrow('API key is required');
        });

        test('should initialize with API key and options', () => {
            const provider = new BaseAIProvider('test-key', { timeout: 60000 });
            expect(provider.apiKey).toBe('test-key');
            expect(provider.options.timeout).toBe(60000);
            expect(provider.options.maxRetries).toBe(3); // default
        });

        test('should check if ready', () => {
            const provider = new BaseAIProvider('test-key');
            expect(provider.isReady()).toBe(true);
        });

        test('should get provider name', () => {
            const provider = new BaseAIProvider('test-key');
            expect(provider.getProviderName()).toBe('base');
        });

        test('should throw error for unimplemented sendPrompt', async () => {
            const provider = new BaseAIProvider('test-key');
            await expect(provider.sendPrompt('test')).rejects.toThrow('sendPrompt must be implemented by subclass');
        });
    });

    describe('OpenAIProvider', () => {
        test('should initialize with default options', () => {
            const provider = new OpenAIProvider('test-key');
            expect(provider.apiKey).toBe('test-key');
            expect(provider.model).toBe('gpt-4o-mini');
            expect(provider.baseUrl).toBe('https://api.openai.com/v1');
            expect(provider.maxTokens).toBe(4000);
            expect(provider.temperature).toBe(0.7);
        });

        test('should initialize with custom options', () => {
            const provider = new OpenAIProvider('test-key', {
                model: 'gpt-4',
                baseUrl: 'https://custom.api.com/v1',
                maxTokens: 2000,
                temperature: 0.5
            });
            expect(provider.model).toBe('gpt-4');
            expect(provider.baseUrl).toBe('https://custom.api.com/v1');
            expect(provider.maxTokens).toBe(2000);
            expect(provider.temperature).toBe(0.5);
        });

        test('should get provider name', () => {
            const provider = new OpenAIProvider('test-key');
            expect(provider.getProviderName()).toBe('openai');
        });

        test('should validate prompt input', async () => {
            const provider = new OpenAIProvider('test-key');
            
            await expect(provider.sendPrompt()).rejects.toThrow('Prompt must be a non-empty string');
            await expect(provider.sendPrompt('')).rejects.toThrow('Prompt must be a non-empty string');
            await expect(provider.sendPrompt(123)).rejects.toThrow('Prompt must be a non-empty string');
        });

        // Note: We don't test actual API calls here as they require real API keys and network access
        // Integration tests would be needed for that
    });

    describe('AIManager', () => {
        test('should initialize with no providers when no API keys', () => {
            const manager = new AIManager(mockEnvManager);
            expect(manager.getAvailableProviders()).toEqual([]);
            expect(manager.isAvailable()).toBe(false);
            expect(manager.getCurrentProvider()).toBeNull();
            expect(manager.pdfProcessor).toBeInstanceOf(PDFProcessor);
        });

        test('should initialize OpenAI provider when API key is set', () => {
            mockEnvManager.set('OPENAI_API_KEY', 'test-key');
            const manager = new AIManager(mockEnvManager);
            
            expect(manager.getAvailableProviders()).toEqual(['openai']);
            expect(manager.isAvailable()).toBe(true);
            expect(manager.getCurrentProvider()).toBeTruthy();
            expect(manager.getCurrentProvider().getProviderName()).toBe('openai');
        });

        test('should use custom OpenAI options from environment', () => {
            mockEnvManager.set('OPENAI_API_KEY', 'test-key');
            mockEnvManager.set('OPENAI_MODEL', 'gpt-4');
            mockEnvManager.set('OPENAI_MAX_TOKENS', '2000');
            mockEnvManager.set('OPENAI_TEMPERATURE', '0.5');
            
            const manager = new AIManager(mockEnvManager);
            const provider = manager.getCurrentProvider();
            
            expect(provider.model).toBe('gpt-4');
            expect(provider.maxTokens).toBe(2000);
            expect(provider.temperature).toBe(0.5);
        });

        test('should get status information', () => {
            // Mock PDFProcessor first
            PDFProcessor.mockImplementation(() => ({
                isPDFJSAvailable: jest.fn().mockReturnValue(true),
                getCapabilities: jest.fn().mockReturnValue({
                    maxRecommendedPages: 10,
                    maxRecommendedFileSize: '50MB',
                    features: ['PDF to image conversion']
                })
            }));
            
            mockEnvManager.set('OPENAI_API_KEY', 'test-key');
            const manager = new AIManager(mockEnvManager);
            
            const status = manager.getStatus();
            expect(status.available).toBe(true);
            expect(status.currentProvider).toBe('openai');
            expect(status.availableProviders).toEqual(['openai']);
            expect(status.providerStatus.openai.ready).toBe(true);
            expect(status.providerStatus.openai.name).toBe('openai');
            expect(status.pdfSupport).toBeDefined();
            expect(status.pdfSupport.available).toBeDefined();
            expect(status.pdfSupport.capabilities).toBeDefined();
        });

        test('should set current provider', () => {
            mockEnvManager.set('OPENAI_API_KEY', 'test-key');
            const manager = new AIManager(mockEnvManager);
            
            manager.setCurrentProvider('openai');
            expect(manager.getStatus().currentProvider).toBe('openai');
        });

        test('should throw error when setting invalid provider', () => {
            const manager = new AIManager(mockEnvManager);
            expect(() => manager.setCurrentProvider('invalid')).toThrow("Provider 'invalid' is not available");
        });

        test('should refresh providers after environment changes', () => {
            const manager = new AIManager(mockEnvManager);
            expect(manager.isAvailable()).toBe(false);
            
            // Add API key and refresh
            mockEnvManager.set('OPENAI_API_KEY', 'test-key');
            manager.refresh();
            
            expect(manager.isAvailable()).toBe(true);
            expect(manager.getAvailableProviders()).toEqual(['openai']);
        });

        test('should throw error when no provider available for sendPrompt', async () => {
            const manager = new AIManager(mockEnvManager);
            await expect(manager.sendPrompt('test')).rejects.toThrow('No AI provider is available. Please configure an API key.');
        });

        test('should send prompt with PDF when provider is available', async () => {
            mockEnvManager.set('OPENAI_API_KEY', 'test-key');
            const manager = new AIManager(mockEnvManager);
            
            // Mock the provider's sendPromptWithPDF method
            const mockProvider = manager.getCurrentProvider();
            mockProvider.sendPromptWithPDF = jest.fn().mockResolvedValue('PDF analysis response');
            
            const mockPDFData = new ArrayBuffer(8);
            const result = await manager.sendPromptWithPDF('Analyze PDF', mockPDFData, {});
            
            expect(result).toBe('PDF analysis response');
            expect(mockProvider.sendPromptWithPDF).toHaveBeenCalledWith('Analyze PDF', mockPDFData, {});
        });

        test('should throw error when no provider available for sendPromptWithPDF', async () => {
            const manager = new AIManager(mockEnvManager);
            const mockPDFData = new ArrayBuffer(8);
            await expect(manager.sendPromptWithPDF('Test', mockPDFData, {}))
                .rejects.toThrow('No AI provider is available. Please configure an API key.');
        });

        test('should convert PDF to images', async () => {
            const mockImages = ['image1', 'image2'];
            PDFProcessor.mockImplementation(() => ({
                convertPDFToImages: jest.fn().mockResolvedValue(mockImages),
                isPDFJSAvailable: jest.fn().mockReturnValue(true),
                getCapabilities: jest.fn().mockReturnValue({
                    maxRecommendedPages: 10,
                    maxRecommendedFileSize: '50MB'
                })
            }));
            
            const manager = new AIManager(mockEnvManager);
            const mockPDFData = new ArrayBuffer(8);
            const result = await manager.convertPDFToImages(mockPDFData, {});
            
            expect(result).toEqual(mockImages);
        });

        test('should handle PDF URL conversion', async () => {
            const mockImages = ['image1', 'image2'];
            const mockPDFProcessor = {
                convertPDFFromURL: jest.fn().mockResolvedValue(mockImages),
                convertPDFToImages: jest.fn(),
                isPDFJSAvailable: jest.fn().mockReturnValue(true),
                getCapabilities: jest.fn().mockReturnValue({})
            };
            
            PDFProcessor.mockImplementation(() => mockPDFProcessor);
            
            const manager = new AIManager(mockEnvManager);
            const result = await manager.convertPDFToImages('https://example.com/test.pdf', {});
            
            expect(result).toEqual(mockImages);
            expect(mockPDFProcessor.convertPDFFromURL).toHaveBeenCalledWith('https://example.com/test.pdf', {});
        });

        test('should handle invalid PDF data format', async () => {
            const manager = new AIManager(mockEnvManager);
            
            await expect(manager.convertPDFToImages(123, {}))
                .rejects.toThrow('Invalid PDF data format');
        });
    });
});