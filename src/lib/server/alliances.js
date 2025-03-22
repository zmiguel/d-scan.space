/**
 *  Functions related to alliances
 */
import { addAlliance, getAllianceByID, updateAlliance } from '$lib/database/alliances.js';

export async function updateAllianceInfo(db, id, returnData = false) {
	const alliance = await getAllianceByID(db, id);

	if (alliance.updatedAt < new Date().getTime() - 86400000) {
		const allianceData = await fetch(
			`https://esi.evetech.net/latest/alliances/${id}/?datasource=tranquility`,
			{
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			}
		);

		const allianceInfo = await allianceData.json();
		// Update alliance info
		await updateAlliance(db, allianceInfo);

		if (returnData) {
			return getAllianceByID(db, id);
		}
	}

	if (returnData) {
		return alliance;
	}
}

export async function addAllianceFromESI(db, id) {
	const allianceData = await fetch(
		`https://esi.evetech.net/latest/alliances/${id}/?datasource=tranquility`,
		{
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		}
	);

	const allianceInfo = await allianceData.json();
	allianceInfo.id = id;

	await addAlliance(db, allianceInfo);
}
