import { getPublicScans } from '$lib/database/scans.js';
import { withSpan } from '$lib/server/tracer';

export async function load(event) {
	return await withSpan(
		'page.load.public_scans',
		async (span) => {
			const scans = await withSpan(
				'database.get_public_scans',
				async () => {
					return await getPublicScans();
				},
				{
					'operation.type': 'read',
					'database.table': 'scans'
				}
			);

			span.setAttributes({
				'scans.public_count': scans?.length || 0,
				'page.type': 'public_scans_list'
			});

			return {
				scans: scans
			};
		},
		{
			'route.id': 'scans'
		},
		{},
		event
	);
}
