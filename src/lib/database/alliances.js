/**
 * All DB functions related to alliances
 */

import { alliances } from '../database/schema';
import { eq } from 'drizzle-orm';


export async function getAlliancesByID(cf, ids) {
	return await cf.db.select().from(alliances).where(eq(alliances.id, ids)).all();
}

export async function addOrUpdateAlliancesDB(cf, data) {
	// add or update alliances in a batch
	let allianceAddOrUpdateBatch = [];
	data.forEach((alliance) => {
		allianceAddOrUpdateBatch.push(
			cf.db.insert(alliances).values({
				id: alliance.id,
				name: alliance.name,
				ticker: alliance.ticker
			}).onConflictDoUpdate({
				target: alliances.id,
				set: {
					name: alliance.name,
					ticker: alliance.ticker,
					updated_at: Math.floor(Date.now() / 1000)
				}
			})
		);
	});

	await cf.db.batch(allianceAddOrUpdateBatch);
}
