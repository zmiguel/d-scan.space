/**
 *  Functions related to characters
 */
import { addOrUpdateCorporations } from '$lib/server/corporations.js';
import { addOrUpdateAlliances } from '$lib/server/alliances.js';
import { addOrUpdateCharactersDB, getCharactersByName } from '$lib/database/characters.js';
//import { DOOMHEIM_ID } from '$lib/server/constants.js';

async function getCharacterFromESI(id) {
	const characterData = await fetch(
		`https://esi.evetech.net/latest/characters/${id}/?datasource=tranquility`,
		{
			method: 'GET',
			headers: {
				'Content-Type': 'application/json'
			}
		}
	);

	const characterInfo = await characterData.json();
	characterInfo.id = id;
	return characterInfo;
}

async function namesToCharacters(names) {
	// Split names into batches of 250
	const batchSize = 50;
	const batches = [];
	for (let i = 0; i < names.length; i += batchSize) {
		batches.push(names.slice(i, i + batchSize));
	}

	// Run all batch requests in parallel
	const batchPromises = batches.map(async (batch) => {
		const response = await fetch(
			'https://esi.evetech.net/latest/universe/ids/?datasource=tranquility&language=en',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(batch),
				timeout: 60000
			}
		);

		if (!response.ok) {
			const errorText = await response.text();
			console.error(
				`Failed to get character ids from ESI - Status: ${response.status} ${response.statusText}, URL: ${response.url}, Body: ${errorText}`
			);
			return [];
		}

		const data = await response.json();
		return data?.characters || [];
	});

	// Wait for all batches to complete
	const batchResults = await Promise.all(batchPromises);

	// Flatten the results from all batches
	const allCharacters = batchResults.flat();

	if (!allCharacters || allCharacters.length === 0) {
		console.error('Tried to add characters from ESI but charactersIds array was empty');
		return [];
	}

	let characterData = [];
	const characterPromises = allCharacters.map(async (character) => {
		const characterInfo = await getCharacterFromESI(character.id);
		characterData.push(characterInfo);
	});

	await Promise.all(characterPromises);

	return characterData;
}

async function idsToCharacters(ids) {
	// get all characters from esi and return them
	let characterData = [];
	const characterPromises = ids.map(async (id) => {
		const characterInfo = await getCharacterFromESI(id);
		characterData.push(characterInfo);
	});

	await Promise.all(characterPromises);

	return characterData;
}

async function addOrUpdateCharacters(data) {
	// get list of all corp ids
	const corpIDs = data
		.map((char) => char.corporation_id)
		.filter((id) => id !== undefined && id !== null);
	const corpIDsUnique = [...new Set(corpIDs)];

	// get list of all alliance ids
	const allianceIDs = data
		.map((char) => char.alliance_id)
		.filter((id) => id !== undefined && id !== null);
	const allianceIDsUnique = [...new Set(allianceIDs)];

	// first we check if we have the alliance info and if the info is updated
	// if we don't, we get it and update it
	await addOrUpdateAlliances(allianceIDsUnique);

	// now we can be sure we have all alliances, we can add the corporations
	await addOrUpdateCorporations(corpIDsUnique);

	// now we can be sure we have all corporations, we can add the characters
	await addOrUpdateCharactersDB(data);
}

export async function addCharactersFromESI(characters, sanityCheck = false) {
	// check if characters is empty
	if (characters.length === 0 || !characters) {
		console.warn('Tried to add characters from ESI but characters array was empty');
		return;
	}

	// sanity check if we already have it in the database
	if (sanityCheck) {
		const charactersInDB = await getCharactersByName(characters);
		if (charactersInDB.length === characters.length) {
			return;
		}
	}

	// Get Character IDS
	const charactersData = await namesToCharacters(characters);

	// check if charactersIds is empty or if characters is empty
	if (!charactersData || charactersData.length === 0) {
		console.error('Tried to add characters from ESI but charactersIds array was empty');
		return;
	}

	await addOrUpdateCharacters(charactersData);
}

export async function updateCharactersFromESI(data) {
	// data is a list of characters, not ids.
	// we need to extract the ids from the characters
	const ids = data.map((char) => char.id);

	const charactersData = await idsToCharacters(ids);

	await addOrUpdateCharacters(charactersData);
}
