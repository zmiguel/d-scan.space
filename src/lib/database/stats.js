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
