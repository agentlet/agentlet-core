/**
 * AIProvider - AI integration utility for agentlet-core
 * Provides a simple interface for AI API calls with support for multiple providers
 * Includes PDF-to-image conversion for document analysis
 */
import PDFProcessor from './PDFProcessor.js';
import type {
    EnvAPI,
    LibrarySetupAPI,
    PDFConversionOptions,
    AIImageInput,
    AIPromptOptions,
    AISendPromptWithPDFOptions,
    AIProviderHandle,
    AIStatus,
    AIValidateAPIResult,
    AIManagerAPI,
    PDFInputData
} from '../../types/public-api';

/** `BaseAIProvider`/`OpenAIProvider` constructor options; `OpenAIProvider` reads a few extra keys off the same bag (see its constructor). */
interface AIProviderOptions {
    timeout?: number;
    maxRetries?: number;
    baseUrl?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
}

/** Fully-populated form of {@link AIProviderOptions} after `BaseAIProvider`'s constructor merges in its defaults. */
interface ResolvedAIProviderOptions {
    timeout: number;
    maxRetries: number;
}

/**
 * Base class for AI providers
 */
export class BaseAIProvider implements AIProviderHandle {
    apiKey: string;
    options: ResolvedAIProviderOptions;

    constructor(apiKey: string, options: AIProviderOptions = {}) {
        if (!apiKey) {
            throw new Error('API key is required');
        }

        this.apiKey = apiKey;
        this.options = {
            timeout: 30000,
            maxRetries: 3,
            ...options
        };
    }

    /**
     * Send a prompt to the AI provider
     * @param prompt - The text prompt
     * @param images - Array of image data (base64 or URLs)
     * @param options - Request options
     * @returns AI response
     */
    async sendPrompt(_prompt: string, _images: AIImageInput[] = [], _options: AIPromptOptions = {}): Promise<string> {
        throw new Error('sendPrompt must be implemented by subclass');
    }

    /**
     * Send a prompt with PDF document to the AI provider
     * @param prompt - The text prompt
     * @param pdfData - PDF data (File, buffer, or URL)
     * @param options - Request options
     * @param librarySetup - Library setup instance for dynamic loading
     * @returns AI response
     */
    async sendPromptWithPDF(
        prompt: string,
        pdfData: PDFInputData,
        options: AISendPromptWithPDFOptions = {},
        librarySetup: LibrarySetupAPI | null = null
    ): Promise<string> {
        // Convert PDF to images first, then send to regular sendPrompt
        const pdfProcessor = new PDFProcessor(librarySetup);
        let images: string[];

        try {
            if (typeof pdfData === 'string' && (pdfData.startsWith('http') || pdfData.startsWith('https'))) {
                // PDF URL
                console.log('📄 Processing PDF from URL...');
                images = await pdfProcessor.convertPDFFromURL(pdfData, options.pdfOptions);
            } else if (pdfData instanceof File || pdfData instanceof ArrayBuffer || pdfData instanceof Uint8Array) {
                // PDF file or buffer
                console.log('📄 Processing PDF data...');
                images = await pdfProcessor.convertPDFToImages(pdfData, options.pdfOptions);
            } else {
                throw new Error('Invalid PDF data format. Expected File, ArrayBuffer, Uint8Array, or URL string.');
            }

            // Display images in console for debugging (if enabled)
            if (options.showInConsole !== false) {
                pdfProcessor.displayPDFImagesInConsole(images, options.pdfName || 'PDF Document');
            }

            return await this.sendPrompt(prompt, images, options);

        } catch (error) {
            console.error('📄 PDF processing failed:', error);
            throw new Error(`PDF processing failed: ${(error as Error).message}`);
        }
    }

    /**
     * Check if the provider is configured and ready
     * @returns True if ready
     */
    isReady(): boolean {
        return !!this.apiKey;
    }

    /**
     * Validate API connectivity by making a test request
     * @returns Validation result with success status and details
     */
    async validateAPI(): Promise<AIValidateAPIResult> {
        throw new Error('validateAPI must be implemented by subclass');
    }

    /**
     * Get provider name
     * @returns Provider name
     */
    getProviderName(): string {
        return 'base';
    }
}

