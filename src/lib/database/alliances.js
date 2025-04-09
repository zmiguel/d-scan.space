/**
 * All DB functions related to alliances
 */

import { alliances } from '../database/schema';
import { inArray } from 'drizzle-orm';

export async function getAlliancesByID(cf, ids) {
	// make batches of 100 ids to query in parallel
	const batchSize = 100;
	const batchPromises = [];

	for (let i = 0; i < ids.length; i += batchSize) {
		const batch = ids.slice(i, i + batchSize);
		const batchPromise = cf.db.select().from(alliances).where(inArray(alliances.id, batch)).all();

		batchPromises.push(batchPromise);
	}

	const batchResults = await Promise.all(batchPromises);
	return batchResults.flat();
}

export async function addOrUpdateAlliancesDB(cf, data) {
	if (!data || data.length === 0) {
		console.warn('Tried to add alliances from ESI but alliances array was empty');
		return;
	}

	// add or update alliances in a batch
	let allianceAddOrUpdateBatch = [];
	data.forEach((alliance) => {
		allianceAddOrUpdateBatch.push(
			cf.db
				.insert(alliances)
				.values({
					id: alliance.id,
					name: alliance.name,
					ticker: alliance.ticker
				})
				.onConflictDoUpdate({
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
