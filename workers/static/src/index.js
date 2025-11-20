import { Cron } from 'croner';
import { startInstrumentation } from './instrumentation.js';
import { config } from './config.js';
import logger from '../../../src/lib/logger.js';
import { updateStaticData } from './services/updater.js';

// Start OpenTelemetry instrumentation
startInstrumentation();

logger.info(
	`[StaticWorker] Starting static worker with cron schedule: ${config.STATIC_UPDATE_CRON}`
);

// Schedule the static data update
Cron(config.STATIC_UPDATE_CRON, async () => {
	logger.info('[StaticWorker] Triggering static data update...');
	try {
		await updateStaticData();
		logger.info('[StaticWorker] Static data update completed successfully.');
	} catch (error) {
		logger.error(`[StaticWorker] Static data update failed: ${error.message}`);
	}
});

// Handle graceful shutdown
process.on('SIGTERM', () => {
	logger.info('[StaticWorker] SIGTERM received, shutting down...');
	process.exit(0);
});

process.on('SIGINT', () => {
	logger.info('[StaticWorker] SIGINT received, shutting down...');
	process.exit(0);
});
