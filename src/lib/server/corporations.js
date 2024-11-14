/**
 *  Functions related to corporations
 */
import { addCorporation, getCorporationByID, updateCorporation } from '$lib/database/corporations.js';

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

	// check if alliance exists
	// TODO: Add alliance check

	await addCorporation(db, corpInfo);
}