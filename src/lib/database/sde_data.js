import { db } from '$lib/database/client';
import { withSpan } from '$lib/server/tracer';
import { sde_data } from './schema';
import { desc, eq } from 'drizzle-orm';

export async function getLastChecksums() {
	return await withSpan('getLastChecksums', async () => {
		return await db
			.select()
			.from(sde_data)
			.where(eq(sde_data.success, true))
			.orderBy(desc(sde_data.install_date))
			.limit(1);
	});
}
