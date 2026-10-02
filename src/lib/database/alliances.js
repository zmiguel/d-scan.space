/**
 * All DB functions related to alliances
 */
import { db } from './client.js';
import { alliances } from './schema.js';
import { UPSERT_CHUNK_SIZE, inChunks, uniqueBy } from './batching.js';
import { claimDueRows } from './refresh.js';
import logger from '../logger.js';
import { withSpan } from '../server/tracer.js';
import { inArray, sql } from 'drizzle-orm';

export async function getAlliancesByID(ids) {
	return inChunks(ids, (part) => db.select().from(alliances).where(inArray(alliances.id, part)));
}

/**
 * Claims up to `limit` alliances due for a refresh (see refresh.js).
 * @param {number} limit
 */
export async function claimAlliancesForRefresh(limit) {
	return await withSpan('database.alliances.claim_for_refresh', async (span) => {
		const rows = await claimDueRows(alliances, limit);
		span.setAttributes({ 'db.alliances.claimed': rows.length, 'db.alliances.limit': limit });
		return rows;
	});
}

export async function addOrUpdateAlliancesDB(data) {
	await withSpan('database.alliances.upsert', async (span) => {
		if (!data || data.length === 0) {
			span.setAttributes({
				'alliances.data.length': 0
			});
			logger.warn('Tried to add alliances from ESI but alliances array was empty');
			return;
		}

		const values = uniqueBy(
			data.map((alliance) => ({
				id: alliance.id,
				name: alliance.name,
				ticker: alliance.ticker
			})),
			(row) => row.id
		);

		span.setAttributes({
			'alliances.data.length': values.length
		});

		await inChunks(
			values,
			(part) =>
				db
					.insert(alliances)
					.values(part)
					.onConflictDoUpdate({
						target: alliances.id,
						set: {
							name: sql`excluded.name`,
							ticker: sql`excluded.ticker`,
							updated_at: sql`now()`
						}
					})
					.then(() => []),
			UPSERT_CHUNK_SIZE
		);
	});
}

export async function updateAlliancesLastSeen(allianceIDs) {
	if (!allianceIDs || allianceIDs.length === 0) {
		logger.warn('Tried to update alliances last seen but alliances array was empty');
		return;
	}

	await inChunks(allianceIDs, (part) =>
		db
			.update(alliances)
			.set({
				last_seen: sql`now()`
			})
			.where(inArray(alliances.id, part))
			.then(() => [])
	);
}
