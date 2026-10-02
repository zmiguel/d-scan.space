import {
	ACTIVITY_DAYS,
	HOURS_DAYS,
	getAllianceStats,
	getCharacterStats,
	getCorporationStats,
	getScanHighlights,
	getScanActivity,
	getScanStats
} from '$lib/database/stats';
import { getLastInstalledSDEVersion } from '$lib/database/sde';
import { withSpan } from '$lib/server/tracer';
import { fillDays, fillHours, shipMix } from '$lib/utils/statsTrends.js';

/** The stats page is public and each load scans several tables; serve it from memory. */
const STATS_TTL_MS = 60_000;

/** @type {{ expires: number, value: Promise<any> } | null} */
let cached = null;

async function loadStats() {
	const [scanStats, characterStats, corporationStats, allianceStats, activity, highlights, sde] =
		await Promise.all([
			withSpan('route.stats.fetch_scans', async () => getScanStats()),
			withSpan('route.stats.fetch_characters', async () => getCharacterStats()),
			withSpan('route.stats.fetch_corporations', async () => getCorporationStats()),
			withSpan('route.stats.fetch_alliances', async () => getAllianceStats()),
			withSpan('route.stats.fetch_activity', async () => getScanActivity()),
			withSpan('route.stats.fetch_highlights', async () => getScanHighlights()),
			withSpan('route.stats.fetch_sde', async () => getLastInstalledSDEVersion())
		]);

	const now = new Date();
	return {
		scanStats,
		characterStats,
		corporationStats,
		allianceStats,
		activity: {
			days: ACTIVITY_DAYS,
			hoursDays: HOURS_DAYS,
			scansPerDay: fillDays(activity.perDay, ACTIVITY_DAYS, { local: 0, directional: 0 }, now),
			scansPerHour: fillHours(activity.perHour)
		},
		highlights: {
			systems: highlights.systems,
			regions: highlights.regions,
			alliances: highlights.alliances,
			ships: shipMix(highlights.shipGroups),
			averages: highlights.averages,
			pilotsPerDay: fillDays(highlights.pilotsPerDay, ACTIVITY_DAYS, { pilots: 0 }, now)
		},
		sde: sde ? { version: sde.release_version, releasedAt: sde.release_date } : null
	};
}

/** Test hook: forget the cached stats. */
export function _resetStatsCache() {
	cached = null;
}

export async function load(event) {
	return await withSpan(
		'route.stats.load',
		async (span) => {
			const now = Date.now();
			const hit = cached !== null && cached.expires > now;
			if (!hit) {
				const value = loadStats();
				cached = { expires: now + STATS_TTL_MS, value };
				// Do not keep a failed load around for the whole TTL.
				value.catch(() => {
					if (cached?.value === value) cached = null;
				});
			}
			const entry = /** @type {NonNullable<typeof cached>} */ (cached);

			const stats = await entry.value;
			span.setAttributes({
				'stats.cache_hit': hit,
				'stats.scans_total': stats.scanStats?.totalScans ?? 0,
				'stats.characters_total': stats.characterStats?.totalCharacters ?? 0,
				'stats.corporations_total': stats.corporationStats?.totalCorporations ?? 0,
				'stats.alliances_total': stats.allianceStats?.totalAlliances ?? 0,
				'page.type': 'stats_overview'
			});

			return stats;
		},
		{
			'route.id': 'stats'
		},
		{},
		event
	);
}
