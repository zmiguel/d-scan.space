import { db } from '$lib/database/client';
import { authAccounts, authUsers } from '$lib/database/schema';
import { and, eq } from 'drizzle-orm';

const EVE_PROVIDER = 'eveonline';

function parseCharacterId(value) {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
}

function characterImage(characterId, size = 128) {
	return characterId ? `https://image.eveonline.com/Character/${characterId}_${size}.jpg` : null;
}

/** @type {import('./$types').RequestHandler} */
export async function POST(event) {
	const session = await event.locals.auth();
	if (!session?.user?.id) {
		return new Response('Unauthorized', { status: 401 });
	}

	const formData = await event.request.formData();
	const characterId = parseCharacterId(formData.get('characterId'));
	const redirectTo = String(formData.get('redirectTo') ?? '/');
	const safeRedirectTo = redirectTo.startsWith('/') ? redirectTo : '/';

	if (!characterId) {
		return new Response('Bad Request', { status: 400 });
	}

	const [linkedAccount] = await db
		.select({
			characterName: authAccounts.character_name,
			characterImage: authAccounts.character_image
		})
		.from(authAccounts)
		.where(
			and(
				eq(authAccounts.userId, session.user.id),
				eq(authAccounts.provider, EVE_PROVIDER),
				eq(authAccounts.providerAccountId, String(characterId))
			)
		)
		.limit(1);

	if (!linkedAccount) {
		return new Response('Bad Request', { status: 400 });
	}

	await db
		.update(authUsers)
		.set({
			primary_character_id: characterId,
			name: linkedAccount.characterName ?? `Character ${characterId}`,
			image: linkedAccount.characterImage ?? characterImage(characterId)
		})
		.where(eq(authUsers.id, session.user.id));

	return new Response(null, {
		status: 303,
		headers: {
			location: safeRedirectTo
		}
	});
}
