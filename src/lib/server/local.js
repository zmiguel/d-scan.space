/**
 * File for all Local Scan related functions
 */

import { getCharactersByName, updateCharactersLastSeen } from '../database/characters.js';
import { updateCorporationsLastSeen } from '../database/corporations.js';
import { updateAlliancesLastSeen } from '../database/alliances.js';
import {
	addCharactersFromESI,
	updateAffiliationsFromESI,
	updateCharactersFromESI
} from './characters.js';
import logger from '../logger.js';
import { withSpan } from './tracer';
import {
	cacheHitCounter,
	cacheMissCounter,
	scanItemsCount,
	scanDuration,
	scansProcessedCounter
} from './metrics';

/**
 * Retrieves and updates character data for a local scan.
 * @param {string[]} data - Array of character names from the scan.
 * @returns {Promise<Object>} The structured scan result.
 */
async function getCharacters(data) {
	return await withSpan(
		'server.local.get_characters',
		async (span) => {
			span.setAttributes({
				'characters.requested_count': data.length,
				'operation.type': 'character_resolution'
			});

			// get characters in the database
			const charactersInDB = await getCharactersByName(data);
			const charactersInDBNames = new Set(charactersInDB.map((c) => c.name));

			const {
				missingCharacters,
				outdatedExpiredCharacters,
				outdatedCachedCharacters,
				goodCharacters
			} = await withSpan('server.local.filter_characters', async (span) => {
				const missingCharacters = data.filter((l) => !charactersInDBNames.has(l));

				const nowSeconds = Math.floor(Date.now() / 1000);
				const oneDaySeconds = 86400;

				const outdatedExpiredCharacters = charactersInDB.filter((c) => {
					const updatedAt = getTimestampSeconds(c.updated_at);
					const cacheExpires = c.esi_cache_expires
						? getTimestampSeconds(c.esi_cache_expires)
						: null;

					const isOld = updatedAt < nowSeconds - oneDaySeconds;
					const isCacheExpired = cacheExpires == null || cacheExpires < nowSeconds;

					return isOld && isCacheExpired;
				});

				const outdatedCachedCharacters = charactersInDB.filter((c) => {
					const updatedAt = getTimestampSeconds(c.updated_at);
					const cacheExpires = c.esi_cache_expires
						? getTimestampSeconds(c.esi_cache_expires)
						: null;

					const isOld = updatedAt < nowSeconds - oneDaySeconds;
					const isCacheValid = cacheExpires && cacheExpires > nowSeconds;

					return isOld && isCacheValid;
				});

				const goodCharacters = charactersInDB.filter((c) => {
					const updatedAt = getTimestampSeconds(c.updated_at);
					return updatedAt >= nowSeconds - oneDaySeconds;
				});

				span.setAttributes({
					'characters.missing_count': missingCharacters.length,
					'characters.outdated_expired_count': outdatedExpiredCharacters.length,
					'characters.outdated_cached_count': outdatedCachedCharacters.length,
					'characters.good_count': goodCharacters.length,
					'characters.cache_hit_rate': ((goodCharacters.length / data.length) * 100).toFixed(2)
				});

				// Record cache metrics
				// Good characters = cache hit (data is fresh)
				cacheHitCounter.add(goodCharacters.length, { resource: 'character' });
				// Missing + outdated = cache miss (need to fetch from ESI)
				cacheMissCounter.add(
					missingCharacters.length +
						outdatedExpiredCharacters.length +
						outdatedCachedCharacters.length,
					{ resource: 'character' }
				);

				return {
					missingCharacters,
					outdatedExpiredCharacters,
					outdatedCachedCharacters,
					goodCharacters
				};
			});

			logger.info(
				`Missing: ${missingCharacters.length}, Outdated (Expired): ${outdatedExpiredCharacters.length}, Outdated (Cached): ${outdatedCachedCharacters.length}, Good: ${goodCharacters.length}`
			);

			// Run the three update paths in parallel where applicable
			const updatePromises = [];
			// missing characters → full character fetch
			if (missingCharacters.length > 0) {
				updatePromises.push(addCharactersFromESI(missingCharacters));
			}
			// outdated with expired ESI cache → full character refresh
			if (outdatedExpiredCharacters.length > 0) {
				updatePromises.push(updateCharactersFromESI(outdatedExpiredCharacters));
			}
			// outdated but ESI cache still valid → affiliations-only refresh
			if (outdatedCachedCharacters.length > 0) {
				updatePromises.push(updateAffiliationsFromESI(outdatedCachedCharacters));
			}
			if (updatePromises.length > 0) {
				await Promise.all(updatePromises);
			}

			// get all outdated and missing characters from db
			const charactersToFetch = [
				...missingCharacters,
				...outdatedExpiredCharacters.map((c) => c.name),
				...outdatedCachedCharacters.map((c) => c.name)
			];
			const updatedCharacters = await getCharactersByName(charactersToFetch);

			// merge good with updated
			const finalCharacters = [...goodCharacters, ...updatedCharacters];

			span.setAttributes({
				'characters.final_count': finalCharacters.length,
				'characters.esi_calls_made':
					missingCharacters.length +
					outdatedExpiredCharacters.length +
					outdatedCachedCharacters.length
			});

			return finalCharacters;
		},
		{
			'scan.characters.requested': data.length
		}
	);
}

