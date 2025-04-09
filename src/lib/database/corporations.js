/**
 * All DB functions related to corporations
 */

import { corporations } from '../database/schema';
import { inArray } from 'drizzle-orm';

export async function getCorporationsByID(cf, ids) {
	return await cf.db.select().from(corporations).where(inArray(corporations.id, ids)).all();
}

export async function addOrUpdateCorporationsDB(cf, data) {
	if (!data || data.length === 0) {
		console.warn('Tried to add corporations from ESI but corporations array was empty');
		return;
	}

	// add or update corporations in a batch
	let corporationAddOrUpdateBatch = [];
	data.forEach((corporation) => {
		corporationAddOrUpdateBatch.push(
			cf.db.insert(corporations).values({
				id: corporation.id,
				name: corporation.name,
				ticker: corporation.ticker,
				alliance_id: corporation.alliance_id ?? null
			}).onConflictDoUpdate({
				target: corporations.id,
				set: {
					name: corporation.name,
					ticker: corporation.ticker,
					alliance_id: corporation.alliance_id ?? null,
					updated_at: Math.floor(Date.now() / 1000)
				}
			})
		);
	});

	await cf.db.batch(corporationAddOrUpdateBatch);
}
