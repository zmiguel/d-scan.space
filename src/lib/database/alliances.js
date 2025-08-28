/**
 * All DB functions related to alliances
 */
import { db } from '$lib/database/client';
import { alliances } from '$lib/database/schema';
import logger from '$lib/logger';
import { withSpan } from '$lib/server/tracer';
import { inArray, sql } from 'drizzle-orm';

export async function getAlliancesByID(ids) {
	return db.select().from(alliances).where(inArray(alliances.id, ids));
}

export async function getAllAlliances() {
	return db.select().from(alliances);
}

export async function addOrUpdateAlliancesDB(data) {
	await withSpan('addOrUpdateAlliancesDB', async (span) => {
		if (!data || data.length === 0) {
			span.setAttributes({
				'alliances.data.length': 0
			});
			logger.warn('Tried to add alliances from ESI but alliances array was empty');
			return;
		}

		const values = data.map((alliance) => ({
			id: alliance.id,
			name: alliance.name,
			ticker: alliance.ticker
		}));

		span.setAttributes({
			'alliances.data.length': values.length
		});

		await db
			.insert(alliances)
			.values(values)
			.onConflictDoUpdate({
				target: alliances.id,
				set: {
					name: sql`excluded.name`,
					ticker: sql`excluded.ticker`,
					updated_at: sql`now()`
				}
			});
	});
}

export async function updateAlliancesLastSeen(allianceIDs) {
	if (!allianceIDs || allianceIDs.length === 0) {
		logger.warn('Tried to update alliances last seen but alliances array was empty');
		return;
	}

	await db
		.update(alliances)
		.set({
			last_seen: sql`now()`
		})
		.where(inArray(alliances.id, allianceIDs));
}
