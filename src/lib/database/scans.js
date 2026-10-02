/**
 * All DB functions related to scans
 */
import { db } from '$lib/database/client';
import { scans, scanGroups } from '../database/schema';
import { eq, desc, and, isNull, sql } from 'drizzle-orm';
import { withSpan } from '$lib/server/tracer';

export async function getScanByID(id) {
	return await withSpan('database.scans.get_by_id', async (span) => {
		span.setAttributes({ 'db.scan_id': id });
		return db
			.select({
				id: scans.id,
				group_id: scans.group_id,
				scan_type: scans.scan_type,
				created_at: scans.created_at,
				data: scans.data,
				system: scanGroups.system
			})
			.from(scans)
			.leftJoin(scanGroups, eq(scanGroups.id, scans.group_id))
			.where(eq(scans.id, id));
	});
}

/**
 * Timeline of a group: one row per scan with only the counters the timeline renders,
 * extracted in SQL so the (large) `data` JSON never leaves the database.
 * Uses scans_group_id_created_at_idx.
 * @param {string} groupId
 * @returns {Promise<Array<{ id: string, scan_type: 'local' | 'directional', created_at: Date,
 *   total_pilots: number | null, on_grid_objects: number | null, off_grid_objects: number | null }>>}
 */
export async function getScanTimeline(groupId) {
	return await withSpan('database.scans.get_timeline', async (span) => {
		span.setAttributes({ 'db.group_id': groupId });
		return db
			.select({
				id: scans.id,
				scan_type: scans.scan_type,
				created_at: scans.created_at,
				total_pilots: sql`(${scans.data} ->> 'total_pilots')::int`,
				on_grid_objects: sql`(${scans.data} -> 'on_grid' ->> 'total_objects')::int`,
				off_grid_objects: sql`(${scans.data} -> 'off_grid' ->> 'total_objects')::int`
			})
			.from(scans)
			.where(eq(scans.group_id, groupId))
			.orderBy(scans.created_at, scans.id);
	});
}

/**
 * Id of the most recent scan in a group, or null when the group has no scans.
 * @param {string} groupId
 */
export async function getLatestScanIdInGroup(groupId) {
	return await withSpan('database.scans.get_latest_in_group', async (span) => {
		span.setAttributes({ 'db.group_id': groupId });
		const rows = await db
			.select({ id: scans.id })
			.from(scans)
			.where(eq(scans.group_id, groupId))
			.orderBy(desc(scans.created_at), desc(scans.id))
			.limit(1);
		return rows[0]?.id ?? null;
	});
}

export async function getScanGroupByID(id) {
	return await withSpan('database.scan_groups.get_by_id', async (span) => {
		span.setAttributes({ 'db.group_id': id });

		const rows = await db
			.select({
				id: scanGroups.id,
				system: scanGroups.system,
				public: scanGroups.public,
				created_by: scanGroups.created_by
			})
			.from(scanGroups)
			.where(eq(scanGroups.id, id))
			.limit(1);

		return rows[0] ?? null;
	});
}

export async function createNewScan(data) {
	return await withSpan('database.scans.create', async (span) => {
		span.setAttributes({
			'db.scan_id': data.scanId,
			'db.group_id': data.scanGroupId,
			'db.scan_type': data.type,
			'db.created_by': data.created_by ?? 'anonymous',
			'user.primary_character_name': data.primary_character_name ?? 'anonymous'
		});
		const timestamp = new Date();
		const systemInfo = data.type === 'directional' && data.data?.system ? data.data.system : null;

		await db.transaction(async (tx) => {
			await tx.insert(scanGroups).values({
				id: data.scanGroupId,
				system: systemInfo,
				public: data.is_public,
				created_at: timestamp,
				created_by: data.created_by ?? null
			});

			await tx.insert(scans).values({
				id: data.scanId,
				group_id: data.scanGroupId,
				scan_type: data.type,
				data: data.data,
				raw_data: data.raw_data,
				created_at: timestamp,
				created_by: data.created_by ?? null
			});
		});
	});
}

export async function updateScan(data) {
	return await withSpan('database.scans.update', async (span) => {
		span.setAttributes({
			'db.scan_id': data.scanId,
			'db.group_id': data.scanGroupId,
			'db.scan_type': data.type,
			'db.created_by': data.created_by ?? 'anonymous',
			'user.primary_character_name': data.primary_character_name ?? 'anonymous'
		});
		const timestamp = new Date();
		const systemInfo = data.type === 'directional' && data.data?.system ? data.data.system : null;

		await db.transaction(async (tx) => {
			await tx.insert(scans).values({
				id: data.scanId,
				group_id: data.scanGroupId,
				scan_type: data.type,
				data: data.data,
				raw_data: data.raw_data,
				created_at: timestamp,
				created_by: data.created_by ?? null
			});

			if (systemInfo) {
				await tx
					.update(scanGroups)
					.set({ system: systemInfo })
					.where(and(eq(scanGroups.id, data.scanGroupId), isNull(scanGroups.system)));
			}
		});
	});
}

