import { toClientSession } from '$lib/server/session';

/** @type {import('./$types').LayoutServerLoad} */
export async function load(event) {
	return {
		session: toClientSession(await event.locals.auth())
	};
}
