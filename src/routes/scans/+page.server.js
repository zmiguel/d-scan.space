import { getPublicScansPage } from '$lib/database/scans.js';
import { parseScanListParams, toScanListData } from '$lib/server/scan-list.js';
import { withSpan } from '$lib/server/tracer';

export async function load(event) {
	return await withSpan(
		'route.scans.load',
		async (span) => {
			const filters = parseScanListParams(event.url);

			const result = await withSpan(
				'route.scans.fetch_public',
				async () => {
					return await getPublicScansPage(filters);
				},
				{
					'operation.type': 'read',
					'database.table': 'scans'
				}
			);

			span.setAttributes({
				'scans.public_count': result.total,
				'scans.page': result.page,
				'scans.filter.type': filters.type || 'all',
				'scans.filter.has_query': filters.query !== '',
				'page.type': 'public_scans_list'
			});

			return toScanListData(result, filters);
		},
		{
			'route.id': 'scans'
		},
		{},
		event
	);
}
