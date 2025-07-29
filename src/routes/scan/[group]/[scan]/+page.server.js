import { getScanByID, getScansByGroupID } from '$lib/database/scans.js';
import { addAttributes } from '$lib/server/tracer.js';

export async function load({ params }) {
	const { group, scan } = params;

	/* We need to find the data for this scan group,
	 * then find the scan data for this scan and all other scans of the group
	 * get this scan the scan of the other type before it (local, space)
	 * return the data for the page to render
	 */

	addAttributes({
		'scan.group': group,
		'scan.id': scan
	});

	const getScanResult = await getScanByID(scan);
	if (!getScanResult) {
		return {
			status: 404,
			body: 'Scan not found'
		};
	}

	const thisScan = getScanResult[0];
	const groupScans = await getScansByGroupID(group);

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
		local: localScan ? thisScan.data : null,
		directional: directionalScan ? thisScan.data : null,
		related: groupScans,
		params: {
			group: group,
			scan: scan
		}
	};
}