/** Fixed page size of the public and personal scan lists. */
export const SCAN_LIST_PAGE_SIZE = 50;

/** Escapes LIKE/ILIKE wildcards so user input only ever matches literally. */
export function escapeLikePattern(value) {
	return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * WHERE conditions shared by the scan lists.
 * @param {{ query?: string, type?: string }} filters
 */
function scanListFilters({ query, type }) {
	const conditions = [];
	if (type === 'local' || type === 'directional') {
		conditions.push(eq(scans.scan_type, type));
	}
	const term = typeof query === 'string' ? query.trim() : '';
	if (term) {
		conditions.push(
			sql`(${scanGroups.system} ->> 'name') ILIKE ${`%${escapeLikePattern(term)}%`} ESCAPE '\\'`
		);
	}
	return conditions;
}

function toPageNumber(page) {
	const value = Math.trunc(Number(page));
	return Number.isFinite(value) && value >= 1 ? value : 1;
}

/**
 * One page of a scan list, newest first. `page` is clamped to [1, last page].
 * @param {import('drizzle-orm').SQL | undefined} where
 * @param {{ page?: unknown, includeVisibility?: boolean }} options
 * @returns {Promise<{ rows: Array<{ id: string, group_id: string, scan_type: 'local' | 'directional',
 *   created_at: Date, system: { name: string, security: number | null, region: string | null } | null,
 *   public?: boolean }>, total: number, page: number, pageSize: number }>}
 */
async function getScanListPage(where, { page, includeVisibility = false }, span) {
	const pageSize = SCAN_LIST_PAGE_SIZE;

	const [{ total }] = await db
		.select({ total: sql`count(*)::int`.mapWith(Number) })
		.from(scans)
		.innerJoin(scanGroups, eq(scanGroups.id, scans.group_id))
		.where(where);

	const pageCount = Math.max(1, Math.ceil(total / pageSize));
	const effectivePage = Math.min(toPageNumber(page), pageCount);

	const rows =
		total === 0
			? []
			: await db
					.select({
						id: scans.id,
						group_id: scans.group_id,
						scan_type: scans.scan_type,
						created_at: scans.created_at,
						system_name: sql`${scanGroups.system} ->> 'name'`,
						system_security: sql`(${scanGroups.system} ->> 'security')::float8`,
						system_region: sql`${scanGroups.system} ->> 'region'`,
						...(includeVisibility ? { public: scanGroups.public } : {})
					})
					.from(scans)
					.innerJoin(scanGroups, eq(scanGroups.id, scans.group_id))
					.where(where)
					.orderBy(desc(scans.created_at), desc(scans.id))
					.limit(pageSize)
					.offset((effectivePage - 1) * pageSize);

	span.setAttributes({
		'db.page': effectivePage,
		'db.page_size': pageSize,
		'db.total': total,
		'db.rows': rows.length
	});

	return {
		rows: rows.map(({ system_name, system_security, system_region, ...row }) => ({
			...row,
			system:
				system_name == null
					? null
					: {
							name: system_name,
							security: system_security ?? null,
							region: system_region ?? null
						}
		})),
		total,
		page: effectivePage,
		pageSize
	};
}

/**
 * Public scans, paginated.
 * @param {{ page?: unknown, query?: string, type?: string }} [options]
 */
export async function getPublicScansPage({ page = 1, query = '', type = '' } = {}) {
	return await withSpan('database.scans.get_public_page', async (span) => {
		span.setAttributes({ 'db.filter.type': type || 'all', 'db.filter.has_query': !!query });
		const where = and(eq(scanGroups.public, true), ...scanListFilters({ query, type }));
		return getScanListPage(where, { page }, span);
	});
}

/**
 * Scans created by a user (public and private), paginated.
 * @param {string} userId
 * @param {{ page?: unknown, query?: string, type?: string }} [options]
 */
export async function getUserScansPage(userId, { page = 1, query = '', type = '' } = {}) {
	return await withSpan('database.scans.get_by_user_page', async (span) => {
		span.setAttributes({
			'db.user_id': userId,
			'db.filter.type': type || 'all',
			'db.filter.has_query': !!query
		});
		const where = and(eq(scans.created_by, userId), ...scanListFilters({ query, type }));
		return getScanListPage(where, { page, includeVisibility: true }, span);
	});
}

export async function setScanGroupSystemIfOwnerAndUnset({
	groupId,
	userId,
	system,
	primaryCharacterName
}) {
	return await withSpan('database.scan_groups.set_system_once', async (span) => {
		span.setAttributes({
			'db.group_id': groupId,
			'db.user_id': userId,
			'user.primary_character_name': primaryCharacterName ?? 'unknown'
		});

		const rows = await db
			.update(scanGroups)
			.set({
				system
			})
			.where(
				and(
					eq(scanGroups.id, groupId),
					eq(scanGroups.created_by, userId),
					isNull(scanGroups.system)
				)
			)
			.returning({ id: scanGroups.id });

		return rows.length > 0;
	});
}
