import { USER_AGENT } from '$lib/server/constants';
import logger from '$lib/logger';
import { recordHttpRequest } from '$lib/server/metrics';
import { withSpan } from '$lib/server/tracer';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';
import { sequence } from '@sveltejs/kit/hooks';
import { authHandle } from '$auth';

/** @type {import('@sveltejs/kit').ServerInit} */
export async function init() {
	logger.info('Current User-Agent: ' + USER_AGENT);
}

/** @type {import('@sveltejs/kit').Handle} */
const metricsHandle = async ({ event, resolve }) => {
	return await withSpan(
		'server.hooks.handle_request',
		async (span) => {
			const startTime = Date.now();
			const method = event.request.method;
			const route = event.route.id || 'unknown';
			const userAgent = event.request.headers.get('user-agent') || 'unknown';
			const clientAddress = event.getClientAddress?.();

			span.setAttributes({
				'http.method': method,
				'http.route': route,
				'http.target': event.url?.pathname ?? 'unknown',
				'http.request.user_agent': userAgent,
				...(clientAddress ? { 'client.address': clientAddress } : {})
			});

			try {
				const response = await resolve(event);
				const duration = Date.now() - startTime;
				recordHttpRequest(method, route, response.status, duration);
				span.setAttributes({
					'http.response.status_code': response.status,
					'http.server.duration_ms': duration
				});
				span.setStatus({ code: SpanStatusCode.OK });
				return response;
			} catch (error) {
				const duration = Date.now() - startTime;
				recordHttpRequest(method, route, 500, duration);
				span.recordException(error);
				span.setStatus({ code: SpanStatusCode.ERROR, message: error?.message });
				throw error;
			}
		},
		{},
		{ kind: SpanKind.SERVER },
		event
	);
};

export const handle = sequence(metricsHandle, authHandle);
