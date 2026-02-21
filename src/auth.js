import { env } from '$env/dynamic/private';
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
import { and, eq } from 'drizzle-orm';

const isDevelopment = env.NODE_ENV !== 'production';
const EVE_PROVIDER = 'eveonline';

function parseCharacterId(value) {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
}

function characterImage(characterId, size = 128) {
	return characterId ? `https://image.eveonline.com/Character/${characterId}_${size}.jpg` : null;
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
			character_image: characterImage(characterId)
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
	adapter: DrizzleAdapter(db, {
		usersTable: authUsers,
		accountsTable: authAccounts,
		sessionsTable: authSessions,
		verificationTokensTable: authVerificationTokens,
		authenticatorsTable: authAuthenticators
	}),
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
		async jwt({ token, account, profile, user }) {
			const userId = token.sub ?? user?.id ?? null;

			if (account) {
				token.provider = account.provider;
				token.providerAccountId = account.providerAccountId;
				token.accountType = account.type;
				token.scope = account.scope;
				token.tokenType = account.token_type;
				token.sessionState = account.session_state;
				token.accessToken = account.access_token;
				token.refreshToken = account.refresh_token;
				token.idToken = account.id_token;
				token.accessTokenExpiresAt = account.expires_at;
			}

			if (profile) {
				token.id = String(profile.CharacterID ?? token.id ?? '');
				token.characterId = profile.CharacterID ?? token.characterId;
				token.characterName = profile.CharacterName ?? token.characterName;
				token.characterOwnerHash = profile.CharacterOwnerHash ?? token.characterOwnerHash;
				token.tokenExpiresOn = profile.ExpiresOn ?? token.tokenExpiresOn;
				token.esiScopes = profile.Scopes ?? token.esiScopes;
				token.esiTokenType = profile.TokenType ?? token.esiTokenType;
				token.intellectualProperty = profile.IntellectualProperty ?? token.intellectualProperty;
				token.rawProfile = profile;
			}

			if (user) {
				token.userName = user.name ?? token.userName;
				token.userImage = user.image ?? token.userImage;
				token.userEmail = user.email ?? token.userEmail;
			}

			if (userId && profile && account?.provider === EVE_PROVIDER) {
				try {
					await ensurePrimaryCharacter(userId, profile);
					await updateLinkedCharacter(userId, profile);
				} catch (error) {
					void error;
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
				provider: token.provider,
				providerAccountId: token.providerAccountId,
				accountType: token.accountType,
				characterId: primaryCharacterId,
				characterName: primaryName,
				characterOwnerHash: token.characterOwnerHash,
				intellectualProperty: token.intellectualProperty,
				tokenType: token.tokenType ?? token.esiTokenType,
				scope: token.scope,
				esiScopes: token.esiScopes,
				tokenExpiresOn: token.tokenExpiresOn,
				accessTokenExpiresAt: token.accessTokenExpiresAt,
				sessionState: token.sessionState,
				linkedCharacters
			};

			if (isDevelopment) {
				session.eveDebug = {
					accessToken: token.accessToken,
					refreshToken: token.refreshToken,
					idToken: token.idToken,
					rawProfile: token.rawProfile
				};
			}

			return session;
		}
	}
});