/** Shape of the body `OpenAIProvider` posts to `/chat/completions`. */
interface OpenAIChatCompletionRequest {
    model: string;
    max_tokens: number;
    temperature: number;
    messages: Array<{ role: string; content: OpenAIMessageContentPart[] }>;
}

type OpenAIMessageContentPart =
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string } };

/** The subset of the `/chat/completions` JSON response this file reads. */
interface OpenAIChatCompletionResponse {
    choices?: Array<{ message: { content: string } }>;
    usage?: Record<string, unknown>;
}

/** The subset of an OpenAI error-response JSON body this file reads. */
interface OpenAIErrorResponseBody {
    error?: { message?: string };
}

/**
 * OpenAI provider implementation
 */
export class OpenAIProvider extends BaseAIProvider {
    baseUrl: string;
    model: string;
    maxTokens: number;
    temperature: number;

    constructor(apiKey: string, options: AIProviderOptions = {}) {
        super(apiKey, options);

        this.baseUrl = options.baseUrl || 'https://api.openai.com/v1';
        this.model = options.model || 'gpt-4o-mini';
        this.maxTokens = options.maxTokens || 4000;
        this.temperature = options.temperature || 0.7;
    }

    async sendPrompt(prompt: string, images: AIImageInput[] = [], options: AIPromptOptions = {}): Promise<string> {
        if (!prompt || typeof prompt !== 'string') {
            throw new Error('Prompt must be a non-empty string');
        }

        const requestOptions: OpenAIChatCompletionRequest = {
            model: (options.model as string) || this.model,
            max_tokens: (options.maxTokens as number) || this.maxTokens,
            temperature: (options.temperature as number) ?? this.temperature,
            messages: []
        };

        // Build message content
        const messageContent: OpenAIMessageContentPart[] = [];

        // Add text prompt
        messageContent.push({
            type: 'text',
            text: prompt
        });

        // Add images if provided
        if (images && images.length > 0) {
            for (const image of images) {
                if (typeof image === 'string') {
                    // Handle base64 or URL images
                    const imageUrl = image.startsWith('data:') ? image :
                        image.startsWith('http') ? image :
                            `data:image/jpeg;base64,${image}`;

                    messageContent.push({
                        type: 'image_url',
                        image_url: {
                            url: imageUrl
                        }
                    });
                }
            }
        }

        requestOptions.messages.push({
            role: 'user',
            content: messageContent
        });

        try {
            const response = await this.makeRequest('/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestOptions)
            }) as OpenAIChatCompletionResponse;

            if (!response.choices || response.choices.length === 0) {
                throw new Error('No response from OpenAI API');
            }

            return response.choices[0].message.content;

        } catch (error) {
            console.error('OpenAI API error:', error);
            throw new Error(`OpenAI API request failed: ${(error as Error).message}`);
        }
    }

    async makeRequest(endpoint: string, options: RequestInit = {}): Promise<unknown> {
        const url = `${this.baseUrl}${endpoint}`;

        const requestOptions = {
            timeout: this.options.timeout,
            ...options
        };

        let lastError: unknown;

        for (let attempt = 1; attempt <= this.options.maxRetries; attempt++) {
            try {
                // `timeout` is not a real `fetch()` RequestInit option; it is carried
                // over unused from the original implementation (fetch never applied
                // any timeout here) rather than "fixed" as part of this conversion.
                const response = await fetch(url, requestOptions as unknown as RequestInit);

                if (!response.ok) {
                    const errorData: OpenAIErrorResponseBody = await response.json().catch(() => ({}));
                    throw new Error(`HTTP ${response.status}: ${errorData.error?.message || response.statusText}`);
                }

                return await response.json();

            } catch (error) {
                lastError = error;

                if (attempt < this.options.maxRetries) {
                    const delay = Math.pow(2, attempt) * 1000; // Exponential backoff
                    console.warn(`OpenAI API request failed (attempt ${attempt}/${this.options.maxRetries}), retrying in ${delay}ms...`);
                    await new Promise(resolve => setTimeout(resolve, delay));
                } else {
                    console.error(`OpenAI API request failed after ${this.options.maxRetries} attempts`);
                }
            }
        }

        throw lastError;
    }

    /**
     * Validate OpenAI API connectivity
     * @returns Validation result
     */
    async validateAPI(): Promise<AIValidateAPIResult> {
        try {
            // Make a simple test request to validate API key and connectivity
            const testPrompt = 'Hello';
            const requestOptions: OpenAIChatCompletionRequest = {
                model: this.model,
                max_tokens: 5,
                temperature: 0,
                messages: [{
                    role: 'user',
                    content: [{ type: 'text', text: testPrompt }]
                }]
            };

            const startTime = Date.now();
            const response = await this.makeRequest('/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestOptions)
            }) as OpenAIChatCompletionResponse;

            const responseTime = Date.now() - startTime;

            if (!response.choices || response.choices.length === 0) {
                return {
                    success: false,
                    error: 'Invalid response format from OpenAI API',
                    details: {
                        provider: 'openai',
                        model: this.model,
                        responseTime: responseTime
                    }
                };
            }

            return {
                success: true,
                message: 'OpenAI API is working correctly',
                details: {
                    provider: 'openai',
                    model: this.model,
                    responseTime: responseTime,
                    usage: response.usage || {},
                    testResponse: response.choices[0].message.content
                }
            };

        } catch (error) {
            return {
                success: false,
                error: (error as Error).message,
                details: {
                    provider: 'openai',
                    model: this.model,
                    errorType: this.getErrorType((error as Error).message)
                }
            };
        }
    }

    /**
     * Categorize error types for better user feedback
     * @private
     */
    getErrorType(errorMessage: string): string {
        if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
            return 'INVALID_API_KEY';
        } else if (errorMessage.includes('402') || errorMessage.includes('quota')) {
            return 'QUOTA_EXCEEDED';
        } else if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
            return 'RATE_LIMITED';
        } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
            return 'ACCESS_DENIED';
        } else if (errorMessage.includes('404') || errorMessage.includes('model')) {
            return 'MODEL_NOT_FOUND';
        } else if (errorMessage.includes('timeout') || errorMessage.includes('network')) {
            return 'NETWORK_ERROR';
        } else {
            return 'UNKNOWN_ERROR';
        }
    }

    getProviderName(): string {
        return 'openai';
    }
}

