// Loaded with `node --import` (package.json `start`, Dockerfile) so the SDK and the
// import-in-the-middle hooks are in place before the worker's modules (pg, ...) load;
// ESM hooks do not patch modules that were loaded before them.
import { readFileSync } from 'node:fs';
import { config } from './config.js';
import { startTelemetry } from '../../../src/lib/server/telemetry.js';

const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const environment = config.DB_ENV || config.NODE_ENV || 'dev';

const telemetry = startTelemetry({
	serviceName: `${config.OTEL_SERVICE_NAME}_updater_${environment}`,
	serviceVersion: pkg.version,
	environment,
	otlpEndpoint: config.OTEL_EXPORTER_OTLP_ENDPOINT,
	otlpAuthorization: config.OTEL_EXPORTER_OTLP_AUTHORIZATION,
	prometheusPort: Number.parseInt(String(config.PROMETHEUS_PORT), 10) || 9464,
	metricExportIntervalMs:
		Number.parseInt(process.env.OTEL_METRIC_EXPORT_INTERVAL ?? '', 10) || undefined,
	metricsExporter: process.env.OTEL_METRICS_EXPORTER
});
// `--import` modules finish before the worker loads; the loader must know what to patch.
await telemetry.ready;

/**
 * Flushes and stops telemetry (bounded, see startTelemetry).
 * @param {string} signal
 */
export function shutdownTelemetry(signal) {
	return telemetry.shutdown(signal);
}
