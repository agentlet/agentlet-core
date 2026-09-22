/**
 * TextToSpeechManager - Text-to-speech functionality with browser-first approach
 * 
 * Primary: Browser's SpeechSynthesis API (free, offline, privacy-friendly)
 * Fallback: ElevenLabs API (premium quality) and OpenAI TTS API (good quality)
 */
export default class TextToSpeechManager {
    constructor(options = {}) {
        this.options = {
            voice: null, // Auto-select best voice
            rate: 1.0,
            pitch: 1.0,
            volume: 1.0,
            language: 'en-US',
            provider: 'auto', // 'auto', 'browser', 'elevenlabs', 'openai'
            elevenLabsVoiceId: 'pNInz6obpgDQGcFmaJgB', // Default: Adam voice
            openaiVoice: 'alloy', // Default OpenAI voice
            ...options
        };
        
        this.isSpeaking = false;
        this.synthesis = null;
        this.currentUtterance = null;
        this.eventHandlers = {};
        this.availableVoices = [];
        
        // Initialize browser speech synthesis if available
        this._initializeBrowserSpeech();
    }
    
    /**
     * Initialize browser SpeechSynthesis API
     * @private
     */
    _initializeBrowserSpeech() {
        if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
            this.synthesis = window.speechSynthesis;
            
            // Load available voices
            this._loadVoices();
            
            // Some browsers load voices asynchronously
            if (this.synthesis.onvoiceschanged !== undefined) {
                this.synthesis.onvoiceschanged = () => {
                    this._loadVoices();
                };
            }
        }
    }
    
    /**
     * Load available voices from browser
     * @private
     */
    _loadVoices() {
        if (this.synthesis) {
            this.availableVoices = this.synthesis.getVoices();
        }
    }
    
    /**
     * Check if browser speech synthesis is supported
     * @returns {boolean}
     */
    isBrowserSpeechSupported() {
        return this.synthesis !== null;
    }
    
    /**
     * Get available voices for the current provider
     * @param {string} provider - Provider to get voices for ('browser', 'elevenlabs', 'openai')
     * @returns {Array} Array of available voices
     */
    getAvailableVoices(provider = 'browser') {
        switch (provider) {
            case 'browser':
                return this.availableVoices.map(voice => ({
                    id: voice.name,
                    name: voice.name,
                    language: voice.lang,
                    gender: voice.name.toLowerCase().includes('female') ? 'female' : 'male',
                    provider: 'browser'
                }));
                
            case 'elevenlabs':
                // ElevenLabs voices (popular ones)
                return [
                    { id: 'pNInz6obpgDQGcFmaJgB', name: 'Adam', language: 'en', gender: 'male', provider: 'elevenlabs' },
                    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella', language: 'en', gender: 'female', provider: 'elevenlabs' },
                    { id: 'ErXwobaYiN019PkySvjV', name: 'Antoni', language: 'en', gender: 'male', provider: 'elevenlabs' },
                    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel', language: 'en', gender: 'female', provider: 'elevenlabs' },
                    { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi', language: 'en', gender: 'female', provider: 'elevenlabs' },
                    { id: 'VR6AewLTigWG4xSOukaG', name: 'Arnold', language: 'en', gender: 'male', provider: 'elevenlabs' }
                ];
                
            case 'openai':
                return [
                    { id: 'alloy', name: 'Alloy', language: 'en', gender: 'neutral', provider: 'openai' },
                    { id: 'echo', name: 'Echo', language: 'en', gender: 'male', provider: 'openai' },
                    { id: 'fable', name: 'Fable', language: 'en', gender: 'neutral', provider: 'openai' },
                    { id: 'onyx', name: 'Onyx', language: 'en', gender: 'male', provider: 'openai' },
                    { id: 'nova', name: 'Nova', language: 'en', gender: 'female', provider: 'openai' },
                    { id: 'shimmer', name: 'Shimmer', language: 'en', gender: 'female', provider: 'openai' }
                ];
                
            default:
                return [];
        }
    }
    
    /**
     * Find the best voice for the given language and provider
     * @param {string} language - Language code (e.g., 'en-US')
     * @param {string} provider - Provider to search ('browser', 'elevenlabs', 'openai')
     * @returns {Object|null} Best matching voice or null
     */
    findBestVoice(language = 'en-US', provider = 'browser') {
        const voices = this.getAvailableVoices(provider);
        const languageCode = language.split('-')[0]; // Convert 'en-US' to 'en'
        
        // Find exact language match first
        let bestVoice = voices.find(voice => voice.language === language);
        
        // If no exact match, find by language code
        if (!bestVoice) {
            bestVoice = voices.find(voice => voice.language.startsWith(languageCode));
        }
        
        // If still no match, return first available voice
        if (!bestVoice && voices.length > 0) {
            bestVoice = voices[0];
        }
        
        return bestVoice;
    }
    
    /**
     * Speak text using the specified or best available provider
     * @param {string} text - Text to speak
     * @param {Object} options - Speaking options
     * @returns {Promise<void>}
     */
    async speak(text, options = {}) {
        const config = { ...this.options, ...options };
        
        if (this.isSpeaking && !config.interrupt) {
            throw new Error('Already speaking. Use interrupt option to stop current speech.');
        }
        
        // Stop current speech if interrupting
        if (this.isSpeaking && config.interrupt) {
            this.stop();
        }
        
        try {
            // Determine which provider to use
            const provider = this._determineProvider(config.provider);
            
            switch (provider) {
                case 'browser':
                    return this._speakWithBrowser(text, config);
                case 'elevenlabs':
                    return this._speakWithElevenLabs(text, config);
                case 'openai':
                    return this._speakWithOpenAI(text, config);
                default:
                    throw new Error(`No speech synthesis provider available`);
            }
        } catch (error) {
            this._trigger('error', { error: error.message, provider: provider });
            throw error;
        }
    }
    
    /**
     * Stop current speech
     */
    stop() {
        if (this.synthesis && this.isSpeaking) {
            this.synthesis.cancel();
        }
        
        this.isSpeaking = false;
        this.currentUtterance = null;
        this._trigger('end');
    }
    
    /**
     * Pause current speech (browser only)
     */
    pause() {
        if (this.synthesis && this.isSpeaking) {
            this.synthesis.pause();
            this._trigger('pause');
        }
    }
    
    /**
     * Resume paused speech (browser only)
     */
    resume() {
        if (this.synthesis) {
            this.synthesis.resume();
            this._trigger('resume');
        }
    }
    
    /**
     * Speak using browser SpeechSynthesis API
     * @param {string} text - Text to speak
     * @param {Object} config - Configuration options
     * @returns {Promise<void>}
     * @private
     */
    async _speakWithBrowser(text, config) {
        if (!this.synthesis) {
            throw new Error('Browser speech synthesis not available');
        }
        
        return new Promise((resolve, reject) => {
            const utterance = new SpeechSynthesisUtterance(text);
            
            // Configure voice
            if (config.voice) {
                const voice = this.availableVoices.find(v => v.name === config.voice);
                if (voice) {
                    utterance.voice = voice;
                }
            } else {
                // Auto-select best voice for language
                const bestVoice = this.findBestVoice(config.language, 'browser');
                if (bestVoice) {
                    const voice = this.availableVoices.find(v => v.name === bestVoice.name);
                    if (voice) utterance.voice = voice;
                }
            }
            
            // Configure speech parameters
            utterance.rate = config.rate;
            utterance.pitch = config.pitch;
            utterance.volume = config.volume;
            utterance.lang = config.language;
            
            // Set up event handlers
            utterance.onstart = () => {
                this.isSpeaking = true;
                this.currentUtterance = utterance;
                this._trigger('start', { provider: 'browser' });
            };
            
            utterance.onend = () => {
                this.isSpeaking = false;
                this.currentUtterance = null;
                this._trigger('end', { provider: 'browser' });
                resolve();
            };
            
            utterance.onerror = (event) => {
                this.isSpeaking = false;
                this.currentUtterance = null;
                const error = new Error(`Browser speech synthesis error: ${event.error}`);
                this._trigger('error', { error: error.message, provider: 'browser' });
                reject(error);
            };
            
            utterance.onboundary = (event) => {
                this._trigger('boundary', { 
                    charIndex: event.charIndex,
                    charLength: event.charLength,
                    provider: 'browser'
                });
            };
            
            // Start speaking
            this.synthesis.speak(utterance);
        });
    }
    
    /**
     * Speak using ElevenLabs API
     * @param {string} text - Text to speak
     * @param {Object} config - Configuration options
     * @returns {Promise<void>}
     * @private
     */
    async _speakWithElevenLabs(text, config) {
        const apiKey = window.agentlet?.env?.ELEVENLABS_API_KEY;
        if (!apiKey) {
            throw new Error('ElevenLabs API key not configured');
        }
        
        try {
            this._trigger('start', { provider: 'elevenlabs' });
            this.isSpeaking = true;
            
            const voiceId = config.elevenLabsVoiceId || this.options.elevenLabsVoiceId;
            
            const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'Content-Type': 'application/json',
                    'xi-api-key': apiKey
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_monolingual_v1',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.5,
                        style: 0.0,
                        use_speaker_boost: true
                    }
                })
            });
            
            if (!response.ok) {
                throw new Error(`ElevenLabs API error: ${response.status} - ${response.statusText}`);
            }
            
            const audioBuffer = await response.arrayBuffer();
            const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Play the audio
            return new Promise((resolve, reject) => {
                const audio = new Audio(audioUrl);
                
                audio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    this.isSpeaking = false;
                    this._trigger('end', { provider: 'elevenlabs' });
                    resolve();
                };
                
                audio.onerror = (error) => {
                    URL.revokeObjectURL(audioUrl);
                    this.isSpeaking = false;
                    this._trigger('error', { error: error.message, provider: 'elevenlabs' });
                    reject(error);
                };
                
                audio.play();
            });
            
        } catch (error) {
            this.isSpeaking = false;
            throw error;
        }
    }
    
    /**
     * Speak using OpenAI TTS API
     * @param {string} text - Text to speak
     * @param {Object} config - Configuration options
     * @returns {Promise<void>}
     * @private
     */
    async _speakWithOpenAI(text, config) {
        const apiKey = window.agentlet?.env?.OPENAI_API_KEY;
        if (!apiKey) {
            throw new Error('OpenAI API key not configured');
        }
        
        try {
            this._trigger('start', { provider: 'openai' });
            this.isSpeaking = true;
            
            const response = await fetch('https://api.openai.com/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: 'tts-1',
                    input: text,
                    voice: config.openaiVoice || this.options.openaiVoice,
                    response_format: 'mp3',
                    speed: config.rate || 1.0
                })
            });
            
            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`OpenAI TTS API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
            }
            
            const audioBuffer = await response.arrayBuffer();
            const audioBlob = new Blob([audioBuffer], { type: 'audio/mpeg' });
            const audioUrl = URL.createObjectURL(audioBlob);
            
            // Play the audio
            return new Promise((resolve, reject) => {
                const audio = new Audio(audioUrl);
                
                audio.onended = () => {
                    URL.revokeObjectURL(audioUrl);
                    this.isSpeaking = false;
                    this._trigger('end', { provider: 'openai' });
                    resolve();
                };
                
                audio.onerror = (error) => {
                    URL.revokeObjectURL(audioUrl);
                    this.isSpeaking = false;
                    this._trigger('error', { error: error.message, provider: 'openai' });
                    reject(error);
                };
                
                audio.play();
            });
            
        } catch (error) {
            this.isSpeaking = false;
            throw error;
        }
    }
    
    /**
     * Determine which provider to use based on preference and availability
     * @param {string} preference - Preferred provider
     * @returns {string} Provider to use
     * @private
     */
    _determineProvider(preference = 'auto') {
        if (preference === 'browser' && this.isBrowserSpeechSupported()) {
            return 'browser';
        }
        
        if (preference === 'elevenlabs' && this._isElevenLabsAvailable()) {
            return 'elevenlabs';
        }
        
        if (preference === 'openai' && this._isOpenAIAvailable()) {
            return 'openai';
        }
        
        // Auto selection
        if (preference === 'auto') {
            if (this.isBrowserSpeechSupported()) {
                return 'browser';
            } else if (this._isElevenLabsAvailable()) {
                return 'elevenlabs';
            } else if (this._isOpenAIAvailable()) {
                return 'openai';
            }
        }
        
        throw new Error(`Requested provider "${preference}" is not available`);
    }
    
    /**
     * Check if ElevenLabs is available
     * @returns {boolean}
     * @private
     */
    _isElevenLabsAvailable() {
        return !!(window.agentlet?.env?.ELEVENLABS_API_KEY);
    }
    
    /**
     * Check if OpenAI TTS is available
     * @returns {boolean}
     * @private
     */
    _isOpenAIAvailable() {
        return !!(window.agentlet?.env?.OPENAI_API_KEY);
    }
    
    /**
     * Get available providers
     * @returns {Array<string>} Array of available provider names
     */
    getAvailableProviders() {
        const providers = [];
        
        if (this.isBrowserSpeechSupported()) {
            providers.push('browser');
        }
        
        if (this._isElevenLabsAvailable()) {
            providers.push('elevenlabs');
        }
        
        if (this._isOpenAIAvailable()) {
            providers.push('openai');
        }
        
        return providers;
    }
    
    /**
     * Get status information
     * @returns {Object} Status object
     */
    getStatus() {
        return {
            isSpeaking: this.isSpeaking,
            browserSupported: this.isBrowserSpeechSupported(),
            elevenLabsAvailable: this._isElevenLabsAvailable(),
            openaiAvailable: this._isOpenAIAvailable(),
            availableProviders: this.getAvailableProviders(),
            availableVoices: this.availableVoices.length,
            currentLanguage: this.options.language
        };
    }
    
    /**
     * Add event listener
     * @param {string} event - Event name ('start', 'end', 'error', 'pause', 'resume', 'boundary')
     * @param {Function} handler - Event handler function
     */
    on(event, handler) {
        if (!this.eventHandlers[event]) {
            this.eventHandlers[event] = [];
        }
        this.eventHandlers[event].push(handler);
    }
    
    /**
     * Remove event listener
     * @param {string} event - Event name
     * @param {Function} handler - Event handler function to remove
     */
    off(event, handler) {
        if (!this.eventHandlers[event]) return;
        
        const index = this.eventHandlers[event].indexOf(handler);
        if (index > -1) {
            this.eventHandlers[event].splice(index, 1);
        }
    }
    
    /**
     * Trigger event
     * @param {string} event - Event name
     * @param {*} data - Event data
     * @private
     */
    _trigger(event, data = null) {
        if (this.eventHandlers[event]) {
            this.eventHandlers[event].forEach(handler => {
                try {
                    handler(data);
                } catch (error) {
                    console.error(`Error in ${event} event handler:`, error);
                }
            });
        }
    }
    
    /**
     * Cleanup resources
     */
    destroy() {
        this.stop();
        this.eventHandlers = {};
        this.synthesis = null;
        this.availableVoices = [];
    }
}