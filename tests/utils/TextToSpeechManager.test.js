/**
 * Tests for TextToSpeechManager utility
 */

import TextToSpeechManager from '../../src/utils/TextToSpeechManager.js';

// Mock browser APIs
const mockSpeechSynthesis = {
    speak: jest.fn(),
    cancel: jest.fn(),
    pause: jest.fn(),
    resume: jest.fn(),
    getVoices: jest.fn().mockReturnValue([
        { name: 'Google US English', lang: 'en-US' },
        { name: 'Google UK English Female', lang: 'en-GB' },
        { name: 'Google español', lang: 'es-ES' }
    ]),
    onvoiceschanged: null
};

const mockSpeechSynthesisUtterance = jest.fn().mockImplementation((text) => ({
    text,
    voice: null,
    rate: 1,
    pitch: 1,
    volume: 1,
    lang: 'en-US',
    onstart: null,
    onend: null,
    onerror: null,
    onboundary: null
}));

const mockAudio = {
    play: jest.fn(),
    onended: null,
    onerror: null
};

// Mock global objects
global.window = {
    speechSynthesis: mockSpeechSynthesis,
    SpeechSynthesisUtterance: mockSpeechSynthesisUtterance,
    Audio: jest.fn(() => mockAudio),
    URL: {
        createObjectURL: jest.fn(() => 'blob:mock-url'),
        revokeObjectURL: jest.fn()
    },
    agentlet: {
        env: {
            ELEVENLABS_API_KEY: 'test-elevenlabs-key',
            OPENAI_API_KEY: 'test-openai-key'
        }
    }
};

// Mock fetch for API calls
global.fetch = jest.fn();
global.Blob = class Blob {
    constructor(content, options) {
        this.content = content;
        this.type = options.type;
    }
};

