import { Cron } from 'croner';
import { startInstrumentation } from './instrumentation.js';
import { config } from './config.js';
import logger from '../../../src/lib/logger.js';
import { updateDynamicData } from './services/updater.js';

// Start OpenTelemetry instrumentation
startInstrumentation();

logger.info(`Starting Dynamic Worker (v${process.env.npm_package_version || 'unknown'})`);
logger.info(`Cron Schedule: ${config.DYNAMIC_UPDATE_CRON}`);

// Schedule the dynamic data update
const job = Cron(config.DYNAMIC_UPDATE_CRON, async () => {
	logger.info('Starting scheduled dynamic data update...');
	try {
		await updateDynamicData();
		logger.info('Scheduled dynamic data update completed successfully.');
	} catch (error) {
		logger.error({ err: error }, 'Scheduled dynamic data update failed.');
	}
});

// Handle graceful shutdown
process.on('SIGINT', () => {
	logger.info('Stopping Dynamic Worker...');
	job.stop();
	process.exit(0);
});

process.on('SIGTERM', () => {
	logger.info('Stopping Dynamic Worker...');
	job.stop();
	process.exit(0);
});

// Run immediately on startup if needed, or just wait for next cron
// job.trigger();
