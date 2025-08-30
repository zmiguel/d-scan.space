import {
	getAllianceStats,
	getCharacterStats,
	getCorporationStats,
	getScanStats
} from '$lib/database/stats';
import { withSpan } from '$lib/server/tracer';

export async function load(event) {
	return await withSpan(
		'page.load.stats',
		async (span) => {
			const [scanStats, characterStats, corporationStats, allianceStats] = await Promise.all([
				withSpan('stats.load.scans', async () => getScanStats()),
				withSpan('stats.load.characters', async () => getCharacterStats()),
				withSpan('stats.load.corporations', async () => getCorporationStats()),
				withSpan('stats.load.alliances', async () => getAllianceStats())
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
