/**
 *  Functions related to characters
 */
import { getCorporationByID } from '$lib/database/corporations.js';
import { addCorporationFromESI } from '$lib/server/corporations.js';
import { getAllianceByID } from '$lib/database/alliances.js';
import { addAllianceFromESI } from '$lib/server/alliances.js';
import { addCharacter, getCharactersByName } from '$lib/database/characters.js';

export async function addCharactersFromESI(db, characters) {
	// sanity check if we already have it in the database
	const charactersInDB = await getCharactersByName(db, characters);
	if (charactersInDB.length === characters.length) {
		return;
	}

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
	const characterPromises = charactersIds.characters.map(async (character) => {
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
		characterInfo.id = character.id;

		// check if we have the corporation in the database
		let corp = await getCorporationByID(db, characterInfo.corporation_id);

		if (!corp) {
			// add corporation to database
			await addCorporationFromESI(db, characterInfo.corporation_id);
		}

		// check if we have the alliance in the database
		if (characterInfo.alliance_id) {
			let alliance = await getAllianceByID(db, characterInfo.alliance_id);

			if (!alliance) {
				// add alliance to database
				await addAllianceFromESI(db, characterInfo.alliance_id);
			}
		}

		// Add character to database
		await addCharacter(db, {
			id: characterInfo.id,
			name: characterInfo.name,
			corporation_id: characterInfo.corporation_id,
			alliance_id: characterInfo.alliance_id ? characterInfo.alliance_id : null
		});
	});

	await Promise.all(characterPromises);
}