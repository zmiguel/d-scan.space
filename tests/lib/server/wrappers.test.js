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
	agentClose: vi.fn(),
	fetch: vi.fn()
}));

vi.mock('undici', () => ({
	Agent: class {
		constructor() {
			this.close = mocks.agentClose;
		}
	},
	fetch: mocks.fetch
}));

import { fetchGET, fetchPOST } from '../../../src/lib/server/wrappers.js';
import { recordEsiRequest } from '../../../src/lib/server/metrics.js';
import { biomassCharacter } from '../../../src/lib/database/characters.js';
import { withSpan } from '../../../src/lib/server/tracer.js';

describe('wrappers', () => {
	beforeEach(() => {
		vi.resetAllMocks();
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
			mocks.fetch.mockResolvedValue(mockResponse);

			const result = await fetchGET('https://esi.evetech.net/v1/characters/1/');

			expect(mocks.fetch).toHaveBeenCalledWith(
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
			mocks.fetch.mockResolvedValue(errorResponse);

			const result = await fetchGET('http://test.com', 2);
			expect(result).toBeNull();

			expect(mocks.fetch).toHaveBeenCalledTimes(2);
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
			mocks.fetch.mockResolvedValue(deletedResponse);

			await fetchGET('https://esi.evetech.net/v1/characters/123');

			expect(biomassCharacter).toHaveBeenCalledWith(123);
			expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 0 });
		});

		it('should mark deleted character with span event', async () => {
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
				url: 'https://esi.evetech.net/v1/characters/456'
			};
			mocks.fetch.mockResolvedValue(deletedResponse);

			await fetchGET('https://esi.evetech.net/v1/characters/456');

			expect(mockSpan.addEvent).toHaveBeenCalledWith(
				'Resource marked as deleted',
				expect.objectContaining({ url: 'https://esi.evetech.net/v1/characters/456' })
			);
		});

		it('should apply compatibility date when ESI_TEST_FLAGS is enabled', async () => {
			vi.resetModules();
			vi.doMock('../../../src/lib/server/constants.js', () => ({
				USER_AGENT: 'TestAgent',
				ESI_MAX_CONNECTIONS: 1,
				ESI_TEST_FLAGS: true
			}));

			const { fetchGET: fetchGETWithFlags } = await import('../../../src/lib/server/wrappers.js');

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
			mocks.fetch.mockResolvedValue(mockResponse);

			await fetchGETWithFlags('https://esi.evetech.net/v1/characters/1/');

			expect(mocks.fetch).toHaveBeenCalledWith(
				'https://esi.evetech.net/v1/characters/1/',
				expect.objectContaining({
					headers: expect.objectContaining({ 'X-Compatibility-Date': '2099-01-01' })
				})
			);
		});

		it('should handle JSON parse error by falling back to text', async () => {
			const errorResponse = {
				ok: false,
				status: 500,
				statusText: 'Error',
				headers: { entries: () => [], get: () => null },
				clone: () => ({
					json: async () => {
						throw new Error('Invalid JSON');
					},
					text: async () => 'Raw Text Error'
				}),
				url: 'http://test.com'
			};
			mocks.fetch.mockResolvedValue(errorResponse);

			const result = await fetchGET('http://test.com');
			expect(result).toBeNull();
			expect(mockSpan.addEvent).toHaveBeenCalledWith(
				'Fetch Failed',
				expect.objectContaining({ preview: 'Raw Text Error' })
			);
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
			mocks.fetch.mockResolvedValue(errorResponse);

			const result = await fetchGET('http://test.com', 1);
			expect(result).toBeNull();
			expect(mockSpan.addEvent).toHaveBeenCalledWith(
				'Fetch Failed',
				expect.objectContaining({ preview: 'null' })
			);
		});

		it('should handle network error (fetch throws) and decrement concurrency', async () => {
			mocks.fetch.mockRejectedValueOnce(new TypeError('Network Error'));
			const { esiConcurrentRequests } = await import('../../../src/lib/server/metrics.js');

			const result = await fetchGET('http://test.com', 1);
			expect(result).toBeNull();
			expect(esiConcurrentRequests.add).toHaveBeenCalledWith(-1);
		});

		it('should add GET fetch failure event details', async () => {
			mocks.fetch.mockRejectedValueOnce(new Error('Network Error'));

			const result = await fetchGET('http://test.com', 1);
			expect(result).toBeNull();

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
			mocks.fetch.mockResolvedValue(deletedResponse);

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
			mocks.fetch.mockResolvedValue(deletedResponse);

			await fetchGET('https://esi.evetech.net/v1/corporations/123');

			expect(biomassCharacter).not.toHaveBeenCalled();
		});

		it('should handle 429 rate limit and return null', async () => {
			vi.useFakeTimers();
			mocks.fetch.mockResolvedValue({
				ok: false,
				status: 429,
				statusText: 'Too Many Requests',
				headers: {
					entries: () => [],
					get: (header) => (header === 'x-esi-error-limit-reset' ? '1' : null)
				},
				clone: () => ({
					json: async () => ({ error: 'rate limited' }),
					text: async () => 'rate limited'
				}),
				url: 'http://test.com'
			});

			const promise = fetchGET('http://test.com', 1);
			await vi.advanceTimersByTimeAsync(1000);
			const result = await promise;

			expect(result).toBeNull();
			expect(mockSpan.addEvent).toHaveBeenCalledWith('ESI rate limited', { resetSeconds: 1 });
			vi.useRealTimers();
		});

		it('should use default 60s wait when x-esi-error-limit-reset header is absent', async () => {
			vi.useFakeTimers();
			mocks.fetch.mockResolvedValue({
				ok: false,
				status: 429,
				statusText: 'Too Many Requests',
				headers: {
					entries: () => [],
					get: () => null
				},
				clone: () => ({
					json: async () => ({ error: 'rate limited' }),
					text: async () => 'rate limited'
				}),
				url: 'http://test.com'
			});

			const promise = fetchGET('http://test.com', 1);
			await vi.advanceTimersByTimeAsync(60000);
			const result = await promise;

			expect(result).toBeNull();
			expect(mockSpan.addEvent).toHaveBeenCalledWith('ESI rate limited', { resetSeconds: 60 });
			vi.useRealTimers();
		});

		it('should stringify unknown GET errors', async () => {
			mocks.fetch.mockRejectedValueOnce({});

			const result = await fetchGET('http://test.com', 1);
			expect(result).toBeNull();

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
			mocks.fetch.mockResolvedValue(mockResponse);

			const body = { ids: [1, 2] };
			const result = await fetchPOST('https://esi.evetech.net/v1/universe/names/', body);

			expect(mocks.fetch).toHaveBeenCalledWith(
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
			mocks.fetch.mockResolvedValue(errorResponse);

			const result = await fetchPOST('http://test.com', {}, 2);
			expect(result).toBeNull();

			expect(mocks.fetch).toHaveBeenCalledTimes(2);
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
			mocks.fetch.mockResolvedValue(deletedResponse);

			await fetchPOST('https://esi.evetech.net/v1/characters/123', {});

			expect(biomassCharacter).toHaveBeenCalledWith(123);
			expect(mockSpan.setStatus).toHaveBeenCalledWith({ code: 0 });
		});

		it('should handle 429 rate limit and return null', async () => {
			vi.useFakeTimers();
			mocks.fetch.mockResolvedValue({
				ok: false,
				status: 429,
				statusText: 'Too Many Requests',
				headers: {
					entries: () => [],
					get: (header) => (header === 'x-esi-error-limit-reset' ? '1' : null)
				},
				clone: () => ({
					json: async () => ({ error: 'rate limited' }),
					text: async () => 'rate limited'
				}),
				url: 'http://test.com'
			});

			const promise = fetchPOST('http://test.com', {}, 1);
			await vi.advanceTimersByTimeAsync(1000);
			const result = await promise;

			expect(result).toBeNull();
			expect(mockSpan.addEvent).toHaveBeenCalledWith('ESI rate limited', { resetSeconds: 1 });
			vi.useRealTimers();
		});

		it('should use default 60s wait when x-esi-error-limit-reset header is absent', async () => {
			vi.useFakeTimers();
			mocks.fetch.mockResolvedValue({
				ok: false,
				status: 429,
				statusText: 'Too Many Requests',
				headers: {
					entries: () => [],
					get: () => null
				},
				clone: () => ({
					json: async () => ({ error: 'rate limited' }),
					text: async () => 'rate limited'
				}),
				url: 'http://test.com'
			});

			const promise = fetchPOST('http://test.com', {}, 1);
			await vi.advanceTimersByTimeAsync(60000);
			const result = await promise;

			expect(result).toBeNull();
			expect(mockSpan.addEvent).toHaveBeenCalledWith('ESI rate limited', { resetSeconds: 60 });
			vi.useRealTimers();
		});

		it('should handle deleted non-character resource without biomass', async () => {
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
			mocks.fetch.mockResolvedValue(deletedResponse);

			await fetchPOST('https://esi.evetech.net/v1/corporations/123', {});

			expect(biomassCharacter).not.toHaveBeenCalled();
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
			mocks.fetch.mockResolvedValue(errorResponse);

			const result = await fetchPOST('http://test.com', {});
			expect(result).toBeNull();
			expect(mockSpan.addEvent).toHaveBeenCalledWith(
				'Fetch Failed',
				expect.objectContaining({ preview: expect.stringContaining('…') })
			);
		});

		it('should handle JSON parse error by falling back to text', async () => {
			const errorResponse = {
				ok: false,
				status: 500,
				statusText: 'Error',
				headers: { entries: () => [], get: () => null },
				clone: () => ({
					json: async () => {
						throw new Error('Invalid JSON');
					},
					text: async () => 'Raw Text Error'
				}),
				url: 'http://test.com'
			};
			mocks.fetch.mockResolvedValue(errorResponse);

			const result = await fetchPOST('http://test.com', {});
			expect(result).toBeNull();
			expect(mockSpan.addEvent).toHaveBeenCalledWith(
				'Fetch Failed',
				expect.objectContaining({ preview: 'Raw Text Error' })
			);
		});

		it('should handle network error (fetch throws) and decrement concurrency', async () => {
			mocks.fetch.mockRejectedValueOnce(new TypeError('Network Error'));
			const { esiConcurrentRequests } = await import('../../../src/lib/server/metrics.js');

			const result = await fetchPOST('http://test.com', {}, 1);
			expect(result).toBeNull();
			expect(esiConcurrentRequests.add).toHaveBeenCalledWith(-1);
		});

		it('should handle POST network error fallback', async () => {
			const error = new Error('Network Error');
			mocks.fetch.mockRejectedValueOnce(error);
			mocks.fetch.mockRejectedValueOnce(error);
			mocks.fetch.mockRejectedValueOnce(error);

			const result = await fetchPOST('https://esi.evetech.net/v1/post', {});
			expect(result).toBeNull();

			// Verify span.addEvent fallback
			expect(mockSpan.addEvent).toHaveBeenCalledWith(
				'Fetch Failed',
				expect.objectContaining({
					error: 'Network Error'
				})
			);
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
			mocks.fetch.mockResolvedValue(mockResponse);

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
			mocks.fetch.mockResolvedValue(mockResponse);

			const result = await fetchPOST('http://test.com', {}, 1);
			expect(result).toBeNull();
		});

		it('should stringify unknown POST errors', async () => {
			mocks.fetch.mockRejectedValueOnce({});

			const result = await fetchPOST('http://test.com', {}, 1);
			expect(result).toBeNull();

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
			mocks.fetch.mockResolvedValue(mockResponse);

			await fetchPOST('http://test.com', undefined, 1);

			expect(mocks.fetch).toHaveBeenCalled();
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
			mocks.fetch.mockResolvedValueOnce({
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

			const result = await fetchGET('https://esi.evetech.net/v1/test', 1);
			expect(result).toBeNull();
			expect(mockSpan.addEvent).toHaveBeenCalledWith(
				'Fetch Failed',
				expect.objectContaining({ preview: 'null' })
			);
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
				mocks.fetch.mockResolvedValueOnce({
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
