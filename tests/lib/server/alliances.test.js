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

vi.mock('../../../src/lib/server/wrappers.js', () => ({
    fetchGET: vi.fn()
}));

vi.mock('../../../src/lib/database/alliances.js', () => ({
    getAlliancesByID: vi.fn(),
    addOrUpdateAlliancesDB: vi.fn()
}));

vi.mock('../../../src/lib/logger.js', () => ({
    default: {
        error: vi.fn()
    }
}));

import { idsToAlliances, addOrUpdateAlliances } from '../../../src/lib/server/alliances.js';
import { fetchGET } from '../../../src/lib/server/wrappers.js';
import { getAlliancesByID, addOrUpdateAlliancesDB } from '../../../src/lib/database/alliances.js';

describe('alliances', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('idsToAlliances', () => {
        it('should fetch alliances from ESI', async () => {
            const ids = [1];
            fetchGET.mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'Alliance1', ticker: 'ALL1' })
            });

            const result = await idsToAlliances(ids);

            expect(fetchGET).toHaveBeenCalledWith('https://esi.evetech.net/alliances/1');
            expect(result).toEqual([{ id: 1, name: 'Alliance1', ticker: 'ALL1' }]);
        });

        it('should handle failed fetch', async () => {
            const ids = [1];
            fetchGET.mockResolvedValue({
                ok: false,
                statusText: 'Not Found'
            });

            const result = await idsToAlliances(ids);

            expect(result).toEqual([null]); // getAllianceFromESI returns null on failure
        });
    });

    describe('addOrUpdateAlliances', () => {
        it('should update missing or outdated alliances', async () => {
            const ids = [1, 2];

            // 1 is missing, 2 is outdated
            getAlliancesByID.mockResolvedValue([
                { id: 2, updated_at: new Date(Date.now() - 100000000).toISOString() }
            ]);

            fetchGET.mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'Alliance', ticker: 'ALL' })
            });

            await addOrUpdateAlliances(ids);

            expect(fetchGET).toHaveBeenCalledTimes(2); // Both need update
            expect(addOrUpdateAlliancesDB).toHaveBeenCalled();
        });

        it('should skip if all up to date', async () => {
            const ids = [1];
            getAlliancesByID.mockResolvedValue([
                { id: 1, updated_at: new Date().toISOString() }
            ]);

            await addOrUpdateAlliances(ids);

            expect(fetchGET).not.toHaveBeenCalled();
            expect(addOrUpdateAlliancesDB).not.toHaveBeenCalled();
        });
    });
});
