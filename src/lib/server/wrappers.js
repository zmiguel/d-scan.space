import { biomassCharacter } from '../database/characters.js';
import { USER_AGENT, ESI_MAX_CONNECTIONS, ESI_TEST_FLAGS } from './constants.js';
import { withSpan } from './tracer.js';
import { recordEsiRequest, esiConcurrentRequests } from './metrics.js';
import { Agent } from 'undici';
import logger from '../logger.js';

const esiAgent = new Agent({
	connections: ESI_MAX_CONNECTIONS,
	keepAliveTimeout: 10_000,
	keepAliveMaxTimeout: 60_000,
	connect: {
		timeout: 30_000
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

const RESPONSE_PREVIEW_LIMIT = 800;

function createPreview(payload) {
	if (payload == null) return 'null';
	const stringified = typeof payload === 'string' ? payload : JSON.stringify(payload);
	if (stringified.length <= RESPONSE_PREVIEW_LIMIT) {
		return stringified;
	}
	return `${stringified.slice(0, RESPONSE_PREVIEW_LIMIT)}…`;
}

function getResourceType(url) {
	if (url.includes('/characters/')) return 'character';
	if (url.includes('/corporations/')) return 'corporation';
	if (url.includes('/alliances/')) return 'alliance';
	if (url.includes('/universe/systems/')) return 'system';
	if (url.includes('/universe/types/')) return 'type';
	if (url.includes('/universe/groups/')) return 'group';
	if (url.includes('/universe/categories/')) return 'category';
	if (url.includes('/status/')) return 'status';
	if (url.includes('/search/')) return 'search';
	return 'other';
}

async function handleDelete(response, span, attempt, fullResponse) {
	// Handle the deleted edge case
	span.addEvent('Resource marked as deleted', {
		url: response.url,
		attempt: attempt,
		preview: createPreview(fullResponse)
	});
	if (response.url.includes('character')) {
		const idStr = response.url.split('/').pop();
		if (typeof idStr === 'string' && idStr.length > 0) {
			await biomassCharacter(parseInt(idStr));
		}
	}
	span.setStatus({ code: 0 });
	return;
}

export async function fetchGET(url, maxRetries = 3) {
	return await withSpan(
		`server.wrappers.fetch_get`,
		async (span) => {
			let lastError;
			const startTime = Date.now();
			const resourceType = getResourceType(url);
			logger.debug(`fetchGET: ${url}`, { resourceType });

			if (ESI_TEST_FLAGS) {
				headers['X-Compatibility-Date'] = '2099-01-01';
			}

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					esiConcurrentRequests.add(1);
					const response = await fetch(url, {
						method: 'GET',
						headers: headers,
						dispatcher: esiAgent
					});
					esiConcurrentRequests.add(-1);

					const responseClone = response.clone();
					let fullResponse;

					try {
						fullResponse = await responseClone.json();
						if (fullResponse && typeof fullResponse === 'object') {
							delete fullResponse.description;
							delete fullResponse.title;
						}
					} catch {
						// Fallback to text if JSON parsing fails
						fullResponse = await response.clone().text();
					}

					span.setAttributes({
						'http.response.status_code': response.status,
						'http.response.status_text': response.statusText,
						'http.response.headers': JSON.stringify(Object.fromEntries(response.headers.entries())),
						'http.response.body': JSON.stringify(fullResponse),
						'http.response.redirected': response.redirected,
						'http.response.type': response.type,
						'http.response.ok': response.ok,
						'http.retry.attempt': attempt,
						'esi.resource_type': resourceType
					});

					// Extract rate limit info if available
					const errorLimitRemain = response.headers.get('x-esi-error-limit-remain');
					const errorLimitReset = response.headers.get('x-esi-error-limit-reset');

					// Check if response is not ok and throw error
					if (!response.ok) {
						// deleted edge case
						if (response.status === 404 && fullResponse.error.includes('deleted')) {
							// Handle the deleted edge case
							await handleDelete(response, span, attempt, fullResponse);
						} else {
							const error = new Error(
								`HTTP ${response.status}: ${response.statusText} | ${createPreview(fullResponse)}`
							);
							Object.assign(error, {
								responseDetails: {
									status: response.status,
									statusText: response.statusText,
									url: response.url,
									redirected: response.redirected,
									type: response.type,
									ok: response.ok,
									attempt: attempt,
									preview: createPreview(fullResponse)
								}
							});
							throw error;
						}
					}

					// Record successful ESI request metrics
					const duration = Date.now() - startTime;
					recordEsiRequest(
						'GET',
						response.status,
						duration,
						errorLimitRemain,
						errorLimitReset,
						resourceType
					);

					// Only set success status here, not error
					span.setStatus({ code: 0 });
					return response;
				} catch (error) {
					// Ensure we decrement if fetch fails (e.g. network error)
					if (error.name !== 'Error') {
						esiConcurrentRequests.add(-1);
					}

					lastError = error;

					// Record failed request metrics
					const duration = Date.now() - startTime;
					const status = error.responseDetails?.status || 500;
					recordEsiRequest('GET', status, duration, null, null, resourceType);

					// Add detailed fetch failure event if response details are available
					if (error.responseDetails) {
						span.addEvent('Fetch Failed', error.responseDetails);
					} else {
						// Fallback for other types of errors (network, parsing, etc.)
						span.addEvent('Fetch Failed', {
							error: error.message || String(error),
							attempt: attempt
						});
					}

					// Don't wait after the last attempt
					if (attempt < maxRetries) {
						// Exponential backoff: 500ms, 1s, 2s
						const delay = Math.pow(2, attempt - 1) * 500;
						await new Promise((resolve) => setTimeout(resolve, delay));
					}
				}
			}

			// Only set error status if ALL retries failed
			span.setStatus({
				code: 1,
				message: `Failed after ${maxRetries} attempts: ${lastError.message}`
			});
			throw lastError;
		},
		{
			'http.method': 'GET',
			'http.url': url,
			'http.request.headers': JSON.stringify(headers),
			'max.retries': maxRetries
		}
	);
}

export async function fetchPOST(url, body, maxRetries = 3) {
	return await withSpan(
		`server.wrappers.fetch_post`,
		async (span) => {
			let lastError;
			const startTime = Date.now();
			const resourceType = getResourceType(url);

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					esiConcurrentRequests.add(1);
					const response = await fetch(url, {
						method: 'POST',
						headers: headers,
						body: JSON.stringify(body),
						dispatcher: esiAgent
					});
					esiConcurrentRequests.add(-1);

					const responseClone = response.clone();
					let fullResponse;

					try {
						fullResponse = await responseClone.json();
						if (fullResponse && typeof fullResponse === 'object') {
							delete fullResponse.description;
							delete fullResponse.title;
						}
					} catch {
						// Fallback to text if JSON parsing fails
						fullResponse = await response.clone().text();
					}

					span.setAttributes({
						'http.response.status_code': response.status,
						'http.response.status_text': response.statusText,
						'http.response.headers': JSON.stringify(Object.fromEntries(response.headers.entries())),
						'http.response.body': JSON.stringify(fullResponse),
						'http.response.redirected': response.redirected,
						'http.response.type': response.type,
						'http.response.ok': response.ok,
						'http.retry.attempt': attempt,
						'esi.resource_type': resourceType
					});

					// Extract rate limit info if available
					const errorLimitRemain = response.headers.get('x-esi-error-limit-remain');
					const errorLimitReset = response.headers.get('x-esi-error-limit-reset');

					// Check if response is not ok and throw error
					if (!response.ok) {
						// deleted edge case
						if (
							response.status === 404 &&
							fullResponse.error &&
							fullResponse.error.includes('deleted')
						) {
							// Handle the deleted edge case
							await handleDelete(response, span, attempt, fullResponse);
						} else {
							const error = new Error(
								`HTTP ${response.status}: ${response.statusText} | ${createPreview(fullResponse)}`
							);
							Object.assign(error, {
								responseDetails: {
									status: response.status,
									statusText: response.statusText,
									url: response.url,
									redirected: response.redirected,
									type: response.type,
									ok: response.ok,
									attempt: attempt,
									preview: createPreview(fullResponse)
								}
							});
							throw error;
						}
					}

					// Record successful ESI request metrics
					const duration = Date.now() - startTime;
					recordEsiRequest(
						'POST',
						response.status,
						duration,
						errorLimitRemain,
						errorLimitReset,
						resourceType
					);

					// Only set success status here, not error
					span.setStatus({ code: 0 });
					return response;
				} catch (error) {
					// Ensure we decrement if fetch fails (e.g. network error)
					if (error.name !== 'Error') {
						esiConcurrentRequests.add(-1);
					}

					lastError = error;

					// Record failed request metrics
					const duration = Date.now() - startTime;
					const status = error.responseDetails?.status || 500;
					recordEsiRequest('POST', status, duration, null, null, resourceType);

					// Add detailed fetch failure event if response details are available
					if (error.responseDetails) {
						span.addEvent('Fetch Failed', error.responseDetails);
					} else {
						// Fallback for other types of errors (network, parsing, etc.)
						span.addEvent('Fetch Failed', {
							error: error.message || String(error),
							attempt: attempt
						});
					}

					// Don't wait after the last attempt
					if (attempt < maxRetries) {
						// Exponential backoff: 500ms, 1s, 2s
						const delay = Math.pow(2, attempt - 1) * 500;
						await new Promise((resolve) => setTimeout(resolve, delay));
					}
				}
			}

			// Only set error status if ALL retries failed
			span.setStatus({
				code: 1,
				message: `Failed after ${maxRetries} attempts: ${lastError.message}`
			});
			throw lastError;
		},
		{
			'http.method': 'POST',
			'http.url': url,
			'http.request.headers': JSON.stringify(headers),
			'http.request.body': JSON.stringify(body),
			'http.request.body_size': Buffer.byteLength(JSON.stringify(body ?? {})),
			'max.retries': maxRetries
		}
	);
}
