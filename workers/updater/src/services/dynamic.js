/**
 * Dynamic data refresh (characters, corporations, alliances) from ESI.
 *
 * Each run claims the rows that are due (see src/lib/database/refresh.js): refreshed more
 * than 23.5 h ago, seen in a scan within a year, not attempted within the last hour.
 * Claiming marks the rows as attempted, so rows whose refresh fails wait an hour instead
 * of being picked first again on every run. The number of rows per run is capped.
 */
import {
	addOrUpdateAlliancesDB,
	claimAlliancesForRefresh
} from '../../../../src/lib/database/alliances.js';
import { claimCharactersForRefresh } from '../../../../src/lib/database/characters.js';
import {
	applyCorporationAllianceChange,
	claimCorporationsForRefresh,
	getCorporationsByID
} from '../../../../src/lib/database/corporations.js';
import { idsToAlliances } from '../../../../src/lib/server/alliances.js';
import { idsToCorporations, storeCorporations } from '../../../../src/lib/server/corporations.js';
import {
	updateCharactersFromESI,
	updateAffiliationsFromESI
} from '../../../../src/lib/server/characters.js';
import { withSpan } from '../../../../src/lib/server/tracer.js';
import logger from '../../../../src/lib/logger.js';
import {
	BATCH_CHARACTERS,
	UPDATER_MAX_ALLIANCES_PER_RUN,
	UPDATER_MAX_CORPORATIONS_PER_RUN
} from '../../../../src/lib/server/constants.js';
import { fetchGET } from '../../../../src/lib/server/wrappers.js';
import {
	recordCronJob,
	charactersUpdatedCounter,
	corporationsUpdatedCounter,
	alliancesUpdatedCounter
} from '../../../../src/lib/server/metrics.js';

/**
 * Updates all dynamic EVE Online data:
 * 1. checks that TQ is up,
 * 2. refreshes due characters (≤ BATCH_CHARACTERS) and propagates corporation alliance
 *    changes they reveal,
 * 3. refreshes due corporations (≤ UPDATER_MAX_CORPORATIONS_PER_RUN),
 * 4. refreshes due alliances (≤ UPDATER_MAX_ALLIANCES_PER_RUN).
 *
 * @returns {Promise<boolean>} true when the update ran, false when TQ was unavailable
 */
export async function updateDynamicData() {
	const startTime = Date.now();

	try {
		logger.info('[DynUpdater] Updating dynamic data...');
		const ran = await withSpan('worker.dynamic.cron', async () => {
			if (!(await getTQStatus())) {
				logger.warn('[DynUpdater] TQ is not available, skipping dynamic data update.');
				return false;
			}

			await updateCharacterData();
			await updateCorporationData();
			await updateAllianceData();
			return true;
		});

		recordCronJob('updateDynamicData', Date.now() - startTime, ran);
		if (ran) logger.info('[DynUpdater] Dynamic data update completed.');
		return ran;
	} catch (error) {
		recordCronJob('updateDynamicData', Date.now() - startTime, false);
		throw error;
	}
}

/**
 * Checks if the EVE Online Tranquility (TQ) server is up and available: more than 100
 * players and not in VIP mode.
 * @returns {Promise<boolean>}
 */
async function getTQStatus() {
	return await withSpan('worker.dynamic.get_tq_status', async (span) => {
		try {
			const res = await fetchGET('https://esi.evetech.net/status');
			if (!res || !res.ok) {
				const status = res ? `HTTP ${res.status}` : 'no response';
				logger.warn(`[DynUpdater] Failed to fetch TQ status: ${status}`);
				span.setAttributes({
					'cron.task.get_tq_status.error': status,
					'cron.task.get_tq_status.is_up': false
				});
				return false;
			}
			const data = await res.json();
			const isServerUp = data.players > 100 && data.vip !== true;

			span.setAttributes({
				'cron.task.get_tq_status.players': data.players,
				'cron.task.get_tq_status.vip': data.vip ?? false,
				'cron.task.get_tq_status.is_up': isServerUp
			});
			return isServerUp;
		} catch (error) {
			logger.error({ err: error }, '[DynUpdater] Error fetching TQ status');
			span.setAttributes({
				'cron.task.get_tq_status.error': error?.message ?? String(error),
				'cron.task.get_tq_status.is_up': false
			});
			return false;
		}
	});
}

/**
 * Corporations whose alliance, according to freshly refreshed members, differs from the
 * stored one. Corporations whose members disagree (should not happen) are skipped.
 * @param {Array<{ corporation_id: number, alliance_id?: number | null }>} characters
 * @returns {Map<number, number | null>} corporation id -> alliance id reported by members
 */
export function allianceByCorporation(characters) {
	const byCorp = new Map();
	const conflicted = new Set();
	for (const { corporation_id: corpId, alliance_id } of characters) {
		if (corpId == null) continue;
		const allianceId = alliance_id ?? null;
		if (byCorp.has(corpId) && byCorp.get(corpId) !== allianceId) conflicted.add(corpId);
		else byCorp.set(corpId, allianceId);
	}
	for (const corpId of conflicted) byCorp.delete(corpId);
	return byCorp;
}

