/**
 *  Functions related to characters
 */
import { addOrUpdateCorporations } from '$lib/server/corporations.js';
import { addOrUpdateAlliances } from '$lib/server/alliances.js';
import { addOrUpdateCharactersDB, getCharactersByName } from '$lib/database/characters.js';

import { fetchGET, fetchPOST } from './wrappers.js';
import { withSpan } from './tracer.js';
import logger from '$lib/logger.js';
import { CHARACTER_REQUEST_BATCH_SIZE } from '$lib/server/constants.js';

async function getCharacterFromESI(id) {
	const characterData = await fetchGET(`https://esi.evetech.net/characters/${id}`);

	if (!characterData.ok) {
		logger.error(`Failed to fetch character ${id}: ${characterData.statusText}`);
		// TODO: Handle character not found case (deleted character)
		return null;
	}

	const characterInfo = await characterData.json();
	characterInfo.id = id;
	delete characterInfo.description;
	delete characterInfo.title;
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
	const allCharacters = await withSpan('namesToCharacters.nameToId', async (span) => {
		const batchPromises = batches.map(async (batch) => {
			const response = await fetchPOST('https://esi.evetech.net/universe/ids', batch);

			if (!response.ok) {
				const errorText = await response.text();
				logger.error(
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
		const flatResults = batchResults.flat();

		span.setAttributes({
			'batch.total_batches': batches.length,
			'batch.names_input': names.length,
			'batch.characters_found': flatResults.length
		});

		return flatResults;
	});

	if (!allCharacters || allCharacters.length === 0) {
		logger.error('Tried to add characters from ESI but charactersIds array was empty');
		return [];
	}

	// Process character requests in batches to avoid overwhelming ESI
	const characterData = await withSpan('namesToCharacters.fetchCharacterData', async (span) => {
		const characterBatches = [];
		for (let i = 0; i < allCharacters.length; i += CHARACTER_REQUEST_BATCH_SIZE) {
			characterBatches.push(allCharacters.slice(i, i + CHARACTER_REQUEST_BATCH_SIZE));
		}

		const allCharacterData = [];
		for (let batchIndex = 0; batchIndex < characterBatches.length; batchIndex++) {
			const characterBatch = characterBatches[batchIndex];
			const batchPromises = characterBatch.map(async (character) => {
				const characterInfo = await getCharacterFromESI(character.id);
				return characterInfo;
			});

			const batchResults = await Promise.all(batchPromises);
			allCharacterData.push(...batchResults);
		}

		span.setAttributes({
			'batch.character_batches': characterBatches.length,
			'batch.characters_to_fetch': allCharacters.length,
			'batch.characters_fetched': allCharacterData.length
		});

		return allCharacterData;
	});

	return characterData;
}

export async function idsToCharacters(ids) {
	return await withSpan(
		'idsToCharacters',
		async () => {
			// Split ids into batches
			const batches = [];
			for (let i = 0; i < ids.length; i += CHARACTER_REQUEST_BATCH_SIZE) {
				batches.push(ids.slice(i, i + CHARACTER_REQUEST_BATCH_SIZE));
			}

			// Process batches sequentially to avoid overwhelming ESI
			const allResults = [];
			for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
				const batch = batches[batchIndex];
				const batchResult = await withSpan(
					`idsToCharacters.batch.${batchIndex + 1}`,
					async () => {
						const batchData = [];
						const characterPromises = batch.map(async (id) => {
							const characterInfo = await getCharacterFromESI(id);
							batchData.push(characterInfo);
						});

						await Promise.all(characterPromises);
						return batchData;
					},
					{
						'batch.size': batch.length,
						'batch.start_id': batch[0],
						'batch.end_id': batch[batch.length - 1],
						'batch.index': batchIndex + 1,
						'batch.total': batches.length
					}
				);

				allResults.push(...batchResult);
			}

			return allResults;
		},
		{
			'idsToCharacters.id.length': ids.length,
			'idsToCharacters.batchSize': CHARACTER_REQUEST_BATCH_SIZE,
			'idsToCharacters.total_batches': Math.ceil(ids.length / CHARACTER_REQUEST_BATCH_SIZE)
		}
	);
}

async function addOrUpdateCharacters(data) {
	await withSpan('addOrUpdateCharacters', async () => {
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
	});
}

export async function addCharactersFromESI(characters, sanityCheck = false) {
	await withSpan(
		'addCharactersFromESI',
		async () => {
			// check if characters is empty
			if (characters.length === 0 || !characters) {
				logger.warn('Tried to add characters from ESI but characters array was empty');
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
			const charactersData = await withSpan('namesToCharacters', async () => {
				return await namesToCharacters(characters);
			});

			// check if charactersIds is empty or if characters is empty
			if (!charactersData || charactersData.length === 0) {
				logger.error('Tried to add characters from ESI but charactersIds array was empty');
				return;
			}

			await addOrUpdateCharacters(charactersData);
		},
		{
			'characters.add_from_esi': characters.length,
			sanity_check: sanityCheck
		}
	);
}

export async function updateCharactersFromESI(data) {
	// data is a list of characters, not ids.
	// we need to extract the ids from the characters
	const ids = data.map((char) => char.id);

	const charactersData = await idsToCharacters(ids);

	await addOrUpdateCharacters(charactersData);
}
