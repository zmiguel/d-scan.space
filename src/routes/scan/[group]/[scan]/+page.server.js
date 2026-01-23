import { getScanByID, getScansByGroupID } from '$lib/database/scans.js';
import { withSpan } from '$lib/server/tracer.js';

export async function load({ params, event }) {
	return await withSpan(
		'route.scan_detail.load',
		async (span) => {
			const { group, scan } = params;

			span.setAttributes({
				'scan.group_id': group,
				'scan.id': scan,
				'page.type': 'scan_detail'
			});

			const getScanResult = await withSpan(
				'route.scan_detail.fetch_scan',
				async () => {
					return await getScanByID(scan);
				},
				{
					'scan.id': scan,
					'operation.type': 'read'
				}
			);

			if (!getScanResult || getScanResult.length === 0) {
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
				'route.scan_detail.fetch_group_scans',
				async () => {
					return await getScansByGroupID(group);
				},
				{
					'scan.group_id': group,
					'operation.type': 'read'
				}
			);

			const thisScanDate = new Date(thisScan.created_at);
			let priorOppositeScan = null;

			if (groupScans.length > 1) {
				for (const scanItem of groupScans) {
					if (scanItem.id === thisScan.id) {
						continue;
					}

					if (scanItem.scan_type === thisScan.scan_type) {
						continue;
					}

					const scanItemDate = new Date(scanItem.created_at);
					if (scanItemDate >= thisScanDate) {
						continue;
					}

					if (!priorOppositeScan || scanItemDate > new Date(priorOppositeScan.created_at)) {
						priorOppositeScan = scanItem;
					}
				}
			}

			if (priorOppositeScan) {
				const priorScanResult = await withSpan(
					'route.scan_detail.fetch_prior_scan',
					async () => {
						return await getScanByID(priorOppositeScan.id);
					},
					{
						'scan.id': priorOppositeScan.id,
						'operation.type': 'read'
					}
				);

				if (priorScanResult && priorScanResult[0]) {
					priorOppositeScan = priorScanResult[0];
				} else {
					priorOppositeScan = null;
				}
			}

			const localScan =
				thisScan.scan_type === 'local'
					? thisScan
					: priorOppositeScan?.scan_type === 'local'
						? priorOppositeScan
						: null;

			const directionalScan =
				thisScan.scan_type === 'directional'
					? thisScan
					: priorOppositeScan?.scan_type === 'directional'
						? priorOppositeScan
						: null;

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
				local: localScan ? localScan.data : null,
				directional: directionalScan ? directionalScan.data : null,
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
