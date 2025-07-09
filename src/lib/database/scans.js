/**
 * All DB functions related to scans
 */
import { db } from '$lib/database/client';
import { scans, scanGroups } from '../database/schema';
import { eq } from 'drizzle-orm';

export async function getScanByID(id) {
	return db
		.select({
			id: scans.id,
			scan_type: scans.scan_type,
			created_at: scans.created_at,
			system: scanGroups.system
		})
		.from(scans)
		.leftJoin(scanGroups, eq(scanGroups.id, scans.scan_group_id))
		.where(eq(scans.id, id));
}

export async function getScansByGroupID(id) {
	return await db.select().from(scans).where(eq(scans.scan_group_id, id)).all();
}

export async function createNewScan(data) {
	const timestamp = Math.floor(Date.now());

	await db.insert(scanGroups).values({
		id: data.scanGroupId,
		system: null,
		public: data.is_public,
		createdAt: timestamp
	});

	await db.insert(scans).values({
		id: data.scanId,
		scan_group_id: data.scanGroupId,
		scan_type: data.type,
		createdAt: timestamp
	});
}

export async function updateScan(data) {
	const timestamp = Math.floor(Date.now());

	await db.insert(scans).values({
		id: data.scanId,
		scan_group_id: data.scanGroupId,
		scan_type: data.type,
		createdAt: timestamp
	});
}

export async function getPublicScans() {
	return db
		.select({
			id: scans.id,
			group_id: scans.scan_group_id,
			scan_type: scans.scan_type,
			data: scans.data,
			raw_data: scans.raw_data,
			created_at: scans.created_at,
			system: scanGroups.system
		})
		.from(scans)
		.leftJoin(scanGroups, eq(scanGroups.id, scans.scan_group_id))
		.where(eq(scanGroups.public, true))
		.orderBy(scans.created_at, 'desc');
}
