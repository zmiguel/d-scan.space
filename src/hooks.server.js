//import cron from 'node-cron';
// import { updateDynamicData } from '$lib/cron/dynamic';
import { USER_AGENT } from '$lib/server/constants';

/** @type {import('@sveltejs/kit').ServerInit} */
export async function init() {
    console.info("Current User-Agent: " + USER_AGENT);

    // update dynamic data once per day, after downtime
    // cron.schedule('30 11 * * *', async () => {
    //     try {
    //         console.log('[CRON] Updating dynamic data...');
    //         await updateDynamicData();
    //         console.log('[CRON] Dynamic data updated successfully');
    //     } catch (error) {
    //         console.error('[CRON] Failed to update dynamic data:', error);
    //     }
    // });

}