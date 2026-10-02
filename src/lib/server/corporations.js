/**
 *  Functions related to corporations
 */
import { addOrUpdateCorporationsDB, getCorporationsByID } from '../database/corporations.js';
import { getAlliancesByID } from '../database/alliances.js';
import { addOrUpdateAlliances } from './alliances.js';
import { withSpan } from './tracer.js';
import logger from '../logger.js';
import { fetchGET } from './wrappers.js';

async function getCorporationFromESI(id) {
	// fetchGET has tracing built-in
	const corporationData = await fetchGET(`https://esi.evetech.net/corporations/${id}`);

	if (!corporationData || !corporationData.ok) {
		logger.error(
			{ corporationId: id, status: corporationData?.status ?? null },
			'Failed to fetch corporation'
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
		const { corporations: stored } = await storeCorporations(corporationData.filter(Boolean));

		span.setAttributes({
			'scan.corporations.missing': missingCorporations.length,
			'scan.corporations.outdated': outdatedCorporations.length,
			'scan.corporations.fetched': stored.length
		});
	});
}

/**
 * Stores corporations fetched from ESI together with their alliances.
 *
 * corporations.alliance_id references alliances: the corporations' own alliances are
 * stored first (they can differ from what character affiliations reported if a corp just
 * joined/left an alliance). If an alliance cannot be fetched, the corporation is kept
 * without it rather than failing the whole batch on the foreign key; the next refresh
 * fills it in.
 * @param {any[]} corporationData ESI corporation objects with `id`
 * @returns {Promise<{ corporations: any[], allianceUnavailable: Set<number> }>} the stored
 *   corporations, and the ids stored without their (unfetchable) alliance
 */
export async function storeCorporations(corporationData) {
	const allianceUnavailable = new Set();
	if (corporationData.length === 0) return { corporations: [], allianceUnavailable };

	const corpAllianceIDs = [
		...new Set(corporationData.map((c) => c.alliance_id).filter((id) => id != null))
	];
	await addOrUpdateAlliances(corpAllianceIDs);
	const storedAlliances = new Set((await getAlliancesByID(corpAllianceIDs)).map((a) => a.id));
	for (const corporation of corporationData) {
		if (corporation.alliance_id != null && !storedAlliances.has(corporation.alliance_id)) {
			logger.warn(
				{ corporationId: corporation.id, allianceId: corporation.alliance_id },
				'Storing corporation without its alliance (alliance could not be fetched)'
			);
			corporation.alliance_id = null;
			allianceUnavailable.add(corporation.id);
		}
	}

	await addOrUpdateCorporationsDB(corporationData);
	return { corporations: corporationData, allianceUnavailable };
}
