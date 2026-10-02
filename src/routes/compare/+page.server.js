import { getScanByID, getScanTimeline } from '$lib/database/scans.js';
import { withSpan } from '$lib/server/tracer.js';
import { comparePath, parseScanReference } from '$lib/utils/scanRef.js';
import { redirect } from '@sveltejs/kit';

const TYPE_LABEL = { local: 'local scan', directional: 'd-scan' };

/**
 * Latest scan of a type in a group other than `excludeId` (a pasted group link means
 * "the latest scan of that group").
 */
async function latestOfType(groupId, scanType, excludeId) {
	const timeline = await getScanTimeline(groupId);
	const match = timeline.filter((s) => s.scan_type === scanType && s.id !== excludeId).at(-1);
	return match ? { id: match.id, scan_type: match.scan_type, created_at: match.created_at } : null;
}

/**
 * `/compare?a=…&b=…`: resolves two pasted scan links / group links / ids and redirects to
 * `/compare/<older>/<newer>`. Without both inputs (or when they can't be compared) the page
 * shows the form with a message.
 */
export async function load(event) {
	return await withSpan(
		'route.compare.load',
		async (span) => {
			const a = event.url.searchParams.get('a') ?? '';
			const b = event.url.searchParams.get('b') ?? '';
			if (!a.trim() && !b.trim()) return { a, b, message: null };

			const fail = (reason, message) => {
				span.setAttributes({ 'compare.result': reason });
				return { a, b, message };
			};

			const refA = parseScanReference(a);
			const refB = parseScanReference(b);
			if (!refA || !refB) {
				return fail('invalid_reference', 'Paste two scan links (or scan ids) to compare.');
			}
			if (!('scan' in refA) && !('scan' in refB)) {
				return fail(
					'two_groups',
					'At least one link needs to point at a specific scan, not just a scan group.'
				);
			}

			const fetchScan = async (id) => (await getScanByID(id))?.[0] ?? null;
			const [scanA, scanB] = await Promise.all([
				'scan' in refA ? fetchScan(refA.scan) : null,
				'scan' in refB ? fetchScan(refB.scan) : null
			]);
			if (('scan' in refA && !scanA) || ('scan' in refB && !scanB)) {
				return fail('not_found', 'Scan not found. Check the link.');
			}

			const anchor = scanA ?? scanB;
			const [first, second] = await Promise.all([
				scanA ?? latestOfType(refA.group, anchor.scan_type, anchor.id),
				scanB ?? latestOfType(refB.group, anchor.scan_type, anchor.id)
			]);
			if (!first || !second) {
				return fail('no_match', `That scan group has no other ${TYPE_LABEL[anchor.scan_type]}.`);
			}
			if (first.scan_type !== second.scan_type) {
				return fail(
					'type_mismatch',
					`Only scans of the same type can be compared (a ${TYPE_LABEL[first.scan_type]} and a ${TYPE_LABEL[second.scan_type]}).`
				);
			}
			if (first.id === second.id) return fail('same_scan', 'Pick two different scans.');

			const [before, after] =
				new Date(second.created_at) < new Date(first.created_at)
					? [second, first]
					: [first, second];
			span.setAttributes({ 'compare.result': 'redirect' });
			redirect(303, comparePath(before.id, after.id));
		},
		{ 'route.id': 'compare' },
		{},
		event
	);
}
