import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { Resource } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { config } from './config.js';
import { readFileSync } from 'fs';

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

const environment = config.DB_ENV || config.NODE_ENV || 'dev';
const serviceBasename = config.OTEL_SERVICE_NAME || 'd-scan.space';
const serviceName = `${serviceBasename}_static_${environment}`;

const traceExporter = new OTLPTraceExporter({
	url: config.OTEL_EXPORTER_OTLP_ENDPOINT,
	headers: {
		Authorization: config.OTEL_EXPORTER_OTLP_AUTHORIZATION
	}
});

const sdk = new NodeSDK({
	resource: new Resource({
		[ATTR_SERVICE_NAME]: serviceName,
		[ATTR_SERVICE_VERSION]: pkg.version,
		'deployment.environment': environment
	}),
	traceExporter,
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
}
