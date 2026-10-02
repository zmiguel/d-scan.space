/**
 * EVE character ownership checks for Auth.js.
 *
 * Accounts are keyed by CharacterID, which never changes when a character is sold or
 * transferred to another EVE account. EVE SSO exposes a CharacterOwnerHash that *does*
 * change on transfer, so it is stored per linked character (`auth.account.character_owner_hash`)
 * and compared:
 *
 * - on sign-in (`enforceOwnerOnSignIn`): a changed hash unlinks the character from the
 *   previous user before Auth.js resolves the account, so the new owner gets a fresh
 *   user (or links it to the user they are signed in as) instead of the old account;
 * - on every session read (`validateSessionOwner`): sessions whose sign-in character was
 *   unlinked, moved to another user, or now has a different owner are dropped.
 */
import logger from '../logger.js';
import {
	detachTransferredCharacter,
	getEveAccount,
	parseCharacterId,
	setEveAccountOwnerHash
} from '../database/accounts.js';

export const SIGN_IN_OUTCOME = Object.freeze({
	/** Character not linked yet; Auth.js links it and the hash is stored afterwards. */
	NEW_LINK: 'new_link',
	/** Stored hash matches the current owner. */
	MATCH: 'match',
	/** Linked before hashes were tracked (and not backfilled); trust on first use. */
	ADOPT: 'adopt',
	/** Stored hash differs: the character changed EVE account. */
	TRANSFERRED: 'transferred'
});

/**
 * @param {{ ownerHash: string | null } | null} storedAccount
 * @param {string} ownerHash hash reported by EVE SSO for this sign-in
 */
export function classifySignIn(storedAccount, ownerHash) {
	if (!storedAccount) return SIGN_IN_OUTCOME.NEW_LINK;
	if (!storedAccount.ownerHash) return SIGN_IN_OUTCOME.ADOPT;
	return storedAccount.ownerHash === ownerHash
		? SIGN_IN_OUTCOME.MATCH
		: SIGN_IN_OUTCOME.TRANSFERRED;
}

/**
 * Auth.js `signIn` callback body for EVE profiles.
 * @param {{ CharacterID?: unknown, CharacterOwnerHash?: string } | undefined} profile
 * @returns {Promise<boolean>} whether the sign-in may proceed
 */
export async function enforceOwnerOnSignIn(profile) {
	const characterId = parseCharacterId(profile?.CharacterID);
	const ownerHash = profile?.CharacterOwnerHash;

	if (!characterId || !ownerHash) {
		// EVE SSO always returns both; refusing is safer than linking blindly.
		logger.error({ characterId }, 'EVE sign-in rejected: profile lacks CharacterID or owner hash');
		return false;
	}

	const stored = await getEveAccount(characterId);
	const outcome = classifySignIn(stored, ownerHash);

	if (outcome === SIGN_IN_OUTCOME.ADOPT) {
		await setEveAccountOwnerHash(characterId, ownerHash);
	} else if (outcome === SIGN_IN_OUTCOME.TRANSFERRED) {
		const previousUserId = await detachTransferredCharacter(characterId);
		logger.warn(
			{ characterId, previousUserId },
			'EVE character changed owner; unlinked it from the previous user'
		);
	}

	return true;
}

/**
 * @param {{ sub?: string, characterOwnerHash?: string }} token
 * @param {{ userId: string, ownerHash: string | null } | null} storedAccount
 */
export function isSessionBindingValid(token, storedAccount) {
	if (!storedAccount || storedAccount.userId !== token.sub) return false;
	if (
		storedAccount.ownerHash &&
		token.characterOwnerHash &&
		storedAccount.ownerHash !== token.characterOwnerHash
	) {
		return false;
	}
	return true;
}

/**
 * Auth.js `jwt` callback check for existing sessions.
 * Fails open on database errors so a DB hiccup does not sign everyone out.
 * @param {{ sub?: string, characterId?: unknown, characterOwnerHash?: string }} token
 * @returns {Promise<boolean>} false when the session must be dropped
 */
export async function validateSessionOwner(token) {
	const characterId = parseCharacterId(token?.characterId);
	if (!token?.sub || !characterId) {
		return true;
	}

	let stored;
	try {
		stored = await getEveAccount(characterId);
	} catch (err) {
		logger.error({ err, characterId }, 'Session owner check failed; keeping session');
		return true;
	}

	const valid = isSessionBindingValid(token, stored);
	if (!valid) {
		logger.warn(
			{ characterId, userId: token.sub },
			'Session dropped: character no longer linked to this user/owner'
		);
	}
	return valid;
}
