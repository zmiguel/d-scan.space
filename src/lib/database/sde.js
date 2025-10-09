import { db } from '$lib/database/client';
import { withSpan } from '$lib/server/tracer';
import { sde, systems, invCategories, invGroups, invTypes } from './schema';
import { desc, eq, sql, inArray } from 'drizzle-orm';

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
					}
				});

			span.addEvent(`Completed batch ${i + 1}/${totalBatches}`);
		}

		span.addEvent('All batches completed successfully', {
			totalSystemsProcessed: data.length
		});
	});
}

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
					}
				});

			span.addEvent(`Completed batch ${i + 1}/${totalBatches}`);
		}

		span.addEvent('All batches completed successfully', {
			totalCategoriesProcessed: data.length
		});
	});
}

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
					}
				});

			span.addEvent(`Completed batch ${i + 1}/${totalBatches}`);
		}

		span.addEvent('All batches completed successfully', {
			totalGroupsProcessed: data.length
		});
	});
}

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
					}
				});

			span.addEvent(`Completed batch ${i + 1}/${totalBatches}`);
		}

		span.addEvent('All batches completed successfully', {
			totalTypesProcessed: data.length
		});
	});
}
