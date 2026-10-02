/**
 * OpenTelemetry setup shared by the app (src/instrumentation.server.js) and the updater
 * worker (workers/updater/src/instrumentation.js). Must be started before the modules it
 * instruments (pg) are loaded.
 *
 * - Prometheus `/metrics` on PROMETHEUS_PORT is always served.
 * - OTLP export (traces + metrics) only when an endpoint is configured. Both the base form
 *   (`http://collector:4318`, as in the OTel spec) and a signal URL
 *   (`http://collector:4318/v1/traces`, this project's historical form) are accepted.
 * - The NodeSDK gets every reader/processor explicitly, so it does not add its own
 *   env-driven OTLP metric and log pipelines (which posted to `<endpoint>/v1/metrics`
 *   next to ours, or `/v1/traces/v1/metrics`) or register a second MeterProvider.
 */
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import {
	AggregationType,
	PeriodicExportingMetricReader,
	createAllowListAttributesProcessor
} from '@opentelemetry/sdk-metrics';
import { setGlobalErrorHandler } from '@opentelemetry/core';
import { createAddHookMessageChannel } from 'import-in-the-middle';
import { register as registerLoaderHooks } from 'import-in-the-middle/register-hooks.mjs';
import logger from '../logger.js';
import {
	CRON_DURATION_BOUNDARIES,
	ESI_DURATION_BOUNDARIES,
	HTTP_DURATION_BOUNDARIES
} from './histogram-boundaries.js';

const DEFAULT_METRIC_EXPORT_INTERVAL_MS = 15_000;
const ERROR_LOG_INTERVAL_MS = 60_000;

/**
 * OTLP/HTTP URL for one signal, from either endpoint form.
 * @param {string | undefined | null} endpoint
 * @param {'traces' | 'metrics' | 'logs'} signal
 * @returns {string | null} null when no endpoint is configured
 */
export function otlpSignalUrl(endpoint, signal) {
	const trimmed = endpoint?.trim();
	if (!trimmed) return null;
	const base = trimmed.replace(/\/+$/, '').replace(/\/v1\/(traces|metrics|logs)$/, '');
	return `${base}/v1/${signal}`;
}

/** Collapses whitespace in pg's `db.operation.name` so metric series stay bounded. */
class TrimDbOperationNameAttributesProcessor {
	_operationNameKeys = ['db.operation.name', 'db_operation_name'];

	process(attributes) {
		for (const key of this._operationNameKeys) {
			const value = attributes[key];
			if (typeof value !== 'string') continue;

			const normalized = value.replace(/\s+/g, ' ').trim();
			if (normalized.length === 0) {
				const updatedAttributes = { ...attributes };
				delete updatedAttributes[key];
				return updatedAttributes;
			}
			if (normalized !== value) return { ...attributes, [key]: normalized };
		}
		return attributes;
	}
}

const histogramView = (instrumentName, boundaries) => ({
	instrumentName,
	meterName: 'd-scan.space',
	aggregation: { type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM, options: { boundaries } }
});

const METRIC_VIEWS = [
	{
		instrumentName: 'db.client.operation.duration',
		attributesProcessors: [
			new TrimDbOperationNameAttributesProcessor(),
			createAllowListAttributesProcessor([
				'db.system',
				'db.namespace',
				'server.address',
				'server.port',
				'db.operation.name'
			])
		],
		aggregation: { type: AggregationType.DEFAULT }
	},
	histogramView('cron_job_duration_seconds', CRON_DURATION_BOUNDARIES),
	histogramView('esi_request_duration_seconds', ESI_DURATION_BOUNDARIES),
	histogramView('http_request_duration_seconds', HTTP_DURATION_BOUNDARIES)
];

/**
 * Export errors (collector down, rejected payload) reach OTel's global error handler,
 * which by default writes to the silent diag logger. Log each distinct error at most once
 * a minute, so a failing signal (e.g. metrics 404) cannot hide another (traces).
 */
function logExportErrors() {
	/** @type {Map<string, { lastLogged: number, suppressed: number }>} */
	const seen = new Map();
	setGlobalErrorHandler((err) => {
		const key = String(err?.message ?? err).slice(0, 200);
		const now = Date.now();
		const entry = seen.get(key) ?? { lastLogged: 0, suppressed: 0 };
		if (now - entry.lastLogged < ERROR_LOG_INTERVAL_MS) {
			entry.suppressed++;
			seen.set(key, entry);
			return;
		}
		logger.warn({ err, suppressedSinceLastLog: entry.suppressed }, 'OpenTelemetry export error');
		seen.set(key, { lastLogged: now, suppressed: 0 });
	});
}

/**
 * OTLP metrics follow the standard `OTEL_METRICS_EXPORTER` list: unset/empty = otlp (when
 * an endpoint is configured); a list without `otlp` (e.g. `prometheus`, `none`) keeps
 * metrics on Prometheus only — for collectors that accept traces but not metrics.
 * @param {string | undefined} value
 */
export function otlpMetricsEnabled(value) {
	const exporters = (value ?? '')
		.split(',')
		.map((name) => name.trim().toLowerCase())
		.filter(Boolean);
	return exporters.length === 0 || exporters.includes('otlp');
}

const TELEMETRY_INSTANCE = Symbol.for('d-scan.space/telemetry');

