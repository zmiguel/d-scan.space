/**
 * All DB functions related to alliances
 */
import { db } from '$lib/database/client';
import { alliances } from '$lib/database/schema';
import { inArray, sql } from 'drizzle-orm';

export async function getAlliancesByID(ids) {
	return db.select().from(alliances).where(inArray(alliances.id, ids));
}

export async function addOrUpdateAlliancesDB(data) {
	if (!data || data.length === 0) {
		console.warn('Tried to add alliances from ESI but alliances array was empty');
		return;
	}

	const values = data.map((alliance) => ({
		id: alliance.id,
		name: alliance.name,
		ticker: alliance.ticker
	}));

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
}
