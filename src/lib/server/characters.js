/**
 * Character lookups against ESI and their persistence.
 *
 * Flow for a set of characters:
 * 1. names → ids with POST /universe/ids (≤500 names per request, case-insensitive,
 *    returns canonical names; unknown names are omitted and negatively cached),
 * 2. ids → corporation/alliance with POST /characters/affiliation (≤1000 ids). This
 *    route is never stale for affiliations (GET /characters/{id} is cached for days).
 *    Deleted characters are reported in the Doomheim corporation and are biomassed
 *    here, *before* their details are requested: GET /characters/{id} would answer 404
 *    and spend ESI error budget,
 * 3. details (name, security status) with GET /characters/{id} for living characters,
 * 4. persistence: alliances → corporations → characters, skipping characters whose
 *    corporation/alliance could not be stored so one failed ESI lookup does not abort
 *    the whole batch on a foreign key.
 *
 * Concurrency, retries and rate limiting are handled by the ESI client (wrappers.js).
 */
import { addOrUpdateCorporations } from './corporations.js';
import { addOrUpdateAlliances } from './alliances.js';
import {
	addOrUpdateCharactersDB,
	biomassCharacters,
	getCharactersByName
} from '../database/characters.js';
import { getCorporationsByID } from '../database/corporations.js';
import { getAlliancesByID } from '../database/alliances.js';
import { chunk } from '../database/batching.js';
import { fetchGET, fetchPOST } from './wrappers.js';
import { withSpan } from './tracer.js';
import logger from '../logger.js';
import { DOOMHEIM_ID, ESI_AFFILIATION_BATCH, ESI_IDS_BATCH } from './constants.js';
import { isKnownUnresolvable, rememberUnresolvable } from './unresolved-names.js';

const ESI = 'https://esi.evetech.net';

/**
 * Character details. 404 means the character was deleted: it is biomassed.
 * @param {number} id
 */
async function getCharacterFromESI(id) {
	const response = await fetchGET(`${ESI}/characters/${id}`);

	if (!response) {
		logger.error({ characterId: id }, 'Failed to fetch character: no response');
		return null;
	}

	if (response.status === 404) {
		// "Character has been deleted!"
		await biomassCharacters([id]);
		return null;
	}

	if (!response.ok) {
		logger.error({ characterId: id, status: response.status }, 'Failed to fetch character');
		return null;
	}

	const characterInfo = await response.json();
	characterInfo.id = id;
	delete characterInfo.description;
	delete characterInfo.title;

	// ESI caches character details; remember until when so we do not refetch early.
	const expires = Date.parse(response.headers.get('expires') ?? '');
	if (!Number.isNaN(expires)) {
		characterInfo.esi_cache_expires = new Date(expires);
	}

	return characterInfo;
}

/**
 * POSTs `items` in batches and returns the parsed JSON bodies of successful batches.
 * A failed batch is logged and skipped (its items are simply not resolved).
 * @template T
 * @param {string} url
 * @param {T[]} items
 * @param {number} batchSize
 * @returns {Promise<any[]>}
 */
async function postInBatches(url, items, batchSize) {
	const batches = chunk(items, batchSize);
	const bodies = await Promise.all(
		batches.map(async (batch) => {
			const response = await fetchPOST(url, batch);
			if (!response || !response.ok) {
				logger.error(
					{ url, status: response?.status ?? null, batchSize: batch.length },
					'ESI batch request failed'
				);
				return null;
			}
			return response.json();
		})
	);
	return bodies.filter((body) => body != null);
}

/**
 * Resolves character names to ids. Names ESI does not know are negatively cached.
 * @param {string[]} names
 * @returns {Promise<Array<{ id: number, name: string }>>}
 */
async function resolveCharacterNames(names) {
	return withSpan('server.characters.names_to_ids', async (span) => {
		const toResolve = names.filter((name) => !isKnownUnresolvable(name));
		const bodies = await postInBatches(`${ESI}/universe/ids`, toResolve, ESI_IDS_BATCH);
		const found = bodies.flatMap((body) => body?.characters ?? []);

		// Only cache misses from batches that actually succeeded.
		if (bodies.length === Math.ceil(toResolve.length / ESI_IDS_BATCH)) {
			const foundNames = new Set(found.map((c) => c.name.toLowerCase()));
			rememberUnresolvable(toResolve.filter((name) => !foundNames.has(name.toLowerCase())));
		}

		span.setAttributes({
			'characters.names_requested': names.length,
			'characters.names_skipped_cached_miss': names.length - toResolve.length,
			'characters.ids_found': found.length
		});
		return found;
	});
}

/**
 * Current corporation/alliance for character ids.
 * @param {number[]} ids
 * @returns {Promise<Array<{ character_id: number, corporation_id: number, alliance_id?: number }>>}
 */
async function idsToAffiliations(ids) {
	return withSpan('server.characters.ids_to_affiliations', async (span) => {
		const bodies = await postInBatches(`${ESI}/characters/affiliation`, ids, ESI_AFFILIATION_BATCH);
		const affiliations = bodies.flat();
		span.setAttributes({
			'characters.ids_requested': ids.length,
			'characters.affiliations_found': affiliations.length
		});
		return affiliations;
	});
}

