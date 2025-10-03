import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
import { env } from '$env/dynamic/private';

export const version = pkg.version;
export const DOOMHEIM_ID = 1000001;
// Example user agent:     D-Scan.Space/0.0.1 (dev; Dev-Branch; +https://dev.d-scan.space; +https://github.com/zmiguel/d-scan.space) Node/24.8.0 (linux; arm64)
export const USER_AGENT =
	`D-Scan.Space/${version} (${env.NODE_ENV}; ${env.AGENT}; +${env.ORIGIN || 'undefined'}) ` +
	`(+https://github.com/zmiguel/d-scan.space; mail:${env.CONTACT_EMAIL || 'undefined'}; eve:${env.CONTACT_EVE || 'undefined'}; discord:${env.CONTACT_DISCORD || 'undefined'}) ` +
	`Node/${process.version.replace('v', '')} (${process.platform}; ${process.arch})`;

// BATCH SETTINGS
export const BATCH_UNIVERSE = 50;
export const BATCH_CHARACTERS = 50;
export const BATCH_CORPORATIONS = 50;
export const BATCH_ALLIANCES = 50;
export const CHARACTER_REQUEST_BATCH_SIZE = 500;

// SDE LINKS
export const SDE_FILE =
	'https://developers.eveonline.com/static-data/eve-online-static-data-latest-jsonl.zip';
export const SDE_VERSION = 'https://developers.eveonline.com/static-data/tranquility/latest.jsonl';
