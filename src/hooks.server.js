import { Cron } from 'croner';
import { updateDynamicData } from '$lib/cron/dynamic';
import { USER_AGENT } from '$lib/server/constants';
import logger from '$lib/logger';

/** @type {import('@sveltejs/kit').ServerInit} */
export async function init() {
	logger.info('Current User-Agent: ' + USER_AGENT);

	// update dynamic data once per day, after downtime
	new Cron('30 11 * * *', async () => {
		try {
			logger.info('[CRON] Updating dynamic data...');
			await updateDynamicData();
			logger.info('[CRON] Dynamic data updated successfully');
		} catch (error) {
			logger.error('[CRON] Failed to update dynamic data:', error);
		}
	});
}
