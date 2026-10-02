// Docker HEALTHCHECK for the updater. Standalone on purpose: importing the worker graph
// would start OpenTelemetry and a DB pool. Keep defaults in sync with config.js.
import { readFileSync } from 'node:fs';

const file = process.env.HEALTHCHECK_FILE || '/tmp/d-scan-updater.heartbeat';
const maxAgeMs = Number.parseInt(process.env.HEALTHCHECK_MAX_AGE_MS ?? '', 10) || 15 * 60 * 1000;

let reason;
try {
	const last = Date.parse(readFileSync(file, 'utf8').trim());
	if (Number.isNaN(last)) {
		reason = `heartbeat file ${file} has no valid timestamp`;
	} else if (Date.now() - last > maxAgeMs) {
		reason = `last successful run ${new Date(last).toISOString()} is older than ${maxAgeMs} ms`;
	}
} catch (err) {
	reason = `cannot read heartbeat file ${file}: ${err.code ?? err.message}`;
}

if (reason) {
	process.stderr.write(`unhealthy: ${reason}\n`);
	process.exit(1);
}
process.exit(0);
