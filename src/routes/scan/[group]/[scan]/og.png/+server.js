import { getScanByID, getScanTimeline } from '$lib/database/scans.js';
import { buildScanOgSvg } from '$lib/server/og-image.js';
import { renderPng } from '$lib/server/og-render.js';
import { findPairedScan } from '$lib/server/scan-pairing.js';
import { withSpan } from '$lib/server/tracer.js';
import { error } from '@sveltejs/kit';

/**
 * `/scan/<group>/<scan>/og.png`: link preview image of a scan (Open Graph). Anyone with
 * the scan link can open the scan, so the image needs no extra access check.
 */
export async function GET(event) {
	return await withSpan(
		'route.scan_og.get',
		async (span) => {
			const { group, scan } = event.params;
			span.setAttributes({ 'scan.group_id': group, 'scan.id': scan });

			const thisScan = (await getScanByID(scan))?.[0];
			if (!thisScan || thisScan.group_id !== group) error(404, 'Scan not found');

			const paired = findPairedScan(await getScanTimeline(group), thisScan);
			const pairedScan = paired ? (await getScanByID(paired.id))?.[0] : null;
			const byType = (type) =>
				thisScan.scan_type === type
					? thisScan.data
					: pairedScan?.scan_type === type
						? pairedScan.data
						: null;

			const png = await withSpan('route.scan_og.render', async () =>
				renderPng(
					buildScanOgSvg({
						system: thisScan.system,
						createdAt: thisScan.created_at,
						local: byType('local'),
						directional: byType('directional')
					})
				)
			);

			return new Response(png, {
				headers: {
					'content-type': 'image/png',
					// A scan never changes; its group can gain a system once, so revalidate daily.
					'cache-control': 'public, max-age=86400'
				}
			});
		},
		{ 'route.id': 'scan_og' },
		{},
		event
	);
}
