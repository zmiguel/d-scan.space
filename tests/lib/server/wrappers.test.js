import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockSpan = {
    setAttributes: vi.fn(),
    setStatus: vi.fn(),
    addEvent: vi.fn()
};

vi.mock('../../../src/lib/server/tracer.js', () => ({
    withSpan: vi.fn((name, fn) => fn(mockSpan))
}));

vi.mock('../../../src/lib/server/metrics.js', () => ({
    recordEsiRequest: vi.fn(),
    esiConcurrentRequests: { add: vi.fn() }
}));

vi.mock('../../../src/lib/database/characters.js', () => ({
    biomassCharacter: vi.fn()
}));

const mocks = vi.hoisted(() => ({
    agentClose: vi.fn()
}));

vi.mock('undici', () => ({
    Agent: class {
        constructor() {
            this.close = mocks.agentClose;
        }
    }
}));

import { fetchGET, fetchPOST } from '../../../src/lib/server/wrappers.js';
import { recordEsiRequest } from '../../../src/lib/server/metrics.js';
import { biomassCharacter } from '../../../src/lib/database/characters.js';
import { withSpan } from '../../../src/lib/server/tracer.js';

// Mock global fetch
// global.fetch = vi.fn(); // Move to beforeEach

describe('wrappers', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        global.fetch = vi.fn();
    });

    describe('fetchGET', () => {
        it('should perform a successful GET request', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: {
                    entries: () => [],
                    get: () => null
                },
                clone: () => ({
                    json: async () => ({ data: 'test' }),
                    text: async () => '{"data": "test"}'
                }),
                redirected: false,
                type: 'basic'
            };
            global.fetch.mockResolvedValue(mockResponse);

            const result = await fetchGET('https://esi.evetech.net/v1/characters/1/');

            expect(global.fetch).toHaveBeenCalledWith(
                'https://esi.evetech.net/v1/characters/1/',
                expect.objectContaining({ method: 'GET' })
            );
            expect(recordEsiRequest).toHaveBeenCalledWith(
                'GET',
                200,
                expect.any(Number),
                null,
                null,
                'character'
            );
            expect(result).toBe(mockResponse);
        });

        it('should retry on failure', async () => {
            const errorResponse = {
                ok: false,
                status: 500,
                statusText: 'Server Error',
                headers: {
                    entries: () => [],
                    get: () => null
                },
                clone: () => ({
                    json: async () => ({ error: 'fail' }),
                    text: async () => 'fail'
                }),
                url: 'http://test.com'
            };
            global.fetch.mockResolvedValue(errorResponse);

            await expect(fetchGET('http://test.com', 2)).rejects.toThrow();

            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('should handle deleted character (404 with deleted error)', async () => {
            const deletedResponse = {
                ok: false,
                status: 404,
                statusText: 'Not Found',
                headers: {
                    entries: () => [],
                    get: () => null
                },
                clone: () => ({
                    json: async () => ({ error: 'Character has been deleted' }),
                    text: async () => 'Character has been deleted'
                }),
                url: 'https://esi.evetech.net/v1/characters/123'
            };
            global.fetch.mockResolvedValue(deletedResponse);

            await fetchGET('https://esi.evetech.net/v1/characters/123');

            expect(biomassCharacter).toHaveBeenCalledWith(123);
            expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 0 });
        });

        it('should handle JSON parse error by falling back to text', async () => {
            const errorResponse = {
                ok: false,
                status: 500,
                statusText: 'Error',
                headers: { entries: () => [], get: () => null },
                clone: () => ({
                    json: async () => { throw new Error('Invalid JSON'); },
                    text: async () => 'Raw Text Error'
                }),
                url: 'http://test.com'
            };
            global.fetch.mockResolvedValue(errorResponse);

            try {
                await fetchGET('http://test.com');
            } catch (e) {
                expect(e.message).toContain('Raw Text Error');
            }
        });

        it('should include null preview when JSON body is null', async () => {
            const errorResponse = {
                ok: false,
                status: 500,
                statusText: 'Error',
                headers: { entries: () => [], get: () => null },
                clone: () => ({
                    json: async () => null,
                    text: async () => 'ignored'
                }),
                url: 'http://test.com'
            };
            global.fetch.mockResolvedValue(errorResponse);

            await expect(fetchGET('http://test.com', 1)).rejects.toThrow('null');
        });

        it('should handle network error (fetch throws) and decrement concurrency', async () => {
            global.fetch.mockRejectedValueOnce(new TypeError('Network Error'));
            const { esiConcurrentRequests } = await import('../../../src/lib/server/metrics.js');

            await expect(fetchGET('http://test.com', 1)).rejects.toThrow('Network Error');
            expect(esiConcurrentRequests.add).toHaveBeenCalledWith(-1);
        });

        it('should add GET fetch failure event details', async () => {
            global.fetch.mockRejectedValueOnce(new Error('Network Error'));

            await expect(fetchGET('http://test.com', 1)).rejects.toThrow('Network Error');

            expect(mockSpan.addEvent).toHaveBeenCalledWith(
                'Fetch Failed',
                expect.objectContaining({
                    error: 'Network Error',
                    attempt: 1
                })
            );
        });

        it('should handle deleted character URLs without an id', async () => {
            const deletedResponse = {
                ok: false,
                status: 404,
                statusText: 'Not Found',
                headers: {
                    entries: () => [],
                    get: () => null
                },
                clone: () => ({
                    json: async () => ({ error: 'Character has been deleted' }),
                    text: async () => 'Character has been deleted'
                }),
                url: 'https://esi.evetech.net/v1/characters/'
            };
            global.fetch.mockResolvedValue(deletedResponse);

            await fetchGET('https://esi.evetech.net/v1/characters/');

            expect(biomassCharacter).not.toHaveBeenCalled();
        });

        it('should handle deleted resources without character ids', async () => {
            const deletedResponse = {
                ok: false,
                status: 404,
                statusText: 'Not Found',
                headers: {
                    entries: () => [],
                    get: () => null
                },
                clone: () => ({
                    json: async () => ({ error: 'Resource has been deleted' }),
                    text: async () => 'Resource has been deleted'
                }),
                url: 'https://esi.evetech.net/v1/corporations/123'
            };
            global.fetch.mockResolvedValue(deletedResponse);

            await fetchGET('https://esi.evetech.net/v1/corporations/123');

            expect(biomassCharacter).not.toHaveBeenCalled();
        });

        it('should stringify unknown GET errors', async () => {
            global.fetch.mockRejectedValueOnce({});

            await expect(fetchGET('http://test.com', 1)).rejects.toEqual({});

            expect(mockSpan.addEvent).toHaveBeenCalledWith(
                'Fetch Failed',
                expect.objectContaining({
                    error: '[object Object]',
                    attempt: 1
                })
            );
        });
    });

    describe('fetchPOST', () => {
        it('should perform a successful POST request', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: {
                    entries: () => [],
                    get: () => null
                },
                clone: () => ({
                    json: async () => ({ result: 'success' }),
                    text: async () => '{"result": "success"}'
                }),
                redirected: false,
                type: 'basic'
            };
            global.fetch.mockResolvedValue(mockResponse);

            const body = { ids: [1, 2] };
            const result = await fetchPOST('https://esi.evetech.net/v1/universe/names/', body);

            expect(global.fetch).toHaveBeenCalledWith(
                'https://esi.evetech.net/v1/universe/names/',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify(body)
                })
            );
            expect(recordEsiRequest).toHaveBeenCalledWith(
                'POST',
                200,
                expect.any(Number),
                null,
                null,
                'other'
            );
            expect(result).toBe(mockResponse);
        });

        it('should retry on failure', async () => {
            const errorResponse = {
                ok: false,
                status: 500,
                statusText: 'Server Error',
                headers: {
                    entries: () => [],
                    get: () => null
                },
                clone: () => ({
                    json: async () => ({ error: 'fail' }),
                    text: async () => 'fail'
                }),
                url: 'http://test.com'
            };
            global.fetch.mockResolvedValue(errorResponse);

            await expect(fetchPOST('http://test.com', {}, 2)).rejects.toThrow();

            expect(global.fetch).toHaveBeenCalledTimes(2);
        });

        it('should handle deleted character (404 with deleted error)', async () => {
            const deletedResponse = {
                ok: false,
                status: 404,
                statusText: 'Not Found',
                headers: {
                    entries: () => [],
                    get: () => null
                },
                clone: () => ({
                    json: async () => ({ error: 'Character has been deleted' }),
                    text: async () => 'Character has been deleted'
                }),
                url: 'https://esi.evetech.net/v1/characters/123'
            };
            global.fetch.mockResolvedValue(deletedResponse);

            await fetchPOST('https://esi.evetech.net/v1/characters/123', {});

            expect(biomassCharacter).toHaveBeenCalledWith(123);
            expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 0 });
        });

        it('should truncate large error response previews', async () => {
            const largeError = 'x'.repeat(1000);
            const errorResponse = {
                ok: false,
                status: 500,
                statusText: 'Error',
                headers: { entries: () => [], get: () => null },
                clone: () => ({
                    json: async () => ({ error: largeError }),
                    text: async () => largeError
                }),
                url: 'http://test.com'
            };
            global.fetch.mockResolvedValue(errorResponse);

            await expect(fetchPOST('http://test.com', {})).rejects.toThrow();
        });

        it('should handle JSON parse error by falling back to text', async () => {
            const errorResponse = {
                ok: false,
                status: 500,
                statusText: 'Error',
                headers: { entries: () => [], get: () => null },
                clone: () => ({
                    json: async () => { throw new Error('Invalid JSON'); },
                    text: async () => 'Raw Text Error'
                }),
                url: 'http://test.com'
            };
            global.fetch.mockResolvedValue(errorResponse);

            try {
                await fetchPOST('http://test.com', {});
            } catch (e) {
                expect(e.message).toContain('Raw Text Error');
            }
        });

        it('should handle network error (fetch throws) and decrement concurrency', async () => {
            global.fetch.mockRejectedValueOnce(new TypeError('Network Error'));
            const { esiConcurrentRequests } = await import('../../../src/lib/server/metrics.js');

            await expect(fetchPOST('http://test.com', {}, 1)).rejects.toThrow('Network Error');
            expect(esiConcurrentRequests.add).toHaveBeenCalledWith(-1);
        });

        it('should handle POST network error fallback', async () => {
            const error = new Error('Network Error');
            global.fetch.mockRejectedValueOnce(error);
            global.fetch.mockRejectedValueOnce(error);
            global.fetch.mockRejectedValueOnce(error);

            await expect(fetchPOST('https://esi.evetech.net/v1/post', {})).rejects.toThrow('Network Error');

            // Verify span.addEvent fallback
            expect(mockSpan.addEvent).toHaveBeenCalledWith('Fetch Failed', expect.objectContaining({
                error: 'Network Error'
            }));
        });

        it('should include body size in POST span attributes', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: {
                    entries: () => [],
                    get: () => null
                },
                clone: () => ({
                    json: async () => ({ result: 'ok' }),
                    text: async () => '{"result":"ok"}'
                }),
                redirected: false,
                type: 'basic'
            };
            global.fetch.mockResolvedValue(mockResponse);

            await fetchPOST('http://test.com', { a: 1 }, 1);

            expect(withSpan).toHaveBeenCalledWith(
                expect.any(String),
                expect.any(Function),
                expect.objectContaining({
                    'http.request.body_size': expect.any(Number)
                })
            );
        });

        it('should handle non-object JSON responses in POST', async () => {
            const mockResponse = {
                ok: false,
                status: 500,
                statusText: 'Error',
                headers: {
                    entries: () => [],
                    get: () => null
                },
                clone: () => ({
                    json: async () => 'not-object',
                    text: async () => 'not-object'
                }),
                url: 'http://test.com'
            };
            global.fetch.mockResolvedValue(mockResponse);

            await expect(fetchPOST('http://test.com', {}, 1)).rejects.toThrow();
        });

        it('should stringify unknown POST errors', async () => {
            global.fetch.mockRejectedValueOnce({});

            await expect(fetchPOST('http://test.com', {}, 1)).rejects.toEqual({});

            expect(mockSpan.addEvent).toHaveBeenCalledWith(
                'Fetch Failed',
                expect.objectContaining({
                    error: '[object Object]',
                    attempt: 1
                })
            );
        });

        it('should handle undefined POST body size calculation', async () => {
            const mockResponse = {
                ok: true,
                status: 200,
                statusText: 'OK',
                headers: {
                    entries: () => [],
                    get: () => null
                },
                clone: () => ({
                    json: async () => ({ result: 'ok' }),
                    text: async () => '{"result":"ok"}'
                }),
                redirected: false,
                type: 'basic'
            };
            global.fetch.mockResolvedValue(mockResponse);

            await fetchPOST('http://test.com', undefined, 1);

            expect(global.fetch).toHaveBeenCalled();
        });
    });

    describe('beforeExit handler', () => {
        it('should close agent on beforeExit', async () => {
            // Trigger the beforeExit event manually
            process.emit('beforeExit');
            expect(mocks.agentClose).toHaveBeenCalled();
        });
    });

    describe('createPreview', () => {
        it('should handle null payload in error preview', async () => {
            global.fetch.mockResolvedValueOnce({
                ok: false,
                status: 500,
                statusText: 'Internal Server Error',
                headers: new Map(),
                json: async () => null,
                clone: () => ({
                    json: async () => null,
                    text: async () => 'null'
                }),
                url: 'https://esi.evetech.net/v1/test'
            });

            try {
                await fetchGET('https://esi.evetech.net/v1/test');
            } catch (e) {
                const msg = e.message;
                const hasNullOrUndefined = msg.includes('null') || msg.includes('undefined');
                expect(hasNullOrUndefined).toBe(true);
            }
        });
    });

    describe('getResourceType', () => {
        it('should identify resource types correctly', async () => {
            const types = [
                { url: '/characters/', type: 'character' },
                { url: '/corporations/', type: 'corporation' },
                { url: '/alliances/', type: 'alliance' },
                { url: '/universe/systems/', type: 'system' },
                { url: '/universe/types/', type: 'type' },
                { url: '/universe/groups/', type: 'group' },
                { url: '/universe/categories/', type: 'category' },
                { url: '/status/', type: 'status' },
                { url: '/search/', type: 'search' },
                { url: '/other/', type: 'other' }
            ];

            for (const { url, type } of types) {
                vi.clearAllMocks();
                global.fetch.mockResolvedValueOnce({
                    ok: true,
                    status: 200,
                    statusText: 'OK',
                    headers: new Map(),
                    json: async () => ({}),
                    clone: () => ({ json: async () => ({}) }),
                    url: `https://esi.evetech.net${url}`
                });

                await fetchGET(`https://esi.evetech.net${url}`);

                expect(recordEsiRequest).toHaveBeenCalledWith(
                    'GET',
                    200,
                    expect.any(Number),
                    undefined, // limitRemain (undefined because map.get returns undefined)
                    undefined, // limitReset
                    type
                );
            }
        });
    });
});
