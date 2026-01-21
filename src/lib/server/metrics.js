import { metrics } from '@opentelemetry/api';
import logger from '../logger.js';
import { pool } from '../database/client.js';

// Get the meter for creating metrics
const meter = metrics.getMeter('d-scan.space');

/**
 * HTTP Request Metrics
 */
export const httpRequestCounter = meter.createCounter('http_requests_total', {
	description: 'Total number of HTTP requests',
	unit: '1'
});

export const httpRequestDuration = meter.createHistogram('http_request_duration_seconds', {
	description: 'HTTP request duration in seconds',
	unit: 's'
});

export const httpResponseStatusCounter = meter.createCounter('http_response_status_total', {
	description: 'Total number of HTTP responses by status code',
	unit: '1'
});

export const dbConnectionPoolSize = meter.createObservableGauge('db_connection_pool_size', {
	description: 'Current database connection pool size',
	unit: '1'
});

export const dbConnectionPoolInUse = meter.createObservableGauge('db_connection_pool_in_use', {
	description: 'Number of database connections currently checked out of the pool',
	unit: '1'
});

export const dbConnectionPoolIdle = meter.createObservableGauge('db_connection_pool_idle', {
	description: 'Number of idle database connections available in the pool',
	unit: '1'
});

export const dbConnectionPoolWaiting = meter.createObservableGauge('db_connection_pool_waiting', {
	description: 'Number of operations waiting for a database connection',
	unit: '1'
});

if (pool) {
	meter.addBatchObservableCallback(
		(observableResult) => {
			try {
				const total = Number(pool.totalCount ?? 0);
				const idle = Number(pool.idleCount ?? 0);
				const waiting = Number(pool.waitingCount ?? 0);
				const inUse = Math.max(total - idle, 0);

				observableResult.observe(dbConnectionPoolSize, total);
				observableResult.observe(dbConnectionPoolInUse, inUse);
				observableResult.observe(dbConnectionPoolIdle, idle);
				observableResult.observe(dbConnectionPoolWaiting, waiting);
			} catch (error) {
				logger.warn({ msg: 'Failed to observe database pool metrics', error });
			}
		},
		[dbConnectionPoolSize, dbConnectionPoolInUse, dbConnectionPoolIdle, dbConnectionPoolWaiting]
	);
} else {
	logger.debug('Database pool metrics disabled: pool not initialized');
}

/**
 * ESI API Metrics
 */
export const esiRequestCounter = meter.createCounter('esi_requests_total', {
	description: 'Total number of ESI API requests',
	unit: '1'
});

export const esiRequestDuration = meter.createHistogram('esi_request_duration_seconds', {
	description: 'ESI API request duration in seconds',
	unit: 's'
});

export const esiResponseStatusCounter = meter.createCounter('esi_response_status_total', {
	description: 'Total number of ESI API responses by status code',
	unit: '1'
});

// Track the latest ESI rate limit values
let latestEsiErrorLimitRemain = 0;
let latestEsiErrorLimitReset = 0;

export const esiErrorLimitRemain = meter.createObservableGauge('esi_error_limit_remain', {
	description: 'Remaining ESI error limit before rate limiting',
	unit: '1'
});

export const esiErrorLimitReset = meter.createObservableGauge('esi_error_limit_reset', {
	description: 'Seconds until ESI error limit resets',
	unit: 's'
});

export const esiConcurrentRequests = meter.createUpDownCounter('esi_concurrent_requests', {
	description: 'Number of concurrent ESI API requests',
	unit: '1'
});

meter.addBatchObservableCallback(
	(observableResult) => {
		if (Number.isFinite(latestEsiErrorLimitRemain)) {
			observableResult.observe(esiErrorLimitRemain, latestEsiErrorLimitRemain);
		}
		if (Number.isFinite(latestEsiErrorLimitReset)) {
			observableResult.observe(esiErrorLimitReset, latestEsiErrorLimitReset);
		}
	},
	[esiErrorLimitRemain, esiErrorLimitReset]
);

/**
 * CRON Job Metrics
 */
export const cronJobCounter = meter.createCounter('cron_job_executions_total', {
	description: 'Total number of CRON job executions',
	unit: '1'
});