/**
 * AI Manager - Main interface for AI capabilities
 */
export class AIManager implements AIManagerAPI {
    envManager: EnvAPI;
    librarySetup: LibrarySetupAPI | null;
    providers: Map<string, BaseAIProvider>;
    currentProvider: string | null;
    pdfProcessor: PDFProcessor;

    constructor(envManager: EnvAPI, librarySetup: LibrarySetupAPI | null = null) {
        this.envManager = envManager;
        this.librarySetup = librarySetup;
        this.providers = new Map();
        this.currentProvider = null;
        this.pdfProcessor = new PDFProcessor(librarySetup);

        // Initialize providers based on available API keys
        this.initializeProviders();
    }

    /**
     * Initialize available providers based on environment variables
     */
    initializeProviders(): void {
        // Check for OpenAI API key
        const openaiKey = this.envManager.get('OPENAI_API_KEY');
        if (openaiKey) {
            const openaiOptions: AIProviderOptions = {
                model: this.envManager.get('OPENAI_MODEL') || 'gpt-4o-mini',
                baseUrl: this.envManager.get('OPENAI_BASE_URL'),
                maxTokens: parseInt(this.envManager.get('OPENAI_MAX_TOKENS') as string) || 4000,
                temperature: parseFloat(this.envManager.get('OPENAI_TEMPERATURE') as string) || 0.7
            };

            this.providers.set('openai', new OpenAIProvider(openaiKey, openaiOptions));

            // Set as current provider if none is set
            if (!this.currentProvider) {
                this.currentProvider = 'openai';
            }
        }

        console.log(`AIManager initialized with ${this.providers.size} provider(s)`);
    }

    /**
     * Get the current AI provider
     * @returns Current provider instance
     */
    getCurrentProvider(): AIProviderHandle | null {
        if (!this.currentProvider || !this.providers.has(this.currentProvider)) {
            return null;
        }
        return this.providers.get(this.currentProvider) as BaseAIProvider;
    }

