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

vi.mock('../../../src/lib/database/corporations.js', () => ({
    getCorporationsByID: vi.fn(),
    addOrUpdateCorporationsDB: vi.fn()
}));

import { idsToCorporations, addOrUpdateCorporations } from '../../../src/lib/server/corporations.js';
import { fetchGET } from '../../../src/lib/server/wrappers.js';
import { getCorporationsByID, addOrUpdateCorporationsDB } from '../../../src/lib/database/corporations.js';

describe('corporations', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('idsToCorporations', () => {
        it('should fetch corporations from ESI', async () => {
            const ids = [1];
            fetchGET.mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'Corp1', ticker: 'CORP1' })
            });

            const result = await idsToCorporations(ids);

            expect(fetchGET).toHaveBeenCalledWith('https://esi.evetech.net/corporations/1');
            expect(result).toEqual([{ id: 1, name: 'Corp1', ticker: 'CORP1' }]);
        });
    });

    describe('addOrUpdateCorporations', () => {
        it('should update missing or outdated corporations', async () => {
            const ids = [1, 2];

            // 1 is missing, 2 is outdated
            getCorporationsByID.mockResolvedValue([
                { id: 2, updated_at: new Date(Date.now() - 100000000).toISOString() }
            ]);

            fetchGET.mockResolvedValue({
                ok: true,
                json: async () => ({ name: 'Corp', ticker: 'CORP' })
            });

            await addOrUpdateCorporations(ids);

            expect(fetchGET).toHaveBeenCalledTimes(2);
            expect(addOrUpdateCorporationsDB).toHaveBeenCalled();
        });

        it('should skip if all up to date', async () => {
            const ids = [1];
            getCorporationsByID.mockResolvedValue([
                { id: 1, updated_at: new Date().toISOString() }
            ]);

            await addOrUpdateCorporations(ids);

            expect(fetchGET).not.toHaveBeenCalled();
            expect(addOrUpdateCorporationsDB).not.toHaveBeenCalled();
        });
    });
});
