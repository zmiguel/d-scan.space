/**
 * Writes text to the clipboard.
 * @param {string} text
 * @returns {Promise<boolean>} true only when the browser confirmed the write (it can be
 *   unavailable, denied, or rejected because the page lost focus / user activation)
 */
export async function copyText(text) {
	try {
		if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
		await navigator.clipboard.writeText(text);
		return true;
	} catch {
		return false;
	}
}

/**
 * Shareable URL of a scan group (`/scan/<group>`, which opens its latest scan) from any
 * scan URL or path in that group.
 * @param {string} location e.g. `/scan/AbCdEfGh/123456789012` or a full URL
 * @param {string} origin e.g. `https://d-scan.space`
 */
export function scanGroupUrl(location, origin) {
	const url = new URL(location, origin);
	const segments = url.pathname.split('/').filter(Boolean);
	return new URL('/' + segments.slice(0, 2).join('/'), url.origin).toString();
}
