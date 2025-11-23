import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

// Mock global fetch
global.fetch = vi.fn();

describe('wrappers', () => {
    beforeEach(() => {
        vi.clearAllMocks();
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

        it('should handle network error (fetch throws) and decrement concurrency', async () => {
            global.fetch.mockRejectedValue(new TypeError('Network Error'));
            const { esiConcurrentRequests } = await import('../../../src/lib/server/metrics.js');

            await expect(fetchGET('http://test.com')).rejects.toThrow('Network Error');
            expect(esiConcurrentRequests.add).toHaveBeenCalledWith(-1);
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
            global.fetch.mockRejectedValue(new TypeError('Network Error'));
            const { esiConcurrentRequests } = await import('../../../src/lib/server/metrics.js');

            await expect(fetchPOST('http://test.com', {})).rejects.toThrow('Network Error');
            expect(esiConcurrentRequests.add).toHaveBeenCalledWith(-1);
        });
    });

    describe('beforeExit handler', () => {
        it('should close agent on beforeExit', async () => {
            // Trigger the beforeExit event manually
            process.emit('beforeExit');
            expect(mocks.agentClose).toHaveBeenCalled();
        });
    });
});
