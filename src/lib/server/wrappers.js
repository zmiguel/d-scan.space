/**
 * HTTP client for ESI (and other CCP endpoints such as the SDE version file).
 *
 * Follows CCP's ESI guidance:
 * - https://developers.eveonline.com/docs/services/esi/best-practices/ (error limit)
 * - https://developers.eveonline.com/docs/services/esi/rate-limiting/ (buckets, 429)
 *
 * Behaviour:
 * - At most ESI_MAX_CONCURRENCY requests in flight per process; the rest queue.
 * - Error limit: ESI allows ~100 non-2xx/3xx responses per window per IP, then answers
 *   420 on every route. When `x-esi-error-limit-remain` drops to
 *   ESI_ERROR_LIMIT_THRESHOLD, or a 420 arrives, all new ESI requests pause until
 *   `x-esi-error-limit-reset`.
 * - Bucket limit (routes with `X-Ratelimit-*` headers, floating window): when
 *   `X-Ratelimit-Remaining` gets close to zero, requests of that route group slow down
 *   (pause long enough for a few requests' worth of tokens to return, derived from
 *   `X-Ratelimit-Limit`, e.g. `150/15m`). Pauses are per group, as buckets are.
 * - 429 (bucket limit or server-side limiter): pause that group for `Retry-After`, then
 *   retry.
 * - Only network errors, timeouts and 5xx are retried (5xx cost no tokens). Other 4xx
 *   are returned to the caller immediately: retrying them only burns error budget and
 *   bucket tokens (a 4xx costs 5).
 * - Traces carry the full request/response detail (headers, bodies minus free-text
 *   description/title). Bodies handed to callers are read through a clone, so callers
 *   still parse the original once.
 *
 * Return value: the `Response` for 2xx/3xx and non-retryable 4xx (callers check `.ok`;
 * e.g. 404 on /characters/{id} means the character was deleted), or `null` when all
 * attempts failed.
 */
import {
	USER_AGENT,
	ESI_MAX_CONNECTIONS,
	ESI_MAX_CONCURRENCY,
	ESI_REQUEST_TIMEOUT_MS,
	ESI_ERROR_LIMIT_THRESHOLD,
	ESI_TEST_FLAGS
} from './constants.js';
import { withSpan } from './tracer.js';
import { recordEsiRequest, esiConcurrentRequests } from './metrics.js';
import { Agent, fetch } from 'undici';
import logger from '../logger.js';

const ESI_ORIGIN = 'https://esi.evetech.net';
const RETRYABLE_STATUSES = new Set([500, 502, 503, 504]);
/** Longest single pause honoured for 420/429/bucket slowdowns. */
const MAX_PAUSE_MS = 60_000;
const DEFAULT_RETRY_AFTER_SECONDS = 5;
const ERROR_PREVIEW_LIMIT = 500;
/** Remaining bucket tokens at which a rate-limit group starts slowing down. */
const BUCKET_LOW_WATERMARK = 10;

const esiAgent = new Agent({
	connections: ESI_MAX_CONNECTIONS,
	keepAliveTimeout: 10_000,
	keepAliveMaxTimeout: 60_000,
	headersTimeout: ESI_REQUEST_TIMEOUT_MS,
	bodyTimeout: ESI_REQUEST_TIMEOUT_MS,
	connect: {
		timeout: 10_000
	}
});

process.once('beforeExit', () => {
	esiAgent.close();
});

