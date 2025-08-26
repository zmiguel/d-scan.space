import { USER_AGENT } from './constants';
import { withSpan } from './tracer.js';

const headers = {
	'Content-Type': 'application/json',
	Accept: 'application/json',
	'Accept-Language': 'en',
	'X-Compatibility-Date': '2025-07-01',
	'X-Tenant': 'tranquility',
	'User-Agent': USER_AGENT
};

export async function fetchGET(url, maxRetries = 3) {
	return await withSpan(
		`fetchGET`,
		async (span) => {
			let lastError;

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
						'http.response': JSON.stringify({
							status: response.status,
							statusText: response.statusText,
							headers: Object.fromEntries(response.headers.entries()),
							body: fullResponse,
							url: response.url,
							redirected: response.redirected,
							type: response.type,
							ok: response.ok,
							attempt: attempt
						})
					});

					// Only set success status here, not error
					span.setStatus({ code: 0 });
					return response;
				} catch (error) {
					lastError = error;
					span.addEvent(`Attempt ${attempt} failed`, {
						error: error.message,
						attempt: attempt
					});

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
						'http.response': JSON.stringify({
							status: response.status,
							statusText: response.statusText,
							headers: Object.fromEntries(response.headers.entries()),
							body: fullResponse,
							url: response.url,
							redirected: response.redirected,
							type: response.type,
							ok: response.ok,
							attempt: attempt
						})
					});

					// Only set success status here, not error
					span.setStatus({ code: 0 });
					return response;
				} catch (error) {
					lastError = error;
					span.addEvent(`Attempt ${attempt} failed`, {
						error: error.message,
						attempt: attempt
					});

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
