import { biomassCharacter } from '$lib/database/characters';
import { USER_AGENT } from './constants';
import { withSpan } from './tracer.js';
import { recordEsiRequest } from './metrics';

const headers = {
	'Content-Type': 'application/json',
	Accept: 'application/json',
	'Accept-Language': 'en',
	'X-Compatibility-Date': '2025-09-01',
	'X-Tenant': 'tranquility',
	'User-Agent': USER_AGENT,
	'X-User-Agent': USER_AGENT
};

async function handleDelete(response, span, attempt, fullResponse) {
	// Handle the deleted edge case
	span.addEvent('Resource marked as deleted', {
		url: response.url,
		attempt: attempt,
		fullResponse: fullResponse
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
		`fetchGET`,
		async (span) => {
			let lastError;
			const startTime = Date.now();

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					const response = await fetch(url, {
						method: 'GET',
						headers: headers
					});

					const responseClone = response.clone();
					let fullResponse;

					try {
						fullResponse = await responseClone.json();
						delete fullResponse.description;
						delete fullResponse.title;
					} catch {
						// Fallback to text if JSON parsing fails
						fullResponse = await response.clone().text();
					}

					span.setAttributes({
						'http.response.status': response.status,
						'http.response.status_text': response.statusText,
						'http.response.headers': JSON.stringify(Object.fromEntries(response.headers.entries())),
						'http.response.body': JSON.stringify(fullResponse),
						'http.response.url': response.url,
						'http.response.redirected': response.redirected,
						'http.response.type': response.type,
						'http.response.ok': response.ok,
						attempt: attempt
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
								`HTTP ${response.status}: ${response.statusText} | ${JSON.stringify(fullResponse)}`
							);
							// Attach response details to error for catch block using Object.assign
							Object.assign(error, {
								responseDetails: {
									'http.response.status': response.status,
									'http.response.status_text': response.statusText,
									'http.response.headers': JSON.stringify(
										Object.fromEntries(response.headers.entries())
									),
									'http.response.body': JSON.stringify(fullResponse),
									'http.response.url': response.url,
									'http.response.redirected': response.redirected,
									'http.response.type': response.type,
									'http.response.ok': response.ok,
									attempt: attempt
								}
							});
							throw error;
						}
					}

					// Record successful ESI request metrics
					const duration = Date.now() - startTime;
					recordEsiRequest('GET', response.status, duration, errorLimitRemain, errorLimitReset);

					// Only set success status here, not error
					span.setStatus({ code: 0 });
					return response;
				} catch (error) {
					lastError = error;

					// Record failed request metrics
					const duration = Date.now() - startTime;
					const status = error.responseDetails?.['http.response.status'] || 500;
					recordEsiRequest('GET', status, duration, null, null);

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
		`fetchPOST`,
		async (span) => {
			let lastError;
			const startTime = Date.now();

			for (let attempt = 1; attempt <= maxRetries; attempt++) {
				try {
					const response = await fetch(url, {
						method: 'POST',
						headers: headers,
						body: JSON.stringify(body)
					});

					const responseClone = response.clone();
					let fullResponse;

					try {
						fullResponse = await responseClone.json();
						delete fullResponse.description;
						delete fullResponse.title;
					} catch {
						// Fallback to text if JSON parsing fails
						fullResponse = await response.clone().text();
					}

					span.setAttributes({
						'http.response.status': response.status,
						'http.response.status_text': response.statusText,
						'http.response.headers': JSON.stringify(Object.fromEntries(response.headers.entries())),
						'http.response.body': JSON.stringify(fullResponse),
						'http.response.url': response.url,
						'http.response.redirected': response.redirected,
						'http.response.type': response.type,
						'http.response.ok': response.ok,
						attempt: attempt
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
								`HTTP ${response.status}: ${response.statusText} | ${JSON.stringify(fullResponse)}`
							);
							// Attach response details to error for catch block using Object.assign
							Object.assign(error, {
								responseDetails: {
									'http.response.status': response.status,
									'http.response.status_text': response.statusText,
									'http.response.headers': JSON.stringify(
										Object.fromEntries(response.headers.entries())
									),
									'http.response.body': JSON.stringify(fullResponse),
									'http.response.url': response.url,
									'http.response.redirected': response.redirected,
									'http.response.type': response.type,
									'http.response.ok': response.ok,
									attempt: attempt
								}
							});
							throw error;
						}
					}

					// Record successful ESI request metrics
					const duration = Date.now() - startTime;
					recordEsiRequest('POST', response.status, duration, errorLimitRemain, errorLimitReset);

					// Only set success status here, not error
					span.setStatus({ code: 0 });
					return response;
				} catch (error) {
					lastError = error;

					// Record failed request metrics
					const duration = Date.now() - startTime;
					const status = error.responseDetails?.['http.response.status'] || 500;
					recordEsiRequest('POST', status, duration, null, null);

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
						// Exponential backoff: 1s, 2s, 4s
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
			'max.retries': maxRetries
		}
	);
}
