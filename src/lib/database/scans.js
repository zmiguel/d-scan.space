/**
 * All DB functions related to scans
 */
import { db } from '$lib/database/client';
import { scans, scanGroups } from '../database/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { withSpan } from '$lib/server/tracer';

export async function getScanByID(id) {
	return await withSpan('database.scans.get_by_id', async (span) => {
		span.setAttributes({ 'db.scan_id': id });
		return db
			.select({
				id: scans.id,
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

export async function getScansByGroupID(id) {
	return await withSpan('database.scans.get_by_group_id', async (span) => {
		span.setAttributes({ 'db.group_id': id });
		return db
			.select({
				id: scans.id,
				scan_type: scans.scan_type,
				created_at: scans.created_at
			})
			.from(scans)
			.where(eq(scans.group_id, id));
	});
}

export async function getScanGroupByID(id) {
	return await withSpan('database.scan_groups.get_by_id', async (span) => {
		span.setAttributes({ 'db.group_id': id });

		const rows = await db
			.select({
				id: scanGroups.id,
				system: scanGroups.system,
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

export async function getPublicScans() {
	return await withSpan('database.scans.get_public', async () => {
		return db
			.select({
				id: scans.id,
				group_id: scans.group_id,
				scan_type: scans.scan_type,
				created_at: scans.created_at,
				system: scanGroups.system
			})
			.from(scans)
			.leftJoin(scanGroups, eq(scanGroups.id, scans.group_id))
			.where(eq(scanGroups.public, true))
			.orderBy(desc(scans.created_at))
			.limit(5000);
	});
}

export async function getScansByUser(userId) {
	return await withSpan('database.scans.get_by_user', async (span) => {
		span.setAttributes({
			'db.user_id': userId
		});

		return db
			.select({
				id: scans.id,
				group_id: scans.group_id,
				scan_type: scans.scan_type,
				created_at: scans.created_at,
				system: scanGroups.system,
				public: scanGroups.public
			})
			.from(scans)
			.leftJoin(scanGroups, eq(scanGroups.id, scans.group_id))
			.where(eq(scans.created_by, userId))
			.orderBy(desc(scans.created_at))
			.limit(5000);
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
