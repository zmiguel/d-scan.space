const PLACEHOLDER_ORIGIN = 'http://localhost';

/**
 * Turns a user-supplied redirect target into a same-origin path.
 *
 * Only plain absolute paths are accepted. Protocol-relative (`//evil.example`),
 * backslash (`/\evil.example`, which browsers treat like `//`), absolute URLs and
 * anything else fall back to `fallback`.
 *
 * @param {unknown} value
 * @param {string} [fallback]
 * @returns {string} path + query + hash
 */
export function safeRedirectPath(value, fallback = '/') {
	if (typeof value !== 'string' || !/^\/(?![/\\])/.test(value)) {
		return fallback;
	}

	try {
		const url = new URL(value, PLACEHOLDER_ORIGIN);
		if (url.origin !== PLACEHOLDER_ORIGIN) {
			return fallback;
		}
		return `${url.pathname}${url.search}${url.hash}`;
	} catch {
		return fallback;
	}
}
