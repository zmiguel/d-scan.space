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

vi.mock('../../../src/lib/server/metrics.js', () => ({
    cacheHitCounter: { add: vi.fn() },
    cacheMissCounter: { add: vi.fn() },
    scanItemsCount: { record: vi.fn() },
    scanDuration: { record: vi.fn() },
    scansProcessedCounter: { add: vi.fn() }
}));

vi.mock('../../../src/lib/database/characters.js', () => ({
    getCharactersByName: vi.fn(),
    updateCharactersLastSeen: vi.fn()
}));

vi.mock('../../../src/lib/database/corporations.js', () => ({
    updateCorporationsLastSeen: vi.fn()
}));

vi.mock('../../../src/lib/database/alliances.js', () => ({
    updateAlliancesLastSeen: vi.fn()
}));

vi.mock('../../../src/lib/server/characters.js', () => ({
    addCharactersFromESI: vi.fn(),
    updateCharactersFromESI: vi.fn(),
    updateAffiliationsFromESI: vi.fn()
}));

vi.mock('../../../src/lib/logger.js', () => ({
    default: {
        info: vi.fn()
    }
}));

import { createNewLocalScan } from '../../../src/lib/server/local.js';
import { getCharactersByName } from '../../../src/lib/database/characters.js';
import { addCharactersFromESI } from '../../../src/lib/server/characters.js';

describe('local', () => {
    beforeEach(() => {
        vi.resetAllMocks();
    });

    it('should process new local scan', async () => {
        const rawData = ['Char1', 'Char2'];

        // Mock DB response
        getCharactersByName
            .mockResolvedValueOnce([
                {
                    id: 95339706,
                    name: 'Char1',
                    updated_at: new Date().toISOString(),
                    corporation_id: 98210135,
                    corporation_name: 'Corp1',
                    corporation_ticker: 'C1',
                    alliance_id: 1900696668,
                    alliance_name: 'Alliance1',
                    alliance_ticker: 'A1'
                }
            ])
            .mockResolvedValueOnce([
                {
                    id: 95339706,
                    name: 'Char1',
                    updated_at: new Date().toISOString(),
                    corporation_id: 98210135,
                    corporation_name: 'Corp1',
                    corporation_ticker: 'C1',
                    alliance_id: 1900696668,
                    alliance_name: 'Alliance1',
                    alliance_ticker: 'A1'
                },
                {
                    id: 2,
                    name: 'Char2',
                    updated_at: new Date().toISOString(),
                    corporation_id: 20,
                    corporation_name: 'Corp2',
                    corporation_ticker: 'C2',
                    alliance_id: null,
                    alliance_name: null,
                    alliance_ticker: null
                }
            ]);

        await createNewLocalScan(rawData);

        expect(addCharactersFromESI).toHaveBeenCalledWith(['Char2']);
        expect(getCharactersByName).toHaveBeenCalledTimes(2);
    });

    it('should structure the output correctly', async () => {
        const rawData = ['Char1'];

        getCharactersByName
            .mockResolvedValueOnce([
                {
                    id: 95339706,
                    name: 'Char1',
                    updated_at: new Date().toISOString(),
                    corporation_id: 98210135,
                    corporation_name: 'Corp1',
                    corporation_ticker: 'C1',
                    alliance_id: 1900696668,
                    alliance_name: 'Alliance1',
                    alliance_ticker: 'A1'
                }
            ])
            .mockResolvedValueOnce([]); // Second call for missing/outdated should return empty

        const result = await createNewLocalScan(rawData);

        expect(result.total_pilots).toBe(1);
        expect(result.alliances).toHaveLength(1);
        expect(result.alliances[0].name).toBe('Alliance1');
        expect(result.alliances[0].corporations).toHaveLength(1);
        expect(result.alliances[0].corporations[0].name).toBe('Corp1');
        expect(result.alliances[0].corporations[0].characters).toHaveLength(1);
        expect(result.alliances[0].corporations[0].characters[0].name).toBe('Char1');
    });
});
