import { drizzle } from 'drizzle-orm/d1';
import ShortUniqueId from 'short-unique-id';
import { scanGroups, scans } from '$lib/database/schema.js';
import { redirect } from '@sveltejs/kit';

/** @satisfies {import('./$types').Actions} */
export const actions = {
	create: async ({request, platform }) => {
		const data = await request.formData();
		const content = data.get('scan_content');
		const is_public = data.has('is_public');

		const uid = new ShortUniqueId();

		let db = drizzle(platform.env.DB);

		let scanGroupId = uid.randomUUID(8);
		let scanId = uid.randomUUID(12);

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
	},
};
