import { db } from './client.js';
import { withSpan } from '../server/tracer.js';
import { sde, systems, invCategories, invGroups, invTypes } from './schema.js';
import { desc, eq, sql, inArray } from 'drizzle-orm';

/**
 * Retrieves the last successfully installed SDE version.
 * @returns {Promise<Object|null>}
 */
export async function getLastInstalledSDEVersion() {
	return await withSpan('getLastInstalledSDEVersion', async () => {
		return await db
			.select()
			.from(sde)
			.where(eq(sde.success, true))
			.orderBy(desc(sde.run_date))
			.limit(1);
	});
}

/**
 * Records a new SDE installation entry.
 * @param {Object} data
 */
export async function addSDEDataEntry(data) {
	await withSpan('addSDEDataEntry', async () => {
		await db.insert(sde).values({
			release_date: new Date(data.release_date),
			release_version: String(data.release_version),
			run_date: sql`now()`,
			success: data.success
		});
	});
}

/**
 * Bulk inserts or updates solar systems.
 * @param {Array<Object>} data
 */
export async function addOrUpdateSystemsDB(data) {
	await withSpan('addOrUpdateSystemsDB', async (span) => {
		if (!data || data.length === 0) {
			return;
		}

		const BATCH_SIZE = 1000; // Process 1000 systems at a time
		const totalBatches = Math.ceil(data.length / BATCH_SIZE);

		span.setAttributes({
			'systems.data.length': data.length,
			'systems.batch_size': BATCH_SIZE,
			'systems.total_batches': totalBatches
		});

		for (let i = 0; i < totalBatches; i++) {
			const start = i * BATCH_SIZE;
			const end = Math.min(start + BATCH_SIZE, data.length);
			const batch = data.slice(start, end);

			span.addEvent(`Processing batch ${i + 1}/${totalBatches}`, {
				batchNumber: i + 1,
				batchSize: batch.length,
				startIndex: start,
				endIndex: end - 1
			});

			await db
				.insert(systems)
				.values(batch)
				.onConflictDoUpdate({
					target: systems.id,
					set: {
						name: sql`excluded.name`,
						constellation: sql`excluded.constellation`,
						region: sql`excluded.region`,
						sec_status: sql`excluded.sec_status`,
						last_seen: sql`systems.last_seen`, // Preserve existing last_seen
						updated_at: sql`now()`
					},
					where: sql`
						systems.name IS DISTINCT FROM excluded.name OR
						systems.constellation IS DISTINCT FROM excluded.constellation OR
						systems.region IS DISTINCT FROM excluded.region OR
						systems.sec_status IS DISTINCT FROM excluded.sec_status
					`
				});

			span.addEvent(`Completed batch ${i + 1}/${totalBatches}`);
		}

		span.addEvent('All batches completed successfully', {
			totalSystemsProcessed: data.length
		});
	});
}

/**
 * Updates the last_seen timestamp for a list of system IDs.
 * @param {number[]} systemIds
 */
export async function updateSystemsLastSeen(systemIds) {
	if (!systemIds || systemIds.length === 0) {
		return;
	}

	await db
		.update(systems)
		.set({
			last_seen: sql`now()`
		})
		.where(inArray(systems.id, systemIds));
}

/**
 * Bulk inserts or updates inventory categories.
 * @param {Array<Object>} data
 */
