/**
 * Tests for SpeechToTextManager utility
 */

import SpeechToTextManager from '../../src/utils/SpeechToTextManager.js';

// Mock browser APIs
const mockSpeechRecognition = {
    start: jest.fn(),
    stop: jest.fn(),
    continuous: false,
    interimResults: false,
    lang: 'en-US',
    maxAlternatives: 1,
    onstart: null,
    onend: null,
    onerror: null,
    onresult: null
};

const mockMediaRecorder = {
    start: jest.fn(),
    stop: jest.fn(),
    state: 'inactive',
    ondataavailable: null,
    onstop: null
};

const mockMediaDevices = {
    getUserMedia: jest.fn().mockResolvedValue({
        getTracks: jest.fn().mockReturnValue([{
            stop: jest.fn()
        }])
    })
};

// Mock global objects
global.window = {
    SpeechRecognition: jest.fn(() => mockSpeechRecognition),
    MediaRecorder: jest.fn(() => mockMediaRecorder),
    navigator: {
        mediaDevices: mockMediaDevices
    },
    agentlet: {
        env: {
            OPENAI_API_KEY: 'test-key'
        }
    }
};

// Mock fetch for OpenAI API
global.fetch = jest.fn();

describe('SpeechToTextManager', () => {
    let manager;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new SpeechToTextManager();
    });

    afterEach(() => {
        manager.destroy();
    });

    describe('Constructor', () => {
        test('should initialize with default options', () => {
            expect(manager.options.language).toBe('en-US');
            expect(manager.options.continuous).toBe(false);
            expect(manager.options.interimResults).toBe(true);
            expect(manager.options.apiProvider).toBe('auto');
            expect(manager.isListening).toBe(false);
        });

        test('should initialize with custom options', () => {
            const customManager = new SpeechToTextManager({
                language: 'es-ES',
                continuous: true,
                apiProvider: 'openai'
            });
            
            expect(customManager.options.language).toBe('es-ES');
            expect(customManager.options.continuous).toBe(true);
            expect(customManager.options.apiProvider).toBe('openai');
        });

        test('should initialize browser speech recognition when available', () => {
            expect(manager.recognition).toBeDefined();
            expect(window.SpeechRecognition).toHaveBeenCalled();
        });
    });

    describe('Browser Support Detection', () => {
        test('should detect browser speech recognition support', () => {
            expect(manager.isBrowserSpeechSupported()).toBe(true);
        });

        test('should handle missing browser speech recognition', () => {
            const originalSpeechRecognition = window.SpeechRecognition;
            window.SpeechRecognition = undefined;
            
            const managerNoSupport = new SpeechToTextManager();
            expect(managerNoSupport.isBrowserSpeechSupported()).toBe(false);
            
            // Restore
            window.SpeechRecognition = originalSpeechRecognition;
        });
    });

    describe('Event Handling', () => {
        test('should add and remove event listeners', () => {
            const handler = jest.fn();
            
            manager.on('result', handler);
            expect(manager.eventHandlers.result).toContain(handler);
            
            manager.off('result', handler);
            expect(manager.eventHandlers.result).not.toContain(handler);
        });

        test('should trigger events correctly', () => {
            const handler = jest.fn();
            manager.on('start', handler);
            
            manager._trigger('start', { test: 'data' });
            expect(handler).toHaveBeenCalledWith({ test: 'data' });
        });

        test('should handle errors in event handlers gracefully', () => {
            const faultyHandler = jest.fn().mockImplementation(() => {
                throw new Error('Handler error');
            });
            
            const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
            
            manager.on('test', faultyHandler);
            manager._trigger('test');
            
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('Browser Speech Recognition', () => {
        test('should start browser speech recognition successfully', async () => {
            await manager.startListening({ apiProvider: 'browser' });
            
            expect(mockSpeechRecognition.start).toHaveBeenCalled();
            expect(mockSpeechRecognition.lang).toBe('en-US');
        });

        test('should stop browser speech recognition', () => {
            manager.isListening = true;
            manager.stopListening();
            
            expect(mockSpeechRecognition.stop).toHaveBeenCalled();
        });

        test('should handle browser speech recognition events', () => {
            const startHandler = jest.fn();
            const resultHandler = jest.fn();
            const errorHandler = jest.fn();
            const endHandler = jest.fn();
            
            manager.on('start', startHandler);
            manager.on('result', resultHandler);
            manager.on('error', errorHandler);
            manager.on('end', endHandler);
            
            // Simulate browser speech recognition events
            mockSpeechRecognition.onstart();
            expect(startHandler).toHaveBeenCalled();
            expect(manager.isListening).toBe(true);
            
            // Simulate result event
            const mockEvent = {
                resultIndex: 0,
                results: [{
                    0: { transcript: 'hello world', confidence: 0.9 },
                    isFinal: true
                }]
            };
            mockSpeechRecognition.onresult(mockEvent);
            expect(resultHandler).toHaveBeenCalledWith({
                results: [{
                    transcript: 'hello world',
                    confidence: 0.9,
                    isFinal: true
                }],
                provider: 'browser'
            });
            
            // Simulate error event
            mockSpeechRecognition.onerror({ error: 'network' });
            expect(errorHandler).toHaveBeenCalled();
            
            // Simulate end event
            mockSpeechRecognition.onend();
            expect(endHandler).toHaveBeenCalled();
            expect(manager.isListening).toBe(false);
        });
    });

    describe('OpenAI Whisper Integration', () => {
        test('should throw error when already listening', async () => {
            manager.isListening = true;
            
            await expect(manager.startListening()).rejects.toThrow('Already listening');
        });

        test('should transcribe audio with OpenAI API', async () => {
            const mockResponse = {
                ok: true,
                json: jest.fn().mockResolvedValue({ text: 'transcribed text' })
            };
            global.fetch.mockResolvedValue(mockResponse);
            
            const audioBlob = new Blob(['fake audio'], { type: 'audio/wav' });
            const result = await manager.transcribeAudio(audioBlob);
            
            expect(result.transcript).toBe('transcribed text');
            expect(result.provider).toBe('openai');
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.openai.com/v1/audio/transcriptions',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-key'
                    })
                })
            );
        });

        test('should handle OpenAI API errors', async () => {
            const mockResponse = {
                ok: false,
                status: 401,
                statusText: 'Unauthorized',
                json: jest.fn().mockResolvedValue({
                    error: { message: 'Invalid API key' }
                })
            };
            global.fetch.mockResolvedValue(mockResponse);
            
            const audioBlob = new Blob(['fake audio'], { type: 'audio/wav' });
            
            await expect(manager.transcribeAudio(audioBlob))
                .rejects.toThrow('OpenAI API error: 401 - Invalid API key');
        });

        test('should require OpenAI API key for transcription', async () => {
            const originalKey = window.agentlet.env.OPENAI_API_KEY;
            delete window.agentlet.env.OPENAI_API_KEY;
            
            const audioBlob = new Blob(['fake audio'], { type: 'audio/wav' });
            
            await expect(manager.transcribeAudio(audioBlob))
                .rejects.toThrow('OpenAI API key not configured');
            
            // Restore
            window.agentlet.env.OPENAI_API_KEY = originalKey;
        });
    });

    describe('Language Support', () => {
        test('should return supported languages', () => {
            const languages = manager.getSupportedLanguages();
            
            expect(Array.isArray(languages)).toBe(true);
            expect(languages).toContain('en-US');
            expect(languages).toContain('es-ES');
            expect(languages).toContain('fr-FR');
        });
    });

    describe('Status Information', () => {
        test('should return correct status', () => {
            const status = manager.getStatus();
            
            expect(status).toHaveProperty('isListening');
            expect(status).toHaveProperty('browserSupported');
            expect(status).toHaveProperty('openaiAvailable');
            expect(status).toHaveProperty('currentLanguage');
            expect(status).toHaveProperty('provider');
            
            expect(status.isListening).toBe(false);
            expect(status.browserSupported).toBe(true);
            expect(status.openaiAvailable).toBe(true);
        });
    });

    describe('Cleanup', () => {
        test('should cleanup resources on destroy', () => {
            const handler = jest.fn();
            manager.on('test', handler);
            
            manager.destroy();
            
            expect(manager.eventHandlers).toEqual({});
            expect(manager.recognition).toBeNull();
        });
    });
});