/**
 *  Functions related to corporations
 */
import { addOrUpdateCorporationsDB, getCorporationsByID } from '$lib/database/corporations.js';
import { USER_AGENT } from './constants';

async function getCorporationFromESI(id) {
	const corporationData = await fetch(
		`https://esi.evetech.net/latest/corporations/${id}/?datasource=tranquility`,
		{
			method: 'GET',
			headers: {
				'Content-Type': 'application/json',
				'User-Agent': USER_AGENT
			}
		}
	);

	const corporationInfo = await corporationData.json();
	corporationInfo.id = id;
	return corporationInfo;
}

export async function idsToCorporations(ids) {
	// get all corporations from esi and return them
	let corporationData = [];
	const corporationPromises = ids.map(async (id) => {
		const corporationInfo = await getCorporationFromESI(id);
		corporationData.push(corporationInfo);
	});

	await Promise.all(corporationPromises);

	return corporationData;
}

export async function addOrUpdateCorporations(data) {
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

	await addOrUpdateCorporationsDB(corporationData);
}
