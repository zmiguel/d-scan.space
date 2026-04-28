import { getScansByGroupID, getScanGroupByID } from '$lib/database/scans.js';
import { withSpan } from '$lib/server/tracer.js';
import { error, redirect } from '@sveltejs/kit';

export async function load(event) {
	return await withSpan(
		'route.scan_group.load',
		async (span) => {
			const { group } = event.params;

			span.setAttributes({
				'scan.group_id': group,
				'page.type': 'scan_group_redirect'
			});

			const scanGroup = await getScanGroupByID(group);
			if (!scanGroup) {
				span.setAttributes({ 'scan.found': false, 'response.status': 404 });
				throw error(404, 'Scan group not found');
			}

			const groupScans = await getScansByGroupID(group);
			if (!groupScans || groupScans.length === 0) {
				span.setAttributes({ 'scan.found': false, 'response.status': 404 });
				throw error(404, 'No scans found in this group');
			}

			const latest = groupScans.reduce((a, b) =>
				new Date(a.created_at) > new Date(b.created_at) ? a : b
			);

			span.setAttributes({ 'scan.id': latest.id, 'scan.found': true });

			redirect(302, `/scan/${group}/${latest.id}`);
		},
		{ 'route.id': 'scan_group_redirect' },
		{},
		event
	);
}
