import {
	getAllAlliances,
	addOrUpdateAlliancesDB,
	getAlliancesByID
} from '../../../../src/lib/database/alliances.js';
import { getLeastRecentlyUpdatedCharacters } from '../../../../src/lib/database/characters.js';
import {
	addOrUpdateCorporationsDB,
	getAllCorporations
} from '../../../../src/lib/database/corporations.js';
import { idsToAlliances } from '../../../../src/lib/server/alliances.js';
import { idsToCorporations } from '../../../../src/lib/server/corporations.js';
import { updateCharactersFromESI, updateAffiliationsFromESI } from '../../../../src/lib/server/characters.js';
import { withSpan } from '../../../../src/lib/server/tracer.js';
import logger from '../../../../src/lib/logger.js';
import {
	BATCH_CHARACTERS,
	BATCH_CORPORATIONS,
	BATCH_ALLIANCES
} from '../../../../src/lib/server/constants.js';
import { fetchGET } from '../../../../src/lib/server/wrappers.js';
import {
	recordCronJob,
	charactersUpdatedCounter,
	corporationsUpdatedCounter,
	alliancesUpdatedCounter
} from '../../../../src/lib/server/metrics.js';

/**
 * Main function to update all dynamic EVE Online data (characters, corporations, and alliances).
 *
 * This function:
 * 1. Checks if the TQ server is available
 * 2. Updates character data (up to 1000 characters per run)
 * 3. Updates corporation data (last seen within a year, not updated in 23+ hours)
 * 4. Updates alliance data (last seen within a year, not updated in 23+ hours)
 *
 * @returns {Promise<boolean>} true when all updates complete successfully
 */
export async function updateDynamicData() {
	const startTime = Date.now();

	try {
		logger.info('[DynUpdater] Updating dynamic data...');
		await withSpan('worker.dynamic.cron', async () => {
			// first we check if the server is up before doing anything
			const status = await getTQStatus();
			if (!status) {
				logger.warn('[DynUpdater] TQ is not available, skipping dynamic data update.');
				// Record skipped CRON job (not really a failure, but server unavailable)
				const duration = Date.now() - startTime;
				recordCronJob('updateDynamicData', duration, false);
				return false;
			}

			// Update the Character data
			await updateCharacterData();

			// Update the Corporation data
			await updateCorporationData();

			// Update the Alliance data
			await updateAllianceData();
		});
		logger.info('[DynUpdater] Dynamic data update completed.');

		// Record successful CRON job
		const duration = Date.now() - startTime;
		recordCronJob('updateDynamicData', duration, true);

		return true;
	} catch (error) {
		const duration = Date.now() - startTime;
		recordCronJob('updateDynamicData', duration, false);
		throw error;
	}
}

/**
 * Checks if the EVE Online Tranquility (TQ) server is up and available.
 *
 * The server is considered "up" when:
 * - It has more than 100 players online
 * - VIP mode is NOT explicitly enabled (vip !== true)
 *
 * @returns {Promise<boolean>} true if the server is up and available, false otherwise
 */
async function getTQStatus() {
	return await withSpan('worker.dynamic.get_tq_status', async (span) => {
		try {
			const res = await fetchGET('https://esi.evetech.net/status');
			if (!res.ok) {
				logger.warn(`[DynUpdater] Failed to fetch TQ status: ${res.status} ${res.statusText}`);
				span.setAttributes({
					'cron.task.get_tq_status.error': `HTTP ${res.status}`,
					'cron.task.get_tq_status.is_up': false
				});
				return false;
			}
			const data = await res.json();

			// Server is considered "up" when it has more than 100 players and VIP mode is NOT explicitly true
			const isServerUp = data.players > 100 && data.vip !== true;

			span.setAttributes({
				'cron.task.get_tq_status.players': data.players,
				'cron.task.get_tq_status.vip': data.vip,
				'cron.task.get_tq_status.is_up': isServerUp
			});

			if (isServerUp) {
				return true;
			} else {
				logger.warn(
					`[DynUpdater] TQ is not available (Players: ${data.players}, VIP: ${data.vip})`
				);
				return false;
			}
		} catch (error) {
			logger.error(`[DynUpdater] Error fetching TQ status: ${error.message}`);
			span.recordException(error);
			span.setAttributes({
				'cron.task.get_tq_status.error': error.message,
				'cron.task.get_tq_status.is_up': false
			});
			return false;
		}
	});
}

/**
 * Updates character data by fetching the least recently updated characters from the database
 * and refreshing their information from ESI.
 */