export async function addOrUpdateCategoriesDB(data) {
	await withSpan('addOrUpdateCategoriesDB', async (span) => {
		if (!data || data.length === 0) {
			return;
		}

		const BATCH_SIZE = 1000;
		const totalBatches = Math.ceil(data.length / BATCH_SIZE);

		span.setAttributes({
			'categories.data.length': data.length,
			'categories.batch_size': BATCH_SIZE,
			'categories.total_batches': totalBatches
		});

		for (let i = 0; i < totalBatches; i++) {
			const start = i * BATCH_SIZE;
			const end = Math.min(start + BATCH_SIZE, data.length);
			const batch = data.slice(start, end);

			span.addEvent(`Processing batch ${i + 1}/${totalBatches}`, {
				batchNumber: i + 1,
				batchSize: batch.length
			});

			await db
				.insert(invCategories)
				.values(batch)
				.onConflictDoUpdate({
					target: invCategories.id,
					set: {
						name: sql`excluded.name`,
						updated_at: sql`now()`
					},
					where: sql`
						inv_categories.name IS DISTINCT FROM excluded.name
					`
				});

			span.addEvent(`Completed batch ${i + 1}/${totalBatches}`);
		}

		span.addEvent('All batches completed successfully', {
			totalCategoriesProcessed: data.length
		});
	});
}

/**
 * Bulk inserts or updates inventory groups.
 * @param {Array<Object>} data
 */
export async function addOrUpdateGroupsDB(data) {
	await withSpan('addOrUpdateGroupsDB', async (span) => {
		if (!data || data.length === 0) {
			return;
		}

		const BATCH_SIZE = 1000;
		const totalBatches = Math.ceil(data.length / BATCH_SIZE);

		span.setAttributes({
			'groups.data.length': data.length,
			'groups.batch_size': BATCH_SIZE,
			'groups.total_batches': totalBatches
		});

		for (let i = 0; i < totalBatches; i++) {
			const start = i * BATCH_SIZE;
			const end = Math.min(start + BATCH_SIZE, data.length);
			const batch = data.slice(start, end);

			span.addEvent(`Processing batch ${i + 1}/${totalBatches}`, {
				batchNumber: i + 1,
				batchSize: batch.length
			});

			await db
				.insert(invGroups)
				.values(batch)
				.onConflictDoUpdate({
					target: invGroups.id,
					set: {
						name: sql`excluded.name`,
						anchorable: sql`excluded.anchorable`,
						anchored: sql`excluded.anchored`,
						fittable_non_singleton: sql`excluded.fittable_non_singleton`,
						category_id: sql`excluded.category_id`,
						icon_id: sql`excluded.icon_id`,
						updated_at: sql`now()`
					},
					where: sql`
						inv_groups.name IS DISTINCT FROM excluded.name OR
						inv_groups.anchorable IS DISTINCT FROM excluded.anchorable OR
						inv_groups.anchored IS DISTINCT FROM excluded.anchored OR
						inv_groups.fittable_non_singleton IS DISTINCT FROM excluded.fittable_non_singleton OR
						inv_groups.category_id IS DISTINCT FROM excluded.category_id OR
						inv_groups.icon_id IS DISTINCT FROM excluded.icon_id
					`
				});

			span.addEvent(`Completed batch ${i + 1}/${totalBatches}`);
		}

		span.addEvent('All batches completed successfully', {
			totalGroupsProcessed: data.length
		});
	});
}

/**
 * Bulk inserts or updates inventory types.
 * @param {Array<Object>} data
 */
