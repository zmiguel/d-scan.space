import { json } from '@sveltejs/kit';
import { searchSystemsByName } from '$lib/database/sde.js';
import { withSpan } from '$lib/server/tracer.js';

export async function GET(event) {
	return await withSpan(
		'route.api.systems.search',
		async (span) => {
			const session = await event.locals.auth();
			const userId = session?.user?.id ?? null;

			if (!userId) {
				span.setAttributes({
					'auth.logged_in': false,
					'response.status': 401
				});
				return json({ message: 'Unauthorized' }, { status: 401 });
			}

			const query = event.url.searchParams.get('q') ?? '';
			const limitParam = Number(event.url.searchParams.get('limit') ?? '10');
			const systems = await searchSystemsByName(query, limitParam);

			span.setAttributes({
				'auth.logged_in': true,
				'user.id': userId,
				'system.search_query': query,
				'system.results_count': systems.length
			});

			return json({ systems });
		},
		{},
		{},
		event
	);
}
