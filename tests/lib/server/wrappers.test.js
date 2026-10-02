import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	fetch: vi.fn(),
	span: {
		setAttributes: () => {},
		setStatus: () => {},
		addEvent: () => {}
	}
}));

vi.mock('../../../src/lib/server/tracer.js', () => ({
	withSpan: (name, fn, attributes) => {
		mocks.spanStartAttributes = attributes;
		return fn(mocks.span);
	}
}));

vi.mock('../../../src/lib/server/metrics.js', () => ({
	recordEsiRequest: () => {},
	esiConcurrentRequests: { add: () => {} }
}));

vi.mock('../../../src/lib/logger.js', () => ({
	default: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} }
}));

vi.mock('undici', () => ({
	Agent: class {
		close() {}
	},
	fetch: mocks.fetch
}));

import {
	fetchGET,
	fetchPOST,
	parseRateLimit,
	_resetEsiPauses
} from '../../../src/lib/server/wrappers.js';
import { ESI_MAX_CONCURRENCY } from '../../../src/lib/server/constants.js';

const CHAR_URL = 'https://esi.evetech.net/characters/1';
const OTHER_CHAR_URL = 'https://esi.evetech.net/characters/2';
const ALLIANCE_URL = 'https://esi.evetech.net/alliances/99';
const NON_ESI_URL = 'https://developers.eveonline.com/static-data/tranquility/latest.jsonl';

/** @param {number} status @param {Record<string, string>} [headers] */
const respond = (status, headers = {}) =>
	new Response(status === 204 ? null : JSON.stringify({ status }), { status, headers });

/** Lets queued promise continuations run without advancing the clock. */
async function flush() {
	for (let i = 0; i < 20; i++) await Promise.resolve();
}

/** Number of fetch calls made for `url`. */
const callsFor = (url) => mocks.fetch.mock.calls.filter(([u]) => u === url).length;

