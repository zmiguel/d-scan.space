/**
 * DB helpers for EVE Online accounts linked through Auth.js
 * (`auth.account` rows with provider `eveonline`, keyed by CharacterID).
 */
import { and, eq } from 'drizzle-orm';
import { db } from './client.js';
import { authAccounts, authUsers } from './schema.js';

export const EVE_PROVIDER = 'eveonline';

/**
 * @param {unknown} value
 * @returns {number | null} positive integer character id, or null
 */
export function parseCharacterId(value) {
	const id = Number(value);
	return Number.isInteger(id) && id > 0 ? id : null;
}

/**
 * @param {number | null} characterId
 * @param {number} [size]
 * @returns {string | null}
 */
export function characterImage(characterId, size = 128) {
	return characterId ? `https://image.eveonline.com/Character/${characterId}_${size}.jpg` : null;
}

function eveAccountWhere(characterId) {
	return and(
		eq(authAccounts.provider, EVE_PROVIDER),
		eq(authAccounts.providerAccountId, String(characterId))
	);
}

/**
 * Linked account for a character, regardless of which user owns it.
 * @param {number} characterId
 * @returns {Promise<{ userId: string, ownerHash: string | null } | null>}
 */
export async function getEveAccount(characterId) {
	const [row] = await db
		.select({ userId: authAccounts.userId, ownerHash: authAccounts.character_owner_hash })
		.from(authAccounts)
		.where(eveAccountWhere(characterId))
		.limit(1);
	return row ?? null;
}

/**
 * Records the owner hash of an already linked character.
 * @param {number} characterId
 * @param {string} ownerHash
 */
export async function setEveAccountOwnerHash(characterId, ownerHash) {
	await db
		.update(authAccounts)
		.set({ character_owner_hash: ownerHash })
		.where(eveAccountWhere(characterId));
}

/**
 * Unlinks a character that now belongs to a different EVE account (it was sold or
 * transferred). The previous D-Scan Space user keeps its scans and other characters;
 * if the removed character was its primary, another linked character is promoted.
 *
 * @param {number} characterId
 * @returns {Promise<string | null>} id of the user the character was detached from
 */
export async function detachTransferredCharacter(characterId) {
	return db.transaction(async (tx) => {
		const [removed] = await tx
			.delete(authAccounts)
			.where(eveAccountWhere(characterId))
			.returning({ userId: authAccounts.userId });

		if (!removed) {
			return null;
		}

		const [user] = await tx
			.select({ primaryCharacterId: authUsers.primary_character_id })
			.from(authUsers)
			.where(eq(authUsers.id, removed.userId))
			.limit(1);

		if (user?.primaryCharacterId === characterId) {
			const [replacement] = await tx
				.select({
					providerAccountId: authAccounts.providerAccountId,
					characterName: authAccounts.character_name,
					characterImage: authAccounts.character_image
				})
				.from(authAccounts)
				.where(
					and(eq(authAccounts.userId, removed.userId), eq(authAccounts.provider, EVE_PROVIDER))
				)
				.limit(1);

			const replacementId = parseCharacterId(replacement?.providerAccountId);
			await tx
				.update(authUsers)
				.set(
					replacementId
						? {
								primary_character_id: replacementId,
								name: replacement.characterName ?? `Character ${replacementId}`,
								image: replacement.characterImage ?? characterImage(replacementId)
							}
						: { primary_character_id: null }
				)
				.where(eq(authUsers.id, removed.userId));
		}

		return removed.userId;
	});
}
