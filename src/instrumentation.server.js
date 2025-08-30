import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { createAddHookMessageChannel } from 'import-in-the-middle';
import { register } from 'node:module';
import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
import { env } from '$env/dynamic/private';
import logger from '$lib/logger.js';

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

// Add error handling for the exporter with retry logic
traceExporter.export = ((originalExport) => {
	return function (spans, resultCallback) {
		const attemptExport = async (attempt = 1, maxRetries = 3) => {
			logger.info(`Exporting ${spans.length} spans, attempt ${attempt}/${maxRetries}`);
			return new Promise((resolve) => {
				originalExport.call(this, spans, (result) => {
					if (result.code !== 0 && attempt < maxRetries) {
						logger.warn(`Export attempt ${attempt} failed, retrying... Error: ${result.error}`);
						setTimeout(
							() => {
								attemptExport(attempt + 1, maxRetries).then(resolve);
							},
							Math.pow(2, attempt) * 1000
						); // Exponential backoff
					} else {
						if (result.code !== 0) {
							logger.error(`Failed to export spans after ${maxRetries} attempts: ${result.error}`);
						}
						resolve(result);
					}
				});
			});
		};

		attemptExport().then((result) => resultCallback(result));
	};
})(traceExporter.export.bind(traceExporter));

const sdk = new NodeSDK({
	resource: resourceFromAttributes({
		[ATTR_SERVICE_NAME]: 'd-scan.space',
		[ATTR_SERVICE_VERSION]: pkg.version
	}),
	spanProcessor: new BatchSpanProcessor(traceExporter, {
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
			// Enable PostgreSQL instrumentation
			'@opentelemetry/instrumentation-pg': { enabled: true }
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

// Handle process exit to ensure spans are flushed
process.on('SIGTERM', async () => {
	try {
		await sdk.shutdown();
		logger.info('OpenTelemetry SDK shut down successfully');
	} catch (error) {
		logger.error('Error shutting down OpenTelemetry SDK:', error);
	}
	process.exit(0);
});

process.on('SIGINT', async () => {
	try {
		await sdk.shutdown();
		logger.info('OpenTelemetry SDK shut down successfully');
	} catch (error) {
		logger.error('Error shutting down OpenTelemetry SDK:', error);
	}
	process.exit(0);
});
