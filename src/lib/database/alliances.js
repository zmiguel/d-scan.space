/**
 * All DB functions related to alliances
 */

import { alliances } from '../database/schema';
import { eq } from 'drizzle-orm';

export async function getAllianceByID(db, id) {
	return await db.select().from(alliances).where(eq(alliances.id, id)).get();
}

export async function updateAlliance(db, data) {
	return await db
		.update(alliances)
		.set({
			name: data.name,
			ticker: data.ticker,
			updated_at: Math.floor(Date.now() / 1000)
		})
		.where(alliances.id.eq(data.id))
		.run();
}

export async function addAlliance(db, data) {
	return await db
		.insert(alliances)
		.values({
			id: data.id,
			name: data.name,
			ticker: data.ticker
		})
		.onConflictDoNothing()
		.run();
}
