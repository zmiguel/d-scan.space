/**
 * All DB functions related to scans
 */
import { db } from '$lib/database/client';
import { scans, scanGroups } from '../database/schema';
import { eq, desc, and, isNull } from 'drizzle-orm';
import { withSpan } from '$lib/server/tracer';

export async function getScanByID(id) {
	return await withSpan('db.getScanByID', async (span) => {
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
	return await withSpan('db.getScansByGroupID', async (span) => {
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

export async function createNewScan(data) {
	return await withSpan('db.createNewScan', async (span) => {
		span.setAttributes({
			'db.scan_id': data.scanId,
			'db.group_id': data.scanGroupId,
			'db.scan_type': data.type
		});
		const timestamp = new Date();
		const systemInfo = data.type === 'directional' && data.data?.system ? data.data.system : null;

		await db.transaction(async (tx) => {
			await tx.insert(scanGroups).values({
				id: data.scanGroupId,
				system: systemInfo,
				public: data.is_public,
				created_at: timestamp
			});

			await tx.insert(scans).values({
				id: data.scanId,
				group_id: data.scanGroupId,
				scan_type: data.type,
				data: data.data,
				raw_data: data.raw_data,
				created_at: timestamp
			});
		});
	});
}

export async function updateScan(data) {
	return await withSpan('db.updateScan', async (span) => {
		span.setAttributes({
			'db.scan_id': data.scanId,
			'db.group_id': data.scanGroupId,
			'db.scan_type': data.type
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
				created_at: timestamp
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
	return await withSpan('db.getPublicScans', async () => {
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
			.orderBy(desc(scans.created_at));
	});
}
