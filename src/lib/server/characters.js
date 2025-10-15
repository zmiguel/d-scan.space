/**
 *  Functions related to characters
 */
import { addOrUpdateCorporations } from '$lib/server/corporations.js';
import { addOrUpdateAlliances } from '$lib/server/alliances.js';
import {
	addOrUpdateCharactersDB,
	biomassCharacter,
	getCharactersByName
} from '$lib/database/characters.js';

import { fetchGET, fetchPOST } from './wrappers.js';
import { withSpan } from './tracer.js';
import logger from '$lib/logger.js';
import {
	CHARACTER_REQUEST_BATCH_SIZE,
	CHARACTER_BATCH_CONCURRENCY,
	DOOMHEIM_ID
} from '$lib/server/constants.js';

async function getCharacterFromESI(id) {
	const characterData = await fetchGET(`https://esi.evetech.net/characters/${id}`);

	if (!characterData.ok) {
		logger.error(
			`Failed to fetch character ${id}: ${characterData.status} ${characterData.statusText}`
		);
		return null;
	}

	const characterInfo = await characterData.json();
	characterInfo.id = id;
	delete characterInfo.description;
	delete characterInfo.title;

	// Determine cache expiry from headers
	try {
		const expiresHeader = characterData.headers.get('expires');
		let cacheExpiresDate = null; // JS Date for DB
		let cacheExpiresAt = null; // ISO string for telemetry

		if (expiresHeader) {
			const ts = Date.parse(expiresHeader);
			if (!Number.isNaN(ts)) {
				cacheExpiresDate = new Date(ts);
				cacheExpiresAt = cacheExpiresDate.toISOString();
			}
		}

		if (cacheExpiresAt) {
			// Attach cache expiry info for callers and DB
			characterInfo.esi_cache_expires = cacheExpiresDate;
		}
	} catch {
		// ignore header parsing errors
	}

	return characterInfo;
}

async function runBatchesWithConcurrency(batches, concurrency, handler) {
	if (!Array.isArray(batches) || batches.length === 0) {
		return [];
	}

	const limit = Math.max(1, Math.floor(concurrency ?? 1));
	const results = new Array(batches.length);
	let index = 0;

	const workers = Array.from({ length: Math.min(limit, batches.length) }, async () => {
		while (true) {
			const currentIndex = index++;
			if (currentIndex >= batches.length) {
				break;
			}

			results[currentIndex] = await handler(batches[currentIndex], currentIndex);
		}
	});

	await Promise.all(workers);

	return results.flat();
}

