/**
 *  Functions related to characters
 */
import { addOrUpdateCorporations } from '$lib/server/corporations.js';
import { addOrUpdateAlliances } from '$lib/server/alliances.js';
import { addOrUpdateCharactersDB, getCharactersByName } from '$lib/database/characters.js';
//import { DOOMHEIM_ID } from '$lib/server/constants.js';


async function addOrUpdateCharacters(cf, data) {
	// get list of all corp ids
	const corpIDs = data.map((char) => char.corporation_id).filter(id => id !== undefined && id !== null);
	const corpIDsUnique = [...new Set(corpIDs)];

	// get list of all alliance ids
	const allianceIDs = data.map((char) => char.alliance_id).filter(id => id !== undefined && id !== null);
	const allianceIDsUnique = [...new Set(allianceIDs)];

	// first we check if we have the alliance info and if the info is updated
	// if we don't, we get it and update it
	await addOrUpdateAlliances(cf, allianceIDsUnique);

	// now we can be sure we have all alliances, we can add the corporations
	await addOrUpdateCorporations(cf, corpIDsUnique);

	// now we can be sure we have all corporations, we can add the characters
	await addOrUpdateCharactersDB(cf, data);
}

export async function addCharactersFromESI(cf, characters, sanityCheck = false) {
	// check if characters is empty
	if (characters.length === 0 || !characters) {
		console.warn('Tried to add characters from ESI but characters array was empty');
		return;
	}

	// sanity check if we already have it in the database
	if (sanityCheck) {
		const charactersInDB = await getCharactersByName(cf, characters);
		if (charactersInDB.length === characters.length) {
			return;
		}
	}

	// Get Character IDS
	const BATCH_SIZE = 500;
	const batches = [];

	// Split characters into batches
	for (let i = 0; i < characters.length; i += BATCH_SIZE) {
		const batch = characters.slice(i, i + BATCH_SIZE);
		batches.push(batch);
	}

	// Process all batches in parallel
	const batchPromises = batches.map(async (batch) => {
		return await cf.esi.namesToCharacters(batch);
	});

	// Wait for all batch requests to complete
	const batchResults = await Promise.all(batchPromises);

	// Combine all batch results
	const charactersBatch = batchResults.reduce((combined, result) => {
		if (result) {
			return [...combined, ...result];
		}
		return combined;
	}, []);

	// check if charactersIds is empty or if characters is empty
	if (!charactersBatch || charactersBatch.length === 0) {
		console.error('Tried to add characters from ESI but charactersIds array was empty');
		return;
	}

	await addOrUpdateCharacters(cf, charactersBatch);
}

export async function updateCharactersFromESI(cf, data) {
	// data is a list of characters, not ids.
	// we need to extract the ids from the characters
	const ids = data.map((char) => char.id);
	const BATCH_SIZE = 500;
	const batches = [];
	for (let i = 0; i < data.length; i += BATCH_SIZE) {
		const batch = ids.slice(i, i + BATCH_SIZE);
		batches.push(batch);
	}
	const batchPromises = batches.map(async (batch) => {
		return await cf.esi.idsToCharacters(batch);
	});
	const batchResults = await Promise.all(batchPromises);
	const charactersBatch = batchResults.reduce((combined, result) => {
		if (result) {
			return [...combined, ...result];
		}
		return combined;
	}, []);
	await addOrUpdateCharacters(cf, charactersBatch);
}