async function updateCharacterData() {
	return await withSpan(
		'worker.dynamic.update_characters',
		async (span) => {
			logger.info('[DynUpdater] Updating Character data...');
			// Get from DB the least recently updated characters
			const charactersToUpdate = await getLeastRecentlyUpdatedCharacters(BATCH_CHARACTERS);
			if (!charactersToUpdate || charactersToUpdate.length === 0) {
				logger.info('[DynUpdater] No characters found to update.');
				span.setAttributes({
					'cron.task.update_characters.to_update': 0
				});
				return;
			}

			span.setAttributes({
				'cron.task.update_characters.to_update': charactersToUpdate.length
			});

			logger.info(`[DynUpdater] Found ${charactersToUpdate.length} characters to update.`);

			const expiredCharacters = charactersToUpdate.filter(
				(char) =>
					char.esi_cache_expires < Date.now() ||
					!char.esi_cache_expires ||
					char.esi_cache_expires === null
			);
			const cachedCharacters = charactersToUpdate.filter(
				(char) => char.esi_cache_expires >= Date.now()
			);

			span.setAttributes({
				'cron.task.update_characters.expired': expiredCharacters.length,
				'cron.task.update_characters.cached': cachedCharacters.length
			});

			const expiredPromise = withSpan(
				'worker.dynamic.update_characters.expired',
				async () => {
					for (let i = 0; i < expiredCharacters.length; i += BATCH_CHARACTERS) {
						await withSpan(
							`worker.dynamic.update_characters.expired_batch.${i / BATCH_CHARACTERS + 1}`,
							async (batchSpan) => {
								const batch = expiredCharacters.slice(i, i + BATCH_CHARACTERS);
								await updateCharactersFromESI(batch);
								batchSpan.setAttributes({
									'cron.task.update_characters.expired_batch_size': batch.length
								});

								charactersUpdatedCounter.add(batch.length);
							}
						);
					}
				},
				{
					'cron.task.update_characters.expired_total': expiredCharacters.length
				}
			);

			const cachedPromise = withSpan(
				'worker.dynamic.update_characters.cached',
				async () => {
					for (let i = 0; i < cachedCharacters.length; i += BATCH_CHARACTERS) {
						await withSpan(
							`worker.dynamic.update_characters.cached_batch.${i / BATCH_CHARACTERS + 1}`,
							async (batchSpan) => {
								const batch = cachedCharacters.slice(i, i + BATCH_CHARACTERS);
								await updateAffiliationsFromESI(batch);
								batchSpan.setAttributes({
									'cron.task.update_characters.cached_batch_size': batch.length
								});

								charactersUpdatedCounter.add(batch.length);
							}
						);
					}
				},
				{
					'cron.task.update_characters.cached_total': cachedCharacters.length
				}
			);

			await Promise.all([expiredPromise, cachedPromise]);

			logger.info('[DynUpdater] Character data update completed.');
			return true;
		},
		{
			'cron.task': 'update_characters'
		}
	);
}

/**
 * Updates corporation data by fetching corporations that haven't been updated recently.
 */
