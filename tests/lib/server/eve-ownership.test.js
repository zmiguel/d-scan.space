import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetEveAccount, mockSetOwnerHash, mockDetach } = vi.hoisted(() => ({
	mockGetEveAccount: vi.fn(),
	mockSetOwnerHash: vi.fn(),
	mockDetach: vi.fn()
}));

vi.mock('../../../src/lib/database/accounts.js', () => ({
	getEveAccount: mockGetEveAccount,
	setEveAccountOwnerHash: mockSetOwnerHash,
	detachTransferredCharacter: mockDetach,
	parseCharacterId: (value) => {
		const id = Number(value);
		return Number.isInteger(id) && id > 0 ? id : null;
	}
}));

vi.mock('../../../src/lib/logger.js', () => ({
	default: { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
}));

import {
	enforceOwnerOnSignIn,
	validateSessionOwner
} from '../../../src/lib/server/eve-ownership.js';

const profile = { CharacterID: 1001, CharacterOwnerHash: 'owner-a' };

describe('enforceOwnerOnSignIn', () => {
	beforeEach(() => vi.clearAllMocks());

	it('lets a never-linked character through without touching accounts', async () => {
		mockGetEveAccount.mockResolvedValue(null);

		await expect(enforceOwnerOnSignIn(profile)).resolves.toBe(true);
		expect(mockSetOwnerHash).not.toHaveBeenCalled();
		expect(mockDetach).not.toHaveBeenCalled();
	});

	it('keeps the link when the owner hash matches', async () => {
		mockGetEveAccount.mockResolvedValue({ userId: 'u1', ownerHash: 'owner-a' });

		await expect(enforceOwnerOnSignIn(profile)).resolves.toBe(true);
		expect(mockDetach).not.toHaveBeenCalled();
	});

	it('adopts the current hash for legacy links without one', async () => {
		mockGetEveAccount.mockResolvedValue({ userId: 'u1', ownerHash: null });

		await expect(enforceOwnerOnSignIn(profile)).resolves.toBe(true);
		expect(mockSetOwnerHash).toHaveBeenCalledWith(1001, 'owner-a');
		expect(mockDetach).not.toHaveBeenCalled();
	});

	it('unlinks a transferred character from the previous user before Auth.js resolves it', async () => {
		mockGetEveAccount.mockResolvedValue({ userId: 'seller', ownerHash: 'owner-old' });
		mockDetach.mockResolvedValue('seller');

		await expect(enforceOwnerOnSignIn(profile)).resolves.toBe(true);
		expect(mockDetach).toHaveBeenCalledWith(1001);
		expect(mockSetOwnerHash).not.toHaveBeenCalled();
	});

	it('refuses profiles without an owner hash', async () => {
		await expect(enforceOwnerOnSignIn({ CharacterID: 1001 })).resolves.toBe(false);
		expect(mockGetEveAccount).not.toHaveBeenCalled();
	});
});

describe('validateSessionOwner', () => {
	beforeEach(() => vi.clearAllMocks());

	const token = { sub: 'u1', characterId: 1001, characterOwnerHash: 'owner-a' };

	it('keeps sessions whose character is still linked to the same user and owner', async () => {
		mockGetEveAccount.mockResolvedValue({ userId: 'u1', ownerHash: 'owner-a' });
		await expect(validateSessionOwner(token)).resolves.toBe(true);
	});

	it('drops sessions whose character was unlinked', async () => {
		mockGetEveAccount.mockResolvedValue(null);
		await expect(validateSessionOwner(token)).resolves.toBe(false);
	});

	it('drops sessions whose character now belongs to another user', async () => {
		mockGetEveAccount.mockResolvedValue({ userId: 'u2', ownerHash: 'owner-a' });
		await expect(validateSessionOwner(token)).resolves.toBe(false);
	});

	it("drops a buyer's old session into the seller's account (hash mismatch)", async () => {
		mockGetEveAccount.mockResolvedValue({ userId: 'u1', ownerHash: 'owner-seller' });
		await expect(
			validateSessionOwner({ ...token, characterOwnerHash: 'owner-buyer' })
		).resolves.toBe(false);
	});

	it('does not compare hashes when either side has none (legacy data)', async () => {
		mockGetEveAccount.mockResolvedValue({ userId: 'u1', ownerHash: null });
		await expect(validateSessionOwner(token)).resolves.toBe(true);

		mockGetEveAccount.mockResolvedValue({ userId: 'u1', ownerHash: 'owner-a' });
		await expect(validateSessionOwner({ sub: 'u1', characterId: 1001 })).resolves.toBe(true);
	});

	it('keeps the session when the database lookup fails', async () => {
		mockGetEveAccount.mockRejectedValue(new Error('db down'));
		await expect(validateSessionOwner(token)).resolves.toBe(true);
	});
});