    /**
     * Set the current AI provider
     * @param providerName - Provider name to use
     */
    setCurrentProvider(providerName: string): void {
        if (!this.providers.has(providerName)) {
            throw new Error(`Provider '${providerName}' is not available`);
        }
        this.currentProvider = providerName;
    }

    /**
     * Get list of available providers
     * @returns Array of provider names
     */
    getAvailableProviders(): string[] {
        return Array.from(this.providers.keys());
    }

    /**
     * Check if AI functionality is available
     * @returns True if at least one provider is available
     */
    isAvailable(): boolean {
        return this.providers.size > 0 && this.getCurrentProvider() !== null;
    }

    /**
     * Send a prompt to the current AI provider
     * @param prompt - Text prompt
     * @param images - Array of images (base64 or URLs)
     * @param options - Request options
     * @returns AI response
     */
    async sendPrompt(prompt: string, images: AIImageInput[] = [], options: AIPromptOptions = {}): Promise<string> {
        const provider = this.getCurrentProvider();
        if (!provider) {
            throw new Error('No AI provider is available. Please configure an API key.');
        }

        return await (provider as BaseAIProvider).sendPrompt(prompt, images, options);
    }

    /**
     * Send a prompt with PDF document to the current AI provider
     * @param prompt - Text prompt
     * @param pdfData - PDF data (File, buffer, or URL)
     * @param options - Request options
     * @returns AI response
     */
    async sendPromptWithPDF(prompt: string, pdfData: PDFInputData, options: AISendPromptWithPDFOptions = {}): Promise<string> {
        const provider = this.getCurrentProvider();
        if (!provider) {
            throw new Error('No AI provider is available. Please configure an API key.');
        }

        return await (provider as BaseAIProvider).sendPromptWithPDF(prompt, pdfData, options, this.librarySetup);
    }

    /**
     * Convert PDF to images without sending to AI
     * @param pdfData - PDF data
     * @param options - Conversion options
     * @returns Array of base64 image data URLs
     */
    async convertPDFToImages(pdfData: PDFInputData, options: PDFConversionOptions = {}): Promise<string[]> {
        if (typeof pdfData === 'string' && (pdfData.startsWith('http') || pdfData.startsWith('https'))) {
            return await this.pdfProcessor.convertPDFFromURL(pdfData, options);
        } else if (pdfData instanceof File || pdfData instanceof ArrayBuffer || pdfData instanceof Uint8Array) {
            return await this.pdfProcessor.convertPDFToImages(pdfData, options);
        } else {
            throw new Error('Invalid PDF data format. Expected File, ArrayBuffer, Uint8Array, or URL string.');
        }
    }

    /**
     * Validate current AI provider by making a test API call
     * @returns Validation result
     */
    async validateAPI(): Promise<AIValidateAPIResult> {
        const provider = this.getCurrentProvider();
        if (!provider) {
            return {
                success: false,
                error: 'No AI provider is available. Please configure an API key.',
                details: {
                    provider: 'none',
                    availableProviders: this.getAvailableProviders()
                }
            };
        }

        return await (provider as BaseAIProvider).validateAPI();
    }

    /**
     * Get provider status information
     * @returns Status information
     */
    getStatus(): AIStatus {
        return {
            available: this.isAvailable(),
            currentProvider: this.currentProvider,
            availableProviders: this.getAvailableProviders(),
            pdfSupport: {
                available: this.pdfProcessor.isPDFJSAvailable(),
                capabilities: this.pdfProcessor.getCapabilities()
            },
            providerStatus: Object.fromEntries(
                Array.from(this.providers.entries()).map(([name, provider]) => [
                    name,
                    {
                        ready: provider.isReady(),
                        name: provider.getProviderName()
                    }
                ])
            )
        };
    }

    /**
     * Refresh providers after environment changes
     */
    refresh(): void {
        this.providers.clear();
        this.currentProvider = null;
        this.initializeProviders();
    }
}

/**
 * Default export for backward compatibility
 */
export default AIManager;
