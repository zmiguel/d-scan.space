import {
	getAllianceStats,
	getCharacterStats,
	getCorporationStats,
	getScanStats
} from '$lib/database/stats';
import { withSpan } from '$lib/server/tracer';

export async function load(event) {
	return await withSpan(
		'route.stats.load',
		async (span) => {
			const [scanStats, characterStats, corporationStats, allianceStats] = await Promise.all([
				withSpan('route.stats.fetch_scans', async () => getScanStats()),
				withSpan('route.stats.fetch_characters', async () => getCharacterStats()),
				withSpan('route.stats.fetch_corporations', async () => getCorporationStats()),
				withSpan('route.stats.fetch_alliances', async () => getAllianceStats())
			]);

			span.setAttributes({
				'stats.scans_count': scanStats?.length || 0,
				'stats.characters_count': characterStats?.length || 0,
				'stats.corporations_count': corporationStats?.length || 0,
				'stats.alliances_count': allianceStats?.length || 0,
				'page.type': 'stats_overview'
			});

			return {
				scanStats,
				characterStats,
				corporationStats,
				allianceStats
			};
		},
		{
			'route.id': 'stats'
		},
		{},
		event
	);
}
