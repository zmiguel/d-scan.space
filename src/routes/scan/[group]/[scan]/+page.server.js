import { getScanByID, getScansByGroupID } from '$lib/database/scans.js';
import { drizzle } from 'drizzle-orm/d1';
import { decompressJson } from '$lib/server/compressor.js';

export async function load({ params, platform }) {
	const { group, scan } = params;
	const db = drizzle(platform?.env.DB);

	/* We need to find the data for this scan group,
	 * then find the scan data for this scan and all other scans of the group
	 * get this scan the scan of the other type before it (local, space)
	 * return the data for the page to render
	 */

	const getScanResult = await getScanByID(db, scan);
	if (!getScanResult) {
		return {
			status: 404,
			body: 'Scan not found'
		};
	}
	const thisScan = getScanResult[0];
	const groupScans = await getScansByGroupID(db, group);

	let localScan;
	let directionalScan;

	if (thisScan.scan_type === 'local') {
		localScan = thisScan;
	} else {
		directionalScan = thisScan;
	}

	if (groupScans.length > 1) {
		groupScans.forEach((scan) => {
			if (scan.created_at < thisScan.created_at && scan.scan_type !== thisScan.scan_type) {
				if (scan.scan_type === 'local') {
					localScan = scan;
				} else {
					directionalScan = scan;
				}
			}
		});
	}

	return {
		system: thisScan.system,
		created_at: thisScan.created_at,
		local: localScan
			? await decompressJson(await platform?.env.KV.get(`${group}${localScan.id}`, 'arrayBuffer'))
			: null,
		directional: directionalScan
			? await decompressJson(
					await platform?.env.KV.get(`${group}${directionalScan.id}`, 'arrayBuffer')
				)
			: null,
		related: groupScans
	};
}
