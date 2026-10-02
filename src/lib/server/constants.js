import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));

const env = process.env;

export const version = pkg.version;
export const DOOMHEIM_ID = 1000001;
const isUpdater = typeof process !== 'undefined' && process.argv?.[1]?.includes('updater');

// Example user agent:     D-Scan.Space/0.0.5 (production; Dev-Branch; +https://dev.d-scan.space) (+https://github.com/zmiguel/d-scan.space; mail:<email>; eve:<ign>; discord:<discord>) Node/24.11.1 (linux; x64)
export const USER_AGENT = isUpdater
	? `D-Scan.Space-Updater/${version} (+https://github.com/zmiguel/d-scan.space; mail:${env.CONTACT_EMAIL || 'undefined'}; eve:${env.CONTACT_EVE || 'undefined'}; discord:${env.CONTACT_DISCORD || 'undefined'}) Node/${process.version.replace('v', '')} (${process.platform}; ${process.arch})`
	: `D-Scan.Space/${version} (${env.NODE_ENV || 'development'}; ${env.AGENT || 'unknown'}; +${env.ORIGIN || 'undefined'}) ` +
		`(+https://github.com/zmiguel/d-scan.space; mail:${env.CONTACT_EMAIL || 'undefined'}; eve:${env.CONTACT_EVE || 'undefined'}; discord:${env.CONTACT_DISCORD || 'undefined'}) ` +
		`Node/${process.version.replace('v', '')} (${process.platform}; ${process.arch})`;

/** Positive integer from env, or the fallback. */
function envInt(name, fallback) {
	const value = Number.parseInt(env[name] ?? '', 10);
	return Number.isFinite(value) && value > 0 ? value : fallback;
}

// UPDATER (workers/updater): maximum rows refreshed per run
export const BATCH_CHARACTERS = 1000;
export const UPDATER_MAX_CORPORATIONS_PER_RUN = 1000;
export const UPDATER_MAX_ALLIANCES_PER_RUN = 1000;

// ESI CLIENT (src/lib/server/wrappers.js)
/** Maximum names per POST /universe/ids (ESI OpenAPI maxItems). */
export const ESI_IDS_BATCH = 500;
/** Maximum character ids per POST /characters/affiliation (ESI OpenAPI maxItems). */
export const ESI_AFFILIATION_BATCH = 1000;
/** Sockets kept open to ESI. */
export const ESI_MAX_CONNECTIONS = 128;
/** ESI requests in flight per process; further requests queue. */
export const ESI_MAX_CONCURRENCY = envInt('ESI_MAX_CONCURRENCY', 32);
/** Per-attempt timeout (headers + body). */
export const ESI_REQUEST_TIMEOUT_MS = envInt('ESI_REQUEST_TIMEOUT_MS', 15_000);
/**
 * ESI allows ~100 error responses per window per IP (x-esi-error-limit-remain); at 0 it
 * answers 420 to everything. New requests pause until the window resets once the
 * remaining budget drops to this value.
 */
export const ESI_ERROR_LIMIT_THRESHOLD = 10;

// DIRECTIONAL SCANS
/**
 * Objects up to this many km away count as on-grid. EVE grids have no fixed size; the
 * default matches the common working assumption for d-scan tools (decided with the
 * maintainer). Override with DSCAN_ON_GRID_MAX_KM.
 */
export const DSCAN_ON_GRID_MAX_KM = envInt('DSCAN_ON_GRID_MAX_KM', 50_000);

// SCAN INPUT
/**
 * Maximum names per local scan (each may need ESI lookups). The largest locals on record
 * are ~6,500 pilots. D-scans have no line cap: they only look up their distinct type ids
 * and can be very large in big fights (drones, fighters, wrecks); the request body is
 * capped by adapter-node's BODY_SIZE_LIMIT. Override with LOCAL_SCAN_MAX_LINES.
 */
export const LOCAL_SCAN_MAX_LINES = envInt('LOCAL_SCAN_MAX_LINES', 12_000);

// SDE LINKS
export const SDE_FILE =
	'https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip';
export const SDE_VERSION = 'https://developers.eveonline.com/static-data/tranquility/latest.jsonl';

// ESI Test flags
export const ESI_TEST_FLAGS = env.ESI_TEST_FLAGS === 'true' || env.ESI_TEST_FLAGS === '1';
