import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PrometheusExporter } from '@opentelemetry/exporter-prometheus';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { createAddHookMessageChannel } from 'import-in-the-middle';
import { register } from 'node:module';
import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
import { env } from '$env/dynamic/private';
import logger from '$lib/logger.js';
import { metrics } from '@opentelemetry/api';
import { PeriodicExportingMetricReader, MeterProvider } from '@opentelemetry/sdk-metrics';
import { AggregationType } from '@opentelemetry/sdk-metrics/build/src/view/AggregationOption.js';
import { createAllowListAttributesProcessor } from '@opentelemetry/sdk-metrics/build/src/view/AttributesProcessor.js';
import { ExportResultCode } from '@opentelemetry/core';
import {
	ESI_DURATION_BOUNDARIES,
	HTTP_DURATION_BOUNDARIES,
	CRON_DURATION_BOUNDARIES
} from '$lib/server/histogram-boundaries.js';

// Set up import-in-the-middle for better instrumentation
const { registerOptions } = createAddHookMessageChannel();
register('import-in-the-middle/hook.mjs', import.meta.url, registerOptions);

// Create trace exporter with retry logic
const traceExporter = new OTLPTraceExporter({
	url:
		env.OTEL_EXPORTER_OTLP_ENDPOINT ||
		process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
		'http://localhost:4318/v1/traces',
	headers: {
		Authorization: `${env.OTEL_EXPORTER_OTLP_AUTHORIZATION || process.env.OTEL_EXPORTER_OTLP_AUTHORIZATION || ''}`
	}
});

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class RetryingSpanExporter {
	constructor(exporter, { maxRetries = 3, baseDelayMillis = 500 } = {}) {
		this._exporter = exporter;
		this._maxRetries = maxRetries;
		this._baseDelayMillis = baseDelayMillis;
	}

	export(spans, resultCallback) {
		const attempt = async (currentAttempt = 1) => {
			const result = await new Promise((resolve) => {
				this._exporter.export(spans, resolve);
			});

			if (result.code === ExportResultCode.SUCCESS || currentAttempt >= this._maxRetries) {
				if (result.code !== ExportResultCode.SUCCESS) {
					logger.error(
						`Failed to export spans after ${currentAttempt} attempts: ${result.error || 'unknown error'}`
					);
				}
				resultCallback(result);
				return;
			}

			logger.warn(
				`Span export failed (attempt ${currentAttempt}/${this._maxRetries}), retrying... ${result.error || ''}`
			);
			const delay = Math.pow(2, currentAttempt - 1) * this._baseDelayMillis;
			await wait(delay);
			return attempt(currentAttempt + 1);
		};

		attempt();
	}

	async shutdown() {
		if (typeof this._exporter.shutdown === 'function') {
			await this._exporter.shutdown();
		}
	}

	async forceFlush() {
		if (typeof this._exporter.forceFlush === 'function') {
			await this._exporter.forceFlush();
		}
	}
}

const retryingTraceExporter = new RetryingSpanExporter(traceExporter, {
	maxRetries: 3,
	baseDelayMillis: 1000
});

// Set up Prometheus exporter for metrics
const prometheusPort = parseInt(env.PROMETHEUS_PORT || process.env.PROMETHEUS_PORT || '9464');
const prometheusExporter = new PrometheusExporter(
	{
		port: prometheusPort,
		endpoint: '/metrics'
	},
	() => {
		logger.info(`Prometheus metrics available at http://localhost:${prometheusPort}/metrics`);
	}
);

// Create resource for metrics
const environment =
	env.DEPLOYMENT_ENV ||
	env.VERCEL_ENV ||
	env.NODE_ENV ||
	process.env.DEPLOYMENT_ENV ||
	process.env.NODE_ENV ||
	'local';

const resource = resourceFromAttributes({
	[ATTR_SERVICE_NAME]: 'd-scan.space',
	[ATTR_SERVICE_VERSION]: pkg.version,
	'deployment.environment': environment
});

// Prepare metric readers array
const metricReaders = [prometheusExporter];

