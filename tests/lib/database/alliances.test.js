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
    alliances: { id: 'alliances.id', name: 'alliances.name', ticker: 'alliances.ticker', updated_at: 'alliances.updated_at', last_seen: 'alliances.last_seen' }
}));

import { getAlliancesByID, addOrUpdateAlliancesDB, updateAlliancesLastSeen } from '../../../src/lib/database/alliances.js';

describe('database/alliances', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getAlliancesByID', () => {
        it('should fetch alliances by ID', async () => {
            const mockSelect = {
                from: vi.fn().mockReturnThis(),
                where: vi.fn().mockResolvedValue([{ id: 1, name: 'Alliance1' }])
            };
            mockDb.select.mockReturnValue(mockSelect);

            const result = await getAlliancesByID([1]);

            expect(mockDb.select).toHaveBeenCalled();
            expect(mockSelect.where).toHaveBeenCalled();
            expect(result).toEqual([{ id: 1, name: 'Alliance1' }]);
        });
    });

    describe('addOrUpdateAlliancesDB', () => {
        it('should upsert alliances', async () => {
            const data = [{ id: 1, name: 'Alliance1' }];

            const mockInsert = {
                values: vi.fn().mockReturnThis(),
                onConflictDoUpdate: vi.fn().mockResolvedValue()
            };
            mockDb.insert.mockReturnValue(mockInsert);

            await addOrUpdateAlliancesDB(data);

            expect(mockDb.insert).toHaveBeenCalled();
            expect(mockInsert.values).toHaveBeenCalled();
        });

        it('should handle empty data gracefully', async () => {
            await addOrUpdateAlliancesDB([]);
            expect(mockDb.insert).not.toHaveBeenCalled();
        });
    });

    describe('updateAlliancesLastSeen', () => {
        it('should update last seen timestamp', async () => {
            const ids = [1];

            const mockUpdate = {
                set: vi.fn().mockReturnThis(),
                where: vi.fn().mockResolvedValue()
            };
            mockDb.update.mockReturnValue(mockUpdate);

            await updateAlliancesLastSeen(ids);

            expect(mockDb.update).toHaveBeenCalled();
        });

        it('should handle empty IDs gracefully', async () => {
            await updateAlliancesLastSeen([]);
            expect(mockDb.update).not.toHaveBeenCalled();
        });
    });
});
