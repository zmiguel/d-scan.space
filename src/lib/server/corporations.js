/**
 *  Functions related to corporations
 */
import { addCorporation, getCorporationByID, updateCorporation } from '$lib/database/corporations.js';
import { getAllianceByID } from '$lib/database/alliances.js';
import { addAllianceFromESI } from '$lib/server/alliances.js';

export async function updateCorp(db, id, returnData = false) {
	const corp = await getCorporationByID(db, id);

	if (corp.updatedAt < new Date().getTime() - 86400000) {
		const corpData = await fetch(
			`https://esi.evetech.net/latest/corporations/${id}/?datasource=tranquility`,
			{
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			}
		);

		const corpInfo = await corpData.json();
		// Update corporation info
		await updateCorporation(db, corpInfo);

		if (returnData) {
			return getCorporationByID(db, id);
		}
	}

	if (returnData) {
		return corp;
	}
}

export async function addCorporationFromESI(db, id) {
	const corpData = await fetch(
		`https://esi.evetech.net/latest/corporations/${id}/?datasource=tranquility`,
		{
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		}
	);

	const corpInfo = await corpData.json()
	corpInfo.id = id;

	if(corpInfo.alliance_id) {
		// check if we have the alliance in the database
		let alliance = await getAllianceByID(db, corpInfo.alliance_id);

		if (!alliance) {
			// add alliance to database
			await addAllianceFromESI(db, corpInfo.alliance_id);
		}
	}

	await addCorporation(db, corpInfo);
}