describe('wrappers (ESI client)', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		mocks.fetch.mockReset();
		_resetEsiPauses();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	describe('responses and retries', () => {
		it('returns the response for a successful request after one call', async () => {
			const response = respond(200);
			mocks.fetch.mockResolvedValueOnce(response);

			await expect(fetchGET(CHAR_URL)).resolves.toBe(response);
			expect(mocks.fetch).toHaveBeenCalledTimes(1);
		});

		it.each([400, 403, 404, 422])(
			'returns a %i response immediately without retrying and with the body unread',
			async (status) => {
				const response = respond(status);
				mocks.fetch.mockResolvedValue(response);

				const result = await fetchGET(CHAR_URL);

				expect(result).toBe(response);
				expect(result.bodyUsed).toBe(false);
				await expect(result.json()).resolves.toEqual({ status });
				expect(mocks.fetch).toHaveBeenCalledTimes(1);
			}
		);

		it.each([500, 502, 503, 504])(
			'retries a %i with exponential backoff and returns the later success',
			async (status) => {
				const success = respond(200);
				mocks.fetch
					.mockResolvedValueOnce(respond(status))
					.mockResolvedValueOnce(respond(status))
					.mockResolvedValueOnce(success);

				const promise = fetchGET(CHAR_URL);
				await flush();
				expect(mocks.fetch).toHaveBeenCalledTimes(1);

				await vi.advanceTimersByTimeAsync(499);
				expect(mocks.fetch).toHaveBeenCalledTimes(1);
				await vi.advanceTimersByTimeAsync(1);
				expect(mocks.fetch).toHaveBeenCalledTimes(2);

				// second backoff is 1s
				await vi.advanceTimersByTimeAsync(999);
				expect(mocks.fetch).toHaveBeenCalledTimes(2);
				await vi.advanceTimersByTimeAsync(1);

				await expect(promise).resolves.toBe(success);
				expect(mocks.fetch).toHaveBeenCalledTimes(3);
			}
		);

		it('returns null after all attempts hit server errors', async () => {
			mocks.fetch.mockImplementation(async () => respond(503));

			const promise = fetchGET(CHAR_URL);
			await vi.advanceTimersByTimeAsync(5_000);

			await expect(promise).resolves.toBeNull();
			expect(mocks.fetch).toHaveBeenCalledTimes(3);
		});

		it('honours a custom maxAttempts', async () => {
			mocks.fetch.mockImplementation(async () => respond(500));

			const promise = fetchPOST(CHAR_URL, [1], 1);
			await vi.advanceTimersByTimeAsync(5_000);

			await expect(promise).resolves.toBeNull();
			expect(mocks.fetch).toHaveBeenCalledTimes(1);
		});

		it('retries network errors and returns null when they persist', async () => {
			mocks.fetch.mockRejectedValue(new Error('ECONNRESET'));

			const promise = fetchGET(CHAR_URL);
			await vi.advanceTimersByTimeAsync(5_000);

			await expect(promise).resolves.toBeNull();
			expect(mocks.fetch).toHaveBeenCalledTimes(3);
		});

		it('recovers when a network error is followed by a success', async () => {
			const success = respond(200);
			mocks.fetch.mockRejectedValueOnce(new Error('timeout')).mockResolvedValueOnce(success);

			const promise = fetchGET(CHAR_URL);
			await vi.advanceTimersByTimeAsync(500);

			await expect(promise).resolves.toBe(success);
		});

		it('sends POST bodies as JSON', async () => {
			mocks.fetch.mockResolvedValueOnce(respond(200));

			await fetchPOST('https://esi.evetech.net/universe/ids', ['Char One', 'Char Two']);

			const [, init] = mocks.fetch.mock.calls[0];
			expect(init.method).toBe('POST');
			expect(JSON.parse(init.body)).toEqual(['Char One', 'Char Two']);
		});
	});

	describe('error limit', () => {
		it('pauses every ESI request until the reset after a 420, then retries', async () => {
			const success = respond(200);
			mocks.fetch
				.mockResolvedValueOnce(respond(420, { 'x-esi-error-limit-reset': '10' }))
				.mockResolvedValue(success);

			const first = fetchGET(CHAR_URL);
			await flush();
			const other = fetchGET(ALLIANCE_URL);
			await flush();
			expect(mocks.fetch).toHaveBeenCalledTimes(1);

			// pause = reset + 1s
			await vi.advanceTimersByTimeAsync(10_999);
			expect(mocks.fetch).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);

			await expect(first).resolves.toBe(success);
			await expect(other).resolves.toBe(success);
			expect(callsFor(CHAR_URL)).toBe(2);
			expect(callsFor(ALLIANCE_URL)).toBe(1);
		});

		it('pauses all ESI requests once error-limit-remain reaches the threshold', async () => {
			const lowBudget = respond(200, {
				'x-esi-error-limit-remain': '10',
				'x-esi-error-limit-reset': '5'
			});
			mocks.fetch.mockResolvedValueOnce(lowBudget).mockResolvedValue(respond(200));

			// the response that reports the low budget is still returned
			await expect(fetchGET(CHAR_URL)).resolves.toBe(lowBudget);

			const next = fetchGET(ALLIANCE_URL);
			await vi.advanceTimersByTimeAsync(5_999);
			expect(callsFor(ALLIANCE_URL)).toBe(0);
			await vi.advanceTimersByTimeAsync(1);
			await next;
			expect(callsFor(ALLIANCE_URL)).toBe(1);
		});

		it('does not pause while error-limit-remain is above the threshold', async () => {
			mocks.fetch
				.mockResolvedValueOnce(
					respond(200, { 'x-esi-error-limit-remain': '11', 'x-esi-error-limit-reset': '5' })
				)
				.mockResolvedValue(respond(200));

			await fetchGET(CHAR_URL);
			await fetchGET(ALLIANCE_URL);

			expect(callsFor(ALLIANCE_URL)).toBe(1);
		});
	});

	describe('rate limit groups', () => {
		it('pauses the group for Retry-After on 429 and then retries', async () => {
			const success = respond(200);
			mocks.fetch
				.mockResolvedValueOnce(respond(429, { 'retry-after': '2' }))
				.mockResolvedValue(success);

			const promise = fetchGET(CHAR_URL);
			await vi.advanceTimersByTimeAsync(1_999);
			expect(mocks.fetch).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);

			await expect(promise).resolves.toBe(success);
			expect(mocks.fetch).toHaveBeenCalledTimes(2);
		});

		it('pauses only the rate-limited group on 429, not other groups', async () => {
			mocks.fetch
				.mockResolvedValueOnce(respond(429, { 'retry-after': '3' }))
				.mockResolvedValue(respond(200));

			const limited = fetchGET(CHAR_URL);
			await flush();

			// other resource group proceeds right away
			await fetchGET(ALLIANCE_URL);
			expect(callsFor(ALLIANCE_URL)).toBe(1);

			// same group (character) waits for the pause
			const sameGroup = fetchGET(OTHER_CHAR_URL);
			await flush();
			expect(callsFor(OTHER_CHAR_URL)).toBe(0);

			await vi.advanceTimersByTimeAsync(3_000);
			await Promise.all([limited, sameGroup]);
			expect(callsFor(OTHER_CHAR_URL)).toBe(1);
			expect(callsFor(CHAR_URL)).toBe(2);
		});

		it('waits 5 seconds on a 429 without Retry-After', async () => {
			mocks.fetch.mockResolvedValueOnce(respond(429)).mockResolvedValue(respond(200));

			const promise = fetchGET(CHAR_URL);
			await vi.advanceTimersByTimeAsync(4_999);
			expect(mocks.fetch).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			await promise;
			expect(mocks.fetch).toHaveBeenCalledTimes(2);
		});

		it('caps pauses at 60 seconds', async () => {
			mocks.fetch
				.mockResolvedValueOnce(respond(429, { 'retry-after': '3600' }))
				.mockResolvedValue(respond(200));

			const promise = fetchGET(CHAR_URL);
			await vi.advanceTimersByTimeAsync(59_999);
			expect(mocks.fetch).toHaveBeenCalledTimes(1);
			await vi.advanceTimersByTimeAsync(1);
			await promise;
			expect(mocks.fetch).toHaveBeenCalledTimes(2);
		});

		it('gives up with null when every attempt is rate limited', async () => {
			mocks.fetch.mockImplementation(async () => respond(429, { 'retry-after': '1' }));

			const promise = fetchGET(CHAR_URL);
			await vi.advanceTimersByTimeAsync(10_000);

			await expect(promise).resolves.toBeNull();
			expect(mocks.fetch).toHaveBeenCalledTimes(3);
		});

		it('slows a group down when its bucket reaches the low watermark', async () => {
			// 600 tokens per minute → 100ms per token → 10 tokens = 1s pause
			mocks.fetch
				.mockResolvedValueOnce(
					respond(200, { 'x-ratelimit-remaining': '10', 'x-ratelimit-limit': '600/1m' })
				)
				.mockResolvedValue(respond(200));

			await fetchGET(CHAR_URL);

			await fetchGET(ALLIANCE_URL);
			expect(callsFor(ALLIANCE_URL)).toBe(1);

			const sameGroup = fetchGET(OTHER_CHAR_URL);
			await vi.advanceTimersByTimeAsync(999);
			expect(callsFor(OTHER_CHAR_URL)).toBe(0);
			await vi.advanceTimersByTimeAsync(1);
			await sameGroup;
			expect(callsFor(OTHER_CHAR_URL)).toBe(1);
		});

		it('holds new requests of a resource back on a 429 for its announced group', async () => {
			const CORP_URL = 'https://esi.evetech.net/corporations/98000001';
			mocks.fetch
				.mockResolvedValueOnce(
					respond(429, { 'retry-after': '3', 'x-ratelimit-group': 'char-detail' })
				)
				.mockResolvedValue(respond(200));

			const limited = fetchGET(CHAR_URL);
			await flush();

			await fetchGET(CORP_URL);
			expect(callsFor(CORP_URL)).toBe(1);

			const fresh = fetchGET(OTHER_CHAR_URL);
			await vi.advanceTimersByTimeAsync(2_999);
			expect(callsFor(OTHER_CHAR_URL)).toBe(0);
			await vi.advanceTimersByTimeAsync(1);
			await Promise.all([limited, fresh]);
			expect(callsFor(OTHER_CHAR_URL)).toBe(1);
		});

		it('delays the next request of a resource when its announced group bucket is low', async () => {
			mocks.fetch
				.mockResolvedValueOnce(
					respond(200, {
						'x-ratelimit-group': 'char-detail',
						'x-ratelimit-remaining': '10',
						'x-ratelimit-limit': '600/1m'
					})
				)
				.mockResolvedValue(respond(200));

			await fetchGET(CHAR_URL);

			await fetchGET(ALLIANCE_URL);
			expect(callsFor(ALLIANCE_URL)).toBe(1);

			const next = fetchGET(OTHER_CHAR_URL);
			await vi.advanceTimersByTimeAsync(999);
			expect(callsFor(OTHER_CHAR_URL)).toBe(0);
			await vi.advanceTimersByTimeAsync(1);
			await next;
			expect(callsFor(OTHER_CHAR_URL)).toBe(1);
		});

		it('does not slow down while the bucket is above the low watermark', async () => {
			mocks.fetch
				.mockResolvedValueOnce(
					respond(200, { 'x-ratelimit-remaining': '11', 'x-ratelimit-limit': '600/1m' })
				)
				.mockResolvedValue(respond(200));

			await fetchGET(CHAR_URL);
			await fetchGET(OTHER_CHAR_URL);

			expect(callsFor(OTHER_CHAR_URL)).toBe(1);
		});
	});

	describe('non-ESI URLs', () => {
		it('are not held back by an active ESI pause', async () => {
			mocks.fetch
				.mockResolvedValueOnce(
					respond(200, { 'x-esi-error-limit-remain': '0', 'x-esi-error-limit-reset': '30' })
				)
				.mockResolvedValue(respond(200));

			await fetchGET(CHAR_URL);
			await fetchGET(NON_ESI_URL);

			expect(callsFor(NON_ESI_URL)).toBe(1);
		});

		it('do not wait for Retry-After when they answer 429', async () => {
			const success = respond(200);
			mocks.fetch
				.mockResolvedValueOnce(respond(429, { 'retry-after': '30' }))
				.mockResolvedValue(success);

			await expect(fetchGET(NON_ESI_URL)).resolves.toBe(success);
			expect(mocks.fetch).toHaveBeenCalledTimes(2);
		});

		it('do not pause ESI requests through their headers', async () => {
			mocks.fetch
				.mockResolvedValueOnce(
					respond(200, { 'x-esi-error-limit-remain': '0', 'x-esi-error-limit-reset': '30' })
				)
				.mockResolvedValue(respond(200));

			await fetchGET(NON_ESI_URL);
			await fetchGET(CHAR_URL);

			expect(callsFor(CHAR_URL)).toBe(1);
		});
	});

	describe('concurrency', () => {
		it(`keeps at most ESI_MAX_CONCURRENCY requests in flight`, async () => {
			/** @type {Array<() => void>} */
			const pending = [];
			mocks.fetch.mockImplementation(
				() => new Promise((resolve) => pending.push(() => resolve(respond(200))))
			);

			const total = ESI_MAX_CONCURRENCY + 5;
			const requests = Array.from({ length: total }, (_, i) =>
				fetchGET(`https://esi.evetech.net/characters/${i}`)
			);
			await flush();
			expect(mocks.fetch).toHaveBeenCalledTimes(ESI_MAX_CONCURRENCY);

			// finishing one request lets exactly one queued request start
			pending.shift()();
			await flush();
			expect(mocks.fetch).toHaveBeenCalledTimes(ESI_MAX_CONCURRENCY + 1);

			while (mocks.fetch.mock.calls.length < total || pending.length > 0) {
				pending.shift()?.();
				await flush();
			}
			const results = await Promise.all(requests);
			expect(results.every((r) => r?.status === 200)).toBe(true);
			expect(mocks.fetch).toHaveBeenCalledTimes(total);
		});
	});

	describe('parseRateLimit', () => {
		it.each([
			['150/15m', { tokens: 150, windowMs: 900_000 }],
			['10/1s', { tokens: 10, windowMs: 1_000 }],
			['3600/1h', { tokens: 3600, windowMs: 3_600_000 }]
		])('parses %s', (value, expected) => {
			expect(parseRateLimit(value)).toEqual(expected);
		});

		it.each([null, undefined, '', '150', '150/15d', 'abc/15m', '150/m'])(
			'returns null for %s',
			(value) => {
				expect(parseRateLimit(value)).toBeNull();
			}
		);
	});

	// Maintainer decision: traces keep the full request/response detail for debugging.
	describe('trace data', () => {
		it('records request and response headers and bodies while the caller still reads the body', async () => {
			const recorded = {};
			const setAttributes = mocks.span.setAttributes;
			mocks.span.setAttributes = (attrs) => Object.assign(recorded, attrs);
			try {
				mocks.fetch.mockResolvedValueOnce(
					new Response(
						JSON.stringify([{ character_id: 1, description: 'long bio', corporation_id: 2 }]),
						{
							status: 200,
							headers: { 'x-esi-error-limit-remain': '100' }
						}
					)
				);
				mocks.fetch.mockResolvedValueOnce(
					new Response(JSON.stringify({ name: 'Bob', description: 'long bio', title: 'CEO' }), {
						status: 200
					})
				);

				const post = await fetchPOST('https://esi.evetech.net/characters/affiliation', [1]);
				expect(mocks.spanStartAttributes['http.request.body']).toBe('[1]');
				expect(JSON.parse(mocks.spanStartAttributes['http.request.headers'])).toHaveProperty(
					'User-Agent'
				);
				expect(recorded['http.response.body']).toContain('character_id');
				expect(JSON.parse(recorded['http.response.headers'])).toHaveProperty(
					'x-esi-error-limit-remain',
					'100'
				);
				await expect(post.json()).resolves.toHaveLength(1);

				const get = await fetchGET(CHAR_URL);
				// free-text bio fields are stripped from the span copy only
				expect(JSON.parse(recorded['http.response.body'])).toEqual({ name: 'Bob' });
				await expect(get.json()).resolves.toMatchObject({ description: 'long bio' });
			} finally {
				mocks.span.setAttributes = setAttributes;
			}
		});
	});
});
