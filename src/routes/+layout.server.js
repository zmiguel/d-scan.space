/** @type {import('./$types').LayoutServerLoad} */
export async function load(event) {
	return {
		session: await event.locals.auth()
	};
}
