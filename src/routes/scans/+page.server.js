import { getPublicScans } from '$lib/database/scans.js';

export async function load() {
	const scans = await getPublicScans();

	return {
		scans: scans
	};
}
