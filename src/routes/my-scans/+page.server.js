import { getScansByUser } from '$lib/database/scans.js';
import { withSpan } from '$lib/server/tracer';

export async function load(event) {
	return await withSpan(
		'route.my_scans.load',
		async (span) => {
			const session = await event.locals.auth();
			const userId = session?.user?.id ?? null;
			const primaryCharacterName = session?.eve?.characterName ?? session?.user?.name ?? null;

			if (!userId) {
				span.setAttributes({
					'page.type': 'my_scans_list',
					'auth.logged_in': false
				});

				return {
					requiresLogin: true,
					scans: []
				};
			}

			const scans = await withSpan(
				'route.my_scans.fetch_user_scans',
				async () => {
					return await getScansByUser(userId);
				},
				{
					'operation.type': 'read',
					'database.table': 'scans',
					'user.id': userId
				}
			);

			span.setAttributes({
				'scans.user_count': scans?.length || 0,
				'page.type': 'my_scans_list',
				'auth.logged_in': true,
				'user.id': userId,
				'user.primary_character_name': primaryCharacterName ?? 'unknown'
			});

			return {
				requiresLogin: false,
				scans
			};
		},
		{
			'route.id': 'my-scans'
		},
		{},
		event
	);
}