// Optionally, add OTLP metric exporter if configured
if (env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_ENDPOINT) {
	const otlpMetricExporter = new OTLPMetricExporter({
		url:
			(env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_ENDPOINT).replace(
				'/v1/traces',
				'/v1/metrics'
			) || 'http://localhost:4318/v1/metrics',
		headers: {
			Authorization: `${env.OTEL_EXPORTER_OTLP_AUTHORIZATION || process.env.OTEL_EXPORTER_OTLP_AUTHORIZATION || ''}`
		}
	});

	metricReaders.push(
		new PeriodicExportingMetricReader({
			exporter: otlpMetricExporter,
			exportIntervalMillis: 1000 // Export every 1 second
		})
	);
	logger.info('OTLP metric exporter configured');
}

class TrimDbOperationNameAttributesProcessor {
	_operationNameKeys = ['db.operation.name', 'db_operation_name'];

	process(attributes) {
		for (const key of this._operationNameKeys) {
			const value = attributes[key];
			if (typeof value !== 'string') {
				continue;
			}

			const normalized = value.replace(/\s+/g, ' ').trim();
			if (normalized.length === 0) {
				const updatedAttributes = { ...attributes };
				delete updatedAttributes[key];
				return updatedAttributes;
			}

			if (normalized !== value) {
				return { ...attributes, [key]: normalized };
			}
		}

		return attributes;
	}
}

const dbOperationViewOptions = {
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
	aggregation: {
		type: AggregationType.DEFAULT
	}
};

const esiViewOptions = {
	instrumentName: 'esi_request_duration_seconds',
	meterName: 'd-scan.space',
	aggregation: {
		type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
		options: { boundaries: ESI_DURATION_BOUNDARIES }
	}
};

const httpViewOptions = {
	instrumentName: 'http_request_duration_seconds',
	meterName: 'd-scan.space',
	aggregation: {
		type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
		options: { boundaries: HTTP_DURATION_BOUNDARIES }
	}
};

const cronViewOptions = {
	instrumentName: 'cron_job_duration_seconds',
	meterName: 'd-scan.space',
	aggregation: {
		type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
		options: { boundaries: CRON_DURATION_BOUNDARIES }
	}
};

logger.info({
	msg: 'Configuring metric views',
	dbOperationViewOptions,
	esiViewOptions,
	httpViewOptions,
	cronViewOptions
});

const viewOptions = [dbOperationViewOptions, esiViewOptions, httpViewOptions, cronViewOptions];

const meterProvider = new MeterProvider({
	resource: resource,
	readers: metricReaders,
	views: viewOptions
});

// Set the global meter provider
metrics.setGlobalMeterProvider(meterProvider);

const sdk = new NodeSDK({
	resource: resource,
	spanProcessor: new BatchSpanProcessor(retryingTraceExporter, {
		// Force faster export for debugging
		scheduledDelayMillis: 1000,
		exportTimeoutMillis: 30000,
		maxExportBatchSize: 1000
	}),
	instrumentations: [
		getNodeAutoInstrumentations({
			// Disable the noisiest ones completely
			'@opentelemetry/instrumentation-dns': { enabled: false },
			'@opentelemetry/instrumentation-net': { enabled: false },
			'@opentelemetry/instrumentation-fs': { enabled: false },
			'@opentelemetry/instrumentation-fetch': { enabled: false },
			'@opentelemetry/instrumentation-undici': { enabled: false },
			'@opentelemetry/instrumentation-http': { enabled: false },
			// Enable PostgreSQL instrumentation with metrics
			'@opentelemetry/instrumentation-pg': {
				enabled: true
			}
		})
	]
});

// Start SDK synchronously and handle errors
try {
	logger.info('Starting OpenTelemetry SDK...');
	sdk.start();
	logger.info(
		`OpenTelemetry SDK started successfully\n URL: ${env.OTEL_EXPORTER_OTLP_ENDPOINT || process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces'}\n Authorization: ${env.OTEL_EXPORTER_OTLP_AUTHORIZATION || process.env.OTEL_EXPORTER_OTLP_AUTHORIZATION || ''}`
	);
} catch (error) {
	logger.error('Failed to start OpenTelemetry SDK:', error);
}

async function shutdownTelemetry(signal) {
	try {
		logger.info(`Received ${signal}. Flushing telemetry...`);
		await sdk.shutdown();
		await meterProvider.shutdown();
		logger.info('OpenTelemetry SDK shut down successfully');
	} catch (error) {
		logger.error('Error shutting down OpenTelemetry SDK:', error);
	} finally {
		process.exit(0);
	}
}

// Handle process exit to ensure spans are flushed
process.on('SIGTERM', () => shutdownTelemetry('SIGTERM'));
process.on('SIGINT', () => shutdownTelemetry('SIGINT'));
