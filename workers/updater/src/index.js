import { Cron } from 'croner';
import { readFileSync } from 'fs';
import { startInstrumentation } from './instrumentation.js';
import { config } from './config.js';
import logger from '../../../src/lib/logger.js';
import { updateDynamicData } from './services/dynamic.js';
import { updateStaticData } from './services/static.js';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

// Prevent the process from exiting immediately
setInterval(() => {}, 1 << 30);

process.on('uncaughtException', (error) => {
	logger.error(error, 'Uncaught Exception');
	process.exit(1);
});

process.on('unhandledRejection', (reason) => {
	logger.error(reason, 'Unhandled Rejection');
	process.exit(1);
});

// Start OpenTelemetry instrumentation
startInstrumentation();

logger.info(`Starting Updater Worker (v${pkg.version || 'unknown'})`);
logger.info(`Dynamic Update Schedule: ${config.DYNAMIC_UPDATE_CRON}`);
logger.info(`Static Update Schedule: ${config.STATIC_UPDATE_CRON}`);

// Schedule the dynamic data update
const dynamicJob = Cron(config.DYNAMIC_UPDATE_CRON, async () => {
	logger.info('[Dynamic] Starting scheduled dynamic data update...');
	try {
		await updateDynamicData();
		logger.info('[Dynamic] Scheduled dynamic data update completed successfully.');
	} catch (error) {
		logger.error({ err: error }, '[Dynamic] Scheduled dynamic data update failed.');
	}
});
logger.info(`Dynamic job scheduled. Next run: ${dynamicJob.nextRun()}`);

// Schedule the static data update
const staticJob = Cron(config.STATIC_UPDATE_CRON, async () => {
	logger.info('[Static] Triggering static data update...');
	try {
		await updateStaticData();
		logger.info('[Static] Static data update completed successfully.');
	} catch (error) {
		logger.error(`[Static] Static data update failed: ${error.message}`);
	}
});
logger.info(`Static job scheduled. Next run: ${staticJob.nextRun()}`);

// Handle graceful shutdown
const shutdown = () => {
	logger.info('Stopping Updater Worker...');
	dynamicJob.stop();
	staticJob.stop();
	process.exit(0);
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
