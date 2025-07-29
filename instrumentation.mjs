import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-proto';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions'
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import pkg from './package.json' with { type: 'json' }; // eslint-disable-line

const traceExporter = new OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4317',
    headers: {
        'Authorization': `${process.env.OTEL_EXPORTER_OTLP_AUTHORIZATION || ''}`
    },
});

// Add error handling for the exporter
traceExporter.export = ((originalExport) => {
    return function(spans, resultCallback) {
        console.info(`Attempting to export ${spans.length} spans`);
        return originalExport.call(this, spans, (result) => {
            if (result.code !== 0) {
                console.error('Failed to export spans:', result.error);
            } else {
                console.info('Successfully exported spans');
            }
            resultCallback(result);
        });
    };
})(traceExporter.export.bind(traceExporter));

const sdk = new NodeSDK({
    resource: resourceFromAttributes({
        [ATTR_SERVICE_NAME]: 'd-scan.space',
        [ATTR_SERVICE_VERSION]: pkg.version,
    }),
    spanProcessor: new BatchSpanProcessor(traceExporter, {
        // Force faster export for debugging
        scheduledDelayMillis: 1000,
        exportTimeoutMillis: 30000,
        maxExportBatchSize: 1024,
    }),
    instrumentations: [getNodeAutoInstrumentations()],
});

// Start SDK synchronously and handle errors
try {
    console.info('Starting OpenTelemetry SDK...');
    sdk.start();
    console.info(`OpenTelemetry SDK started successfully\n URL: ${process.env.OTEL_EXPORTER_OTLP_ENDPOINT}\n Authorization: ${process.env.OTEL_EXPORTER_OTLP_AUTHORIZATION}`);
} catch (error) {
    console.error('Failed to start OpenTelemetry SDK:', error);
}

// Handle process exit to ensure spans are flushed
process.on('SIGTERM', async () => {
    try {
        await sdk.shutdown();
        console.info('OpenTelemetry SDK shut down successfully');
    } catch (error) {
        console.error('Error shutting down OpenTelemetry SDK:', error);
    }
    process.exit(0);
});

process.on('SIGINT', async () => {
    try {
        await sdk.shutdown();
        console.info('OpenTelemetry SDK shut down successfully');
    } catch (error) {
        console.error('Error shutting down OpenTelemetry SDK:', error);
    }
    process.exit(0);
});