const headers = {
	'Content-Type': 'application/json',
	Accept: 'application/json',
	'Accept-Language': 'en',
	'X-Compatibility-Date': '2025-09-01',
	'X-Tenant': 'tranquility',
	'User-Agent': USER_AGENT,
	'X-User-Agent': USER_AGENT
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Counting semaphore limiting concurrent ESI requests in this process. */
class Limiter {
	/** @param {number} max */
	constructor(max) {
		this.max = max;
		this.active = 0;
		/** @type {Array<() => void>} */
		this.queue = [];
	}

	/**
	 * @template T
	 * @param {() => Promise<T>} task
	 * @returns {Promise<T>}
	 */
	async run(task) {
		if (this.active >= this.max) {
			await new Promise((resolve) => this.queue.push(resolve));
		}
		this.active++;
		try {
			return await task();
		} finally {
			this.active--;
			this.queue.shift()?.();
		}
	}
}

const limiter = new Limiter(ESI_MAX_CONCURRENCY);

/** Epoch ms until which all new ESI requests wait (the error limit is global per IP). */
let pausedUntil = 0;
/** Epoch ms until which requests of one rate-limit group wait (bucket limits). */
const groupPausedUntil = new Map();
/**
 * Rate-limit group last announced by ESI (`X-Ratelimit-Group`) for each resource type,
 * so new requests wait for their group's pause before they are sent.
 */
const groupByResource = new Map();

/**
 * @param {number} ms
 * @param {string} reason
 * @param {string | null} [group] rate-limit group; null pauses every ESI request
 */
function pauseEsi(ms, reason, group = null) {
	const until = Date.now() + Math.min(ms, MAX_PAUSE_MS);
	const current = group ? (groupPausedUntil.get(group) ?? 0) : pausedUntil;
	if (until > current) {
		if (group) groupPausedUntil.set(group, until);
		else pausedUntil = until;
		logger.warn({ pauseMs: until - Date.now(), reason, group }, 'Pausing ESI requests');
	}
}

/** @param {string} group */
async function waitWhilePaused(group) {
	for (;;) {
		const until = Math.max(pausedUntil, groupPausedUntil.get(group) ?? 0);
		if (Date.now() >= until) return;
		await sleep(until - Date.now());
	}
}

function intHeader(response, name) {
	const value = Number.parseInt(response.headers.get(name) ?? '', 10);
	return Number.isFinite(value) ? value : null;
}

/** `150/15m` → { tokens: 150, windowMs: 900000 } */
export function parseRateLimit(value) {
	const match = /^(\d+)\/(\d+)([smh])$/.exec(value ?? '');
	if (!match) return null;
	const unitMs = { s: 1_000, m: 60_000, h: 3_600_000 }[match[3]];
	return { tokens: Number(match[1]), windowMs: Number(match[2]) * unitMs };
}

/**
 * Slows a rate-limit group down when its bucket is nearly empty ("If the
 * X-Ratelimit-Remaining is approaching zero, start to slow down"). Tokens return one
 * window after they were spent, so waiting `window / tokens * BUCKET_LOW_WATERMARK`
 * lets roughly that many tokens come back on average.
 */
function observeBucket(response, group) {
	const remaining = intHeader(response, 'x-ratelimit-remaining');
	const limit = parseRateLimit(response.headers.get('x-ratelimit-limit'));
	if (remaining === null || !limit || remaining > BUCKET_LOW_WATERMARK) return;
	pauseEsi(
		Math.ceil((limit.windowMs / limit.tokens) * BUCKET_LOW_WATERMARK),
		`rate limit bucket low (${remaining} tokens)`,
		group
	);
}

function getResourceType(url) {
	if (url.includes('/characters/')) return 'character';
	if (url.includes('/corporations/')) return 'corporation';
	if (url.includes('/alliances/')) return 'alliance';
	if (url.includes('/universe/systems/')) return 'system';
	if (url.includes('/universe/types/')) return 'type';
	if (url.includes('/universe/groups/')) return 'group';
	if (url.includes('/universe/categories/')) return 'category';
	if (url.includes('/universe/ids')) return 'ids';
	if (url.includes('/status')) return 'status';
	if (url.includes('/search/')) return 'search';
	return 'other';
}

/** Log-line excerpt of a response body. */
function preview(text) {
	return text.length > ERROR_PREVIEW_LIMIT ? `${text.slice(0, ERROR_PREVIEW_LIMIT)}…` : text;
}

/**
 * Response body as recorded on the span: JSON without the free-text `description` and
 * `title` fields (character/corporation bios can be very large), otherwise the raw text.
 */
function spanBody(text) {
	try {
		const parsed = JSON.parse(text);
		if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
			delete parsed.description;
			delete parsed.title;
		}
		return JSON.stringify(parsed);
	} catch {
		return text;
	}
}

/**
 * @param {'GET' | 'POST'} method
 * @param {string} url
 * @param {unknown} body
 * @param {number} maxAttempts
 * @returns {Promise<import('undici').Response | null>}
 */
