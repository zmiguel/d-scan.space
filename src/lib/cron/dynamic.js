import { getAllAlliances, addOrUpdateAlliancesDB, getAlliancesByID } from '$lib/database/alliances';
import {
	addOrUpdateCharactersDB,
	getLeastRecentlyUpdatedCharacters
} from '$lib/database/characters';
import { addOrUpdateCorporationsDB, getAllCorporations } from '$lib/database/corporations';
import { idsToAlliances } from '$lib/server/alliances';
import { idsToCorporations } from '$lib/server/corporations';
import { idsToCharacters } from '$lib/server/characters';
import { withSpan } from '$lib/server/tracer';
import logger from '$lib/logger';
import { BATCH_CHARACTERS, BATCH_CORPORATIONS, BATCH_ALLIANCES } from '$lib/server/constants';

export async function updateDynamicData() {
	logger.info('[DynUpdater] Updating dynamic data...');
	await withSpan('CRON Dynamic', async () => {
		// Update the Character data
		await updateCharacterData();

		// Update the Corporation data
		await updateCorporationData();

		// Update the Alliance data
		await updateAllianceData();
	});
	logger.info('[DynUpdater] Dynamic data update completed.');
	return true;
}

async function updateAllianceData() {
	return await withSpan(
		'Update Alliances',
		async (span) => {
			logger.info('[DynUpdater] Updating Alliance data...');
			const allAlliances = await getAllAlliances();
			if (!allAlliances || allAlliances.length === 0) {
				logger.warn('[DynUpdater] No alliances found to update.');
				return;
			}

			// Filter by last seen within the last year
			// and that have have not been updated in the last 24 hours
			const yearAgo = new Date();
			yearAgo.setFullYear(yearAgo.getFullYear() - 1);
			const twentyThreeHoursAgo = new Date();
			twentyThreeHoursAgo.setHours(twentyThreeHoursAgo.getHours() - 23);
			const alliancesToUpdate = allAlliances.filter((alliance) => {
				const lastSeen = new Date(alliance.last_seen);
				const lastUpdated = new Date(alliance.updated_at);
				return lastSeen >= yearAgo && lastUpdated <= twentyThreeHoursAgo;
			});

			span.setAttributes({
				'cron.task.update_alliances.to_update': alliancesToUpdate.length
			});

			// If no alliances to update, exit
			if (alliancesToUpdate.length === 0) {
				logger.info('[DynUpdater] No alliances to update at this time.');
				return;
			}

			logger.info(`[DynUpdater] Found ${alliancesToUpdate.length} alliances to update.`);

			await withSpan(
				'Batch Update Alliances',
				async () => {
					for (let i = 0; i < alliancesToUpdate.length; i += BATCH_ALLIANCES) {
						await withSpan(`Batch Update Alliances ${i / BATCH_ALLIANCES + 1}`, async (span) => {
							const batch = alliancesToUpdate.slice(i, i + BATCH_ALLIANCES);
							const allianceIDs = batch.map((alliance) => alliance.id);
							const alliancesData = await idsToAlliances(allianceIDs);
							// Process alliancesData
							const validAlliancesData = alliancesData.filter(
								(alliance) => alliance !== null && alliance !== undefined
							);
							if (!validAlliancesData || validAlliancesData.length === 0) {
								logger.warn(
									`[DynUpdater] No alliance data fetched from ESI for batch starting at index ${i}.`
								);
								span.setAttributes({
									'cron.task.update_alliances.batch_fetched_data_length': 0
								});
								return;
							}
							span.setAttributes({
								'cron.task.update_alliances.batch_fetched_data_length': validAlliancesData.length
							});
							logger.info(
								`[DynUpdater] Fetched ${validAlliancesData.length} alliances from ESI for batch starting at index ${i}.`
							);

							await addOrUpdateAlliancesDB(validAlliancesData);
						});
					}
				},
				{
					'cron.task.update_alliances.batch_size': alliancesToUpdate.length
				}
			);

			// Log completion
			logger.info('[DynUpdater] Alliance data update completed.');
			return true;
		},
		{
			'cron.task': 'update_alliances'
		}
	);
}

