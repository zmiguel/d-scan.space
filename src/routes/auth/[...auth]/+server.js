import { authHandle } from '$auth';

/**
 * Explicit catch-all Auth.js endpoint for /auth/* routes
 * (e.g. /auth/callback/eveonline, /auth/signin, /auth/signout).
 */
async function delegateToAuthHandle(event) {
	return authHandle({
		event,
		resolve: () => new Response('Not Found', { status: 404 })
	});
}

/** @type {import('./$types').RequestHandler} */
export async function GET(event) {
	return delegateToAuthHandle(event);
}

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
	return delegateToAuthHandle(event);
}
