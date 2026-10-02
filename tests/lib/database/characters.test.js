import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock dependencies
const mockSpan = {
	setAttributes: vi.fn(),
	setStatus: vi.fn(),
	addEvent: vi.fn()
};

vi.mock('../../../src/lib/server/tracer.js', () => ({
	withSpan: vi.fn((name, fn) => fn(mockSpan))
}));

const { mockDb } = vi.hoisted(() => {
	return {
		mockDb: {
			select: vi.fn(),
			insert: vi.fn(),
			update: vi.fn()
		}
	};
});

vi.mock('../../../src/lib/database/client.js', () => ({
	db: mockDb
}));

vi.mock('../../../src/lib/database/schema.js', () => ({
	characters: {
		id: 'characters.id',
		name: 'characters.name',
		sec_status: 'characters.sec_status',
		corporation_id: 'characters.corporation_id',
		alliance_id: 'characters.alliance_id',
		last_seen: 'characters.last_seen',
		updated_at: 'characters.updated_at',
		esi_cache_expires: 'characters.esi_cache_expires',
		deleted_at: 'characters.deleted_at'
	},
	corporations: { id: 'corporations.id', name: 'corporations.name', ticker: 'corporations.ticker' },
	alliances: { id: 'alliances.id', name: 'alliances.name', ticker: 'alliances.ticker' }
}));

import {
	addOrUpdateCharactersDB,
	updateCharactersLastSeen,
	biomassCharacters
} from '../../../src/lib/database/characters.js';

function mockUpdateChain() {
	const chain = {
		set: vi.fn().mockReturnThis(),
		where: vi.fn().mockReturnThis(),
		then: (resolve) => resolve()
	};
	mockDb.update.mockReturnValue(chain);
	return chain;
}

describe('database/characters', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('addOrUpdateCharactersDB', () => {
		it('writes one row per id (last wins) with normalized columns', async () => {
			const insert = {
				values: vi.fn().mockReturnThis(),
				onConflictDoUpdate: vi.fn().mockResolvedValue()
			};
			mockDb.insert.mockReturnValue(insert);

			await addOrUpdateCharactersDB([
				{ id: 1, name: 'bob', security_status: -2.5, corporation_id: 10 },
				{ id: 2, name: 'Alice', sec_status: 1.2, corporation_id: 11, alliance_id: 99 },
				{ id: 1, name: 'Bob', security_status: -2.5, corporation_id: 10 }
			]);

			expect(insert.values).toHaveBeenCalledTimes(1);
			expect(insert.values.mock.calls[0][0]).toEqual([
				{
					id: 1,
					name: 'Bob',
					sec_status: -2.5,
					corporation_id: 10,
					alliance_id: null,
					esi_cache_expires: null
				},
				{
					id: 2,
					name: 'Alice',
					sec_status: 1.2,
					corporation_id: 11,
					alliance_id: 99,
					esi_cache_expires: null
				}
			]);
		});

		it('writes nothing for an empty list', async () => {
			await addOrUpdateCharactersDB([]);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});
	});

	describe('updateCharactersLastSeen', () => {
		it('writes nothing for an empty list', async () => {
			await updateCharactersLastSeen([]);
			expect(mockDb.update).not.toHaveBeenCalled();
		});
	});

	describe('biomassCharacters', () => {
		it.each([[[]], [null], [undefined]])('writes nothing for %j', async (ids) => {
			await biomassCharacters(ids);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('moves characters to Doomheim, drops the alliance and marks them deleted', async () => {
			const update = mockUpdateChain();

			await biomassCharacters([1, 2]);

			expect(update.set).toHaveBeenCalledTimes(1);
			expect(update.set).toHaveBeenCalledWith(
				expect.objectContaining({
					corporation_id: 1000001,
					alliance_id: null,
					deleted_at: expect.anything()
				})
			);
		});
	});
});
