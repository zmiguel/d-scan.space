import { getPublicScans } from '$lib/database/scans.js';
import { drizzle } from 'drizzle-orm/d1';

export async function load({ platform }) {
	const cf = {
		db: drizzle(platform?.env.DB)
	};
	const scans = await getPublicScans(cf);
	// replace all null systems with Unknown
	scans.forEach((scan) => {
		if (scan.system === null) {
			scan.system = 'Unknown';
		}
	});

	return {
		scans: scans
	};
}
