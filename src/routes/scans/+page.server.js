import { getPublicScans } from '$lib/database/scans.js';

export async function load() {
	const scans = await getPublicScans();
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
