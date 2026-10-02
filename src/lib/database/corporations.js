/**
 * All DB functions related to corporations
 */
import { db } from './client.js';
import logger from '../logger.js';
import { withSpan } from '../server/tracer.js';
import { characters, corporations } from './schema.js';
import { UPSERT_CHUNK_SIZE, inChunks, uniqueBy } from './batching.js';
import { claimDueRows } from './refresh.js';
import { and, eq, inArray, isNull, sql } from 'drizzle-orm';

export async function getCorporationsByID(ids) {
	return inChunks(ids, (part) =>
		db.select().from(corporations).where(inArray(corporations.id, part))
	);
}

/**
 * Claims up to `limit` corporations due for a refresh (see refresh.js).
 * @param {number} limit
 */
export async function claimCorporationsForRefresh(limit) {
	return await withSpan('database.corporations.claim_for_refresh', async (span) => {
		const rows = await claimDueRows(corporations, limit);
		span.setAttributes({ 'db.corporations.claimed': rows.length, 'db.corporations.limit': limit });
		return rows;
	});
}

/**
 * A corporation joined, left or changed alliance: store it on the corporation and on its
 * living members in one transaction. Members' `updated_at` is not touched (their own
 * refresh of name/security status stays due); the alliance must already be stored.
 * @param {number} corporationId
 * @param {number | null} allianceId
 * @returns {Promise<number>} characters whose alliance changed
 */
export async function applyCorporationAllianceChange(corporationId, allianceId) {
	return await withSpan('database.corporations.apply_alliance_change', async (span) => {
		span.setAttributes({
			'db.corporation_id': corporationId,
			'db.alliance_id': allianceId ?? 'none'
		});
		return db.transaction(async (tx) => {
			await tx
				.update(corporations)
				.set({ alliance_id: allianceId })
				.where(
					and(
						eq(corporations.id, corporationId),
						sql`${corporations.alliance_id} IS DISTINCT FROM ${allianceId}`
					)
				);
			const updated = await tx
				.update(characters)
				.set({ alliance_id: allianceId })
				.where(
					and(
						eq(characters.corporation_id, corporationId),
						isNull(characters.deleted_at),
						sql`${characters.alliance_id} IS DISTINCT FROM ${allianceId}`
					)
				)
				.returning({ id: characters.id });
			span.setAttributes({ 'db.characters.updated': updated.length });
			return updated.length;
		});
	});
}

export async function addOrUpdateCorporationsDB(data) {
	await withSpan('database.corporations.upsert', async (span) => {
		if (!data || data.length === 0) {
			logger.warn('Tried to add corporations from ESI but corporations array was empty');
			return;
		}

		const values = uniqueBy(
			data.map((corporation) => ({
				id: corporation.id,
				name: corporation.name,
				ticker: corporation.ticker,
				alliance_id: corporation.alliance_id ?? null,
				...(corporation.npc !== undefined && { npc: corporation.npc })
			})),
			(row) => row.id
		);

		span.setAttributes({
			'corporations.data.length': values.length
		});

		// Determine if any of the records have npc field
		const hasNpcData = values.some((corp) => corp.npc !== undefined);

		const updateSet = {
			name: sql`excluded.name`,
			ticker: sql`excluded.ticker`,
			alliance_id: sql`excluded.alliance_id`,
			updated_at: sql`now()`
		};

		// Only update npc if the data contains npc values
		if (hasNpcData) {
			updateSet.npc = sql`excluded.npc`;
		}

		await inChunks(
			values,
			(part) =>
				db
					.insert(corporations)
					.values(part)
					.onConflictDoUpdate({
						target: corporations.id,
						set: updateSet
					})
					.then(() => []),
			UPSERT_CHUNK_SIZE
		);
	});
}

export async function updateCorporationsLastSeen(corporationsIDs) {
	if (!corporationsIDs || corporationsIDs.length === 0) {
		logger.warn('Tried to update corporations last seen but corporations array was empty');
		return;
	}

	await inChunks(corporationsIDs, (part) =>
		db
			.update(corporations)
			.set({
				last_seen: sql`now()`
			})
			.where(inArray(corporations.id, part))
			.then(() => [])
	);
}
