import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
import { env } from '$env/dynamic/private';

export const version = pkg.version;
export const DOOMHEIM_ID = 1000001;
// Example user agent:     D-Scan.Space/0.0.1 (dev; Docker; Preview-Branch; +https://dev.d-scan.space) Node/24.7.0 (linux; arm64)
export const USER_AGENT = `D-Scan.Space/${version} (${env.NODE_ENV}; ${env.AGENT}; +${env.ORIGIN || 'undefined'}) Node/${process.version.replace('v', '')} (${process.platform}; ${process.arch})`;

// BATCH SETTINGS
export const BATCH_UNIVERSE = 50;
export const BATCH_CHARACTERS = 50;
export const BATCH_CORPORATIONS = 50;
export const BATCH_ALLIANCES = 50;
export const CHARACTER_REQUEST_BATCH_SIZE = 500;

// SDE LINKS
export const SDE_FSD_CHECKSUM =
	'https://eve-static-data-export.s3-eu-west-1.amazonaws.com/tranquility/fsd.zip.checksum';
export const SDE_FSD =
	'https://eve-static-data-export.s3-eu-west-1.amazonaws.com/tranquility/fsd.zip';
export const SDE_BSD_CHECKSUM =
	'https://eve-static-data-export.s3-eu-west-1.amazonaws.com/tranquility/bsd.zip.checksum';
export const SDE_BSD =
	'https://eve-static-data-export.s3-eu-west-1.amazonaws.com/tranquility/bsd.zip';
export const SDE_UNIVERSE_CHECKSUM =
	'https://eve-static-data-export.s3-eu-west-1.amazonaws.com/tranquility/universe.zip.checksum';
export const SDE_UNIVERSE =
	'https://eve-static-data-export.s3-eu-west-1.amazonaws.com/tranquility/universe.zip';
