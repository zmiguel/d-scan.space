/**
 * All DB functions related to stats.
 *
 * Every counter is `count(*) FILTER (WHERE ...)` over a single table scan: each row is
 * counted once per bucket, so no `COUNT(DISTINCT ...)` sort/hash is needed. Callers
 * cache the results (see src/routes/stats/+page.server.js).
 */
import { db } from '$lib/database/client';
import { withSpan } from '$lib/server/tracer';
import { characters, corporations, alliances, scans, scanGroups } from '../database/schema';
import { eq, sql } from 'drizzle-orm';

const count = (condition) =>
	(condition ? sql`count(*) FILTER (WHERE ${condition})` : sql`count(*)`).mapWith(Number);

/** @param {import('drizzle-orm').AnyColumn} column */
const seenWithin = (column, interval) =>
	sql`${column} >= now() - ${sql.raw(`interval '${interval}'`)}`;

export async function getScanStats() {
	return await withSpan('database.stats.get_scan_stats', async () => {
		const [scanCounts, groupCounts] = await Promise.all([
			db
				.select({
					totalScans: count(),
					publicScans: count(sql`${scanGroups.public} = true`),
					localScans: count(sql`${scans.scan_type} = 'local'`),
					directionalScans: count(sql`${scans.scan_type} = 'directional'`)
				})
				.from(scans)
				.innerJoin(scanGroups, eq(scanGroups.id, scans.group_id)),
			db
				.select({
					totalScanGroups: count(),
					publicScanGroups: count(sql`${scanGroups.public} = true`),
					scanGroupsWithoutSystem: count(sql`${scanGroups.system} IS NULL`)
				})
				.from(scanGroups)
		]);

		return { ...scanCounts[0], ...groupCounts[0] };
	});
}

export async function getCharacterStats() {
	return await withSpan('database.stats.get_character_stats', async () => {
		const stats = await db
			.select({
				totalCharacters: count(),
				charactersLastSeen24h: count(seenWithin(characters.last_seen, '24 hours')),
				charactersLastSeenWeek: count(seenWithin(characters.last_seen, '7 days')),
				charactersLastSeenMonth: count(seenWithin(characters.last_seen, '30 days')),
				charactersLastSeenYear: count(seenWithin(characters.last_seen, '365 days')),
				charactersUpdated24h: count(seenWithin(characters.updated_at, '24 hours')),
				charactersWithoutAlliance: count(sql`${characters.alliance_id} IS NULL`),
				charactersDeleted: count(sql`${characters.deleted_at} IS NOT NULL`)
			})
			.from(characters);

		return stats[0];
	});
}

export async function getCorporationStats() {
	return await withSpan('database.stats.get_corporation_stats', async () => {
		const stats = await db
			.select({
				totalCorporations: count(),
				corporationsLastSeen24h: count(seenWithin(corporations.last_seen, '24 hours')),
				corporationsLastSeenWeek: count(seenWithin(corporations.last_seen, '7 days')),
				corporationsLastSeenMonth: count(seenWithin(corporations.last_seen, '30 days')),
				corporationsLastSeenYear: count(seenWithin(corporations.last_seen, '365 days')),
				corporationsUpdated24h: count(seenWithin(corporations.updated_at, '24 hours')),
				corporationsWithoutAlliance: count(sql`${corporations.alliance_id} IS NULL`),
				npcCorporations: count(sql`${corporations.npc} = true`)
			})
			.from(corporations);

		return stats[0];
	});
}

export async function getAllianceStats() {
	return await withSpan('database.stats.get_alliance_stats', async () => {
		const stats = await db
			.select({
				totalAlliances: count(),
				alliancesLastSeen24h: count(seenWithin(alliances.last_seen, '24 hours')),
				alliancesLastSeenWeek: count(seenWithin(alliances.last_seen, '7 days')),
				alliancesLastSeenMonth: count(seenWithin(alliances.last_seen, '30 days')),
				alliancesLastSeenYear: count(seenWithin(alliances.last_seen, '365 days')),
				alliancesUpdated24h: count(seenWithin(alliances.updated_at, '24 hours'))
			})
			.from(alliances);

		return stats[0];
	});
}

/** Trend and highlight windows of the stats page. */
export const ACTIVITY_DAYS = 30;
export const HOURS_DAYS = 90;

