import { Cron } from 'croner';
import { updateDynamicData } from '$lib/cron/dynamic';
import { USER_AGENT } from '$lib/server/constants';
import logger from '$lib/logger';
import { env } from '$env/dynamic/private';
import { updateStaticData } from '$lib/cron/static';
import { recordHttpRequest } from '$lib/server/metrics';
import { withSpan } from '$lib/server/tracer';
import { SpanKind, SpanStatusCode } from '@opentelemetry/api';

/** @type {import('@sveltejs/kit').ServerInit} */
export async function init() {
	logger.info('Current User-Agent: ' + USER_AGENT);

	// update dynamic data once per day, after downtime
	const dynamicSchedule = env.DYNAMIC_UPDATE_CRON || '* * * * *';
	new Cron(dynamicSchedule, async () => {
		try {
			logger.info('[CRON] Updating dynamic data...');
			await withSpan(
				'cron.updateDynamicData',
				async (span) => {
					span.setAttributes({ 'cron.schedule': dynamicSchedule });
					await updateDynamicData();
					span.addEvent('cron.completed');
				},
				{},
				{ kind: SpanKind.INTERNAL }
			);
			logger.info('[CRON] Dynamic data updated successfully');
		} catch (error) {
			logger.error('[CRON] Failed to update dynamic data:', error);
		}
	});

	const staticSchedule = env.STATIC_UPDATE_CRON || '30 10,12 * * *';
	new Cron(staticSchedule, async () => {
		try {
			logger.info('[CRON] Update SDE...');
			await withSpan(
				'cron.updateStaticData',
				async (span) => {
					span.setAttributes({ 'cron.schedule': staticSchedule });
					await updateStaticData();
					span.addEvent('cron.completed');
				},
				{},
				{ kind: SpanKind.INTERNAL }
			);
			logger.info('[CRON] SDE update completed successfully');
		} catch (error) {
			logger.error('[CRON] SDE update failed:', error);
		}
	});
}

/**
 * SvelteKit handle hook that processes all HTTP requests.
 * Records metrics for request method, route, status code, and duration.
 *
 * @type {import('@sveltejs/kit').Handle}
 */
export async function handle({ event, resolve }) {
	return await withSpan(
		'http.request',
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
}
