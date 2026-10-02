import { env } from '$env/dynamic/private';
import logger from '$lib/logger';
import { SvelteKitAuth } from '@auth/sveltekit';
import EveOnline from '@auth/sveltekit/providers/eveonline';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { db } from '$lib/database/client';
import {
	authAccounts,
	authAuthenticators,
	authSessions,
	authUsers,
	authVerificationTokens
} from '$lib/database/schema';
import { EVE_PROVIDER, characterImage, parseCharacterId } from '$lib/database/accounts';
import { enforceOwnerOnSignIn, validateSessionOwner } from '$lib/server/eve-ownership';
import { and, eq } from 'drizzle-orm';

/** Token fields older versions stored in the session JWT; removed on the next refresh. */
const LEGACY_TOKEN_FIELDS = [
	'accessToken',
	'refreshToken',
	'idToken',
	'rawProfile',
	'scope',
	'tokenType',
	'sessionState',
	'accessTokenExpiresAt',
	'tokenExpiresOn',
	'esiScopes',
	'esiTokenType',
	'intellectualProperty',
	'accountType'
];

/**
 * Drizzle adapter that never persists OAuth tokens. The app only uses EVE SSO for
 * identity (`publicData` scope) and makes no authenticated ESI calls, so storing
 * access/refresh tokens would only create a liability.
 */
function createAdapter() {
	const adapter = DrizzleAdapter(db, {
		usersTable: authUsers,
		accountsTable: authAccounts,
		sessionsTable: authSessions,
		verificationTokensTable: authVerificationTokens,
		authenticatorsTable: authAuthenticators
	});
	const linkAccount = adapter.linkAccount.bind(adapter);
	adapter.linkAccount = (account) =>
		linkAccount({ ...account, access_token: null, refresh_token: null, id_token: null });
	return adapter;
}

async function ensurePrimaryCharacter(userId, profile) {
	if (!userId || !profile) {
		return;
	}

	const characterId = parseCharacterId(profile.CharacterID);
	if (!characterId) {
		return;
	}

	const [currentUser] = await db
		.select({
			primaryCharacterId: authUsers.primary_character_id,
			name: authUsers.name,
			image: authUsers.image
		})
		.from(authUsers)
		.where(eq(authUsers.id, userId))
		.limit(1);

	if (!currentUser || currentUser.primaryCharacterId) {
		return;
	}

	await db
		.update(authUsers)
		.set({
			primary_character_id: characterId,
			name: profile.CharacterName ?? currentUser.name,
			image: characterImage(characterId) ?? currentUser.image
		})
		.where(eq(authUsers.id, userId));
}

/** Refreshes name/portrait and records the owner hash of the character that just signed in. */
async function updateLinkedCharacter(userId, profile) {
	if (!userId || !profile) {
		return;
	}

	const characterId = parseCharacterId(profile.CharacterID);
	if (!characterId) {
		return;
	}

	await db
		.update(authAccounts)
		.set({
			character_name: profile.CharacterName ?? null,
			character_image: characterImage(characterId),
			...(profile.CharacterOwnerHash ? { character_owner_hash: profile.CharacterOwnerHash } : {})
		})
		.where(
			and(
				eq(authAccounts.userId, userId),
				eq(authAccounts.provider, EVE_PROVIDER),
				eq(authAccounts.providerAccountId, String(characterId))
			)
		);
}

export const {
	handle: authHandle,
	signIn,
	signOut
} = SvelteKitAuth({
	trustHost: true,
	adapter: createAdapter(),
	session: {
		strategy: 'jwt'
	},
	providers: [
		EveOnline({
			clientId: env.AUTH_EVEONLINE_ID,
			clientSecret: env.AUTH_EVEONLINE_SECRET
		})
	],
	callbacks: {
		// Runs after EVE SSO returns and before Auth.js looks up/links the account.
		async signIn({ account, profile }) {
			if (account?.provider !== EVE_PROVIDER) {
				return true;
			}
			return enforceOwnerOnSignIn(profile);
		},
		async jwt({ token, account, profile, user }) {
			const userId = token.sub ?? user?.id ?? null;

			for (const field of LEGACY_TOKEN_FIELDS) {
				delete token[field];
			}

			if (!account) {
				// Existing session: drop it if its character was transferred or unlinked.
				return (await validateSessionOwner(token)) ? token : null;
			}

			token.provider = account.provider;
			token.providerAccountId = account.providerAccountId;

			if (profile) {
				token.id = String(profile.CharacterID ?? token.id ?? '');
				token.characterId = profile.CharacterID ?? token.characterId;
				token.characterName = profile.CharacterName ?? token.characterName;
				token.characterOwnerHash = profile.CharacterOwnerHash ?? token.characterOwnerHash;
			}

			if (user) {
				token.userName = user.name ?? token.userName;
				token.userImage = user.image ?? token.userImage;
				token.userEmail = user.email ?? token.userEmail;
			}

			if (userId && profile && account.provider === EVE_PROVIDER) {
				try {
					await ensurePrimaryCharacter(userId, profile);
					await updateLinkedCharacter(userId, profile);
				} catch (error) {
					logger.error({ err: error }, 'Failed to sync character data during login');
				}
			}

			return token;
		},
		async session({ session, token }) {
			const userId = token.sub ?? null;
			let primaryCharacterId = parseCharacterId(token.characterId);
			let primaryName = token.userName ?? session.user?.name ?? token.characterName ?? null;
			let primaryImage =
				token.userImage ?? session.user?.image ?? characterImage(primaryCharacterId);
			let linkedCharacters = [];

			if (userId) {
				const [dbUser] = await db
					.select({
						name: authUsers.name,
						image: authUsers.image,
						primaryCharacterId: authUsers.primary_character_id
					})
					.from(authUsers)
					.where(eq(authUsers.id, userId))
					.limit(1);

				const linkedAccounts = await db
					.select({
						providerAccountId: authAccounts.providerAccountId,
						characterName: authAccounts.character_name,
						characterImage: authAccounts.character_image
					})
					.from(authAccounts)
					.where(and(eq(authAccounts.userId, userId), eq(authAccounts.provider, EVE_PROVIDER)));

				linkedCharacters = linkedAccounts
					.map((linkedAccount) => {
						const linkedCharacterId = parseCharacterId(linkedAccount.providerAccountId);
						if (!linkedCharacterId) {
							return null;
						}

						return {
							characterId: linkedCharacterId,
							name: linkedAccount.characterName ?? `Character ${linkedCharacterId}`,
							image: linkedAccount.characterImage ?? characterImage(linkedCharacterId)
						};
					})
					.filter(Boolean);

				primaryCharacterId = dbUser?.primaryCharacterId ?? primaryCharacterId;
				const primaryCharacter =
					linkedCharacters.find(
						(linkedCharacter) => linkedCharacter.characterId === primaryCharacterId
					) ?? null;

				primaryName = dbUser?.name ?? primaryCharacter?.name ?? primaryName;
				primaryImage = dbUser?.image ?? primaryCharacter?.image ?? primaryImage;
				linkedCharacters = linkedCharacters.map((linkedCharacter) => ({
					...linkedCharacter,
					isPrimary: linkedCharacter.characterId === primaryCharacterId
				}));
			}

			session.user = {
				...session.user,
				id: userId,
				name: primaryName,
				image: primaryImage
			};

			session.eve = {
				characterId: primaryCharacterId,
				characterName: primaryName,
				linkedCharacters
			};

			return session;
		}
	}
});
