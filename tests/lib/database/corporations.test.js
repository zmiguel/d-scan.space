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
	corporations: {
		id: 'corporations.id',
		name: 'corporations.name',
		ticker: 'corporations.ticker',
		updated_at: 'corporations.updated_at',
		last_seen: 'corporations.last_seen'
	}
}));

import {
	getCorporationsByID,
	addOrUpdateCorporationsDB,
	updateCorporationsLastSeen,
	getAllCorporations
} from '../../../src/lib/database/corporations.js';

describe('database/corporations', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe('getCorporationsByID', () => {
		it('should fetch corporations by ID', async () => {
			const mockSelect = {
				from: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue([{ id: 1, name: 'Corp1' }])
			};
			mockDb.select.mockReturnValue(mockSelect);

			const result = await getCorporationsByID([1]);

			expect(mockDb.select).toHaveBeenCalled();
			expect(mockSelect.where).toHaveBeenCalled();
			expect(result).toEqual([{ id: 1, name: 'Corp1' }]);
		});
	});

	describe('getAllCorporations', () => {
		it('should fetch all corporations', async () => {
			const mockSelect = {
				from: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }])
			};
			mockDb.select.mockReturnValue(mockSelect);

			const result = await getAllCorporations();

			expect(mockDb.select).toHaveBeenCalled();
			expect(mockSelect.from).toHaveBeenCalled();
			expect(result).toHaveLength(2);
		});
	});

	describe('addOrUpdateCorporationsDB', () => {
		it('should upsert corporations', async () => {
			const data = [{ id: 1, name: 'Corp1' }];

			const mockInsert = {
				values: vi.fn().mockReturnThis(),
				onConflictDoUpdate: vi.fn().mockResolvedValue()
			};
			mockDb.insert.mockReturnValue(mockInsert);

			await addOrUpdateCorporationsDB(data);

			expect(mockDb.insert).toHaveBeenCalled();
			expect(mockInsert.values).toHaveBeenCalled();
		});

		it('should handle empty data gracefully', async () => {
			await addOrUpdateCorporationsDB([]);
			expect(mockDb.insert).not.toHaveBeenCalled();
		});

		it('should handle NPC data', async () => {
			const data = [{ id: 1, name: 'Corp1', npc: true }];

			const mockInsert = {
				values: vi.fn().mockReturnThis(),
				onConflictDoUpdate: vi.fn().mockResolvedValue()
			};
			mockDb.insert.mockReturnValue(mockInsert);

			await addOrUpdateCorporationsDB(data);

			expect(mockDb.insert).toHaveBeenCalled();
			expect(mockInsert.values).toHaveBeenCalledWith(
				expect.arrayContaining([expect.objectContaining({ npc: true })])
			);
		});
	});

	describe('updateCorporationsLastSeen', () => {
		it('should update last seen timestamp', async () => {
			const ids = [1];

			const mockUpdate = {
				set: vi.fn().mockReturnThis(),
				where: vi.fn().mockResolvedValue()
			};
			mockDb.update.mockReturnValue(mockUpdate);

			await updateCorporationsLastSeen(ids);

			expect(mockDb.update).toHaveBeenCalled();
		});

		it('should handle empty IDs gracefully', async () => {
			await updateCorporationsLastSeen([]);
			expect(mockDb.update).not.toHaveBeenCalled();
		});
	});
});
