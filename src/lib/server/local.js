/**
 * File for all Local Scan related functions
 */

import { getCharactersByName, updateCharactersLastSeen } from '$lib/database/characters.js';
import { addCharactersFromESI, updateCharactersFromESI } from '$lib/server/characters.js';

async function getCharacters(data) {
	// get characters in the database
	const charactersInDB = await getCharactersByName(data);

	const missingCharacters = await data.filter((l) => !charactersInDB.some((c) => c.name === l));
	const outdatedCharacters = await charactersInDB.filter(
		(c) => c.updated_at < Math.floor(Date.now() / 1000) - 86400
	);
	const goodCharacters = await charactersInDB.filter(
		(c) => c.updated_at >= Math.floor(Date.now() / 1000) - 86400
	);

	console.log(
		`Missing: ${missingCharacters.length}, Outdated: ${outdatedCharacters.length}, Good: ${goodCharacters.length}`
	);

	// check if we are missing characters from the database
	if (missingCharacters.length > 0) {
		// get missing characters from ESI
		await addCharactersFromESI(missingCharacters);
	}

	// check if characters are outdated in database
	if (outdatedCharacters.length > 0) {
		// get updated characters from ESI
		await updateCharactersFromESI(outdatedCharacters);
	}

	// get all outdated and missing characters from db
	const charactersToFetch = [...missingCharacters, ...outdatedCharacters.map((c) => c.name)];
	const updatedCharacters = await getCharactersByName(charactersToFetch);

	// merge good with updated
	return [...goodCharacters, ...updatedCharacters];
}

export async function createNewLocalScan(data) {
	const allCharacters = await getCharacters(data);
	updateCharactersLastSeen(allCharacters); // No need for Async here

	/* process scan data & build scan json
	 *
	 * Format:
	 * {
	 *   alliances: [
	 * 	 {
	 * 		 name: "Alliance Name",
	 *      ticker: "ABC",
	 * 		 corporations: [
	 * 			 {
	 * 				 name: "Corp Name",
	 *          ticker: "DEF",
	 * 				 characters: [
	 * 					 {
	 *              name: "Character Name",
	 *              sec_status: 0.0,
	 *            },
	 * 				 ],
	 * 			 character_count: 0
	 * 			 },
	 * 			 ...
	 * 		 ],
	 *    corporation_count: 0
	 * 	 character_count: 0
	 * 	 },
	 * 	 ...
	 *  ],
	 */

	const formattedData = {
		alliances: []
	};

	const alliancesMap = new Map();

	allCharacters.forEach((character) => {
		const {
			alliance_id,
			alliance_name,
			alliance_ticker,
			corporation_id,
			corporation_name,
			corporation_ticker,
			id,
			name,
			sec_status
		} = character;

		if (!alliancesMap.has(alliance_name)) {
			alliancesMap.set(alliance_name, {
				id: alliance_id,
				name: alliance_name,
				ticker: alliance_ticker,
				corporations: new Map(),
				corporation_count: 0,
				character_count: 0
			});
		}

		const alliance = alliancesMap.get(alliance_name);

		if (!alliance.corporations.has(corporation_name)) {
			alliance.corporations.set(corporation_name, {
				id: corporation_id,
				name: corporation_name,
				ticker: corporation_ticker,
				characters: [],
				character_count: 0
			});
			alliance.corporation_count++;
		}

		const corporation = alliance.corporations.get(corporation_name);
		corporation.characters.push({ id, name, sec_status });
		corporation.character_count++;
		alliance.character_count++;
	});

	formattedData.alliances = Array.from(alliancesMap.values()).map((alliance) => {
		alliance.corporations = Array.from(alliance.corporations.values());
		alliance.corporations.sort((a, b) => b.character_count - a.character_count);
		return alliance;
	});

	formattedData.alliances.sort((a, b) => b.character_count - a.character_count);
	return formattedData;
}
