import { Cron } from 'croner';
import { updateDynamicData } from '$lib/cron/dynamic';
import { USER_AGENT } from '$lib/server/constants';
import logger from '$lib/logger';
import { env } from '$env/dynamic/private';
import { updateStaticData } from '$lib/cron/static';
import { recordHttpRequest } from '$lib/server/metrics';

/** @type {import('@sveltejs/kit').ServerInit} */
export async function init() {
	logger.info('Current User-Agent: ' + USER_AGENT);

	// update dynamic data once per day, after downtime
	new Cron(env.DYNAMIC_UPDATE_CRON || '* * * * *', async () => {
		try {
			logger.info('[CRON] Updating dynamic data...');
			await updateDynamicData();
			logger.info('[CRON] Dynamic data updated successfully');
		} catch (error) {
			logger.error('[CRON] Failed to update dynamic data:', error);
		}
	});

	new Cron(env.STATIC_UPDATE_CRON || '30 10,12 * * *', async () => {
		try {
			logger.info('[CRON] Update SDE...');
			await updateStaticData();
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
	const startTime = Date.now();
	const method = event.request.method;
	const route = event.route.id || 'unknown';

	try {
		const response = await resolve(event);
		const duration = Date.now() - startTime;

		// Record successful request metrics
		recordHttpRequest(method, route, response.status, duration);

		return response;
	} catch (error) {
		const duration = Date.now() - startTime;

		// Record failed request metrics (500 error)
		recordHttpRequest(method, route, 500, duration);

		throw error;
	}
}
