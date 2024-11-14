/**
 * File for all Local Scan related functions
 */

import ShortUniqueId from 'short-unique-id';
import { getCharactersByName } from '$lib/database/characters.js';
import { addCharactersFromESI } from '$lib/server/characters.js';

export async function createNewLocalScan(db, data) {
	const uid = new ShortUniqueId();
	const scanGroupId = uid.randomUUID(8);
	const scanId = uid.randomUUID(12);

	// get characters in database
	const charactersInDB = await getCharactersByName(db, data);

	// check if we are missing characters from the database
	const missingCharacters = await data.filter(l => !charactersInDB.some(c => c.name === l));

	console.log("Missing:", missingCharacters);

	if (missingCharacters.length  > 0) {
		// get missing characters from ESI
		await addCharactersFromESI(db, missingCharacters);
	}


}