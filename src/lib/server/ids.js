import { randomInt } from 'node:crypto';

const ALPHABET = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/** Scan group ids: 8 chars ≈ 47.6 bits. Same length/alphabet as before (short-unique-id). */
export const SCAN_GROUP_ID_LENGTH = 8;
/** Scan ids: 12 chars ≈ 71.4 bits. */
export const SCAN_ID_LENGTH = 12;

/**
 * Random base62 id from the OS CSPRNG. Private scans are only protected by their
 * URL, so ids must not be predictable (Math.random-based generators are).
 *
 * @param {number} length
 * @returns {string}
 */
export function randomId(length) {
	let id = '';
	for (let i = 0; i < length; i++) {
		id += ALPHABET[randomInt(ALPHABET.length)];
	}
	return id;
}

export const newScanGroupId = () => randomId(SCAN_GROUP_ID_LENGTH);
export const newScanId = () => randomId(SCAN_ID_LENGTH);
