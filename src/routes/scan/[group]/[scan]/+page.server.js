import {
	getScanByID,
	getScansByGroupID,
	getScanGroupByID,
	setScanGroupSystemIfOwnerAndUnset
} from '$lib/database/scans.js';
import { getSystemByName } from '$lib/database/sde.js';
import { withSpan } from '$lib/server/tracer.js';
import { error, fail } from '@sveltejs/kit';

/** @satisfies {import('./$types').Actions} */
export const actions = {
	setSystem: async ({ request, params, locals, event }) => {
		return await withSpan(
			'route.scan_detail.set_system',
			async (span) => {
				const session = await locals.auth();
				const userId = session?.user?.id ?? null;
				const primaryCharacterName = session?.eve?.characterName ?? session?.user?.name ?? null;

				if (!userId) {
					return fail(401, { message: 'You must be logged in to set a system.' });
				}

				const formData = await request.formData();
				const systemName = String(formData.get('system_name') ?? '').trim();
				if (!systemName) {
					return fail(400, { message: 'Please select a system.' });
				}

				const groupId = params.group;
				const scanGroup = await getScanGroupByID(groupId);
				if (!scanGroup) {
					return fail(404, { message: 'Scan group not found.' });
				}

				if (scanGroup.created_by !== userId) {
					return fail(403, { message: 'Only the scan group creator can set the system.' });
				}

				if (scanGroup.system) {
					return fail(409, { message: 'This scan group already has a system set.' });
				}

				const system = await getSystemByName(systemName);
				if (!system) {
					return fail(400, { message: 'Selected system was not found.' });
				}

				const systemPayload = {
					id: Number(system.id),
					name: system.name,
					constellation: system.constellation,
					region: system.region,
					security: Number(system.secStatus)
				};

				const wasUpdated = await setScanGroupSystemIfOwnerAndUnset({
					groupId,
					userId,
					system: systemPayload,
					primaryCharacterName
				});

				span.setAttributes({
					'scan.group_id': groupId,
					'user.id': userId,
					'user.primary_character_name': primaryCharacterName ?? 'unknown',
					'system.name': system.name,
					'system.updated': wasUpdated
				});

				if (!wasUpdated) {
					return fail(409, { message: 'System can no longer be edited for this scan group.' });
				}

				return {
					success: true
				};
			},
			{},
			{},
			event
		);
	}
};

export async function load(event) {
	return await withSpan(
		'route.scan_detail.load',
		async (span) => {
			const { group, scan } = event.params;
			const session = await event.locals.auth();
			const userId = session?.user?.id ?? null;

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
				throw error(404, 'Scan not found');
			}

			const thisScan = getScanResult[0];
			const scanGroup = await withSpan(
				'route.scan_detail.fetch_group',
				async () => {
					return await getScanGroupByID(group);
				},
				{
					'scan.group_id': group,
					'operation.type': 'read'
				}
			);

			if (!scanGroup) {
				span.setAttributes({
					'scan.found': false,
					'response.status': 404
				});
				throw error(404, 'Scan group not found');
			}
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
				'scan.has_directional': !!directionalScan,
				'user.id': userId ?? 'anonymous'
			});

			const canEditSystem = !scanGroup.system && !!userId && scanGroup.created_by === userId;

			return {
				system: thisScan.system,
				canEditSystem,
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
