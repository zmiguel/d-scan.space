import { signIn } from '$auth';

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
	return signIn(event);
}