async function namesToCharacters(names) {
	// Split names into batches
	const batchSize = 50;
	const idsBatches = [];
	for (let i = 0; i < names.length; i += batchSize) {
		idsBatches.push(names.slice(i, i + batchSize));
	}

	// Run all batch requests in parallel
	const allCharacters = await withSpan('namesToCharacters.nameToId', async (span) => {
		const batchPromises = idsBatches.map(async (batch) => {
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
			'batch.total_batches': idsBatches.length,
			'batch.names_input': names.length,
			'batch.characters_found': flatResults.length
		});

		return flatResults;
	});

	if (!allCharacters || allCharacters.length === 0) {
		logger.error('Tried to add characters from ESI but charactersIds array was empty');
		return [];
	}

	// The character endpoint is cached up to 30 days, so we cannot rely on it for updated corp and alliance info.
	// We will fetch all character affiliations in batches like we did for the names to ids.
	// then we get the individual character info and replace the corp and alliance ids with the ones from the affiliation endpoint.

	// Build batches for affiliations and character detail fetches
	const affiliationBatches = [];
	for (let i = 0; i < allCharacters.length; i += batchSize) {
		affiliationBatches.push(allCharacters.slice(i, i + batchSize));
	}

	const characterBatches = [];
	for (let i = 0; i < allCharacters.length; i += CHARACTER_REQUEST_BATCH_SIZE) {
		characterBatches.push(allCharacters.slice(i, i + CHARACTER_REQUEST_BATCH_SIZE));
	}

	// Kick off both long-running operations in parallel
	const affiliationsPromise = withSpan('namesToCharacters.characterAffiliation', async (span) => {
		const batchPromises = affiliationBatches.map(async (batch) => {
			const response = await fetchPOST(
				'https://esi.evetech.net/characters/affiliation',
				batch.map((c) => c.id)
			);

			if (!response.ok) {
				const errorText = await response.text();
				logger.error(
					`Failed to get character affiliations from ESI - Status: ${response.status} ${response.statusText}, URL: ${response.url}, Body: ${errorText}`
				);
				return [];
			}

			const data = await response.json();
			return data || [];
		});

		const batchResults = await Promise.all(batchPromises);
		const flatResults = batchResults.flat();

		span.setAttributes({
			'batch.total_batches': affiliationBatches.length,
			'batch.affiliations_found': flatResults.length
		});

		return flatResults;
	});

	const charactersPromise = withSpan('namesToCharacters.fetchCharacterData', async (span) => {
		const effectiveConcurrency = Math.min(
			characterBatches.length || 1,
			Math.max(1, CHARACTER_BATCH_CONCURRENCY)
		);

		const allCharacterData = await runBatchesWithConcurrency(
			characterBatches,
			CHARACTER_BATCH_CONCURRENCY,
			async (characterBatch) =>
				Promise.all(characterBatch.map(async (character) => getCharacterFromESI(character.id)))
		);

		span.setAttributes({
			'batch.character_batches': characterBatches.length,
			'batch.characters_to_fetch': allCharacters.length,
			'batch.characters_fetched': allCharacterData.length,
			'batch.character_concurrency': effectiveConcurrency
		});

		return allCharacterData;
	});

	const [allCharacterAffiliations, characterData] = await Promise.all([
		affiliationsPromise,
		charactersPromise
	]);

	if (!allCharacterAffiliations || allCharacterAffiliations.length === 0) {
		logger.error('Affiliation data from ESI was empty');
		return [];
	}

	// filter out any null values from characterData first
	const filteredCharacterData = characterData.filter((char) => char !== null);

	const affiliationMap = new Map(allCharacterAffiliations.map((aff) => [aff.character_id, aff]));

	// now we need to merge the affiliation data into the character data
	for (const char of filteredCharacterData) {
		const affiliation = affiliationMap.get(char.id);
		if (affiliation) {
			char.corporation_id = affiliation.corporation_id;
			char.alliance_id = affiliation.alliance_id ?? null;
		}
	}

	return filteredCharacterData;
}

export async function idsToCharacters(ids) {
	return await withSpan(
		'idsToCharacters',
		async () => {
			// Prepare affiliation batches (ESI accepts arrays of ids)
			const affBatchSize = 50;
			const affiliationBatches = [];
			for (let i = 0; i < ids.length; i += affBatchSize) {
				affiliationBatches.push(ids.slice(i, i + affBatchSize));
			}

			// Fire off affiliations in parallel batches
			const affiliationsPromise = withSpan('idsToCharacters.characterAffiliation', async (span) => {
				const batchPromises = affiliationBatches.map(async (batch) => {
					const response = await fetchPOST('https://esi.evetech.net/characters/affiliation', batch);

					if (!response.ok) {
						const errorText = await response.text();
						logger.error(
							`Failed to get character affiliations from ESI - Status: ${response.status} ${response.statusText}, URL: ${response.url}, Body: ${errorText}`
						);
						return [];
					}

					const data = await response.json();
					return data || [];
				});

				const batchResults = await Promise.all(batchPromises);
				const flatResults = batchResults.flat();

				span.setAttributes({
					'batch.total_batches': affiliationBatches.length,
					'batch.affiliations_found': flatResults.length
				});

				return flatResults;
			});

			// Split ids into character fetch batches
			const batches = [];
			for (let i = 0; i < ids.length; i += CHARACTER_REQUEST_BATCH_SIZE) {
				batches.push(ids.slice(i, i + CHARACTER_REQUEST_BATCH_SIZE));
			}

			// Fetch character data (sequential batches) under a parent span
			const charactersPromise = withSpan('idsToCharacters.characterData', async (span) => {
				const effectiveConcurrency = Math.min(
					batches.length || 1,
					Math.max(1, CHARACTER_BATCH_CONCURRENCY)
				);

				const allResults = await runBatchesWithConcurrency(
					batches,
					CHARACTER_BATCH_CONCURRENCY,
					async (batch, batchIndex) =>
						withSpan(
							`idsToCharacters.batch.${batchIndex + 1}`,
							async () => Promise.all(batch.map((id) => getCharacterFromESI(id))),
							{
								'batch.size': batch.length,
								'batch.start_id': batch[0],
								'batch.end_id': batch[batch.length - 1],
								'batch.index': batchIndex + 1,
								'batch.total': batches.length
							}
						)
				);

				span.setAttributes({
					'batch.character_batches': batches.length,
					'batch.characters_to_fetch': ids.length,
					'batch.characters_fetched': allResults.length,
					'batch.character_concurrency': effectiveConcurrency
				});

				return allResults;
			});

			const [allCharacterAffiliations, allResults] = await Promise.all([
				affiliationsPromise,
				charactersPromise
			]);

			if (!allCharacterAffiliations || allCharacterAffiliations.length === 0) {
				logger.error('Affiliation data from ESI was empty');
				return [];
			}

			let processedCharacters = [];

			// Merge affiliation data into character results using a Map for O(1) lookups
			const affByCharId = new Map(allCharacterAffiliations.map((a) => [a.character_id, a]));
			for (const char of allResults) {
				if (!char) continue;
				const affiliation = affByCharId.get(char.id);
				if (affiliation) {
					if (affiliation.corporation_id === DOOMHEIM_ID) {
						// Biomass the character if they are in Doomheim
						await biomassCharacter(char.id);
						continue;
					}
					char.corporation_id = affiliation.corporation_id;
					char.alliance_id = affiliation.alliance_id ?? null;
					processedCharacters.push(char);
				}
			}

			// Filter out any null values from results
			const filtered = processedCharacters.filter((char) => char !== null);
			return filtered;
		},
		{
			'idsToCharacters.id.length': ids.length,
			'idsToCharacters.batchSize': CHARACTER_REQUEST_BATCH_SIZE,
			'idsToCharacters.total_batches': Math.ceil(ids.length / CHARACTER_REQUEST_BATCH_SIZE)
		}
	);
}

