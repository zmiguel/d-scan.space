import { getAllAlliances, addOrUpdateAlliancesDB, getAlliancesByID } from '$lib/database/alliances';
import { getAllCharacters, addOrUpdateCharactersDB } from '$lib/database/characters';
import { addOrUpdateCorporationsDB, getAllCorporations } from '$lib/database/corporations';
import { idsToAlliances } from '$lib/server/alliances';
import { idsToCorporations } from '$lib/server/corporations';
import { idsToCharacters } from '$lib/server/characters';
import { withSpan } from '$lib/server/tracer';
import logger from '$lib/logger';
import { json } from '@sveltejs/kit';

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
	return await withSpan('Update Alliances', async (span) => {
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
		const twentyFourHoursAgo = new Date();
		twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
		const alliancesToUpdate = allAlliances.filter((alliance) => {
			const lastSeen = new Date(alliance.last_seen);
			const lastUpdated = new Date(alliance.updated_at);
			return lastSeen >= yearAgo && lastUpdated <= twentyFourHoursAgo;
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
		// convert to array of allianceIDs
		const allianceIDs = alliancesToUpdate.map((alliance) => alliance.id);
		const alliancesData = await idsToAlliances(allianceIDs);

		if (!alliancesData || alliancesData.length === 0) {
			logger.warn('[DynUpdater] No alliance data fetched from ESI.');
			span.setAttributes({
				'cron.task.update_alliances.fetched_data_length': 0
			});
			return;
		}

		await addOrUpdateAlliancesDB(alliancesData);

		// Log completion
		logger.info('[DynUpdater] Alliance data update completed.');
		return true;
	}, {
		'cron.task': 'update_alliances'
	});
}

async function updateCorporationData() {
	return await withSpan('Update Corporations', async (span) => {
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
		const twentyFourHoursAgo = new Date();
		twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
		const corporationsToUpdate = allCorporations.filter((corporation) => {
			const lastSeen = new Date(corporation.last_seen);
			const lastUpdated = new Date(corporation.updated_at);
			return lastSeen >= yearAgo && lastUpdated <= twentyFourHoursAgo;
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
		// convert to array of corporationIDs
		const corporationIDs = corporationsToUpdate.map((corporation) => corporation.id);
		const corporationsData = await idsToCorporations(corporationIDs);

		if (!corporationsData || corporationsData.length === 0) {
			logger.warn('[DynUpdater] No corporation data fetched from ESI.');
			span.setAttributes({
				'cron.task.update_corporations.fetched_data_length': 0
			});
			return;
		}

		// before we can add or update the corps, we need to check if we have alliances for them
		await withSpan('Fetch Alliances for Corporations', async (span) => {
			const allianceIDs = corporationsData
				.map((corporation) => corporation.alliance_id)
				.filter((id) => id !== undefined && id !== null);

			// filter out duplicates
			const uniqueAllianceIDs = [...new Set(allianceIDs)];

			// filter out alliances that are already in the database
			const existingAlliances = await getAlliancesByID(uniqueAllianceIDs);
			const existingAllianceIDs = existingAlliances.map((alliance) => alliance.id);
			const newAllianceIDs = uniqueAllianceIDs.filter((id) => !existingAllianceIDs.includes(id));

			span.setAttributes({
				'cron.task.update_corporations.new_alliances': newAllianceIDs.length
			});

			if (newAllianceIDs.length > 0) {
				const alliancesData = await idsToAlliances(newAllianceIDs);
				await addOrUpdateAlliancesDB(alliancesData);
			}
		});

		await addOrUpdateCorporationsDB(corporationsData);

		logger.info('[DynUpdater] Corporation data update completed.');
		return true;
	}, {
		'cron.task': 'update_corporations'
	});
}

async function updateCharacterData() {
	return await withSpan('Update Characters', async (span) => {
		logger.info('[DynUpdater] Updating Character data...');

		// Fetch all from the database
		const allCharacters = await getAllCharacters();
		if (!allCharacters || allCharacters.length === 0) {
			logger.warn('[DynUpdater] No characters found to update.');
			return;
		}

		// Filter by last seen within the last year
		// and that have have not been updated in the last 24 hours
		const yearAgo = new Date();
		yearAgo.setFullYear(yearAgo.getFullYear() - 1);
		const twentyFourHoursAgo = new Date();
		twentyFourHoursAgo.setHours(twentyFourHoursAgo.getHours() - 24);
		const charactersToUpdate = allCharacters.filter((character) => {
			const lastSeen = new Date(character.last_seen);
			const lastUpdated = new Date(character.updated_at);
			return lastSeen >= yearAgo && lastUpdated <= twentyFourHoursAgo;
		});

		span.setAttributes({
			'cron.task.update_characters.to_update': charactersToUpdate.length
		});

		// If no characters to update, exit
		if (charactersToUpdate.length === 0) {
			logger.info('[DynUpdater] No characters to update at this time.');
			return;
		}
		logger.info(`[DynUpdater] Found ${charactersToUpdate.length} characters to update`);

		// convert to array of characterIDs
		const characterIDs = charactersToUpdate.map((character) => character.id);
		const charactersData = await idsToCharacters(characterIDs);

		if (!charactersData || charactersData.length === 0) {
			logger.warn('[DynUpdater] No character data fetched from ESI.');
			span.setAttributes({
				'cron.task.update_characters.fetched_data_length': 0
			});
			return;
		}

		for (const character of charactersData) {
			// Process each character
			if (!character) {
				logger.warn('[DynUpdater] Received an empty character object from ESI.');
				continue;
			}
			if (!character.alliance_id) {
				logger.warn(`[DynUpdater] Character has no alliance_id.`, { character: character });
			}
		}

		logger.info(charactersData);

		// before we can add or update the characters, we need to check if we have alliances for them
		await withSpan('Fetch Alliances for Characters', async (span) => {
			const allianceIDs = charactersData
				.map((character) => character.alliance_id)
				.filter((id) => id !== undefined && id !== null);

			// filter out duplicates
			const uniqueAllianceIDs = [...new Set(allianceIDs)];

			// filter out alliances that are already in the database
			const existingAlliances = await getAlliancesByID(uniqueAllianceIDs);
			const existingAllianceIDs = existingAlliances.map((alliance) => alliance.id);
			const newAllianceIDs = uniqueAllianceIDs.filter((id) => !existingAllianceIDs.includes(id));

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
			const corporationIDs = charactersData
				.map((character) => character.corporation_id)
				.filter((id) => id !== undefined && id !== null);

			// filter out duplicates
			const uniqueCorporationIDs = [...new Set(corporationIDs)];

			// filter out corporations that are already in the database
			const existingCorporations = await getAllCorporations();
			const existingCorporationIDs = existingCorporations.map((corporation) => corporation.id);
			const newCorporationIDs = uniqueCorporationIDs.filter((id) => !existingCorporationIDs.includes(id));

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
		await addOrUpdateCharactersDB(charactersData);
		logger.info('[DynUpdater] Character data update completed.');
		return true;
	}, {
		'cron.task': 'update_characters'
	});
}
