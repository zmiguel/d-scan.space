/**
 * File for all Local Scan related functions
 */

import ShortUniqueId from 'short-unique-id';
import { getCharactersByName, updateCharactersLastSeen } from '$lib/database/characters.js';
import { addCharactersFromESI, updateCharactersFromESI } from '$lib/server/characters.js';

async function getCharacters(db, data) {
	// get characters in database
	const charactersInDB = await getCharactersByName(db, data);

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
		await addCharactersFromESI(db, missingCharacters);
	}

	// check if characters are outdated in database
	if (outdatedCharacters.length > 0) {
		// get updated characters from ESI
		await updateCharactersFromESI(db, outdatedCharacters);
	}

	// get all outdated and missing characters from db
	const charactersToFetch = [...missingCharacters, ...outdatedCharacters.map((c) => c.name)];
	const updatedCharacters = await getCharactersByName(db, charactersToFetch);

	// merge good with updated
	return [...goodCharacters, ...updatedCharacters];
}

export async function createNewLocalScan(db, data) {
	const uid = new ShortUniqueId();
	const scanGroupId = uid.randomUUID(8);
	const scanId = uid.randomUUID(12);

	const allCharacters = await getCharacters(db, data);
	updateCharactersLastSeen(db, allCharacters); // No need for Async here

	/* process scan data & build scan json
	 *
	 * Format:
	 * {
	 *   type: local,
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
		type: 'local',
		alliances: []
	};

	const alliancesMap = new Map();

	allCharacters.forEach((character) => {
		const {
			alliance_name,
			alliance_ticker,
			corporation_name,
			corporation_ticker,
			name,
			sec_status
		} = character;

		if (!alliancesMap.has(alliance_name)) {
			alliancesMap.set(alliance_name, {
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
				name: corporation_name,
				ticker: corporation_ticker,
				characters: [],
				character_count: 0
			});
			alliance.corporation_count++;
		}

		const corporation = alliance.corporations.get(corporation_name);
		corporation.characters.push({ name, sec_status });
		corporation.character_count++;
		alliance.character_count++;
	});

	formattedData.alliances = Array.from(alliancesMap.values()).map((alliance) => {
		alliance.corporations = Array.from(alliance.corporations.values());
		return alliance;
	});

	return formattedData;
}