const since = (days) => sql`now() - ${sql.raw(`interval '${Number(days)} days'`)}`;
const utcDay = sql`to_char(${scans.created_at} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
const rows = async (query) => (await db.execute(query)).rows;

/**
 * Scan counts over time. Counts only (no scan content), so private scans are included.
 * @returns {Promise<{ perDay: Array<{ day: string, local: number, directional: number }>,
 *   perHour: Array<{ hour: number, scans: number }> }>}
 */
export async function getScanActivity() {
	return await withSpan('database.stats.get_scan_activity', async () => {
		const [perDay, perHour] = await Promise.all([
			rows(sql`
				SELECT ${utcDay} AS day,
					count(*) FILTER (WHERE ${scans.scan_type} = 'local')::int AS local,
					count(*) FILTER (WHERE ${scans.scan_type} = 'directional')::int AS directional
				FROM ${scans}
				WHERE ${scans.created_at} >= ${since(ACTIVITY_DAYS)}
				GROUP BY 1`),
			rows(sql`
				SELECT extract(hour FROM ${scans.created_at} AT TIME ZONE 'UTC')::int AS hour,
					count(*)::int AS scans
				FROM ${scans}
				WHERE ${scans.created_at} >= ${since(HOURS_DAYS)}
				GROUP BY 1`)
		]);
		return { perDay, perHour };
	});
}

/**
 * What scans of the last ACTIVITY_DAYS contained. Lists that name systems, regions or
 * alliances use public scans only (a private scan's location or local must never show
 * up); counts without names (ship classes, averages, pilots per day) use all scans.
 */
export async function getScanHighlights() {
	return await withSpan('database.stats.get_scan_highlights', async () => {
		const recentPublic = sql`${scanGroups.public} = true AND ${scans.created_at} >= ${since(ACTIVITY_DAYS)}`;
		const recentAll = sql`${scans.created_at} >= ${since(ACTIVITY_DAYS)}`;
		const fromPublic = sql`FROM ${scans} JOIN ${scanGroups} ON ${scanGroups.id} = ${scans.group_id}`;

		const [systems, regions, alliancesSeen, shipGroups, averages, pilotsPerDay] = await Promise.all(
			[
				rows(sql`
					SELECT ${scanGroups.system}->>'name' AS name, ${scanGroups.system}->>'region' AS region,
						(${scanGroups.system}->>'security')::float AS security, count(*)::int AS scans
					${fromPublic}
					WHERE ${recentPublic} AND ${scanGroups.system} IS NOT NULL
					GROUP BY 1, 2, 3 ORDER BY 4 DESC, 1 LIMIT 5`),
				rows(sql`
					SELECT ${scanGroups.system}->>'region' AS name, count(*)::int AS scans
					${fromPublic}
					WHERE ${recentPublic} AND ${scanGroups.system} IS NOT NULL
					GROUP BY 1 ORDER BY 2 DESC, 1 LIMIT 5`),
				rows(sql`
					SELECT alliance->>'name' AS name, alliance->>'ticker' AS ticker,
						sum((alliance->>'character_count')::int)::int AS pilots
					${fromPublic}
					CROSS JOIN LATERAL json_array_elements(${scans.data}->'alliances') AS alliance
					WHERE ${recentPublic} AND ${scans.scan_type} = 'local'
						AND alliance->>'ticker' IS NOT NULL
					GROUP BY alliance->>'id', 1, 2 ORDER BY 3 DESC, 1 LIMIT 5`),
				rows(sql`
					SELECT ship_group->>'id' AS id, ship_group->>'name' AS name, side.key AS side,
						sum((ship_group->>'total_objects')::int)::int AS total
					FROM ${scans}
					CROSS JOIN LATERAL json_each(json_build_object(
						'on', ${scans.data}->'on_grid', 'off', ${scans.data}->'off_grid')) AS side
					CROSS JOIN LATERAL json_array_elements(coalesce(side.value->'objects', '[]'::json)) AS category
					CROSS JOIN LATERAL json_array_elements(category->'objects') AS ship_group
					WHERE ${recentAll} AND ${scans.scan_type} = 'directional'
						AND category->>'id' = '6'
					GROUP BY 1, 2, 3`),
				rows(sql`
					SELECT
						count(*) FILTER (WHERE ${scans.scan_type} = 'local')::int AS local_scans,
						count(*) FILTER (WHERE ${scans.scan_type} = 'directional')::int AS directional_scans,
						avg((${scans.data}->>'total_pilots')::int)
							FILTER (WHERE ${scans.scan_type} = 'local')::float AS avg_pilots,
						avg(coalesce((${scans.data}->'on_grid'->>'total_objects')::int, 0)
							+ coalesce((${scans.data}->'off_grid'->>'total_objects')::int, 0))
							FILTER (WHERE ${scans.scan_type} = 'directional')::float AS avg_objects
					FROM ${scans}
					WHERE ${recentAll}`),
				rows(sql`
					SELECT ${utcDay} AS day, sum((${scans.data}->>'total_pilots')::int)::int AS pilots
					FROM ${scans}
					WHERE ${recentAll} AND ${scans.scan_type} = 'local'
					GROUP BY 1`)
			]
		);

		return {
			systems,
			regions,
			alliances: alliancesSeen,
			shipGroups,
			averages: averages[0],
			pilotsPerDay
		};
	});
}
