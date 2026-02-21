/**
 *  Functions related to corporations
 */
import { addOrUpdateCorporationsDB, getCorporationsByID } from '../database/corporations.js';
import { withSpan } from './tracer.js';
import logger from '../logger.js';
import { fetchGET } from './wrappers.js';

async function getCorporationFromESI(id) {
	// fetchGET has tracing built-in
	const corporationData = await fetchGET(`https://esi.evetech.net/corporations/${id}`);

	if (!corporationData) {
		logger.error(`Failed to fetch corporation ${id}: no response`);
		return null;
	}

	if (!corporationData.ok) {
		logger.error(
			`Failed to fetch corporation ${id}: ${corporationData.status} ${corporationData.statusText}`
		);
		return null;
	}

	const corporationInfo = await corporationData.json();
	corporationInfo.id = id;
	delete corporationInfo.description; // Remove description if it exists
	return corporationInfo;
}

export async function idsToCorporations(ids) {
	return await withSpan('server.corporations.ids_to_corporations', async () => {
		// get all corporations from esi and return them
		let corporationData = [];
		const corporationPromises = ids.map(async (id) => {
			const corporationInfo = await getCorporationFromESI(id);
			if (corporationInfo) {
				corporationData.push(corporationInfo);
			}
		});

		await Promise.all(corporationPromises);

		return corporationData;
	});
}

export async function addOrUpdateCorporations(data) {
	await withSpan('server.corporations.add_or_update', async (span) => {
		const corporationsInDB = await getCorporationsByID(data);

		// find missing corporations
		const missingCorporations = data.filter((id) => !corporationsInDB.some((a) => a.id === id));

		// find outdated corporations
		const outdatedCorporations = corporationsInDB.filter(
			(a) => new Date(a.updated_at).getTime() < Date.now() - 86400 * 1000 // 24 hours
		);

		// combine missing and outdated corporations
		const corporationsToFetch = [...missingCorporations, ...outdatedCorporations.map((a) => a.id)];

		if (corporationsToFetch.length === 0) {
			return;
		}

		const corporationData = await idsToCorporations(corporationsToFetch);
		const filteredCorporationData = corporationData.filter(Boolean);

		span.setAttributes({
			'scan.corporations.missing': missingCorporations.length,
			'scan.corporations.outdated': outdatedCorporations.length,
			'scan.corporations.fetched': filteredCorporationData.length
		});

		await addOrUpdateCorporationsDB(filteredCorporationData);
	});
}
