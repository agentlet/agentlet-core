/**
 * Behaviour characterization tests for AIProvider (BaseAIProvider / OpenAIProvider).
 *
 * tests/utils/ai/AIProvider.test.js explicitly does not exercise real API
 * calls ("we don't test actual API calls here as they require real API keys
 * and network access"). That leaves the exact request payload `sendPrompt()`
 * sends to OpenAI, `makeRequest()`'s retry/error-formatting behaviour,
 * `validateAPI()`'s result shape, and `getErrorType()`'s classification
 * completely uncovered. This file mocks `fetch` (no network calls) and pins
 * down that CURRENT behaviour ahead of the file's conversion to TypeScript.
 */

import { OpenAIProvider as OpenAIProviderCtor } from '../../../src/utils/ai/AIProvider.js';
import type { AIValidateAPIResult } from '../../../src/types/public-api';

/**
 * AIProvider.js is untyped, plain JS, so `tsc` only infers a weak shape for
 * it. This local type describes the real runtime surface of `OpenAIProvider`
 * actually exercised here, including fields (`apiKey`, `model`, `options`,
 * ...) that are not part of the public `AIAPI`/`AIManagerAPI` contract.
 */
interface OpenAIProviderTestInstance {
    apiKey: string;
    baseUrl: string;
    model: string;
    maxTokens: number;
    temperature: number;
    options: { timeout: number; maxRetries: number };
    sendPrompt(prompt: string, images?: unknown[], options?: Record<string, unknown>): Promise<string>;
    makeRequest(endpoint: string, options?: RequestInit): Promise<unknown>;
    validateAPI(): Promise<AIValidateAPIResult>;
    getErrorType(errorMessage: string): string;
    getProviderName(): string;
    isReady(): boolean;
}

interface OpenAIProviderOptions {
    baseUrl?: string;
    model?: string;
    maxTokens?: number;
    temperature?: number;
    timeout?: number;
    maxRetries?: number;
}

const OpenAIProvider = OpenAIProviderCtor as unknown as new (
    apiKey: string,
    options?: OpenAIProviderOptions
) => OpenAIProviderTestInstance;

/** Builds a minimal `Response`-shaped object, exactly what `makeRequest()` reads (`ok`, `status`, `statusText`, `json()`). */
function fakeResponse(init: { ok: boolean; status?: number; statusText?: string; json: () => Promise<unknown> }): Response {
    return init as unknown as Response;
}

type FetchMock = jest.Mock<Promise<Response>, [RequestInfo | URL, RequestInit?]>;

/** Body shape `OpenAIProvider.sendPrompt()` builds and JSON-stringifies for `/chat/completions`. */
interface ChatCompletionRequestBody {
    model: string;
    max_tokens: number;
    temperature: number;
    messages: Array<{
        role: string;
        content: Array<{ type: string; text?: string; image_url?: { url: string } }>;
    }>;
}

function parseBody(fetchMock: FetchMock): ChatCompletionRequestBody {
    const [, requestInit] = fetchMock.mock.calls[0];
    return JSON.parse(requestInit?.body as string) as ChatCompletionRequestBody;
}

