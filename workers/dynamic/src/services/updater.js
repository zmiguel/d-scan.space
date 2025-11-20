import {
	getAllAlliances,
	addOrUpdateAlliancesDB,
	updateAlliancesLastSeen
} from '../../../../src/lib/database/alliances.js';
import {
	getLeastRecentlyUpdatedCharacters,
	updateCharactersLastSeen
} from '../../../../src/lib/database/characters.js';
import {
	addOrUpdateCorporationsDB,
	getAllCorporations,
	updateCorporationsLastSeen
} from '../../../../src/lib/database/corporations.js';
import { idsToAlliances } from '../../../../src/lib/server/alliances.js';
import { idsToCorporations } from '../../../../src/lib/server/corporations.js';
import { updateAffiliationsFromESI } from '../../../../src/lib/server/characters.js';
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
		await withSpan('CRON Dynamic', async () => {
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
	return await withSpan('Get TQ Status', async (span) => {
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
	await withSpan('Update Character Data', async (span) => {
		// Get characters that haven't been updated in 23.5h
		const charactersToUpdate = await getLeastRecentlyUpdatedCharacters(BATCH_CHARACTERS);

		if (charactersToUpdate.length === 0) {
			logger.info('[DynUpdater] No characters to update.');
			span.setAttributes({ 'cron.task.update_characters.count': 0 });
			return;
		}

		logger.info(`[DynUpdater] Updating ${charactersToUpdate.length} characters...`);
		span.setAttributes({ 'cron.task.update_characters.count': charactersToUpdate.length });

		const characterIds = charactersToUpdate.map((c) => c.id);

		// Update affiliations (this fetches from ESI and updates DB)
		await updateAffiliationsFromESI(characterIds);

		// Update last_seen for these characters
		await updateCharactersLastSeen(characterIds);

		charactersUpdatedCounter.add(charactersToUpdate.length);
	});
}

/**
 * Updates corporation data by fetching corporations that haven't been updated recently.
 */
async function updateCorporationData() {
	await withSpan('Update Corporation Data', async (span) => {
		const allCorporations = await getAllCorporations();
		const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
		const twentyThreeHoursAgo = new Date(Date.now() - 23.5 * 60 * 60 * 1000);

		// Filter corporations: last_seen > 1 year ago AND updated_at < 23.5 hours ago
		const corporationsToUpdate = allCorporations
			.filter((c) => new Date(c.last_seen) > oneYearAgo)
			.filter((c) => new Date(c.updated_at) < twentyThreeHoursAgo)
			.slice(0, BATCH_CORPORATIONS);

		if (corporationsToUpdate.length === 0) {
			logger.info('[DynUpdater] No corporations to update.');
			span.setAttributes({ 'cron.task.update_corporations.count': 0 });
			return;
		}

		logger.info(`[DynUpdater] Updating ${corporationsToUpdate.length} corporations...`);
		span.setAttributes({ 'cron.task.update_corporations.count': corporationsToUpdate.length });

		const corporationIds = corporationsToUpdate.map((c) => c.id);
		const corporationData = await idsToCorporations(corporationIds);

		await addOrUpdateCorporationsDB(corporationData);
		await updateCorporationsLastSeen(corporationIds);

		corporationsUpdatedCounter.add(corporationsToUpdate.length);
	});
}

/**
 * Updates alliance data by fetching alliances that haven't been updated recently.
 */
async function updateAllianceData() {
	await withSpan('Update Alliance Data', async (span) => {
		const allAlliances = await getAllAlliances();
		const oneYearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000);
		const twentyThreeHoursAgo = new Date(Date.now() - 23.5 * 60 * 60 * 1000);

		// Filter alliances: last_seen > 1 year ago AND updated_at < 23.5 hours ago
		const alliancesToUpdate = allAlliances
			.filter((a) => new Date(a.last_seen) > oneYearAgo)
			.filter((a) => new Date(a.updated_at) < twentyThreeHoursAgo)
			.slice(0, BATCH_ALLIANCES);

		if (alliancesToUpdate.length === 0) {
			logger.info('[DynUpdater] No alliances to update.');
			span.setAttributes({ 'cron.task.update_alliances.count': 0 });
			return;
		}

		logger.info(`[DynUpdater] Updating ${alliancesToUpdate.length} alliances...`);
		span.setAttributes({ 'cron.task.update_alliances.count': alliancesToUpdate.length });

		const allianceIds = alliancesToUpdate.map((a) => a.id);
		const allianceData = await idsToAlliances(allianceIds);

		await addOrUpdateAlliancesDB(allianceData);
		await updateAlliancesLastSeen(allianceIds);

		alliancesUpdatedCounter.add(alliancesToUpdate.length);
	});
}
