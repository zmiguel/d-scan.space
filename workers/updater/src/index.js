// OpenTelemetry must be loaded before anything else so `pg` gets instrumented: start the
// worker with `node --import ./src/instrumentation.js src/index.js` (package.json `start`,
// Dockerfile). This import is then the already-started instance; without --import the
// SDK starts here, later, and DB spans may be missing.
import { shutdownTelemetry } from './instrumentation.js';
import { Cron } from 'croner';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import logger from '../../../src/lib/logger.js';
import { closeDb, runMigrations } from '../../../src/lib/database/client.js';
import {
	WORKER_RECOMMENDED,
	WORKER_REQUIRED,
	validateProductionEnv
} from '../../../src/lib/server/env-check.js';
import { updateDynamicData } from './services/dynamic.js';
import { updateStaticData } from './services/static.js';
import { createJobRunner, writeHeartbeat } from './utils/jobs.js';

// Repository-level drizzle/ folder, independent of the working directory
// (/app/drizzle in the Docker image).
const MIGRATIONS_FOLDER = fileURLToPath(new URL('../../../drizzle', import.meta.url));

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));

// Prevent the process from exiting immediately
setInterval(() => {}, 1 << 30);

process.on('uncaughtException', (err) => {
	logger.error({ err }, 'Uncaught Exception');
	process.exit(1);
});

process.on('unhandledRejection', (reason) => {
	logger.error({ err: reason }, 'Unhandled Rejection');
	process.exit(1);
});

try {
	validateProductionEnv('updater', { required: WORKER_REQUIRED, recommended: WORKER_RECOMMENDED });
} catch (err) {
	logger.error({ err }, 'Invalid configuration');
	process.exit(1);
}

// Normally a no-op: docker-compose sets SKIP_MIGRATIONS=true and lets the app migrate.
// When enabled, the advisory lock in runMigrations() makes it safe alongside the app.
try {
	await runMigrations({ migrationsFolder: MIGRATIONS_FOLDER });
} catch (err) {
	logger.error({ err }, 'Database migration failed');
	process.exit(1);
}

logger.info(`Starting Updater Worker (v${pkg.version || 'unknown'})`);
logger.info(`Dynamic Update Schedule: ${config.DYNAMIC_UPDATE_CRON}`);
logger.info(`Static Update Schedule: ${config.STATIC_UPDATE_CRON}`);

const jobs = createJobRunner();

/**
 * `protect` skips a tick while the previous run of the same job is still going (a slow
 * run, e.g. after downtime, must not stack up concurrent runs). Across processes the
 * job's advisory lock (utils/jobs.js) does the same.
 * @param {string} name
 */
const skipWhileRunning = (name) => () =>
	logger.warn({ job: name }, 'Job still running, skipping this scheduled run');

const dynamicJob = new Cron(
	config.DYNAMIC_UPDATE_CRON,
	{ name: 'dynamic', protect: skipWhileRunning('dynamic') },
	() => jobs.run('dynamic', updateDynamicData)
);
logger.info(`Dynamic job scheduled. Next run: ${dynamicJob.nextRun()}`);

const staticJob = new Cron(
	config.STATIC_UPDATE_CRON,
	{ name: 'static', protect: skipWhileRunning('static') },
	() => jobs.run('static', updateStaticData)
);
logger.info(`Static job scheduled. Next run: ${staticJob.nextRun()}`);

await writeHeartbeat();

let shuttingDown = false;

/** Stops scheduling, lets running jobs finish (bounded), flushes telemetry, closes DB. */
const shutdown = async (signal) => {
	if (shuttingDown) return;
	shuttingDown = true;
	logger.info({ signal, runningJobs: jobs.active }, 'Stopping Updater Worker...');
	dynamicJob.stop();
	staticJob.stop();

	const drained = await jobs.drain(config.SHUTDOWN_TIMEOUT_MS);
	if (!drained) {
		logger.warn(
			{ timeoutMs: config.SHUTDOWN_TIMEOUT_MS },
			'Running jobs did not finish in time; exiting anyway (their claims are retried later)'
		);
	}

	await shutdownTelemetry(signal);
	await closeDb().catch((err) => logger.error({ err }, 'Failed to close database pool'));
	process.exit(0);
};

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
