/**
 * All DB functions related to corporations
 */
import { db } from '$lib/database/client';
import logger from '$lib/logger';
import { withSpan } from '$lib/server/tracer';
import { corporations } from '../database/schema';
import { inArray, sql } from 'drizzle-orm';

export async function getCorporationsByID(ids) {
	return db.select().from(corporations).where(inArray(corporations.id, ids));
}

export async function getAllCorporations() {
	return db.select().from(corporations);
}

export async function addOrUpdateCorporationsDB(data) {
	await withSpan('addOrUpdateCorporationsDB', async (span) => {
		if (!data || data.length === 0) {
			logger.warn('Tried to add corporations from ESI but corporations array was empty');
			return;
		}

		const values = data.map((corporation) => ({
			id: corporation.id,
			name: corporation.name,
			ticker: corporation.ticker,
			alliance_id: corporation.alliance_id ?? null,
			npc: corporation.npc ?? false
		}));

		span.setAttributes({
			'corporations.data.length': values.length
		});

		await db
			.insert(corporations)
			.values(values)
			.onConflictDoUpdate({
				target: corporations.id,
				set: {
					name: sql`excluded.name`,
					ticker: sql`excluded.ticker`,
					alliance_id: sql`excluded.alliance_id`,
					npc: sql`excluded.npc`,
					updated_at: sql`now()`
				}
			});
	});
}

export async function updateCorporationsLastSeen(corporationsIDs) {
	if (!corporationsIDs || corporationsIDs.length === 0) {
		logger.warn('Tried to update corporations last seen but corporations array was empty');
		return;
	}

	await db
		.update(corporations)
		.set({
			last_seen: new Date()
		})
		.where(inArray(corporations.id, corporationsIDs));
}
