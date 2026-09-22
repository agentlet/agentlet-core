/**
 * SpeechToTextManager - Speech recognition utility for agentlet-core
 * Provides browser-first speech-to-text with OpenAI Whisper fallback
 */

export default class SpeechToTextManager {
    constructor(options = {}) {
        this.options = {
            language: 'en-US',
            continuous: false,
            interimResults: true,
            maxAlternatives: 1,
            apiProvider: 'auto', // 'browser', 'openai', 'auto'
            ...options
        };

        this.isListening = false;
        this.recognition = null;
        this.eventHandlers = {};
        
        // OpenAI recording properties
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.currentStream = null;
        
        // Initialize browser speech recognition if available
        this._initializeBrowserSpeech();
    }

    /**
     * Initialize browser SpeechRecognition API
     * @private
     */
    _initializeBrowserSpeech() {
        if (typeof window !== 'undefined') {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            
            if (SpeechRecognition) {
                this.recognition = new SpeechRecognition();
                this.recognition.continuous = this.options.continuous;
                this.recognition.interimResults = this.options.interimResults;
                this.recognition.lang = this.options.language;
                this.recognition.maxAlternatives = this.options.maxAlternatives;

                // Set up event handlers
                this.recognition.onstart = () => {
                    this.isListening = true;
                    this._trigger('start');
                };

                this.recognition.onend = () => {
                    this.isListening = false;
                    this._trigger('end');
                };

                this.recognition.onerror = (event) => {
                    this.isListening = false;
                    this._trigger('error', { 
                        error: event.error, 
                        message: event.message,
                        provider: 'browser'
                    });
                };

                this.recognition.onresult = (event) => {
                    const results = [];
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        const result = event.results[i];
                        results.push({
                            transcript: result[0].transcript,
                            confidence: result[0].confidence,
                            isFinal: result.isFinal
                        });
                    }
                    this._trigger('result', { results, provider: 'browser' });
                };
            }
        }
    }

    /**
     * Check if browser speech recognition is supported
     * @returns {boolean}
     */
    isBrowserSpeechSupported() {
        return this.recognition !== null;
    }

    /**
     * Start listening for speech
     * @param {Object} options - Listening options
     * @returns {Promise<void>}
     */
    async startListening(options = {}) {
        const config = { ...this.options, ...options };
        
        if (this.isListening) {
            throw new Error('Already listening');
        }

        // Try browser first if supported and not explicitly disabled
        if (config.apiProvider !== 'openai' && this.isBrowserSpeechSupported()) {
            try {
                // Update recognition settings
                this.recognition.continuous = config.continuous;
                this.recognition.interimResults = config.interimResults;
                this.recognition.lang = config.language;
                this.recognition.maxAlternatives = config.maxAlternatives;
                
                this.recognition.start();
                return;
            } catch (error) {
                console.warn('Browser speech recognition failed, trying OpenAI fallback:', error);
                // Fall through to OpenAI implementation
            }
        }

        // Fallback to OpenAI Whisper (requires implementation)
        if (config.apiProvider !== 'browser') {
            await this._startOpenAIListening(config);
        } else {
            throw new Error('Browser speech recognition not supported and OpenAI fallback disabled');
        }
    }

    /**
     * Stop listening for speech
     */
    stopListening() {
        if (!this.isListening) {
            return;
        }

        if (this.recognition) {
            this.recognition.stop();
        }

        // Stop any ongoing OpenAI listening
        this._stopOpenAIListening();
    }

    /**
     * Process audio data using OpenAI Whisper API
     * @param {ArrayBuffer|Blob} audioData - Audio data to transcribe
     * @param {Object} options - Transcription options
     * @returns {Promise<Object>} Transcription result
     */
    async transcribeAudio(audioData, options = {}) {
        const config = { ...this.options, ...options };
        
        if (!window.agentlet?.env?.OPENAI_API_KEY) {
            throw new Error('OpenAI API key not configured');
        }

        try {
            // Convert audio data to FormData for OpenAI API
            const formData = new FormData();
            
            // Handle different audio data types
            let audioBlob;
            if (audioData instanceof ArrayBuffer) {
                audioBlob = new Blob([audioData], { type: 'audio/wav' });
            } else if (audioData instanceof Blob) {
                audioBlob = audioData;
            } else {
                throw new Error('Invalid audio data format');
            }
            
            formData.append('file', audioBlob, 'audio.wav');
            formData.append('model', 'whisper-1');
            formData.append('language', config.language.split('-')[0]); // Convert en-US to en
            
            if (config.prompt) {
                formData.append('prompt', config.prompt);
            }

            const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${window.agentlet.env.OPENAI_API_KEY}`
                },
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`OpenAI API error: ${response.status} - ${errorData.error?.message || response.statusText}`);
            }

            const result = await response.json();
            
            return {
                transcript: result.text,
                confidence: 1.0, // OpenAI doesn't provide confidence scores
                provider: 'openai'
            };
        } catch (error) {
            this._trigger('error', {
                error: error.message,
                provider: 'openai'
            });
            throw error;
        }
    }

    /**
     * Start OpenAI-based listening with continuous recording
     * @param {Object} config - Configuration options
     * @private
     */
    async _startOpenAIListening(config) {
        try {
            // Request microphone access
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Set up MediaRecorder for continuous recording
            this.mediaRecorder = new MediaRecorder(stream, {
                mimeType: 'audio/webm;codecs=opus'
            });
            
            this.audioChunks = [];
            this.currentStream = stream;
            
            this.mediaRecorder.ondataavailable = (event) => {
                if (event.data.size > 0) {
                    this.audioChunks.push(event.data);
                }
            };
            
            this.mediaRecorder.onstop = async () => {
                if (this.audioChunks.length > 0) {
                    try {
                        const audioBlob = new Blob(this.audioChunks, { type: 'audio/webm' });
                        const result = await this.transcribeAudio(audioBlob, config);
                        
                        this._trigger('result', { 
                            results: [{
                                transcript: result.transcript,
                                confidence: result.confidence,
                                isFinal: true
                            }], 
                            provider: 'openai' 
                        });
                    } catch (error) {
                        this._trigger('error', { error: error.message, provider: 'openai' });
                    }
                }
                
                // Cleanup
                this._cleanupOpenAIListening();
                this._trigger('end');
            };
            
            // Start recording
            this.isListening = true;
            this.mediaRecorder.start();
            this._trigger('start');
            
        } catch (error) {
            this._trigger('error', { error: error.message, provider: 'openai' });
            throw error;
        }
    }

    /**
     * Stop OpenAI-based listening
     * @private
     */
    _stopOpenAIListening() {
        if (this.mediaRecorder && this.mediaRecorder.state === 'recording') {
            this.mediaRecorder.stop();
        }
    }
    
    /**
     * Cleanup OpenAI listening resources
     * @private
     */
    _cleanupOpenAIListening() {
        if (this.currentStream) {
            this.currentStream.getTracks().forEach(track => track.stop());
            this.currentStream = null;
        }
        
        this.mediaRecorder = null;
        this.audioChunks = [];
        this.isListening = false;
    }

    /**
     * Add event listener
     * @param {string} event - Event name ('start', 'end', 'result', 'error')
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
     * Get available languages for speech recognition
     * @returns {Array<string>} Array of supported language codes
     */
    getSupportedLanguages() {
        // Common languages supported by most speech recognition systems
        return [
            'en-US', 'en-GB', 'en-AU', 'en-CA', 'en-IN',
            'es-ES', 'es-MX', 'es-AR', 'es-CO',
            'fr-FR', 'fr-CA',
            'de-DE',
            'it-IT',
            'pt-BR', 'pt-PT',
            'ru-RU',
            'ja-JP',
            'ko-KR',
            'zh-CN', 'zh-TW',
            'ar-SA',
            'hi-IN',
            'nl-NL',
            'sv-SE',
            'da-DK',
            'no-NO',
            'fi-FI',
            'pl-PL',
            'tr-TR'
        ];
    }

    /**
     * Get current status information
     * @returns {Object} Status object
     */
    getStatus() {
        return {
            isListening: this.isListening,
            browserSupported: this.isBrowserSpeechSupported(),
            openaiAvailable: !!window.agentlet?.env?.OPENAI_API_KEY,
            currentLanguage: this.options.language,
            provider: this.recognition ? 'browser' : 'openai'
        };
    }

    /**
     * Cleanup resources
     */
    destroy() {
        this.stopListening();
        this._cleanupOpenAIListening();
        this.eventHandlers = {};
        this.recognition = null;
    }
}