describe('AIProvider (OpenAIProvider) behaviour characterization', () => {
    let fetchMock: FetchMock;
    let originalSetTimeout: typeof setTimeout;

    beforeEach(() => {
        fetchMock = jest.fn();
        global.fetch = fetchMock as unknown as typeof fetch;
        originalSetTimeout = global.setTimeout;
    });

    afterEach(() => {
        global.setTimeout = originalSetTimeout;
        jest.restoreAllMocks();
    });

    describe('sendPrompt()', () => {
        test('builds the exact OpenAI chat completions request for a text-only prompt', async () => {
            fetchMock.mockResolvedValue(
                fakeResponse({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'Hello!' } }] }) })
            );

            const provider = new OpenAIProvider('sk-test');
            const reply = await provider.sendPrompt('Say hi');

            expect(reply).toBe('Hello!');
            expect(fetchMock).toHaveBeenCalledTimes(1);
            const [url, requestInit] = fetchMock.mock.calls[0];
            expect(url).toBe('https://api.openai.com/v1/chat/completions');
            expect(requestInit?.method).toBe('POST');
            expect(requestInit?.headers).toEqual({
                'Content-Type': 'application/json',
                'Authorization': 'Bearer sk-test'
            });

            const body = parseBody(fetchMock);
            expect(body).toEqual({
                model: 'gpt-4o-mini',
                max_tokens: 4000,
                temperature: 0.7,
                messages: [
                    {
                        role: 'user',
                        content: [{ type: 'text', text: 'Say hi' }]
                    }
                ]
            });
        });

        test('builds image content parts for data/http/bare-base64 strings and skips non-string entries', async () => {
            fetchMock.mockResolvedValue(
                fakeResponse({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }) })
            );

            const provider = new OpenAIProvider('sk-test');
            await provider.sendPrompt('Describe these', [
                'data:image/png;base64,AAA',
                'https://example.com/photo.jpg',
                'rawBase64Data',
                // A non-string image entry is silently skipped by sendPrompt's `typeof image === 'string'` guard.
                { not: 'a string' } as unknown as string
            ]);

            const body = parseBody(fetchMock);
            expect(body.messages[0].content).toEqual([
                { type: 'text', text: 'Describe these' },
                { type: 'image_url', image_url: { url: 'data:image/png;base64,AAA' } },
                { type: 'image_url', image_url: { url: 'https://example.com/photo.jpg' } },
                { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,rawBase64Data' } }
            ]);
        });

        test('lets per-call options override model/maxTokens/temperature, including temperature: 0', async () => {
            fetchMock.mockResolvedValue(
                fakeResponse({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'ok' } }] }) })
            );

            const provider = new OpenAIProvider('sk-test', { model: 'gpt-4', maxTokens: 4000, temperature: 0.7 });
            // temperature: 0 exercises the `options.temperature ?? this.temperature` nullish-coalescing quirk:
            // 0 is falsy but not nullish, so it must survive instead of falling back to the provider default.
            await provider.sendPrompt('Say hi', [], { model: 'gpt-4-turbo', maxTokens: 10, temperature: 0 });

            const body = parseBody(fetchMock);
            expect(body.model).toBe('gpt-4-turbo');
            expect(body.max_tokens).toBe(10);
            expect(body.temperature).toBe(0);
        });
    });

    describe('makeRequest()', () => {
        test('retries with exponential backoff and returns the eventual successful response', async () => {
            let attempts = 0;
            fetchMock.mockImplementation(() => {
                attempts += 1;
                if (attempts < 3) {
                    return Promise.resolve(fakeResponse({ ok: false, status: 500, statusText: 'Server Error', json: () => Promise.resolve({}) }));
                }
                return Promise.resolve(fakeResponse({ ok: true, json: () => Promise.resolve({ choices: [{ message: { content: 'recovered' } }] }) }));
            });
            // Drive the exponential-backoff delay synchronously instead of waiting 2s + 4s of real time.
            global.setTimeout = ((callback: () => void) => {
                callback();
                return 0 as unknown as ReturnType<typeof setTimeout>;
            }) as typeof setTimeout;

            const provider = new OpenAIProvider('sk-test', { maxRetries: 3 });
            const reply = await provider.sendPrompt('retry me');

            expect(reply).toBe('recovered');
            expect(attempts).toBe(3);
        });

        test('throws the last error, using the API error envelope message, once retries are exhausted', async () => {
            fetchMock.mockResolvedValue(
                fakeResponse({ ok: false, status: 401, statusText: 'Unauthorized', json: () => Promise.resolve({ error: { message: 'Invalid API key provided' } }) })
            );

            const provider = new OpenAIProvider('sk-bad', { maxRetries: 1 });
            await expect(provider.sendPrompt('hi')).rejects.toThrow(
                'OpenAI API request failed: HTTP 401: Invalid API key provided'
            );
            expect(fetchMock).toHaveBeenCalledTimes(1);
        });

        test('falls back to response.statusText when the error body has no error.message', async () => {
            fetchMock.mockResolvedValue(
                fakeResponse({ ok: false, status: 500, statusText: 'Internal Server Error', json: () => Promise.resolve({}) })
            );

            const provider = new OpenAIProvider('sk-test', { maxRetries: 1 });
            await expect(provider.sendPrompt('hi')).rejects.toThrow(
                'OpenAI API request failed: HTTP 500: Internal Server Error'
            );
        });
    });

    describe('validateAPI()', () => {
        test('returns a detailed success shape on a successful test call', async () => {
            fetchMock.mockResolvedValue(
                fakeResponse({
                    ok: true,
                    json: () => Promise.resolve({ choices: [{ message: { content: 'Hello!' } }], usage: { total_tokens: 7 } })
                })
            );

            const provider = new OpenAIProvider('sk-test', { model: 'gpt-4o-mini' });
            const result = await provider.validateAPI();

            expect(result).toEqual({
                success: true,
                message: 'OpenAI API is working correctly',
                details: {
                    provider: 'openai',
                    model: 'gpt-4o-mini',
                    responseTime: expect.any(Number),
                    usage: { total_tokens: 7 },
                    testResponse: 'Hello!'
                }
            });
        });

        test('returns a detailed failure shape with a classified errorType on failure', async () => {
            fetchMock.mockResolvedValue(
                fakeResponse({ ok: false, status: 429, statusText: 'Too Many Requests', json: () => Promise.resolve({ error: { message: 'rate limit exceeded' } }) })
            );

            const provider = new OpenAIProvider('sk-test', { maxRetries: 1 });
            const result = await provider.validateAPI();

            expect(result).toEqual({
                success: false,
                error: 'HTTP 429: rate limit exceeded',
                details: {
                    provider: 'openai',
                    model: 'gpt-4o-mini',
                    errorType: 'RATE_LIMITED'
                }
            });
        });
    });

    describe('getErrorType()', () => {
        test('classifies known HTTP/network error substrings and defaults to UNKNOWN_ERROR', () => {
            const provider = new OpenAIProvider('sk-test');

            expect(provider.getErrorType('HTTP 401: Unauthorized')).toBe('INVALID_API_KEY');
            expect(provider.getErrorType('HTTP 402: quota exceeded')).toBe('QUOTA_EXCEEDED');
            expect(provider.getErrorType('HTTP 429: rate limit hit')).toBe('RATE_LIMITED');
            expect(provider.getErrorType('HTTP 403: Forbidden')).toBe('ACCESS_DENIED');
            expect(provider.getErrorType('HTTP 404: model not found')).toBe('MODEL_NOT_FOUND');
            expect(provider.getErrorType('network timeout while connecting')).toBe('NETWORK_ERROR');
            expect(provider.getErrorType('something unexpected happened')).toBe('UNKNOWN_ERROR');
        });
    });
});
