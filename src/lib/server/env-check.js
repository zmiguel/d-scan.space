/**
 * Startup validation of environment variables (production only; dev keeps its defaults).
 * Missing `required` variables stop the process with one message naming all of them;
 * missing `recommended` ones are logged as a warning so existing deployments keep
 * starting. Plain process.env is used: the worker has no SvelteKit `$env`, and
 * adapter-node exposes the same values there.
 */
import logger from '../logger.js';

/** App: without these the site cannot serve requests or sessions. */
export const APP_REQUIRED = ['DATABASE_URL', 'AUTH_SECRET'];
export const APP_RECOMMENDED = [
	'ORIGIN',
	'AUTH_EVEONLINE_ID',
	'AUTH_EVEONLINE_SECRET',
	'BODY_SIZE_LIMIT',
	'DB_ENV',
	'CONTACT_EMAIL'
];

export const WORKER_REQUIRED = ['DATABASE_URL'];
export const WORKER_RECOMMENDED = ['DB_ENV', 'ORIGIN', 'CONTACT_EMAIL'];

const isSet = (value) => typeof value === 'string' && value.trim() !== '';

/**
 * @param {Record<string, string | undefined>} source
 * @param {{ required: string[], recommended: string[] }} spec
 * @returns {{ missing: string[], missingRecommended: string[] }}
 */
export function findMissingEnv(source, { required, recommended }) {
	return {
		missing: required.filter((name) => !isSet(source[name])),
		missingRecommended: recommended.filter((name) => !isSet(source[name]))
	};
}

/**
 * Validates in production (`NODE_ENV=production`), no-op otherwise.
 * @param {string} processName for messages ('app' | 'updater')
 * @param {{ required: string[], recommended: string[] }} spec
 * @param {Record<string, string | undefined>} [source]
 * @throws {Error} listing every missing required variable
 */
export function validateProductionEnv(processName, spec, source = process.env) {
	if (source.NODE_ENV !== 'production') return;

	const { missing, missingRecommended } = findMissingEnv(source, spec);
	if (missingRecommended.length > 0) {
		logger.warn(
			{ missing: missingRecommended },
			`Recommended environment variables are not set for the ${processName} (see .env.example)`
		);
	}
	if (missing.length > 0) {
		throw new Error(
			`Missing required environment variables for the ${processName}: ${missing.join(', ')} (see .env.example)`
		);
	}
}
