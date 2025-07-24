import { getAllAlliances, addOrUpdateAlliancesDB } from '$lib/database/alliances';
import { getAllCharacters, addOrUpdateCharactersDB } from '$lib/database/characters';
import { addOrUpdateCorporationsDB, getAllCorporations } from '$lib/database/corporations';
import { idsToAlliances } from '$lib/server/alliances';
import { idsToCorporations } from '$lib/server/corporations';
import { idsToCharacters } from '$lib/server/characters';

export async function updateDynamicData() {
	console.info('[DynUpdater] Updating dynamic data...');
	// Update the Alliance data
	await updateAllianceData();
	// Update the Corporation data
	await updateCorporationData();
	// Update the Character data
	await updateCharacterData();
	console.info('[DynUpdater] Dynamic data update completed.');
	return true;
}

async function updateAllianceData() {
	console.info('[DynUpdater] Updating Alliance data...');
	const allAlliances = await getAllAlliances();
	if (!allAlliances || allAlliances.length === 0) {
		console.warn('[DynUpdater] No alliances found to update.');
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

	// If no alliances to update, exit
	if (alliancesToUpdate.length === 0) {
		console.info('[DynUpdater] No alliances to update at this time.');
		return;
	}

	console.info(`[DynUpdater] Found ${alliancesToUpdate.length} alliances to update.`);
	// convert to array of allianceIDs
	const allianceIDs = alliancesToUpdate.map((alliance) => alliance.id);
	const alliancesData = await idsToAlliances(allianceIDs);

	await addOrUpdateAlliancesDB(alliancesData);

	// Log completion
	console.info('[DynUpdater] Alliance data update completed.');
	return true;
}

async function updateCorporationData() {
	console.info('[DynUpdater] Updating Corporation data...');
	// Fetch all from the database
	const allCorporations = await getAllCorporations();
	if (!allCorporations || allCorporations.length === 0) {
		console.warn('[DynUpdater] No corporations found to update.');
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

	// If no corporations to update, exit
	if (corporationsToUpdate.length === 0) {
		console.info('[DynUpdater] No corporations to update at this time.');
		return;
	}

	console.info(`[DynUpdater] Found ${corporationsToUpdate.length} corporations to update`);
	// convert to array of corporationIDs
	const corporationIDs = corporationsToUpdate.map((corporation) => corporation.id);
	const corporationsData = await idsToCorporations(corporationIDs);

	await addOrUpdateCorporationsDB(corporationsData);

	console.info('[DynUpdater] Corporation data update completed.');
	return true;
}

async function updateCharacterData() {
	console.info('[DynUpdater] Updating Character data...');

	// Fetch all from the database
	const allCharacters = await getAllCharacters();
	if (!allCharacters || allCharacters.length === 0) {
		console.warn('[DynUpdater] No characters found to update.');
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
	// If no characters to update, exit
	if (charactersToUpdate.length === 0) {
		console.info('[DynUpdater] No characters to update at this time.');
		return;
	}
	console.info(`[DynUpdater] Found ${charactersToUpdate.length} characters to update`);
	// convert to array of characterIDs
	const characterIDs = charactersToUpdate.map((character) => character.id);
	const charactersData = await idsToCharacters(characterIDs);
	await addOrUpdateCharactersDB(charactersData);
	console.info('[DynUpdater] Character data update completed.');
	return true;
}
