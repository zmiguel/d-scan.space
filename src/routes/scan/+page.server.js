import { drizzle } from 'drizzle-orm/d1';
import ShortUniqueId from 'short-unique-id';
import { redirect } from '@sveltejs/kit';
import { createNewLocalScan } from '$lib/server/local.js';
import { compressJson } from '$lib/server/compressor.js';
import { createNewScan } from '$lib/database/scans.js';

/** @satisfies {import('./$types').Actions} */
export const actions = {
	create: async ({ request, platform }) => {
		const data = await request.formData();
		const content = /** @type {(string | null)} */ (data.get('scan_content'));
		const is_public = data.has('is_public');
		const cf = {
			db: drizzle(platform?.env.DB),
			kv: platform?.env.KV,
			esi: platform?.env.ESI_CLIENT
		};

		if (!content) {
			return { status: 400, body: 'No scan content provided' };
		}

		let lines = content.split('\n');
		// remove empty lines
		lines = lines.filter((line) => line.trim().length > 0);

		// Figure out if local or directional scan
		//  - Directional scans start with numbers and have 3 tabs per line
		const isDirectional = lines.every((line) => {
			const parts = line.split('\t');
			return parts.length === 4 && !isNaN(parts[0]);
		});

		const uid = new ShortUniqueId();
		const scanGroupId = uid.randomUUID(8);
		const scanId = uid.randomUUID(12);
		let result;
		// LOCAL SCAN
		if (!isDirectional) {
			result = await createNewLocalScan(db, worker, lines);
		} else {
			// DIRECTIONAL SCAN
			//
			// TBD.
		}

		try {
			await createNewScan(db, {
				scanGroupId,
				scanId,
				is_public,
				isDirectional
			});

			await cf.kv.put(`${scanGroupId}${scanId}`, await compressJson(result));
		} catch (e) {
			console.error('Failed to store scan data', e);
			return { status: 500, body: 'Failed to store scan data' };
		}

		return redirect(303, `/scan/${scanGroupId}/${scanId}`);
	}
};
