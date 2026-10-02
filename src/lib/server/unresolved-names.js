/**
 * In-memory negative cache for names ESI's /universe/ids could not resolve to a
 * character (typos, non-character text pasted as "local", names of characters that do
 * not exist). Without it every submit of the same paste asks ESI again.
 *
 * Keys are lower-cased (EVE names are case-insensitive). Entries expire after
 * UNRESOLVED_TTL_MS so a newly created character becomes resolvable; the map is capped
 * and evicts the oldest entries first (Map keeps insertion order).
 */
export const UNRESOLVED_TTL_MS = 60 * 60 * 1000;
export const UNRESOLVED_MAX_ENTRIES = 50_000;

/** @type {Map<string, number>} lower-cased name -> expiry (epoch ms) */
const unresolved = new Map();

/** @param {string} name */
export function isKnownUnresolvable(name) {
	const key = name.toLowerCase();
	const expires = unresolved.get(key);
	if (expires === undefined) return false;
	if (expires > Date.now()) return true;
	unresolved.delete(key);
	return false;
}

/** @param {string[]} names */
export function rememberUnresolvable(names) {
	const expires = Date.now() + UNRESOLVED_TTL_MS;
	for (const name of names) {
		const key = name.toLowerCase();
		unresolved.delete(key); // re-insert at the end (newest)
		unresolved.set(key, expires);
	}
	while (unresolved.size > UNRESOLVED_MAX_ENTRIES) {
		unresolved.delete(unresolved.keys().next().value);
	}
}

/** Test hook. */
export function _clearUnresolvableNames() {
	unresolved.clear();
}
