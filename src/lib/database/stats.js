/**
 * All DB functions related to stats
 */
import { db } from '$lib/database/client';
import { withSpan } from '$lib/server/tracer';
import { characters, corporations, alliances, scans, scanGroups } from '../database/schema';
import { eq, sql } from 'drizzle-orm';

export async function getScanStats() {
	// get stats for scans, how many scans, how many groups
	return await withSpan('database.stats.get_scan_stats', async () => {
		const stats = await db
			.select({
				totalScans: sql`COUNT(DISTINCT ${scans.id})`.mapWith(Number),
				totalScanGroups: sql`COUNT(DISTINCT ${scanGroups.id})`.mapWith(Number),
				publicScans:
					sql`COUNT(DISTINCT CASE WHEN ${scanGroups.public} = true THEN ${scans.id} END)`.mapWith(
						Number
					),
				publicScanGroups:
					sql`COUNT(DISTINCT CASE WHEN ${scanGroups.public} = true THEN ${scanGroups.id} END)`.mapWith(
						Number
					),
				scanGroupsWithoutSystem:
					sql`COUNT(DISTINCT CASE WHEN ${scanGroups.system} IS NULL THEN ${scanGroups.id} END)`.mapWith(
						Number
					),
				localScans:
					sql`COUNT(DISTINCT CASE WHEN ${scans.scan_type} = 'local' THEN ${scans.id} END)`.mapWith(
						Number
					),
				directionalScans:
					sql`COUNT(DISTINCT CASE WHEN ${scans.scan_type} = 'directional' THEN ${scans.id} END)`.mapWith(
						Number
					)
			})
			.from(scanGroups)
			.leftJoin(scans, eq(scans.group_id, scanGroups.id));

		return stats[0];
	});
}

export async function getCharacterStats() {
	return await withSpan('database.stats.get_character_stats', async () => {
		const stats = await db
			.select({
				totalCharacters: sql`COUNT(DISTINCT ${characters.id})`.mapWith(Number),
				charactersLastSeen24h:
					sql`COUNT(DISTINCT CASE WHEN ${characters.last_seen} >= NOW() - INTERVAL '24 hours' THEN ${characters.id} END)`.mapWith(
						Number
					),
				charactersLastSeenWeek:
					sql`COUNT(DISTINCT CASE WHEN ${characters.last_seen} >= NOW() - INTERVAL '7 days' THEN ${characters.id} END)`.mapWith(
						Number
					),
				charactersLastSeenMonth:
					sql`COUNT(DISTINCT CASE WHEN ${characters.last_seen} >= NOW() - INTERVAL '30 days' THEN ${characters.id} END)`.mapWith(
						Number
					),
				charactersLastSeenYear:
					sql`COUNT(DISTINCT CASE WHEN ${characters.last_seen} >= NOW() - INTERVAL '365 days' THEN ${characters.id} END)`.mapWith(
						Number
					),
				charactersUpdated24h:
					sql`COUNT(DISTINCT CASE WHEN ${characters.updated_at} >= NOW() - INTERVAL '24 hours' THEN ${characters.id} END)`.mapWith(
						Number
					),
				charactersWithoutAlliance:
					sql`COUNT(DISTINCT CASE WHEN ${characters.alliance_id} IS NULL THEN ${characters.id} END)`.mapWith(
						Number
					),
				charactersDeleted:
					sql`COUNT(DISTINCT CASE WHEN ${characters.deleted_at} IS NOT NULL THEN ${characters.id} END)`.mapWith(
						Number
					)
			})
			.from(characters);

		return stats[0];
	});
}

export async function getCorporationStats() {
	return await withSpan('database.stats.get_corporation_stats', async () => {
		const stats = await db
			.select({
				totalCorporations: sql`COUNT(DISTINCT ${corporations.id})`.mapWith(Number),
				corporationsLastSeen24h:
					sql`COUNT(DISTINCT CASE WHEN ${corporations.last_seen} >= NOW() - INTERVAL '24 hours' THEN ${corporations.id} END)`.mapWith(
						Number
					),
				corporationsLastSeenWeek:
					sql`COUNT(DISTINCT CASE WHEN ${corporations.last_seen} >= NOW() - INTERVAL '7 days' THEN ${corporations.id} END)`.mapWith(
						Number
					),
				corporationsLastSeenMonth:
					sql`COUNT(DISTINCT CASE WHEN ${corporations.last_seen} >= NOW() - INTERVAL '30 days' THEN ${corporations.id} END)`.mapWith(
						Number
					),
				corporationsLastSeenYear:
					sql`COUNT(DISTINCT CASE WHEN ${corporations.last_seen} >= NOW() - INTERVAL '365 days' THEN ${corporations.id} END)`.mapWith(
						Number
					),
				corporationsUpdated24h:
					sql`COUNT(DISTINCT CASE WHEN ${corporations.updated_at} >= NOW() - INTERVAL '24 hours' THEN ${corporations.id} END)`.mapWith(
						Number
					),
				corporationsWithoutAlliance:
					sql`COUNT(DISTINCT CASE WHEN ${corporations.alliance_id} IS NULL THEN ${corporations.id} END)`.mapWith(
						Number
					),
				npcCorporations:
					sql`COUNT(DISTINCT CASE WHEN ${corporations.npc} = true THEN ${corporations.id} END)`.mapWith(
						Number
					)
			})
			.from(corporations);

		return stats[0];
	});
}

export async function getAllianceStats() {
	return await withSpan('database.stats.get_alliance_stats', async () => {
		const stats = await db
			.select({
				totalAlliances: sql`COUNT(DISTINCT ${alliances.id})`.mapWith(Number),
				alliancesLastSeen24h:
					sql`COUNT(DISTINCT CASE WHEN ${alliances.last_seen} >= NOW() - INTERVAL '24 hours' THEN ${alliances.id} END)`.mapWith(
						Number
					),
				alliancesLastSeenWeek:
					sql`COUNT(DISTINCT CASE WHEN ${alliances.last_seen} >= NOW() - INTERVAL '7 days' THEN ${alliances.id} END)`.mapWith(
						Number
					),
				alliancesLastSeenMonth:
					sql`COUNT(DISTINCT CASE WHEN ${alliances.last_seen} >= NOW() - INTERVAL '30 days' THEN ${alliances.id} END)`.mapWith(
						Number
					),
				alliancesLastSeenYear:
					sql`COUNT(DISTINCT CASE WHEN ${alliances.last_seen} >= NOW() - INTERVAL '365 days' THEN ${alliances.id} END)`.mapWith(
						Number
					),
				alliancesUpdated24h:
					sql`COUNT(DISTINCT CASE WHEN ${alliances.updated_at} >= NOW() - INTERVAL '24 hours' THEN ${alliances.id} END)`.mapWith(
						Number
					)
			})
			.from(alliances);

		return stats[0];
	});
}
