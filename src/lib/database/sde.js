import { db } from '$lib/database/client';
import { withSpan } from '$lib/server/tracer';
import { sde, systems } from './schema';
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
						last_seen: sql`now()`,
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
