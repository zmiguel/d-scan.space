import {
	getScanByID,
	getScanGroupByID,
	getScanTimeline,
	setScanGroupSystemIfOwnerAndUnset
} from '$lib/database/scans.js';
import { getSystemByName } from '$lib/database/sde.js';
import { findPairedScan } from '$lib/server/scan-pairing.js';
import { withSpan } from '$lib/server/tracer.js';
import { error, fail, redirect } from '@sveltejs/kit';

/** @satisfies {import('./$types').Actions} */
export const actions = {
	setSystem: async (event) => {
		const { request, params, locals } = event;
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

			// A scan only belongs to one group. Opening it under another group id would mix
			// that group's timeline/permissions with this scan, so send it to its real URL.
			if (thisScan.group_id && thisScan.group_id !== group) {
				span.setAttributes({
					'scan.group_mismatch': true,
					'response.status': 301
				});
				redirect(301, `/scan/${thisScan.group_id}/${scan}`);
			}

			const [scanGroup, groupScans] = await withSpan(
				'route.scan_detail.fetch_group_and_timeline',
				async () => Promise.all([getScanGroupByID(group), getScanTimeline(group)]),
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

			let priorOppositeScan = findPairedScan(groupScans, thisScan);

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
			const canUpdateScan = !scanGroup.created_by || scanGroup.created_by === userId;

			return {
				system: thisScan.system,
				isPublic: Boolean(scanGroup.public),
				canEditSystem,
				canUpdateScan,
				created_at: thisScan.created_at,
				local: localScan ? localScan.data : null,
				directional: directionalScan ? directionalScan.data : null,
				related: groupScans,
				// The other scan type shown alongside this one (latest earlier scan of the
				// other type in the group), so the page can say how old that data is.
				pairedScan: priorOppositeScan
					? {
							id: priorOppositeScan.id,
							scan_type: priorOppositeScan.scan_type,
							created_at: priorOppositeScan.created_at
						}
					: null,
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
