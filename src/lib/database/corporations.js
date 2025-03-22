/**
 * All DB functions related to corporations
 */

import { corporations } from '../database/schema';
import { eq } from 'drizzle-orm';

export async function getCorporationByID(db, id) {
	return await db.select().from(corporations).where(eq(corporations.id, id)).get();
}

export async function updateCorporation(db, data) {
	return await db
		.update(corporations)
		.set({
			name: data.name,
			ticker: data.ticker,
			alliance_id: data.alliance_id ? data.alliance_id : null,
			updated_at: Math.floor(Date.now() / 1000)
		})
		.where(corporations.id.eq(data.id))
		.run();
}

export async function addCorporation(db, data) {
	return await db
		.insert(corporations)
		.values({
			id: data.id,
			name: data.name,
			ticker: data.ticker,
			alliance_id: data.alliance_id ?? null
		})
		.onConflictDoNothing()
		.run();
}
