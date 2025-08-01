import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import pkg from './package.json' with { type: 'json' }; // eslint-disable-line
import logger from './src/lib/logger.js';

const traceExporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
    headers: {
        'Authorization': `${process.env.OTEL_EXPORTER_OTLP_AUTHORIZATION || ''}`
    },
});

// Add error handling for the exporter with retry logic
traceExporter.export = ((originalExport) => {
    return function(spans, resultCallback) {
        logger.info(`Exporting ${spans.length} spans`);

        const attemptExport = async (attempt = 1, maxRetries = 3) => {
            return new Promise((resolve) => {
                originalExport.call(this, spans, (result) => {
                    if (result.code !== 0 && attempt < maxRetries) {
                        logger.warn(`Export attempt ${attempt} failed, retrying... Error: ${result.error}`);
                        setTimeout(() => {
                            attemptExport(attempt + 1, maxRetries).then(resolve);
                        }, Math.pow(2, attempt) * 1000); // Exponential backoff
                    } else {
                        if (result.code !== 0) {
                            logger.error(`Failed to export spans after ${maxRetries} attempts: ${result.error}`);
                        }
                        resolve(result);
                    }
                });
            });
        };

        attemptExport().then(result => resultCallback(result));
    };
})(traceExporter.export.bind(traceExporter));

const sdk = new NodeSDK({
    resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'd-scan.space',
        [ATTR_SERVICE_VERSION]: pkg.version,
    }),
    spanProcessor: new BatchSpanProcessor(traceExporter, {
        // Force faster export for debugging
        scheduledDelayMillis: 5000,
        exportTimeoutMillis: 30000,
        maxExportBatchSize: 512,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
});

// Start SDK synchronously and handle errors
try {
    logger.info('Starting OpenTelemetry SDK...');
    sdk.start();
    logger.info(`OpenTelemetry SDK started successfully\n URL: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}\n Authorization: ${process.env.OTEL_EXPORTER_OTLP_AUTHORIZATION}`);
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