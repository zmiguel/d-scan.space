/**
 *  Functions related to characters
 */
import { getCorporationByID } from '$lib/database/corporations.js';
import { addCorporationFromESI, updateCorp } from '$lib/server/corporations.js';

export async function addCharactersFromESI(db, characters) {
	// Get Character IDS
	const universeIds = await fetch(
		'https://esi.evetech.net/latest/universe/ids/?datasource=tranquility&language=en',
		{
			method: 'POST',
			headers: {
				'Content-Type': 'application/json'
			},
			body: JSON.stringify(characters)
		}
	)

	const charactersIds = await universeIds.json();

	// Get character data from ESI
	await charactersIds.forEach(async (character) => {
		const characterData = await fetch(
			`https://esi.evetech.net/latest/characters/${character.id}/?datasource=tranquility`,
			{
				method: 'GET',
				headers: {
					'Content-Type': 'application/json'
				}
			}
		);

		const characterInfo = await characterData.json();

		// check if we have the corporation in the database
		let corp = await getCorporationByID(db, characterInfo.corporation_id);

		if (!corp) {
			// add corporation to database
			await addCorporationFromESI(db, characterInfo.corporation_id);
		}

		// update corporation info if needed
		updateCorp(db, characterInfo.corporation_id);

	});


	// Check for corporations and alliances
}