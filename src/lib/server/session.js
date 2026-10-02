/**
 * Shape of the session sent to the browser. Only the fields the UI renders
 * (navbar, character switcher, analytics identity) leave the server; the full
 * Auth.js session stays server-side.
 *
 * @param {any} session result of `locals.auth()`
 */
export function toClientSession(session) {
	if (!session?.user?.id) {
		return null;
	}

	return {
		user: {
			id: session.user.id,
			name: session.user.name ?? null,
			image: session.user.image ?? null
		},
		eve: {
			characterName: session.eve?.characterName ?? null,
			linkedCharacters: (session.eve?.linkedCharacters ?? []).map((character) => ({
				characterId: character.characterId,
				name: character.name,
				image: character.image,
				isPrimary: Boolean(character.isPrimary)
			}))
		}
	};
}
