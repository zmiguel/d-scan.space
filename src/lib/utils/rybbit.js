export function getRybbitIdentity(session) {
	const userId = session?.user?.id ?? null;
	if (!userId) {
		return null;
	}

	const username = session?.eve?.characterName ?? session?.user?.name ?? null;

	return {
		userId: String(userId),
		traits: {
			username,
			name: username
		}
	};
}

export function syncRybbitIdentity(rybbit, session) {
	if (!rybbit) {
		return;
	}

	const identity = getRybbitIdentity(session);

	if (identity) {
		if (typeof rybbit.identify === 'function') {
			rybbit.identify(identity.userId, identity.traits);
		}
		return;
	}

	if (typeof rybbit.clearUserId === 'function') {
		rybbit.clearUserId();
	}
}
