/**
 * All DB functions related to characters
 */
import { db } from './client.js';
import logger from '../logger.js';
import { DOOMHEIM_ID } from '../server/constants.js';
import { withSpan } from '../server/tracer.js';
import { characters, corporations, alliances } from './schema.js';
import { UPSERT_CHUNK_SIZE, inChunks, uniqueBy } from './batching.js';
import { claimDueRows } from './refresh.js';
import { desc, eq, inArray, sql, and, isNull } from 'drizzle-orm';

/**
 * Characters currently holding the given names, one row per name, matched
 * case-insensitively: EVE character names are unique regardless of case, and ESI's
 * /universe/ids resolves "chribba" to the canonical "Chribba" (verified). Rows carry the
 * canonical spelling.
 *
 * Names are not unique in the table: biomassed characters keep their old name and a
 * live character may later hold it, and stale rows can linger after renames. Anyone in
 * a local scan is alive, so deleted rows are ignored and, if several live rows share a
 * name, the most recently refreshed one wins. Uses characters_name_lower_idx.
 * @param {string[]} names
 */
export async function getCharactersByName(names) {
	const lowered = [...new Set(names.map((name) => name.toLowerCase()))];
	const nameKey = sql`lower(${characters.name})`;
	return await withSpan(
		'database.characters.get_by_name',
		async () =>
			inChunks(lowered, (part) =>
				db
					.selectDistinctOn([nameKey], {
						id: characters.id,
						name: characters.name,
						sec_status: characters.sec_status,
						corporation_name: corporations.name,
						corporation_ticker: corporations.ticker,
						corporation_id: characters.corporation_id,
						alliance_name: alliances.name,
						alliance_ticker: alliances.ticker,
						alliance_id: characters.alliance_id,
						last_seen: characters.last_seen,
						updated_at: characters.updated_at,
						esi_cache_expires: characters.esi_cache_expires
					})
					.from(characters)
					.leftJoin(corporations, eq(characters.corporation_id, corporations.id))
					.leftJoin(alliances, eq(characters.alliance_id, alliances.id))
					.where(and(inArray(nameKey, part), isNull(characters.deleted_at)))
					.orderBy(nameKey, desc(characters.updated_at))
			),
		{
			'db.characters.get_by_name': names.length
		}
	);
}

export async function addOrUpdateCharactersDB(data) {
	await withSpan('database.characters.upsert', async (span) => {
		if (!data || data.length === 0) {
			logger.warn('Tried to add characters from ESI but characters array was empty');
			return;
		}

		// One row per id: duplicates (e.g. the same pilot pasted as "bob" and "Bob", both
		// resolved by ESI to one id) would make ON CONFLICT DO UPDATE fail.
		const values = uniqueBy(
			data.map((character) => ({
				id: character.id,
				name: character.name,
				sec_status: character.sec_status || character.security_status || 0,
				corporation_id: character.corporation_id,
				alliance_id: character.alliance_id ?? null,
				esi_cache_expires: character.esi_cache_expires ?? null
			})),
			(row) => row.id
		);

		span.setAttributes({
			'db.characters.insert': values.length,
			'db.characters.insert_values': JSON.stringify(values)
		});

		await inChunks(
			values,
			(part) =>
				db
					.insert(characters)
					.values(part)
					.onConflictDoUpdate({
						target: characters.id,
						set: {
							name: sql`excluded.name`,
							sec_status: sql`excluded.sec_status`,
							corporation_id: sql`excluded.corporation_id`,
							alliance_id: sql`excluded.alliance_id`,
							esi_cache_expires: sql`excluded.esi_cache_expires`,
							updated_at: sql`now()`
						}
					})
					.then(() => []),
			UPSERT_CHUNK_SIZE
		);
	});
}

export async function updateCharactersLastSeen(characterIDs) {
	if (!characterIDs || characterIDs.length === 0) {
		logger.warn('Tried to update characters last seen but characters array was empty');
		return;
	}

	await inChunks(characterIDs, (part) =>
		db
			.update(characters)
			.set({
				last_seen: sql`now()`
			})
			.where(inArray(characters.id, part))
			.then(() => [])
	);
}

/**
 * Claims up to `limit` living characters due for a refresh (see refresh.js).
 * @param {number} limit
 */
export async function claimCharactersForRefresh(limit) {
	return await withSpan('database.characters.claim_for_refresh', async (span) => {
		const rows = await claimDueRows(characters, limit, isNull(characters.deleted_at));
		span.setAttributes({ 'db.characters.claimed': rows.length, 'db.characters.limit': limit });
		return rows;
	});
}

/**
 * Marks characters as deleted (biomassed): ESI reports them in the Doomheim NPC
 * corporation and answers 404 "Character has been deleted!" for their details.
 * @param {number[]} ids
 */
export async function biomassCharacters(ids) {
	if (!ids || ids.length === 0) return;
	await withSpan('database.characters.biomass', async (span) => {
		span.setAttributes({ 'db.characters.biomass': ids.length });
		await inChunks(ids, (part) =>
			db
				.update(characters)
				.set({
					corporation_id: DOOMHEIM_ID,
					alliance_id: null,
					updated_at: sql`now()`,
					deleted_at: sql`now()`
				})
				.where(inArray(characters.id, part))
				.then(() => [])
		);
	});
}