describe('TextToSpeechManager', () => {
    let manager;

    beforeEach(() => {
        jest.clearAllMocks();
        manager = new TextToSpeechManager();
    });

    afterEach(() => {
        manager.destroy();
    });

    describe('Constructor', () => {
        test('should initialize with default options', () => {
            expect(manager.options.voice).toBeNull();
            expect(manager.options.rate).toBe(1.0);
            expect(manager.options.pitch).toBe(1.0);
            expect(manager.options.volume).toBe(1.0);
            expect(manager.options.language).toBe('en-US');
            expect(manager.options.provider).toBe('auto');
            expect(manager.isSpeaking).toBe(false);
        });

        test('should initialize with custom options', () => {
            const customManager = new TextToSpeechManager({
                rate: 1.5,
                pitch: 0.8,
                language: 'es-ES',
                provider: 'elevenlabs'
            });
            
            expect(customManager.options.rate).toBe(1.5);
            expect(customManager.options.pitch).toBe(0.8);
            expect(customManager.options.language).toBe('es-ES');
            expect(customManager.options.provider).toBe('elevenlabs');
        });

        test('should initialize browser speech synthesis when available', () => {
            expect(manager.synthesis).toBe(mockSpeechSynthesis);
            expect(manager.availableVoices).toEqual(mockSpeechSynthesis.getVoices());
        });
    });

    describe('Browser Support Detection', () => {
        test('should detect browser speech synthesis support', () => {
            expect(manager.isBrowserSpeechSupported()).toBe(true);
        });

        test('should handle missing browser speech synthesis', () => {
            const originalSpeechSynthesis = window.speechSynthesis;
            delete window.speechSynthesis;
            
            const managerNoSupport = new TextToSpeechManager();
            expect(managerNoSupport.isBrowserSpeechSupported()).toBe(false);
            
            // Restore
            window.speechSynthesis = originalSpeechSynthesis;
        });
    });

    describe('Voice Management', () => {
        test('should get available voices for browser', () => {
            const voices = manager.getAvailableVoices('browser');
            
            expect(voices).toHaveLength(3);
            expect(voices[0]).toHaveProperty('id', 'Google US English');
            expect(voices[0]).toHaveProperty('name', 'Google US English');
            expect(voices[0]).toHaveProperty('language', 'en-US');
            expect(voices[0]).toHaveProperty('provider', 'browser');
        });

        test('should get available voices for ElevenLabs', () => {
            const voices = manager.getAvailableVoices('elevenlabs');
            
            expect(voices.length).toBeGreaterThan(0);
            expect(voices[0]).toHaveProperty('id');
            expect(voices[0]).toHaveProperty('name');
            expect(voices[0]).toHaveProperty('provider', 'elevenlabs');
        });

        test('should get available voices for OpenAI', () => {
            const voices = manager.getAvailableVoices('openai');
            
            expect(voices.length).toBeGreaterThan(0);
            expect(voices[0]).toHaveProperty('id');
            expect(voices[0]).toHaveProperty('name');
            expect(voices[0]).toHaveProperty('provider', 'openai');
        });

        test('should find best voice for language', () => {
            const voice = manager.findBestVoice('en-US', 'browser');
            
            expect(voice).toBeDefined();
            expect(voice.language).toBe('en-US');
        });

        test('should find voice by language prefix when exact match not found', () => {
            const voice = manager.findBestVoice('en-CA', 'browser');
            
            expect(voice).toBeDefined();
            expect(voice.language.startsWith('en')).toBe(true);
        });
    });

    describe('Event Handling', () => {
        test('should add and remove event listeners', () => {
            const handler = jest.fn();
            
            manager.on('start', handler);
            expect(manager.eventHandlers.start).toContain(handler);
            
            manager.off('start', handler);
            expect(manager.eventHandlers.start).not.toContain(handler);
        });

        test('should trigger events correctly', () => {
            const handler = jest.fn();
            manager.on('start', handler);
            
            manager._trigger('start', { provider: 'browser' });
            expect(handler).toHaveBeenCalledWith({ provider: 'browser' });
        });
    });

    describe('Browser Speech Synthesis', () => {
        test('should speak text using browser API', async () => {
            const speakPromise = manager.speak('Hello world', { provider: 'browser' });
            
            expect(window.SpeechSynthesisUtterance).toHaveBeenCalledWith('Hello world');
            expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
            
            // Simulate speech end
            const utterance = window.SpeechSynthesisUtterance.mock.results[0].value;
            utterance.onend();
            
            await speakPromise;
            expect(manager.isSpeaking).toBe(false);
        });

        test('should configure utterance parameters', async () => {
            const options = {
                provider: 'browser',
                rate: 1.5,
                pitch: 0.8,
                volume: 0.9,
                language: 'es-ES'
            };
            
            manager.speak('Hola mundo', options);
            
            const utterance = window.SpeechSynthesisUtterance.mock.results[0].value;
            expect(utterance.rate).toBe(1.5);
            expect(utterance.pitch).toBe(0.8);
            expect(utterance.volume).toBe(0.9);
            expect(utterance.lang).toBe('es-ES');
        });

        test('should handle speech synthesis errors', async () => {
            const speakPromise = manager.speak('Hello world', { provider: 'browser' });
            
            const utterance = window.SpeechSynthesisUtterance.mock.results[0].value;
            utterance.onerror({ error: 'network' });
            
            await expect(speakPromise).rejects.toThrow('Browser speech synthesis error: network');
        });

        test('should stop current speech', () => {
            manager.isSpeaking = true;
            manager.stop();
            
            expect(mockSpeechSynthesis.cancel).toHaveBeenCalled();
            expect(manager.isSpeaking).toBe(false);
        });

        test('should pause and resume speech', () => {
            manager.isSpeaking = true;
            
            manager.pause();
            expect(mockSpeechSynthesis.pause).toHaveBeenCalled();
            
            manager.resume();
            expect(mockSpeechSynthesis.resume).toHaveBeenCalled();
        });
    });

    describe('ElevenLabs Integration', () => {
        test('should speak text using ElevenLabs API', async () => {
            const mockResponse = {
                ok: true,
                arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
            };
            global.fetch.mockResolvedValue(mockResponse);
            
            const speakPromise = manager.speak('Hello world', { provider: 'elevenlabs' });
            
            expect(global.fetch).toHaveBeenCalledWith(
                expect.stringContaining('api.elevenlabs.io'),
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'xi-api-key': 'test-elevenlabs-key'
                    })
                })
            );
            
            // Simulate audio end
            setTimeout(() => mockAudio.onended(), 10);
            
            await speakPromise;
            expect(manager.isSpeaking).toBe(false);
        });

        test('should handle ElevenLabs API errors', async () => {
            const mockResponse = {
                ok: false,
                status: 401,
                statusText: 'Unauthorized'
            };
            global.fetch.mockResolvedValue(mockResponse);
            
            await expect(manager.speak('Hello world', { provider: 'elevenlabs' }))
                .rejects.toThrow('ElevenLabs API error: 401 - Unauthorized');
        });

        test('should require ElevenLabs API key', async () => {
            const originalKey = window.agentlet.env.ELEVENLABS_API_KEY;
            delete window.agentlet.env.ELEVENLABS_API_KEY;
            
            await expect(manager.speak('Hello world', { provider: 'elevenlabs' }))
                .rejects.toThrow('ElevenLabs API key not configured');
            
            // Restore
            window.agentlet.env.ELEVENLABS_API_KEY = originalKey;
        });
    });

    describe('OpenAI TTS Integration', () => {
        test('should speak text using OpenAI API', async () => {
            const mockResponse = {
                ok: true,
                arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
            };
            global.fetch.mockResolvedValue(mockResponse);
            
            const speakPromise = manager.speak('Hello world', { provider: 'openai' });
            
            expect(global.fetch).toHaveBeenCalledWith(
                'https://api.openai.com/v1/audio/speech',
                expect.objectContaining({
                    method: 'POST',
                    headers: expect.objectContaining({
                        'Authorization': 'Bearer test-openai-key'
                    })
                })
            );
            
            // Simulate audio end
            setTimeout(() => mockAudio.onended(), 10);
            
            await speakPromise;
            expect(manager.isSpeaking).toBe(false);
        });

        test('should handle OpenAI API errors', async () => {
            const mockResponse = {
                ok: false,
                status: 429,
                statusText: 'Too Many Requests',
                json: jest.fn().mockResolvedValue({
                    error: { message: 'Rate limit exceeded' }
                })
            };
            global.fetch.mockResolvedValue(mockResponse);
            
            await expect(manager.speak('Hello world', { provider: 'openai' }))
                .rejects.toThrow('OpenAI TTS API error: 429 - Rate limit exceeded');
        });
    });

    describe('Provider Selection', () => {
        test('should auto-select browser provider when available', async () => {
            await manager.speak('Hello world', { provider: 'auto' });
            
            expect(mockSpeechSynthesis.speak).toHaveBeenCalled();
        });

        test('should select specific provider when requested', async () => {
            const mockResponse = {
                ok: true,
                arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(1024))
            };
            global.fetch.mockResolvedValue(mockResponse);
            
            const speakPromise = manager.speak('Hello world', { provider: 'elevenlabs' });
            
            expect(global.fetch).toHaveBeenCalled();
            
            setTimeout(() => mockAudio.onended(), 10);
            await speakPromise;
        });

        test('should get available providers', () => {
            const providers = manager.getAvailableProviders();
            
            expect(providers).toContain('browser');
            expect(providers).toContain('elevenlabs');
            expect(providers).toContain('openai');
        });
    });

    describe('Status Information', () => {
        test('should return correct status', () => {
            const status = manager.getStatus();
            
            expect(status).toHaveProperty('isSpeaking');
            expect(status).toHaveProperty('browserSupported');
            expect(status).toHaveProperty('elevenLabsAvailable');
            expect(status).toHaveProperty('openaiAvailable');
            expect(status).toHaveProperty('availableProviders');
            expect(status).toHaveProperty('currentLanguage');
            
            expect(status.isSpeaking).toBe(false);
            expect(status.browserSupported).toBe(true);
            expect(status.elevenLabsAvailable).toBe(true);
            expect(status.openaiAvailable).toBe(true);
        });
    });

    describe('Interruption Handling', () => {
        test('should throw error when already speaking without interrupt option', async () => {
            manager.isSpeaking = true;
            
            await expect(manager.speak('Hello world'))
                .rejects.toThrow('Already speaking. Use interrupt option to stop current speech.');
        });

        test('should interrupt current speech when interrupt option is true', async () => {
            manager.isSpeaking = true;
            const stopSpy = jest.spyOn(manager, 'stop');
            
            await manager.speak('Hello world', { interrupt: true, provider: 'browser' });
            
            expect(stopSpy).toHaveBeenCalled();
        });
    });

    describe('Cleanup', () => {
        test('should cleanup resources on destroy', () => {
            const handler = jest.fn();
            manager.on('test', handler);
            
            manager.destroy();
            
            expect(manager.eventHandlers).toEqual({});
            expect(manager.synthesis).toBeNull();
            expect(manager.availableVoices).toEqual([]);
        });
    });
});