async function updateCharacterData() {
	return await withSpan(
		'worker.dynamic.update_characters',
		async (span) => {
			const claimed = await claimCharactersForRefresh(BATCH_CHARACTERS);
			span.setAttributes({ 'cron.task.update_characters.to_update': claimed.length });
			if (claimed.length === 0) {
				logger.info('[DynUpdater] No characters due for a refresh.');
				return;
			}
			logger.info(`[DynUpdater] Refreshing ${claimed.length} characters.`);

			// Details are cached by ESI for days: only refetch them when the cache expired;
			// otherwise refresh the (never stale) affiliation only.
			const now = Date.now();
			const expired = claimed.filter(
				(char) => !char.esi_cache_expires || new Date(char.esi_cache_expires).getTime() < now
			);
			const cached = claimed.filter(
				(char) => char.esi_cache_expires && new Date(char.esi_cache_expires).getTime() >= now
			);
			span.setAttributes({
				'cron.task.update_characters.expired': expired.length,
				'cron.task.update_characters.cached': cached.length
			});

			const [refreshedDetails, refreshedAffiliations] = await Promise.all([
				expired.length > 0 ? updateCharactersFromESI(expired) : [],
				cached.length > 0 ? updateAffiliationsFromESI(cached) : []
			]);
			const refreshed = [...refreshedDetails, ...refreshedAffiliations];
			charactersUpdatedCounter.add(refreshed.length);
			span.setAttributes({
				'cron.task.update_characters.refreshed': refreshed.length,
				'cron.task.update_characters.not_refreshed': claimed.length - refreshed.length
			});

			// Members reveal corporation alliance changes before the corporation's own daily
			// refresh: apply them to the corporation and all of its members right away.
			const reported = allianceByCorporation(refreshed);
			if (reported.size === 0) return;
			const corporations = await getCorporationsByID([...reported.keys()]);
			let changes = 0;
			for (const corporation of corporations) {
				const allianceId = reported.get(corporation.id) ?? null;
				if ((corporation.alliance_id ?? null) === allianceId) continue;
				await applyCorporationAllianceChange(corporation.id, allianceId);
				changes++;
			}
			span.setAttributes({ 'cron.task.update_characters.corporation_alliance_changes': changes });
		},
		{ 'cron.task': 'update_characters' }
	);
}

async function updateCorporationData() {
	return await withSpan(
		'worker.dynamic.update_corporations',
		async (span) => {
			const claimed = await claimCorporationsForRefresh(UPDATER_MAX_CORPORATIONS_PER_RUN);
			span.setAttributes({ 'cron.task.update_corporations.to_update': claimed.length });
			if (claimed.length === 0) {
				logger.info('[DynUpdater] No corporations due for a refresh.');
				return;
			}
			logger.info(`[DynUpdater] Refreshing ${claimed.length} corporations.`);

			const fetched = (await idsToCorporations(claimed.map((c) => c.id))).filter(Boolean);
			const { corporations: stored, allianceUnavailable } = await storeCorporations(fetched);
			corporationsUpdatedCounter.add(stored.length);

			// Corporations that joined/left/changed alliance: update their members too.
			// Skipped when the new alliance could not be stored (it would wrongly clear it).
			const previousAlliance = new Map(claimed.map((c) => [c.id, c.alliance_id ?? null]));
			let changes = 0;
			for (const corporation of stored) {
				if (allianceUnavailable.has(corporation.id)) continue;
				const allianceId = corporation.alliance_id ?? null;
				if (previousAlliance.get(corporation.id) === allianceId) continue;
				await applyCorporationAllianceChange(corporation.id, allianceId);
				changes++;
			}

			span.setAttributes({
				'cron.task.update_corporations.refreshed': stored.length,
				'cron.task.update_corporations.not_refreshed': claimed.length - stored.length,
				'cron.task.update_corporations.alliance_changes': changes
			});
		},
		{ 'cron.task': 'update_corporations' }
	);
}

async function updateAllianceData() {
	return await withSpan(
		'worker.dynamic.update_alliances',
		async (span) => {
			const claimed = await claimAlliancesForRefresh(UPDATER_MAX_ALLIANCES_PER_RUN);
			span.setAttributes({ 'cron.task.update_alliances.to_update': claimed.length });
			if (claimed.length === 0) {
				logger.info('[DynUpdater] No alliances due for a refresh.');
				return;
			}
			logger.info(`[DynUpdater] Refreshing ${claimed.length} alliances.`);

			const fetched = (await idsToAlliances(claimed.map((a) => a.id))).filter(Boolean);
			if (fetched.length > 0) {
				await addOrUpdateAlliancesDB(fetched);
			}
			alliancesUpdatedCounter.add(fetched.length);
			span.setAttributes({
				'cron.task.update_alliances.refreshed': fetched.length,
				'cron.task.update_alliances.not_refreshed': claimed.length - fetched.length
			});
		},
		{ 'cron.task': 'update_alliances' }
	);
}
