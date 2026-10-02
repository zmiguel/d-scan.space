import {
	getAllianceStats,
	getCharacterStats,
	getCorporationStats,
	getScanStats
} from '$lib/database/stats';
import { withSpan } from '$lib/server/tracer';

/** The stats page is public and each load scans four tables; serve it from memory. */
const STATS_TTL_MS = 60_000;

/** @type {{ expires: number, value: Promise<any> } | null} */
let cached = null;

function loadStats() {
	return Promise.all([
		withSpan('route.stats.fetch_scans', async () => getScanStats()),
		withSpan('route.stats.fetch_characters', async () => getCharacterStats()),
		withSpan('route.stats.fetch_corporations', async () => getCorporationStats()),
		withSpan('route.stats.fetch_alliances', async () => getAllianceStats())
	]).then(([scanStats, characterStats, corporationStats, allianceStats]) => ({
		scanStats,
		characterStats,
		corporationStats,
		allianceStats
	}));
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
