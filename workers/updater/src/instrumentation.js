import { NodeSDK } from '@opentelemetry/sdk-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { OTLPMetricExporter } from '@opentelemetry/exporter-metrics-otlp-proto';
import { PeriodicExportingMetricReader } from '@opentelemetry/sdk-metrics';
import { AggregationType } from '@opentelemetry/sdk-metrics';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { config } from './config.js';
import logger from '../../../src/lib/logger.js';
import { readFileSync } from 'fs';
import { CRON_DURATION_BOUNDARIES } from '../../../src/lib/server/histogram-boundaries.js';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

const environment = config.DB_ENV || config.NODE_ENV || 'dev';
const serviceBasename = config.OTEL_SERVICE_NAME || 'd-scan.space';
const serviceName = `${serviceBasename}_updater_${environment}`;

const sdk = new NodeSDK({
	resource: new Resource({
		[ATTR_SERVICE_NAME]: serviceName,
		[ATTR_SERVICE_VERSION]: pkg.version,
		'deployment.environment': environment
	}),
	traceExporter: new OTLPTraceExporter({
		url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/traces`,
		headers: {
			Authorization: config.OTEL_EXPORTER_OTLP_AUTHORIZATION
		}
	}),
	metricReader: new PeriodicExportingMetricReader({
		exporter: new OTLPMetricExporter({
			url: `${config.OTEL_EXPORTER_OTLP_ENDPOINT}/v1/metrics`,
			headers: {
				Authorization: config.OTEL_EXPORTER_OTLP_AUTHORIZATION
			}
		}),
		exportIntervalMillis: 1000
	}),
	views: [
		{
			instrumentName: 'cron_job_duration_seconds',
			meterName: 'd-scan.space',
			aggregation: {
				type: AggregationType.EXPLICIT_BUCKET_HISTOGRAM,
				options: { boundaries: CRON_DURATION_BOUNDARIES }
			}
		}
	],
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
	sdk.start();
	logger.info('OpenTelemetry instrumentation started');
}

process.on('SIGTERM', () => {
	sdk
		.shutdown()
		.then(() => logger.info('Tracing terminated'))
		.catch((error) => logger.error('Error terminating tracing', error))
		.finally(() => process.exit(0));
});
