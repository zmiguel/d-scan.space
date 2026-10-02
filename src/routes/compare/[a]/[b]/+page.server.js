import { getScanByID, getScanTimeline } from '$lib/database/scans.js';
import { withSpan } from '$lib/server/tracer.js';
import { diffDirectional, diffLocal } from '$lib/utils/scanDiff.js';
import { error } from '@sveltejs/kit';

const describeScan = (scan) => ({
	id: scan.id,
	group_id: scan.group_id,
	created_at: scan.created_at,
	system: scan.system ?? null
});

/**
 * `/compare/<before>/<after>`: difference between two scans of the same type, from any
 * groups. Only the diff (not both scans) is sent to the browser.
 */
export async function load(event) {
	return await withSpan(
		'route.compare_detail.load',
		async (span) => {
			const { a, b } = event.params;
			span.setAttributes({ 'compare.before_id': a, 'compare.after_id': b });
			if (a === b) error(400, 'Pick two different scans to compare.');

			const [beforeRows, afterRows] = await withSpan(
				'route.compare_detail.fetch_scans',
				async () => Promise.all([getScanByID(a), getScanByID(b)]),
				{ 'operation.type': 'read' }
			);
			const before = beforeRows?.[0];
			const after = afterRows?.[0];
			if (!before || !after) {
				span.setAttributes({ 'response.status': 404 });
				error(404, 'Scan not found');
			}
			if (before.scan_type !== after.scan_type) {
				span.setAttributes({ 'response.status': 400 });
				error(400, 'Only scans of the same type can be compared.');
			}

			const scanType = before.scan_type;
			const diff = await withSpan(
				'route.compare_detail.diff',
				async () =>
					scanType === 'local'
						? diffLocal(before.data, after.data)
						: diffDirectional(before.data, after.data),
				{ 'scan.type': scanType }
			);

			// Same-type scans of both groups, for the pickers.
			const groupIds = [...new Set([before.group_id, after.group_id])];
			const timelines = await Promise.all(groupIds.map((groupId) => getScanTimeline(groupId)));
			const choices = timelines
				.flatMap((timeline, index) =>
					timeline
						.filter((scan) => scan.scan_type === scanType)
						.map((scan) => ({
							id: scan.id,
							group_id: groupIds[index],
							created_at: scan.created_at
						}))
				)
				.sort((x, y) => new Date(y.created_at).getTime() - new Date(x.created_at).getTime());

			const systemsDiffer =
				Boolean(before.system?.id && after.system?.id) && before.system.id !== after.system.id;
			span.setAttributes({
				'scan.type': scanType,
				'compare.same_group': before.group_id === after.group_id,
				'compare.systems_differ': systemsDiffer
			});

			return {
				scanType,
				before: describeScan(before),
				after: describeScan(after),
				systemsDiffer,
				diff,
				choices
			};
		},
		{ 'route.id': 'compare_detail' },
		{},
		event
	);
}