/**
 * Starts the SDK. Never throws: telemetry problems must not stop the process.
 * @param {{
 *   serviceName: string,
 *   serviceVersion: string,
 *   environment: string,
 *   otlpEndpoint?: string,
 *   otlpAuthorization?: string,
 *   prometheusPort: number,
 *   metricExportIntervalMs?: number,
 *   metricsExporter?: string
 * }} options
 * @returns {{ ready: Promise<void>, shutdown: (reason: string, timeoutMs?: number) => Promise<void> }}
 */
export function startTelemetry({
	serviceName,
	serviceVersion,
	environment,
	otlpEndpoint,
	otlpAuthorization,
	prometheusPort,
	metricExportIntervalMs = DEFAULT_METRIC_EXPORT_INTERVAL_MS,
	metricsExporter
}) {
	// `vite dev` re-evaluates instrumentation.server.js when it or its imports change; a
	// second SDK would fail global registration and the Prometheus port. One per process.
	const running = globalThis[TELEMETRY_INSTANCE];
	if (running) return running;

	// ESM modules can only be patched through import-in-the-middle's loader hooks, installed
	// in-thread with `module.registerHooks()` (`module.register()` is deprecated, DEP0205).
	// Only modules an instrumentation hooks may be wrapped: each `Hook()` sends its module
	// names over this channel and the loader starts from an empty include list. Without it
	// every ESM module is wrapped, and wrapped modules hand importers a snapshot of their
	// exports instead of live bindings (the built app then lost SvelteKit's private env).
	const { registerOptions, waitForAllMessagesAcknowledged } = createAddHookMessageChannel();
	registerLoaderHooks(registerOptions.data);
	logExportErrors();

	const tracesUrl = otlpSignalUrl(otlpEndpoint, 'traces');
	const metricsUrl = otlpMetricsEnabled(metricsExporter)
		? otlpSignalUrl(otlpEndpoint, 'metrics')
		: null;
	const headers = otlpAuthorization ? { Authorization: otlpAuthorization } : {};

	const metricReaders = [
		new PrometheusExporter({ port: prometheusPort, endpoint: '/metrics' }, () => {
			logger.info(`Prometheus metrics available at http://localhost:${prometheusPort}/metrics`);
		})
	];
	if (metricsUrl) {
		metricReaders.push(
			new PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter({ url: metricsUrl, headers }),
				exportIntervalMillis: metricExportIntervalMs
			})
		);
	}

	const sdk = new NodeSDK({
		resource: resourceFromAttributes({
			[ATTR_SERVICE_NAME]: serviceName,
			[ATTR_SERVICE_VERSION]: serviceVersion,
			'deployment.environment': environment
		}),
		// Batch size/delay/timeouts: SDK defaults, tunable with the standard OTEL_BSP_* vars.
		spanProcessors: tracesUrl
			? [new BatchSpanProcessor(new OTLPTraceExporter({ url: tracesUrl, headers }))]
			: [],
		metricReaders,
		views: METRIC_VIEWS,
		logRecordProcessors: [],
		instrumentations: [
			getNodeAutoInstrumentations({
				// Manual spans cover HTTP/ESI; these would only add noise.
				'@opentelemetry/instrumentation-dns': { enabled: false },
				'@opentelemetry/instrumentation-net': { enabled: false },
				'@opentelemetry/instrumentation-fs': { enabled: false },
				'@opentelemetry/instrumentation-fetch': { enabled: false },
				'@opentelemetry/instrumentation-undici': { enabled: false },
				'@opentelemetry/instrumentation-http': { enabled: false },
				'@opentelemetry/instrumentation-pg': { enabled: true }
			})
		]
	});

	try {
		sdk.start();
		logger.info(
			{
				serviceName,
				environment,
				traces: tracesUrl ?? 'disabled (OTEL_EXPORTER_OTLP_ENDPOINT not set)',
				metrics: metricsUrl ?? 'prometheus only',
				metricExportIntervalMs: metricsUrl ? metricExportIntervalMs : undefined,
				// Never log the credential itself, only whether one is configured.
				authorization: Boolean(otlpAuthorization)
			},
			'OpenTelemetry SDK started'
		);
	} catch (err) {
		logger.error({ err }, 'Failed to start OpenTelemetry SDK');
	}

	const telemetry = {
		/**
		 * Resolves once the loader knows every module the instrumentations hook. Await it
		 * before importing application code, or those modules load unpatched.
		 */
		ready: waitForAllMessagesAcknowledged(),
		/**
		 * Flushes and stops telemetry, giving up after `timeoutMs`: exporters retry an
		 * unreachable collector far longer than a container's stop timeout.
		 */
		async shutdown(reason, timeoutMs = 3000) {
			logger.info({ reason }, 'Flushing telemetry...');
			let timer;
			const timedOut = new Promise((resolve) => {
				timer = setTimeout(() => resolve(false), timeoutMs);
			});
			try {
				const flushed = await Promise.race([sdk.shutdown().then(() => true), timedOut]);
				if (flushed) logger.info('OpenTelemetry SDK shut down');
				else logger.warn({ timeoutMs }, 'Telemetry flush timed out; unsent telemetry is dropped');
			} catch (err) {
				logger.error({ err }, 'Error shutting down OpenTelemetry SDK');
			} finally {
				clearTimeout(timer);
			}
		}
	};
	globalThis[TELEMETRY_INSTANCE] = telemetry;
	return telemetry;
}