async function updateCorporationData() {
	return await withSpan(
		'worker.dynamic.update_corporations',
		async (span) => {
			logger.info('[DynUpdater] Updating Corporation data...');
			const allCorporations = await getAllCorporations();
			if (!allCorporations || allCorporations.length === 0) {
				logger.warn('[DynUpdater] No corporations found to update.');
				return;
			}

			const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
			const twentyThreeHoursAgo = new Date(Date.now() - 23.5 * 60 * 60 * 1000);
			const corporationsToUpdate = allCorporations
				.filter((c) => new Date(c.last_seen) > oneYearAgo)
				.filter((c) => new Date(c.updated_at) < twentyThreeHoursAgo);

			span.setAttributes({
				'cron.task.update_corporations.to_update': corporationsToUpdate.length
			});

			if (corporationsToUpdate.length === 0) {
				logger.info('[DynUpdater] No corporations to update at this time.');
				return;
			}

			logger.info(`[DynUpdater] Found ${corporationsToUpdate.length} corporations to update`);

			await withSpan(
				'worker.dynamic.update_corporations.batches',
				async () => {
					for (let i = 0; i < corporationsToUpdate.length; i += BATCH_CORPORATIONS) {
						await withSpan(
							`worker.dynamic.update_corporations.batch.${i / BATCH_CORPORATIONS + 1}`,
							async (batchSpan) => {
								const batch = corporationsToUpdate.slice(i, i + BATCH_CORPORATIONS);
								const corporationIDs = batch.map((corporation) => corporation.id);
								const corporationsData = await idsToCorporations(corporationIDs);
								const validCorporationsData = corporationsData.filter(
									(corporation) => corporation !== null && corporation !== undefined
								);
								if (!validCorporationsData || validCorporationsData.length === 0) {
									logger.warn(
										`[DynUpdater] No corporation data fetched from ESI for batch starting at index ${i}.`
									);
									batchSpan.setAttributes({
										'cron.task.update_corporations.batch_fetched_data_length': 0
									});
									return;
								}
								batchSpan.setAttributes({
									'cron.task.update_corporations.batch_fetched_data_length':
										validCorporationsData.length
								});

								await withSpan('worker.dynamic.update_corporations.fetch_alliances', async (span) => {
									const allianceIDs = validCorporationsData
										.map((corporation) => corporation.alliance_id)
										.filter((id) => id !== undefined && id !== null);

									const uniqueAllianceIDs = [...new Set(allianceIDs)];

									const existingAlliances = await getAlliancesByID(uniqueAllianceIDs);
									const existingAllianceIDs = existingAlliances.map((alliance) => alliance.id);
									const newAllianceIDs = uniqueAllianceIDs.filter(
										(id) => !existingAllianceIDs.includes(id)
									);

									span.setAttributes({
										'cron.task.update_corporations.new_alliances': newAllianceIDs.length
									});

									if (newAllianceIDs.length > 0) {
										const alliancesData = await idsToAlliances(newAllianceIDs);
										await addOrUpdateAlliancesDB(alliancesData);
									}
								});

								await addOrUpdateCorporationsDB(validCorporationsData);
								corporationsUpdatedCounter.add(validCorporationsData.length);
							}
						);
					}
				},
				{
					'cron.task.update_corporations.batch_size': corporationsToUpdate.length
				}
			);

			logger.info('[DynUpdater] Corporation data update completed.');
			return true;
		},
		{
			'cron.task': 'update_corporations'
		}
	);
}

/**
 * Updates alliance data by fetching alliances that haven't been updated recently.
 */
async function updateAllianceData() {
	return await withSpan(
		'worker.dynamic.update_alliances',
		async (span) => {
			logger.info('[DynUpdater] Updating Alliance data...');
			const allAlliances = await getAllAlliances();
			if (!allAlliances || allAlliances.length === 0) {
				logger.warn('[DynUpdater] No alliances found to update.');
				return;
			}

			const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
			const twentyThreeHoursAgo = new Date(Date.now() - 23.5 * 60 * 60 * 1000);
			const alliancesToUpdate = allAlliances
				.filter((a) => new Date(a.last_seen) > oneYearAgo)
				.filter((a) => new Date(a.updated_at) < twentyThreeHoursAgo);

			span.setAttributes({
				'cron.task.update_alliances.to_update': alliancesToUpdate.length
			});

			if (alliancesToUpdate.length === 0) {
				logger.info('[DynUpdater] No alliances to update at this time.');
				return;
			}

			logger.info(`[DynUpdater] Found ${alliancesToUpdate.length} alliances to update.`);

			await withSpan(
				'worker.dynamic.update_alliances.batches',
				async () => {
					for (let i = 0; i < alliancesToUpdate.length; i += BATCH_ALLIANCES) {
						await withSpan(
							`worker.dynamic.update_alliances.batch.${i / BATCH_ALLIANCES + 1}`,
							async (batchSpan) => {
								const batch = alliancesToUpdate.slice(i, i + BATCH_ALLIANCES);
								const allianceIDs = batch.map((alliance) => alliance.id);
								const alliancesData = await idsToAlliances(allianceIDs);
								const validAlliancesData = alliancesData.filter(
									(alliance) => alliance !== null && alliance !== undefined
								);
								if (!validAlliancesData || validAlliancesData.length === 0) {
									logger.warn(
										`[DynUpdater] No alliance data fetched from ESI for batch starting at index ${i}.`
									);
									batchSpan.setAttributes({
										'cron.task.update_alliances.batch_fetched_data_length': 0
									});
									return;
								}
								batchSpan.setAttributes({
									'cron.task.update_alliances.batch_fetched_data_length': validAlliancesData.length
								});

								await addOrUpdateAlliancesDB(validAlliancesData);
								alliancesUpdatedCounter.add(validAlliancesData.length);
							}
						);
					}
				},
				{
					'cron.task.update_alliances.batch_size': alliancesToUpdate.length
				}
			);

			logger.info('[DynUpdater] Alliance data update completed.');
			return true;
		},
		{
			'cron.task': 'update_alliances'
		}
	);
}