async function request(method, url, body, maxAttempts) {
	const resourceType = getResourceType(url);
	const isEsi = url.startsWith(ESI_ORIGIN);
	const requestHeaders =
		ESI_TEST_FLAGS && ['character', 'corporation', 'alliance'].includes(resourceType)
			? { ...headers, 'X-Compatibility-Date': '2099-01-01' }
			: headers;
	const payload = body === undefined ? undefined : JSON.stringify(body);

	return withSpan(
		`server.wrappers.fetch_${method.toLowerCase()}`,
		async (span) => {
			const startTime = Date.now();
			let lastError = '';
			// Bucket group as last announced by ESI for this resource; else the resource type.
			let group = groupByResource.get(resourceType) ?? resourceType;

			for (let attempt = 1; attempt <= maxAttempts; attempt++) {
				if (isEsi) await waitWhilePaused(group);

				let response;
				try {
					response = await limiter.run(async () => {
						esiConcurrentRequests.add(1);
						try {
							return await fetch(url, {
								method,
								headers: requestHeaders,
								body: payload,
								dispatcher: esiAgent,
								signal: AbortSignal.timeout(ESI_REQUEST_TIMEOUT_MS)
							});
						} finally {
							esiConcurrentRequests.add(-1);
						}
					});
				} catch (error) {
					// Network error or timeout: retryable.
					lastError = error?.message || String(error);
					recordEsiRequest(method, 0, Date.now() - startTime, null, null, resourceType);
					span.addEvent('ESI request failed', { attempt, error: lastError });
					logger.warn({ err: error, url, attempt, resourceType }, `${method} ESI failed`);
					if (attempt < maxAttempts) await sleep(2 ** (attempt - 1) * 500);
					continue;
				}

				const announcedGroup = response.headers.get('x-ratelimit-group');
				if (announcedGroup) {
					group = announcedGroup;
					groupByResource.set(resourceType, announcedGroup);
				}
				const errorRemain = intHeader(response, 'x-esi-error-limit-remain');
				const errorReset = intHeader(response, 'x-esi-error-limit-reset');
				recordEsiRequest(
					method,
					response.status,
					Date.now() - startTime,
					errorRemain,
					errorReset,
					resourceType
				);

				// Responses handed to the caller are read through a clone (the caller consumes the
				// original); responses that are retried are drained here.
				const retried =
					response.status === 420 ||
					response.status === 429 ||
					RETRYABLE_STATUSES.has(response.status);
				const bodyText = await (retried ? response : response.clone()).text().catch(() => '');

				// Full request/response detail on the span: invaluable when debugging ESI issues.
				span.setAttributes({
					'http.response.status_code': response.status,
					'http.response.status_text': response.statusText,
					'http.response.ok': response.ok,
					'http.response.redirected': response.redirected,
					'http.response.type': response.type,
					'http.response.headers': JSON.stringify(Object.fromEntries(response.headers.entries())),
					'http.response.body': spanBody(bodyText),
					'http.retry.attempt': attempt,
					'esi.resource_type': resourceType,
					...(errorRemain !== null && { 'esi.error_limit.remain': errorRemain }),
					...(response.headers.get('x-ratelimit-remaining') && {
						'esi.ratelimit.group': group,
						'esi.ratelimit.remaining': response.headers.get('x-ratelimit-remaining')
					})
				});

				if (isEsi) {
					if (errorRemain !== null && errorRemain <= ESI_ERROR_LIMIT_THRESHOLD) {
						pauseEsi(((errorReset ?? 60) + 1) * 1000, `error limit remain ${errorRemain}`);
					}
					observeBucket(response, group);
				}

				if (response.status < 400) {
					span.setStatus({ code: 0 });
					return response;
				}

				if (response.status === 420) {
					lastError = `HTTP 420: error limited | ${preview(bodyText)}`;
					span.addEvent('ESI error limited', { attempt, body: bodyText });
					pauseEsi(((errorReset ?? 60) + 1) * 1000, '420 error limited');
					continue;
				}

				if (response.status === 429) {
					const retryAfter = intHeader(response, 'retry-after') ?? DEFAULT_RETRY_AFTER_SECONDS;
					lastError = `HTTP 429: retry after ${retryAfter}s | ${preview(bodyText)}`;
					span.addEvent('ESI rate limited', { retryAfter, attempt, group, body: bodyText });
					pauseEsi(retryAfter * 1000, '429 rate limited', group);
					continue;
				}

				if (RETRYABLE_STATUSES.has(response.status)) {
					lastError = `HTTP ${response.status}: ${preview(bodyText)}`;
					span.addEvent('ESI server error', { attempt, status: response.status, body: bodyText });
					logger.warn({ err: lastError, url, attempt, resourceType }, `${method} ESI failed`);
					if (attempt < maxAttempts) await sleep(2 ** (attempt - 1) * 500);
					continue;
				}

				// Non-retryable client error: hand it to the caller (body still unread).
				span.addEvent('ESI client error', { status: response.status, body: bodyText });
				span.setStatus({ code: 0 });
				return response;
			}

			span.setStatus({ code: 2, message: `Failed after ${maxAttempts} attempts: ${lastError}` });
			logger.error({ err: lastError, url, resourceType }, `${method} ESI exhausted retries`);
			return null;
		},
		{
			'http.method': method,
			'http.url': url,
			'http.request.headers': JSON.stringify(requestHeaders),
			...(payload !== undefined && { 'http.request.body': payload }),
			'http.request.body_size': payload ? Buffer.byteLength(payload) : 0,
			'max.retries': maxAttempts
		}
	);
}

/**
 * @param {string} url
 * @param {number} [maxAttempts]
 */
export function fetchGET(url, maxAttempts = 3) {
	return request('GET', url, undefined, maxAttempts);
}

/**
 * @param {string} url
 * @param {unknown} body JSON-serialisable request body
 * @param {number} [maxAttempts]
 */
export function fetchPOST(url, body, maxAttempts = 3) {
	return request('POST', url, body, maxAttempts);
}

/** Test hook: clear all ESI pauses. */
export function _resetEsiPauses() {
	pausedUntil = 0;
	groupPausedUntil.clear();
	groupByResource.clear();
}
