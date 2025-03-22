/**
 * All DB functions related to scans
 */

import { scans, scanGroups } from '../database/schema';
import { eq } from 'drizzle-orm';

export async function getScanByID(db, id) {
	return await db
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

export async function getScansByGroupID(db, id) {
	return await db.select().from(scans).where(eq(scans.scan_group_id, id)).all();
}

export async function createNewScan(db, data) {
	const timestamp = Math.floor(Date.now() / 1000);

	await db.insert(scanGroups).values({
		id: data.scanGroupId,
		system: null,
		public: data.is_public ? 1 : 0,
		createdAt: timestamp
	});

	await db.insert(scans).values({
		id: data.scanId,
		scan_group_id: data.scanGroupId,
		scan_type: data.isDirectional ? 'directional' : 'local',
		createdAt: timestamp
	});
}
