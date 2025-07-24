/**
 *  Functions related to alliances
 */
import { getAlliancesByID, addOrUpdateAlliancesDB } from '$lib/database/alliances.js';
import { fetchGET } from './wrappers.js';

async function getAllianceFromESI(id) {
	const allianceData = await fetchGET(
		`https://esi.evetech.net/alliances/${id}`
	);

	if (!allianceData.ok) {
		console.error(`Failed to fetch alliance ${id}: ${allianceData.statusText}`);
		return null;
	}

	const allianceInfo = await allianceData.json();
	allianceInfo.id = id;
	return allianceInfo;
}

export async function idsToAlliances(ids) {
	// get all alliances from esi and return them
	let allianceData = [];
	const alliancePromises = ids.map(async (id) => {
		const allianceInfo = await getAllianceFromESI(id);
		allianceData.push(allianceInfo);
	});

	await Promise.all(alliancePromises);

	return allianceData;
}

export async function addOrUpdateAlliances(data) {
	const alliancesInDB = await getAlliancesByID(data);

	// find missing alliances
	const missingAlliances = data.filter((id) => !alliancesInDB.some((a) => a.id === id));

	// find outdated alliances
	const outdatedAlliances = alliancesInDB.filter(
		(a) => new Date(a.updated_at).getTime() < Date.now() - 86400 * 1000
	);

	// combine missing and outdated alliances
	const alliancesToFetch = [...missingAlliances, ...outdatedAlliances.map((a) => a.id)];

	if (alliancesToFetch.length === 0) {
		return;
	}

	const alliancesData = await idsToAlliances(alliancesToFetch);

	await addOrUpdateAlliancesDB(alliancesData);
}