export async function addOrUpdateTypesDB(data) {
	await withSpan('addOrUpdateTypesDB', async (span) => {
		if (!data || data.length === 0) {
			return;
		}

		const BATCH_SIZE = 1000;
		const totalBatches = Math.ceil(data.length / BATCH_SIZE);

		span.setAttributes({
			'types.data.length': data.length,
			'types.batch_size': BATCH_SIZE,
			'types.total_batches': totalBatches
		});

		for (let i = 0; i < totalBatches; i++) {
			const start = i * BATCH_SIZE;
			const end = Math.min(start + BATCH_SIZE, data.length);
			const batch = data.slice(start, end);

			span.addEvent(`Processing batch ${i + 1}/${totalBatches}`, {
				batchNumber: i + 1,
				batchSize: batch.length
			});

			await db
				.insert(invTypes)
				.values(batch)
				.onConflictDoUpdate({
					target: invTypes.id,
					set: {
						name: sql`excluded.name`,
						mass: sql`excluded.mass`,
						volume: sql`excluded.volume`,
						capacity: sql`excluded.capacity`,
						faction_id: sql`excluded.faction_id`,
						race_id: sql`excluded.race_id`,
						group_id: sql`excluded.group_id`,
						market_group_id: sql`excluded.market_group_id`,
						icon_id: sql`excluded.icon_id`,
						updated_at: sql`now()`
					},
					where: sql`
						inv_types.name IS DISTINCT FROM excluded.name OR
						inv_types.mass IS DISTINCT FROM excluded.mass OR
						inv_types.volume IS DISTINCT FROM excluded.volume OR
						inv_types.capacity IS DISTINCT FROM excluded.capacity OR
						inv_types.faction_id IS DISTINCT FROM excluded.faction_id OR
						inv_types.race_id IS DISTINCT FROM excluded.race_id OR
						inv_types.group_id IS DISTINCT FROM excluded.group_id OR
						inv_types.market_group_id IS DISTINCT FROM excluded.market_group_id OR
						inv_types.icon_id IS DISTINCT FROM excluded.icon_id
					`
				});

			span.addEvent(`Completed batch ${i + 1}/${totalBatches}`);
		}

		span.addEvent('All batches completed successfully', {
			totalTypesProcessed: data.length
		});
	});
}

/**
 * Retrieves hierarchy metadata (Type -> Group -> Category) for a list of Type IDs.
 * @param {number[]} typeIds
 * @returns {Promise<Map<number, Object>>}
 */
export async function getTypeHierarchyMetadata(typeIds) {
	return await withSpan('getTypeHierarchyMetadata', async (span) => {
		if (!typeIds || typeIds.length === 0) {
			return new Map();
		}

		const ids = Array.from(
			new Set(typeIds.map((id) => Number(id)).filter((id) => Number.isFinite(id) && id > 0))
		);

		if (ids.length === 0) {
			return new Map();
		}

		span.setAttributes({ 'types.requested': ids.length });

		const rows = await db
			.select({
				typeId: invTypes.id,
				typeName: invTypes.name,
				mass: invTypes.mass,
				groupId: invGroups.id,
				groupName: invGroups.name,
				anchorable: invGroups.anchorable,
				anchored: invGroups.anchored,
				categoryId: invCategories.id,
				categoryName: invCategories.name
			})
			.from(invTypes)
			.leftJoin(invGroups, eq(invTypes.group_id, invGroups.id))
			.leftJoin(invCategories, eq(invGroups.category_id, invCategories.id))
			.where(inArray(invTypes.id, ids));

		const result = new Map();
		for (const row of rows) {
			const typeId = Number(row.typeId);
			if (!Number.isFinite(typeId) || typeId <= 0) {
				continue;
			}

			const groupId = row.groupId != null ? Number(row.groupId) : null;
			const categoryId = row.categoryId != null ? Number(row.categoryId) : null;

			result.set(typeId, {
				typeId,
				typeName: row.typeName,
				mass: Number(row.mass) || 0,
				groupId,
				groupName: row.groupName ?? 'Unknown Group',
				anchorable: Boolean(row.anchorable),
				anchored: Boolean(row.anchored),
				categoryId,
				categoryName: row.categoryName ?? 'Unknown Category'
			});
		}

		span.setAttributes({ 'types.found': result.size });
		return result;
	});
}

/**
 * Looks up a solar system by its exact name.
 * @param {string} name
 * @returns {Promise<Object|null>}
 */
export async function getSystemByName(name) {
	return await withSpan('getSystemByName', async (span) => {
		const trimmed = name?.trim();
		if (!trimmed) {
			return null;
		}

		span.setAttributes({ 'system.lookup_name': trimmed });

		const rows = await db
			.select({
				id: systems.id,
				name: systems.name,
				constellation: systems.constellation,
				region: systems.region,
				secStatus: systems.sec_status
			})
			.from(systems)
			.where(eq(systems.name, trimmed))
			.limit(1);

		return rows[0] ?? null;
	});
}
