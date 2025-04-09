/**
 *  Functions related to corporations
 */
import { addOrUpdateCorporationsDB, getCorporationsByID } from '$lib/database/corporations.js';

export async function addOrUpdateCorporations(cf, data) {
	const corporationsInDB = await getCorporationsByID(cf, data);

	// find missing corporations
	const missingCorporations = data.filter((id) => !corporationsInDB.some((a) => a.id === id));

	// find outdated corporations
	const outdatedCorporations = corporationsInDB.filter(
		(a) => a.updated_at < Math.floor(Date.now() / 1000) - 86400
	);

	// combine missing and outdated corporations
	const corporationsToFetch = [...missingCorporations, ...outdatedCorporations.map((a) => a.id)];

	if (corporationsToFetch.length === 0) {
		return;
	}

	// fetch missing and outdated corporations using the esi client and by batching them all together
	// we need to ensure we don't exceed the 1000 calls limit of CF workers,
	// so we must batch them in batches of 500 corporations
	const BATCH_SIZE = 500;
	const batches = [];
	for (let i = 0; i < corporationsToFetch.length; i += BATCH_SIZE) {
		const batch = corporationsToFetch.slice(i, i + BATCH_SIZE);
		batches.push(batch);
	}
	const batchPromises = batches.map(async (batch) => {
		return await cf.esi.idsToCorporations(batch);
	});
	const batchResults = await Promise.all(batchPromises);
	const corporationsBatch = batchResults.reduce((combined, result) => {
		if (result) {
			return [...combined, ...result];
		}
		return combined;
	}, []);

	await addOrUpdateCorporationsDB(cf, corporationsBatch);
}
