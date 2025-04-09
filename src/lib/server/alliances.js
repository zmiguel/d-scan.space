/**
 *  Functions related to alliances
 */
import { getAlliancesByID, addOrUpdateAlliancesDB } from '$lib/database/alliances.js';


export async function addOrUpdateAlliances(cf, data) {
	const alliancesInDB = await getAlliancesByID(cf, data)

	// find missing alliances
	const missingAlliances = data.filter((id) => !alliancesInDB.some((a) => a.id === id));

	// find outdated alliances
	const outdatedAlliances = alliancesInDB.filter(
		(a) => a.updated_at < Math.floor(Date.now() / 1000) - 86400
	);

	// combine missing and outdated alliances
	const alliancesToFetch = [...missingAlliances, ...outdatedAlliances.map((a) => a.id)];

	// fetch missing and outdated alliances using the esi client and by batching them all together
	// we need to ensure we don't exceed the 1000 calls limit of CF workers,
	// so we must batch them in batches of 500 alliances
	const BATCH_SIZE = 500;
	const batches = [];
	for (let i = 0; i < alliancesToFetch.length; i += BATCH_SIZE) {
		const batch = alliancesToFetch.slice(i, i + BATCH_SIZE);
		batches.push(batch);
	}
	const batchPromises = batches.map(async (batch) => {
		return await cf.esi.idsToAlliances(batch);
	});
	const batchResults = await Promise.all(batchPromises);
	const alliancesBatch = batchResults.reduce((combined, result) => {
		if (result) {
			combined.alliances = [...combined, ...result];
		}
		return combined;
	}, {});

	await addOrUpdateAlliancesDB(cf, alliancesBatch);
}
