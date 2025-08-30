import { getScanByID, getScansByGroupID } from '$lib/database/scans.js';
import { withSpan } from '$lib/server/tracer.js';

export async function load({ params, event }) {
	return await withSpan(
		'page.load.scan_detail',
		async (span) => {
			const { group, scan } = params;

			span.setAttributes({
				'scan.group_id': group,
				'scan.id': scan,
				'page.type': 'scan_detail'
			});

			const getScanResult = await withSpan(
				'database.get_scan_by_id',
				async () => {
					return await getScanByID(scan);
				},
				{
					'scan.id': scan,
					'operation.type': 'read'
				}
			);

			if (!getScanResult) {
				span.setAttributes({
					'scan.found': false,
					'response.status': 404
				});
				return {
					status: 404,
					body: 'Scan not found'
				};
			}

			const thisScan = getScanResult[0];
			const groupScans = await withSpan(
				'database.get_scans_by_group_id',
				async () => {
					return await getScansByGroupID(group);
				},
				{
					'scan.group_id': group,
					'operation.type': 'read'
				}
			);

			let localScan;
			let directionalScan;

			if (thisScan.scan_type === 'local') {
				localScan = thisScan;
			} else {
				directionalScan = thisScan;
			}

			if (groupScans.length > 1) {
				groupScans.forEach((scanItem) => {
					if (
						scanItem.created_at < thisScan.created_at &&
						scanItem.scan_type !== thisScan.scan_type
					) {
						if (scanItem.scan_type === 'local') {
							localScan = scanItem;
						} else {
							directionalScan = scanItem;
						}
					}
				});
			}

			span.setAttributes({
				'scan.found': true,
				'scan.type': thisScan.scan_type,
				'scan.group_size': groupScans.length,
				'scan.has_local': !!localScan,
				'scan.has_directional': !!directionalScan
			});

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
		},
		{
			'route.id': 'scan_detail'
		},
		{},
		event
	);
}
