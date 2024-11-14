/**
 * File for all Local Scan related functions
 */

import ShortUniqueId from 'short-unique-id';
import { getCharactersByName } from '$lib/database/characters.js';

export async function createNewLocalScan(db, data) {
	const uid = new ShortUniqueId();
	const scanGroupId = uid.randomUUID(8);
	const scanId = uid.randomUUID(12);

	// split data in lines
	const lines = data.split('\n');

	// get characters in database
	const charactersInDB = await getCharactersByName(db, lines);

	// check if we are missing characters from the database
	const missingCharacters = lines.filter(l => !charactersInDB.some(c => c.name === l));

	if (missingCharacters.length > 0) {
		// get missing characters from ESI

	}


}