export const cronJobDuration = meter.createHistogram('cron_job_duration_seconds', {
	description: 'CRON job execution duration in seconds',
	unit: 's'
});

export const cronJobSuccessCounter = meter.createCounter('cron_job_success_total', {
	description: 'Total number of successful CRON job executions',
	unit: '1'
});

export const cronJobErrorCounter = meter.createCounter('cron_job_errors_total', {
	description: 'Total number of failed CRON job executions',
	unit: '1'
});

/**
 * Cache Metrics
 */
export const cacheHitCounter = meter.createCounter('cache_hits_total', {
	description: 'Total number of cache hits',
	unit: '1'
});

export const cacheMissCounter = meter.createCounter('cache_misses_total', {
	description: 'Total number of cache misses',
	unit: '1'
});

/**
 * Business Metrics
 */
export const scansProcessedCounter = meter.createCounter('scans_processed_total', {
	description: 'Total number of scans processed',
	unit: '1'
});

export const scanItemsCount = meter.createHistogram('scan_items_count', {
	description: 'Number of items in a scan',
	unit: '1'
});

export const scanDuration = meter.createHistogram('scan_processing_duration_seconds', {
	description: 'Time taken to process a scan',
	unit: 's'
});

export const charactersUpdatedCounter = meter.createCounter('characters_updated_total', {
	description: 'Total number of characters updated',
	unit: '1'
});

export const corporationsUpdatedCounter = meter.createCounter('corporations_updated_total', {
	description: 'Total number of corporations updated',
	unit: '1'
});

export const alliancesUpdatedCounter = meter.createCounter('alliances_updated_total', {
	description: 'Total number of alliances updated',
	unit: '1'
});

/**
 * Helper function to record HTTP request metrics
 *
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {string} route - Route path
 * @param {number} statusCode - HTTP status code
 * @param {number} durationMs - Request duration in milliseconds
 */
export function recordHttpRequest(method, route, statusCode, durationMs) {
	const attributes = { method, route, status: statusCode.toString() };

	httpRequestCounter.add(1, attributes);
	httpRequestDuration.record(durationMs / 1000, attributes);
	httpResponseStatusCounter.add(1, { status: statusCode.toString() });
}

/**
 * Helper function to record ESI API request metrics
 *
 * @param {string} method - HTTP method (GET, POST, etc.)
 * @param {number} statusCode - HTTP status code
 * @param {number} durationMs - Request duration in milliseconds
 * @param {number|null} errorLimitRemain - Value from x-esi-error-limit-remain header
 * @param {number|null} errorLimitReset - Value from x-esi-error-limit-reset header
 * @param {string} resourceType - Type of ESI resource (character, corporation, etc.)
 */
export function recordEsiRequest(
	method,
	statusCode,
	durationMs,
	errorLimitRemain = null,
	errorLimitReset = null,
	resourceType = 'unknown'
) {
	const attributes = { method, status: statusCode.toString(), resource: resourceType };

	// Record basic metrics without endpoint to avoid high cardinality
	esiRequestCounter.add(1, attributes);
	esiRequestDuration.record(durationMs / 1000, { method, resource: resourceType });
	esiResponseStatusCounter.add(1, { status: statusCode.toString() });

	// Update rate limit gauges if headers are present
	if (errorLimitRemain !== null && !isNaN(errorLimitRemain)) {
		latestEsiErrorLimitRemain = parseInt(errorLimitRemain, 10);
	}
	if (errorLimitReset !== null && !isNaN(errorLimitReset)) {
		latestEsiErrorLimitReset = parseInt(errorLimitReset, 10);
	}
}

/**
 * Helper function to record CRON job execution metrics
 *
 * @param {string} jobName - Name of the CRON job
 * @param {number} durationMs - Job duration in milliseconds
 * @param {boolean} success - Whether the job succeeded
 */
export function recordCronJob(jobName, durationMs, success = true) {
	const attributes = { job: jobName, success: success.toString() };

	cronJobCounter.add(1, attributes);
	cronJobDuration.record(durationMs / 1000, attributes);

	if (success) {
		cronJobSuccessCounter.add(1, { job: jobName });
	} else {
		cronJobErrorCounter.add(1, { job: jobName });
	}
}

logger.info('Metrics module initialized');