/**
 * Splits affiliations into living characters and biomassed (Doomheim) ones, marking the
 * latter as deleted.
 */
async function separateBiomassed(affiliations) {
	const living = affiliations.filter((a) => a.corporation_id !== DOOMHEIM_ID);
	const deletedIds = affiliations
		.filter((a) => a.corporation_id === DOOMHEIM_ID)
		.map((a) => a.character_id);
	await biomassCharacters(deletedIds);
	return living;
}

/**
 * Full character records (details + current affiliation) for ids, from ESI.
 * Deleted characters are biomassed and left out.
 * @param {number[]} ids
 */
export async function idsToCharacters(ids) {
	return await withSpan(
		'server.characters.ids_to_characters',
		async (span) => {
			const living = await separateBiomassed(await idsToAffiliations(ids));

			const details = await Promise.all(living.map((a) => getCharacterFromESI(a.character_id)));

			const characters = [];
			details.forEach((character, index) => {
				if (!character) return;
				character.corporation_id = living[index].corporation_id;
				character.alliance_id = living[index].alliance_id ?? null;
				characters.push(character);
			});

			span.setAttributes({
				'characters.living': living.length,
				'characters.fetched': characters.length
			});
			return characters;
		},
		{ 'characters.ids_requested': ids.length }
	);
}

/**
 * Stores characters with their corporations and alliances. Characters whose
 * corporation or alliance could not be stored (ESI failure) are skipped instead of
 * failing the whole batch on the foreign key; they are refreshed on a later scan/run.
 * @returns {Promise<any[]>} the characters that were stored
 */
async function addOrUpdateCharacters(data) {
	return withSpan('server.characters.add_or_update', async (span) => {
		if (data.length === 0) return [];

		const corpIDs = [
			...new Set(data.map((char) => char.corporation_id).filter((id) => id != null))
		];
		const allianceIDs = [
			...new Set(data.map((char) => char.alliance_id).filter((id) => id != null))
		];

		await addOrUpdateAlliances(allianceIDs);
		await addOrUpdateCorporations(corpIDs);

		const [storedCorps, storedAlliances] = await Promise.all([
			getCorporationsByID(corpIDs),
			getAlliancesByID(allianceIDs)
		]);
		const corpSet = new Set(storedCorps.map((c) => c.id));
		const allianceSet = new Set(storedAlliances.map((a) => a.id));

		const storable = data.filter(
			(char) =>
				corpSet.has(char.corporation_id) &&
				(char.alliance_id == null || allianceSet.has(char.alliance_id))
		);
		const skipped = data.length - storable.length;
		if (skipped > 0) {
			logger.warn(
				{ skipped },
				'Skipped characters whose corporation/alliance could not be fetched from ESI'
			);
		}
		span.setAttributes({ 'characters.storable': storable.length, 'characters.skipped': skipped });

		await addOrUpdateCharactersDB(storable);
		return storable;
	});
}

/**
 * Adds characters that are not in the database yet, by name.
 * @param {string[]} names
 * @param {boolean} [sanityCheck] skip ESI when all names are already stored
 */
export async function addCharactersFromESI(names, sanityCheck = false) {
	await withSpan(
		'server.characters.add_from_esi',
		async () => {
			if (!names || names.length === 0) {
				logger.warn('Tried to add characters from ESI but characters array was empty');
				return;
			}

			if (sanityCheck) {
				const charactersInDB = await getCharactersByName(names);
				if (charactersInDB.length === names.length) {
					return;
				}
			}

			const resolved = await resolveCharacterNames(names);
			if (resolved.length === 0) {
				return;
			}

			const characters = await idsToCharacters(resolved.map((c) => c.id));
			await addOrUpdateCharacters(characters);
		},
		{
			'characters.add_from_esi': names.length,
			sanity_check: sanityCheck
		}
	);
}

/**
 * Full refresh (details + affiliation) of stored characters whose ESI cache expired.
 * @param {Array<{ id: number }>} data
 */
export async function updateCharactersFromESI(data) {
	return await withSpan(
		'server.characters.update_from_esi',
		async () => {
			const characters = await idsToCharacters(data.map((char) => char.id));
			return addOrUpdateCharacters(characters);
		},
		{
			'characters.update_from_esi': data.length
		}
	);
}

/**
 * Affiliation-only refresh of stored characters whose details are still cached by ESI.
 * @param {Array<{ id: number, corporation_id: number, alliance_id: number | null }>} data
 */
export async function updateAffiliationsFromESI(data) {
	return await withSpan(
		'server.characters.update_affiliations_from_esi',
		async () => {
			const living = await separateBiomassed(await idsToAffiliations(data.map((c) => c.id)));
			const affiliationMap = new Map(living.map((a) => [a.character_id, a]));

			const updatedCharacters = [];
			for (const char of data) {
				const affiliation = affiliationMap.get(char.id);
				if (!affiliation) continue;
				char.corporation_id = affiliation.corporation_id;
				char.alliance_id = affiliation.alliance_id ?? null;
				updatedCharacters.push(char);
			}

			return addOrUpdateCharacters(updatedCharacters);
		},
		{
			'characters.update_affiliations_from_esi': data.length
		}
	);
}
