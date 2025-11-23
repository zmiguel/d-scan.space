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

// BATCH SETTINGS
export const BATCH_UNIVERSE = 50;
export const BATCH_CHARACTERS = 1000;
export const BATCH_CORPORATIONS = 50;
export const BATCH_ALLIANCES = 50;
export const CHARACTER_REQUEST_BATCH_SIZE = 250;
export const ESI_MAX_CONNECTIONS = 128;
export const CHARACTER_BATCH_CONCURRENCY = ESI_MAX_CONNECTIONS;

// SDE LINKS
export const SDE_FILE =
	'https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip';
export const SDE_VERSION = 'https://developers.eveonline.com/static-data/tranquility/latest.jsonl';
