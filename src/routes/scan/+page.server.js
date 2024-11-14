import { drizzle } from 'drizzle-orm/d1';
import ShortUniqueId from 'short-unique-id';
import { scanGroups, scans } from '$lib/database/schema.js';
import { redirect } from '@sveltejs/kit';
import { createNewLocalScan } from '$lib/server/local.js';

/** @satisfies {import('./$types').Actions} */
export const actions = {
	create: async ({ request, platform }) => {
		const data = await request.formData();
		const content = /** @type {(string | null)} */ (data.get('scan_content'));
		const is_public = data.has('is_public');
		const db = drizzle(platform?.env.DB);

		if (!content) {
			return { status: 400, body: 'No scan content provided' };
		}

		const lines = content.split('\n');

		// Figure out if local or directional scan
		//  - Directional scans start with numbers and have 3 tabs per line
		const isDirectional = lines.every((line) => {
			const parts = line.split('\t');
			return parts.length === 4 && !isNaN(parts[0]);
		});

		// LOCAL SCAN
		if (!isDirectional) {
			const result = await createNewLocalScan(db, lines);
		} else {
			// DIRECTIONAL SCAN
			//
			// TBD.
		}

		const uid = new ShortUniqueId();
		const scanGroupId = uid.randomUUID(8);
		const scanId = uid.randomUUID(12);

		await db.insert(scanGroups).values({
			id: scanGroupId,
			system: null,
			public: is_public ? 1 : 0,
			createdAt: new Date().toISOString()
		});

		await db.insert(scans).values({
			id: scanId,
			data: content,
			scan_group_id: scanGroupId,
			scan_type: 'test',
			createdAt: new Date().toISOString()
		});

		return redirect(303, `/scan/${scanGroupId}/${scanId}`);
	}
};
