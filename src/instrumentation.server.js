// Loaded by SvelteKit before the app (kit.experimental.instrumentation.server), so pg is
// patched before it is imported. Setup shared with the worker: $lib/server/telemetry.js.
import { readFileSync } from 'node:fs';
import { env } from '$env/dynamic/private';
import { startTelemetry } from '$lib/server/telemetry.js';

const read = (name) => env[name] || process.env[name] || '';

// adapter-node runs from the project root (Dockerfile: /app with package.json beside build/).
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

const environment = read('DB_ENV') || read('DEPLOYMENT_ENV') || read('NODE_ENV') || 'dev';

const telemetry = startTelemetry({
	serviceName: `${read('OTEL_SERVICE_NAME') || 'd-scan.space'}_app_${environment}`,
	serviceVersion: pkg.version,
	environment,
	otlpEndpoint: read('OTEL_EXPORTER_OTLP_ENDPOINT'),
	otlpAuthorization: read('OTEL_EXPORTER_OTLP_AUTHORIZATION'),
	prometheusPort: Number.parseInt(read('PROMETHEUS_PORT'), 10) || 9464,
	metricExportIntervalMs: Number.parseInt(read('OTEL_METRIC_EXPORT_INTERVAL'), 10) || undefined,
	metricsExporter: read('OTEL_METRICS_EXPORTER')
});
// The app is imported after this module; make sure the loader knows which modules to patch.
await telemetry.ready;

// adapter-node owns SIGINT/SIGTERM: it stops accepting connections, drains in-flight
// requests and then emits `sveltekit:shutdown`. Flushing here (instead of exiting from a
// signal handler) keeps that graceful drain intact. The DB pool closes on the same event
// (src/hooks.server.js). Under `vite dev` the event is not emitted; signals end the process.
process.on('sveltekit:shutdown', (reason) => telemetry.shutdown(reason));
