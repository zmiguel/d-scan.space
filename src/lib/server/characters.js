/**
 *  Functions related to characters
 */
import { getCorporationByID } from '$lib/database/corporations.js';
import { addCorporationFromESI } from '$lib/server/corporations.js';
import { getAllianceByID } from '$lib/database/alliances.js';
import { addAllianceFromESI } from '$lib/server/alliances.js';
import { addOrUpdateCharacterDB, getCharactersByName } from '$lib/database/characters.js';
import { DOOMHEIM_ID } from '$lib/server/constants.js';

async function getCharacterFromESI(id){
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

async function addOrUpdateCharacter(db, data){
	// check if we have the corporation in the database
	let corp = await getCorporationByID(db, data.corporation_id);

	if (!corp) {
		// add corporation to database
		await addCorporationFromESI(db, data.corporation_id);
	}

	// check if we have the alliance in the database
	if (data.alliance_id) {
		let alliance = await getAllianceByID(db, data.alliance_id);

		if (!alliance) {
			// add alliance to database
			await addAllianceFromESI(db, data.alliance_id);
		}
	}

	// Add character to database
	await addOrUpdateCharacterDB(db, {
		id: data.id,
		name: data.name,
		sec_status: data.security_status,
		corporation_id: data.corporation_id,
		alliance_id: data.alliance_id ?? null
	});
}

export async function addCharactersFromESI(db, characters, sanityCheck = false) {
	// check if characters is empty
	if (characters.length === 0 || !characters) {
		console.warn(
			'Tried to add characters from ESI but characters array was empty'
		);
		return;
	}

	console.info(`Adding ${characters.length} characters from ESI`);

	// sanity check if we already have it in the database
	if (sanityCheck) {
		const charactersInDB = await getCharactersByName(db, characters);
		if (charactersInDB.length === characters.length) {
			return;
		}
	}

	// Get Character IDS
	const BATCH_SIZE = 250;
	const batches = [];

	// Split characters into batches
	for (let i = 0; i < characters.length; i += BATCH_SIZE) {
		const batch = characters.slice(i, i + BATCH_SIZE);
		batches.push(batch);
	}

	// Process all batches in parallel
	const batchPromises = batches.map(async (batch) => {
		const response = await fetch(
			'https://esi.evetech.net/latest/universe/ids/?datasource=tranquility&language=en',
			{
				method: 'POST',
				headers: {
					'Content-Type': 'application/json'
				},
				body: JSON.stringify(batch)
			}
		);
		// check if response is ok
		if (!response.ok) {
			console.error(`Failed to get character ids from ESI ${JSON.stringify(response)}`);
			return {};
		}
		return response.json();
	});

	// Wait for all batch requests to complete
	const batchResults = await Promise.all(batchPromises);

	// Combine all batch results
	const charactersIds = batchResults.reduce((combined, result) => {
		if (result && result.characters) {
			if (!combined.characters) {
				combined.characters = [];
			}
			combined.characters = [...combined.characters, ...result.characters];
		}
		return combined;
	}, {});

	// check if charactersIds is empty or if characters is empty
	if (!charactersIds || !charactersIds.characters) {
		console.error(
			'Tried to add characters from ESI but charactersIds array was empty'
		);
		return;
	}

	const characterPromises = charactersIds.characters.map(async (character) => {
		const characterInfo = await getCharacterFromESI(character.id);
		await addOrUpdateCharacter(db, characterInfo);
	});

	await Promise.all(characterPromises);
}

export async function updateCharactersFromESI(db, data){
	const characterPromises = data.map(async (character) => {
		const characterInfo = await getCharacterFromESI(character.id);
		await addOrUpdateCharacter(db, characterInfo);
	});

	await Promise.all(characterPromises);
}