export async function createNewLocalScan(data) {
	return await withSpan(
		'server.local.create_new',
		async (span) => {
			const startTime = Date.now();
			// Remove duplicates
			data = [...new Set(data)];

			span.setAttributes({
				'scan.type': 'local',
				'scan.raw_character_count': data.length
			});

			const allCharacters = await getCharacters(data);
			await updateLastSeen(allCharacters);

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

			/** @type {{
				alliances: Array<any>;
				total_alliances: number;
				total_corporations: number;
				total_pilots: number;
			}} */
			const formattedData = {
				alliances: [],
				total_alliances: 0,
				total_corporations: 0,
				total_pilots: 0
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
				alliance.corporations.forEach((corporation) => {
					corporation.characters.sort((a, b) => a.name.localeCompare(b.name));
				});
				alliance.corporations.sort((a, b) => b.character_count - a.character_count);
				return alliance;
			});

			formattedData.alliances.sort((a, b) => b.character_count - a.character_count);

			const totalAlliances = formattedData.alliances.length;
			const totalCorporations = formattedData.alliances.reduce(
				(acc, alliance) => acc + (alliance.corporation_count ?? 0),
				0
			);
			const totalPilots = allCharacters.length;

			formattedData.total_alliances = totalAlliances;
			formattedData.total_corporations = totalCorporations;
			formattedData.total_pilots = totalPilots;

			span.setAttributes({
				'scan.processed_characters': totalPilots,
				'scan.alliances_count': totalAlliances,
				'scan.corporations_count': totalCorporations
			});

			// Record scan metrics
			const duration = Date.now() - startTime;
			scanItemsCount.record(data.length, { type: 'local' });
			scanDuration.record(duration / 1000, { type: 'local' });
			scansProcessedCounter.add(1, { type: 'local' });

			return formattedData;
		},
		{
			'operation.type': 'local_scan_creation'
		}
	);
}
async function updateLastSeen(characters) {
	// extract all character ids, corp ids and alliance ids to update the last seen timestamp
	await withSpan('server.local.update_last_seen', async (span) => {
		const characterIDs = characters.map((c) => c.id);
		const uniqueCorporationIDs = [...new Set(characters.map((c) => c.corporation_id))];
		const uniqueAllianceIDs = [...new Set(characters.map((c) => c.alliance_id))];

		span.setAttributes({
			characters: characterIDs.length,
			corporations: uniqueCorporationIDs.length,
			alliances: uniqueAllianceIDs.length
		});

		await updateCharactersLastSeen(characterIDs);
		await updateCorporationsLastSeen(uniqueCorporationIDs);
		await updateAlliancesLastSeen(uniqueAllianceIDs);
	});
}

function getTimestampSeconds(dateOrNumber) {
	if (typeof dateOrNumber === 'number') {
		return dateOrNumber;
	}
	if (dateOrNumber instanceof Date) {
		return Math.floor(dateOrNumber.getTime() / 1000);
	}
	if (typeof dateOrNumber === 'string') {
		return Math.floor(new Date(dateOrNumber).getTime() / 1000);
	}
	return 0;
}
