import { readFileSync } from 'fs';
const pkg = JSON.parse(readFileSync('./package.json', 'utf8'));
import { env } from '$env/dynamic/private';

export const version = pkg.version;
export const DOOMHEIM_ID = 1000001;
export const USER_AGENT = `D-Scan.Space/${version} (${env.NODE_ENV}; ${env.AGENT}) Node/${process.version.replace('v', '')} (${process.platform}; ${process.arch})`;

// BATCH SETTINGS
export const BATCH_UNIVERSE = 50;
export const BATCH_CHARACTERS = 50;
export const BATCH_CORPORATIONS = 50;
export const BATCH_ALLIANCES = 50;
export const CHARACTER_REQUEST_BATCH_SIZE = 250;