async function idsToAffiliations(ids) {
	// Prepare affiliation batches (ESI accepts arrays of ids)
	const affBatchSize = 50;
	const affiliationBatches = [];
	for (let i = 0; i < ids.length; i += affBatchSize) {
		affiliationBatches.push(ids.slice(i, i + affBatchSize));
	}

	// Fire off affiliations in parallel batches
	return await withSpan('idsToAffiliations', async (span) => {
		const batchPromises = affiliationBatches.map(async (batch) => {
			const response = await fetchPOST('https://esi.evetech.net/characters/affiliation', batch);

			if (!response.ok) {
				const errorText = await response.text();
				logger.error(
					`Failed to get character affiliations from ESI - Status: ${response.status} ${response.statusText}, URL: ${response.url}, Body: ${errorText}`
				);
				return [];
			}

			const data = await response.json();
			return data || [];
		});

		const batchResults = await Promise.all(batchPromises);
		const flatResults = batchResults.flat();

		span.setAttributes({
			'batch.total_batches': affiliationBatches.length,
			'batch.affiliations_found': flatResults.length
		});

		return flatResults;
	});
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
	await withSpan(
		'updateCharactersFromESI',
		async () => {
			const ids = data.map((char) => char.id);
			const charactersData = await idsToCharacters(ids);
			await addOrUpdateCharacters(charactersData);
		},
		{
			'characters.update_from_esi': data.length
		}
	);
}

export async function updateAffiliationsFromESI(data) {
	// data is a list of characters, not ids.
	// we need to extract the ids from the characters
	await withSpan(
		'updateAffiliationsFromESI',
		async () => {
			const ids = data.map((char) => char.id);
			const affiliationsData = await idsToAffiliations(ids);
			const affiliationMap = new Map(affiliationsData.map((aff) => [aff.character_id, aff]));

			let updatedCharacters = [];

			// update character data with new affiliation data
			for (const char of data) {
				const affiliation = affiliationMap.get(char.id);
				if (affiliation) {
					if (affiliation.corporation_id === DOOMHEIM_ID) {
						biomassCharacter(char.id);
						continue;
					}
					char.alliance_id = affiliation.alliance_id;
					char.corporation_id = affiliation.corporation_id;
					updatedCharacters.push(char);
				}
			}

			await addOrUpdateCharacters(updatedCharacters);
		},
		{
			'characters.update_affiliations_from_esi': data.length
		}
	);
}
