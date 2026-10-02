/**
 * Helpers for statements built from caller-sized lists.
 *
 * Postgres accepts at most 65,535 bind parameters per statement, and `IN (...)` lists and
 * multi-row INSERTs use one parameter per value, so large scans/ESI batches are split.
 */

/** Rows per multi-row INSERT (rows use up to ~6 parameters each). */
export const UPSERT_CHUNK_SIZE = 1000;
/** Values per `IN (...)` list. */
export const IN_LIST_CHUNK_SIZE = 5000;

/**
 * @template T
 * @param {T[]} items
 * @param {number} size
 * @returns {T[][]}
 */
export function chunk(items, size) {
	const chunks = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

/**
 * Keeps one item per key (the last one wins). `INSERT ... ON CONFLICT DO UPDATE` fails
 * when the same key appears twice in one statement ("cannot affect row a second time").
 * @template T, K
 * @param {T[]} items
 * @param {(item: T) => K} key
 * @returns {T[]}
 */
export function uniqueBy(items, key) {
	const byKey = new Map();
	for (const item of items) {
		byKey.set(key(item), item);
	}
	return [...byKey.values()];
}

/**
 * Runs `query` for each chunk of `values` sequentially and concatenates the results.
 * @template V, R
 * @param {V[]} values
 * @param {(chunk: V[]) => Promise<R[] | void>} query
 * @param {number} [size]
 * @returns {Promise<R[]>}
 */
export async function inChunks(values, query, size = IN_LIST_CHUNK_SIZE) {
	const results = [];
	for (const part of chunk(values, size)) {
		const rows = await query(part);
		if (rows) results.push(...rows);
	}
	return results;
}
