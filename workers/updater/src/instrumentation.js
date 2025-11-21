import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader, MeterProvider } from '@opentelemetry/sdk-metrics';
import { AggregationType } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { metrics } from '@opentelemetry/api';
import { ExportResultCode } from '@opentelemetry/core';
import { createAllowListAttributesProcessor } from '@opentelemetry/sdk-metrics/build/src/view/AttributesProcessor.js';
import { config } from './config.js';
import logger from '../../../src/lib/logger.js';
import { readFileSync } from 'fs';
import {
	CRON_DURATION_BOUNDARIES,
	ESI_DURATION_BOUNDARIES,
	HTTP_DURATION_BOUNDARIES
} from '../../../src/lib/server/histogram-boundaries.js';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

const environment = config.DB_ENV || config.NODE_ENV || 'dev';
const serviceBasename = config.OTEL_SERVICE_NAME || 'd-scan.space';
const serviceName = `${serviceBasename}_updater_${environment}`;

const resource = resourceFromAttributes({
	[ATTR_SERVICE_NAME]: serviceName,
	[ATTR_SERVICE_VERSION]: pkg.version,
	'deployment.environment': environment
});

// Create trace exporter with retry logic
const traceExporter = new OTLPTraceExporter({
	url: config.OTEL_EXPORTER_OTLP_ENDPOINT,
	headers: {
		Authorization: config.OTEL_EXPORTER_OTLP_AUTHORIZATION
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

const cronViewOptions = {
	instrumentName: 'cron_job_duration_seconds',
	meterName: 'd-scan.space',
	aggregation: {
		type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
		options: { boundaries: CRON_DURATION_BOUNDARIES }
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

logger.info({
	msg: 'Configuring metric views',
	dbOperationViewOptions,
	cronViewOptions,
	esiViewOptions,
	httpViewOptions
});

const viewOptions = [dbOperationViewOptions, cronViewOptions, esiViewOptions, httpViewOptions];

const metricReaders = [
	new PeriodicExportingMetricReader({
		exporter: new OTLPMetricExporter({
			url: config.OTEL_EXPORTER_OTLP_ENDPOINT.replace('/v1/traces', '/v1/metrics'),
			headers: {
				Authorization: config.OTEL_EXPORTER_OTLP_AUTHORIZATION
			}
		}),
		exportIntervalMillis: 1000
	})
];

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

export function startInstrumentation() {
	try {
		logger.info('Starting OpenTelemetry SDK...');
		sdk.start();
		logger.info(
			`OpenTelemetry SDK started successfully\n URL: ${config.OTEL_EXPORTER_OTLP_ENDPOINT}`
		);
	} catch (error) {
		logger.error('Failed to start OpenTelemetry SDK:', error);
	}
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

process.on('SIGTERM', () => shutdownTelemetry('SIGTERM'));
process.on('SIGINT', () => shutdownTelemetry('SIGINT'));
