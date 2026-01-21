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
	getCharactersByName,
	addOrUpdateCharactersDB,
	updateCharactersLastSeen,
	updateCharactersAllianceByCorporation,
	biomassCharacter,
	getAllCharacters,
	getLeastRecentlyUpdatedCharacters
} from '../../../src/lib/database/characters.js';

describe('database/characters', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getCharactersByName', () => {
		it('should fetch characters by name', async () => {
			const mockSelect = {
				from: vi.fn().mockReturnThis(),
				leftJoin: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue([{ id: 1, name: 'Char1' }])
			};
			mockDb.select.mockReturnValue(mockSelect);

			const result = await getCharactersByName(['Char1']);

			expect(mockDb.select).toHaveBeenCalled();
			expect(mockSelect.from).toHaveBeenCalled();
			expect(mockSelect.leftJoin).toHaveBeenCalledTimes(2); // corps and alliances
			expect(mockSelect.where).toHaveBeenCalled();
			expect(result).toEqual([{ id: 1, name: 'Char1' }]);
		});
	});

	describe('getAllCharacters', () => {
		it('should fetch all characters', async () => {
			const mockSelect = {
				from: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }])
			};
			mockDb.select.mockReturnValue(mockSelect);

			const result = await getAllCharacters();

			expect(mockDb.select).toHaveBeenCalled();
			expect(mockSelect.from).toHaveBeenCalled();
			expect(result).toHaveLength(2);
		});
	});

	describe('addOrUpdateCharactersDB', () => {
		it('should upsert characters', async () => {
			const data = [{ id: 1, name: 'Char1', corporation_id: 10 }];

			const mockInsert = {
				values: vi.fn().mockReturnThis(),
				onConflictDoUpdate: vi.fn().mockResolvedValue()
			};
			mockDb.insert.mockReturnValue(mockInsert);

			await addOrUpdateCharactersDB(data);

			expect(mockDb.insert).toHaveBeenCalled();
			expect(mockInsert.values).toHaveBeenCalled();
			expect(mockInsert.onConflictDoUpdate).toHaveBeenCalled();
		});

		it('should skip if data is empty', async () => {
			await addOrUpdateCharactersDB([]);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});
	});

	describe('updateCharactersLastSeen', () => {
		it('should do nothing if characterIDs is empty', async () => {
			await updateCharactersLastSeen([]);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should update last_seen for given characters', async () => {
			const characterIDs = [1, 2];

			const mockUpdate = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue()
			};
			mockDb.update.mockReturnValue(mockUpdate);

			await updateCharactersLastSeen(characterIDs);

			expect(mockDb.update).toHaveBeenCalled();
			expect(mockUpdate.set).toHaveBeenCalled();
			expect(mockUpdate.where).toHaveBeenCalled();
		});
	});

	describe('updateCharactersAllianceByCorporation', () => {
		it('should do nothing if corporationId is missing', async () => {
			await updateCharactersAllianceByCorporation(null, 123);
			expect(mockDb.update).not.toHaveBeenCalled();
		});

		it('should update alliance_id for corporation characters', async () => {
			const mockUpdate = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue()
			};
			mockDb.update.mockReturnValue(mockUpdate);

			await updateCharactersAllianceByCorporation(42, 9001);

			expect(mockDb.update).toHaveBeenCalled();
			expect(mockUpdate.set).toHaveBeenCalledWith(
				expect.objectContaining({
					alliance_id: 9001
				})
			);
			expect(mockUpdate.where).toHaveBeenCalled();
		});

		it('should allow null alliance id updates', async () => {
			const mockUpdate = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue()
			};
			mockDb.update.mockReturnValue(mockUpdate);

			await updateCharactersAllianceByCorporation(42, null);

			expect(mockUpdate.set).toHaveBeenCalledWith(
				expect.objectContaining({
					alliance_id: null
				})
			);
		});
	});

	describe('getLeastRecentlyUpdatedCharacters', () => {
		it('should fetch least recently updated characters', async () => {
			const mockSelect = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockReturnThis(),
				orderBy: vi.fn().mockReturnThis(),
				limit: vi.fn().mockResolvedValue([{ id: 1 }])
			};
			mockDb.select.mockReturnValue(mockSelect);

			const result = await getLeastRecentlyUpdatedCharacters(10);

			expect(mockDb.select).toHaveBeenCalled();
			expect(mockSelect.from).toHaveBeenCalled();
			expect(mockSelect.where).toHaveBeenCalled();
			expect(mockSelect.orderBy).toHaveBeenCalled();
			expect(mockSelect.limit).toHaveBeenCalledWith(10);
			expect(result).toHaveLength(1);
		});
	});

	describe('biomassCharacter', () => {
		it('should mark character as deleted (doomheim)', async () => {
			const id = 1;

			const mockUpdate = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue()
			};
			mockDb.update.mockReturnValue(mockUpdate);

			await biomassCharacter(id);

			expect(mockDb.update).toHaveBeenCalled();
			expect(mockUpdate.set).toHaveBeenCalledWith(
				expect.objectContaining({
					corporation_id: 1000001 // DOOMHEIM_ID
				})
			);
			expect(mockUpdate.where).toHaveBeenCalled();
		});
	});
});
