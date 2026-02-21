import { signOut } from '$auth';

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
	return signOut(event);
}
