import { describe, it, expect } from 'vitest';
import { execFile } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';
import { otlpMetricsEnabled, otlpSignalUrl } from '../../../src/lib/server/telemetry.js';

describe('otlpSignalUrl', () => {
	it.each([
		['http://collector:4318', 'traces', 'http://collector:4318/v1/traces'],
		['http://collector:4318/', 'metrics', 'http://collector:4318/v1/metrics'],
		['http://collector:4318/v1/traces', 'traces', 'http://collector:4318/v1/traces'],
		['http://collector:4318/v1/traces', 'metrics', 'http://collector:4318/v1/metrics'],
		['https://otel.example/otlp/v1/metrics/', 'traces', 'https://otel.example/otlp/v1/traces']
	])('%s -> %s URL', (endpoint, signal, expected) => {
		expect(otlpSignalUrl(endpoint, signal)).toBe(expected);
	});

	it.each([[undefined], [null], [''], ['   ']])('disables export for %j', (endpoint) => {
		expect(otlpSignalUrl(endpoint, 'traces')).toBeNull();
	});
});

describe('otlpMetricsEnabled (OTEL_METRICS_EXPORTER)', () => {
	it.each([[undefined], [''], ['otlp'], ['prometheus, OTLP']])(
		'pushes OTLP metrics for %j',
		(v) => {
			expect(otlpMetricsEnabled(v)).toBe(true);
		}
	);

	it.each([['prometheus'], ['none'], ['console']])('keeps metrics off OTLP for %j', (v) => {
		expect(otlpMetricsEnabled(v)).toBe(false);
	});
});

describe('startTelemetry ESM loader hooks', () => {
	// Loader hooks are process-wide, so this runs in a child process.
	const url = (path) => pathToFileURL(fileURLToPath(new URL(path, import.meta.url))).href;
	const script = `
		const { startTelemetry } = await import(${JSON.stringify(url('../../../src/lib/server/telemetry.js'))});
		const telemetry = startTelemetry({
			serviceName: 'test', serviceVersion: '0', environment: 'test', prometheusPort: 0
		});
		await telemetry.ready;
		const live = await import(${JSON.stringify(url('../../fixtures/live-binding.mjs'))});
		live.update('updated');
		const { default: pg } = await import('pg');
		console.log(JSON.stringify({
			liveBinding: live.value,
			pgPatched: Boolean(pg.Client.prototype.query.__wrapped)
		}));
		await telemetry.shutdown('test', 500);
		process.exit(0);
	`;

	it('patches instrumented packages but leaves live bindings of other modules intact', async () => {
		const { stdout } = await promisify(execFile)(
			process.execPath,
			['--input-type=module', '-e', script],
			{ env: { ...process.env, OTEL_EXPORTER_OTLP_ENDPOINT: '', LOG_LEVEL: 'silent' } }
		);
		const result = JSON.parse(stdout.trim().split('\n').at(-1));
		expect(result).toEqual({ liveBinding: 'updated', pgPatched: true });
	}, 30000);
});