async function updateCorporationData() {
	return await withSpan(
		'Update Corporations',
		async (span) => {
			logger.info('[DynUpdater] Updating Corporation data...');
			// Fetch all from the database
			const allCorporations = await getAllCorporations();
			if (!allCorporations || allCorporations.length === 0) {
				logger.warn('[DynUpdater] No corporations found to update.');
				return;
			}

			// Filter by last seen within the last year
			// and that have have not been updated in the last 24 hours
			const yearAgo = new Date();
			yearAgo.setFullYear(yearAgo.getFullYear() - 1);
			const twentyThreeHoursAgo = new Date();
			twentyThreeHoursAgo.setHours(twentyThreeHoursAgo.getHours() - 23);
			const corporationsToUpdate = allCorporations.filter((corporation) => {
				const lastSeen = new Date(corporation.last_seen);
				const lastUpdated = new Date(corporation.updated_at);
				return lastSeen >= yearAgo && lastUpdated <= twentyThreeHoursAgo;
			});

			span.setAttributes({
				'cron.task.update_corporations.to_update': corporationsToUpdate.length
			});

			// If no corporations to update, exit
			if (corporationsToUpdate.length === 0) {
				logger.info('[DynUpdater] No corporations to update at this time.');
				return;
			}

			logger.info(`[DynUpdater] Found ${corporationsToUpdate.length} corporations to update`);

			await withSpan(
				'Batch Update Corporations',
				async () => {
					for (let i = 0; i < corporationsToUpdate.length; i += BATCH_CORPORATIONS) {
						await withSpan(
							`Batch Update Corporations ${i / BATCH_CORPORATIONS + 1}`,
							async (span) => {
								const batch = corporationsToUpdate.slice(i, i + BATCH_CORPORATIONS);
								const corporationIDs = batch.map((corporation) => corporation.id);
								const corporationsData = await idsToCorporations(corporationIDs);
								// Process corporationsData
								const validCorporationsData = corporationsData.filter(
									(corporation) => corporation !== null && corporation !== undefined
								);
								if (!validCorporationsData || validCorporationsData.length === 0) {
									logger.warn(
										`[DynUpdater] No corporation data fetched from ESI for batch starting at index ${i}.`
									);
									span.setAttributes({
										'cron.task.update_corporations.batch_fetched_data_length': 0
									});
									return;
								}
								span.setAttributes({
									'cron.task.update_corporations.batch_fetched_data_length':
										validCorporationsData.length
								});
								logger.info(
									`[DynUpdater] Fetched ${validCorporationsData.length} corporations from ESI for batch starting at index ${i}.`
								);

								// before we can add or update the corps, we need to check if we have alliances for them
								await withSpan('Fetch Alliances for Corporations', async (span) => {
									const allianceIDs = validCorporationsData
										.map((corporation) => corporation.alliance_id)
										.filter((id) => id !== undefined && id !== null);

									// filter out duplicates
									const uniqueAllianceIDs = [...new Set(allianceIDs)];

									// filter out alliances that are already in the database
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

async function updateCharacterData() {
	return await withSpan(
		'Update Characters',
		async (span) => {
			logger.info('[DynUpdater] Updating Character data...');
			// This is called every minute, we try to update up to 1000 characters every minute
			// in batches of 100, so we can handle large amounts of characters without overloading the database or ESI

			// Get from DB the least recently updated 1000 characters
			const charactersToUpdate = await getLeastRecentlyUpdatedCharacters(1000);
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

			// Now we do multiple smaller batches to avoid overloading ESI, batch size is BATCH_CHARACTERS
			logger.info(`[DynUpdater] Found ${charactersToUpdate.length} characters to update.`);

			await withSpan(
				'Batch Update Characters',
				async () => {
					for (let i = 0; i < charactersToUpdate.length; i += BATCH_CHARACTERS) {
						await withSpan(`Batch Update Characters ${i / BATCH_CHARACTERS + 1}`, async (span) => {
							const batch = charactersToUpdate.slice(i, i + BATCH_CHARACTERS);
							const characterIDs = batch.map((character) => character.id);
							const charactersData = await idsToCharacters(characterIDs);
							// Process charactersData
							const validCharactersData = charactersData.filter(
								(character) => character !== null && character !== undefined
							);
							if (!validCharactersData || validCharactersData.length === 0) {
								logger.warn(
									`[DynUpdater] No character data fetched from ESI for batch starting at index ${i}.`
								);
								span.setAttributes({
									'cron.task.update_characters.batch_fetched_data_length': 0
								});
								return;
							}
							span.setAttributes({
								'cron.task.update_characters.batch_fetched_data_length': validCharactersData.length
							});
							logger.info(
								`[DynUpdater] Fetched ${validCharactersData.length} characters from ESI for batch starting at index ${i}.`
							);

							// before we can add or update the characters, we need to check if we have alliances for them
							await withSpan('Fetch Alliances for Characters', async (span) => {
								const allianceIDs = validCharactersData
									.map((character) => character.alliance_id)
									.filter((id) => id !== undefined && id !== null);

								// filter out duplicates
								const uniqueAllianceIDs = [...new Set(allianceIDs)];

								// filter out alliances that are already in the database
								const existingAlliances = await getAlliancesByID(uniqueAllianceIDs);
								const existingAllianceIDs = existingAlliances.map((alliance) => alliance.id);
								const newAllianceIDs = uniqueAllianceIDs.filter(
									(id) => !existingAllianceIDs.includes(id)
								);

								span.setAttributes({
									'cron.task.update_characters.new_alliances': newAllianceIDs.length
								});

								// Fetch alliance data
								if (newAllianceIDs.length > 0) {
									const alliancesData = await idsToAlliances(newAllianceIDs);
									// Add or update alliances in the database
									await addOrUpdateAlliancesDB(alliancesData);
								}
							});

							// before we can add or update the characters, we need to check if we have corporations for them
							await withSpan('Fetch Corporations for Characters', async (span) => {
								const corporationIDs = validCharactersData
									.map((character) => character.corporation_id)
									.filter((id) => id !== undefined && id !== null);

								// filter out duplicates
								const uniqueCorporationIDs = [...new Set(corporationIDs)];

								// filter out corporations that are already in the database
								const existingCorporations = await getAllCorporations();
								const existingCorporationIDs = existingCorporations.map(
									(corporation) => corporation.id
								);
								const newCorporationIDs = uniqueCorporationIDs.filter(
									(id) => !existingCorporationIDs.includes(id)
								);

								span.setAttributes({
									'cron.task.update_characters.new_corporations': newCorporationIDs.length
								});

								// Fetch corporation data
								if (newCorporationIDs.length > 0) {
									const corporationsData = await idsToCorporations(newCorporationIDs);
									// Add or update corporations in the database
									await addOrUpdateCorporationsDB(corporationsData);
								}
							});

							// Add or update characters in the database
							await addOrUpdateCharactersDB(validCharactersData);
						});
					}
				},
				{
					'cron.task.update_characters.batch_size': charactersToUpdate.length
				}
			);

			logger.info('[DynUpdater] Character data update completed.');
			return true;
		},
		{
			'cron.task': 'update_characters'
		}
	);
}
