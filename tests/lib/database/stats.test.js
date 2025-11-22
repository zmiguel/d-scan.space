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
            select: vi.fn()
        }
    };
});

vi.mock('../../../src/lib/database/client.js', () => ({
    db: mockDb
}));

vi.mock('../../../src/lib/database/schema.js', () => ({
    characters: { id: 'characters.id', last_seen: 'characters.last_seen', updated_at: 'characters.updated_at', alliance_id: 'characters.alliance_id', deleted_at: 'characters.deleted_at' },
    corporations: { id: 'corporations.id', last_seen: 'corporations.last_seen', updated_at: 'corporations.updated_at', alliance_id: 'corporations.alliance_id', npc: 'corporations.npc' },
    alliances: { id: 'alliances.id', last_seen: 'alliances.last_seen', updated_at: 'alliances.updated_at' },
    scans: { id: 'scans.id', group_id: 'scans.group_id', scan_type: 'scans.scan_type' },
    scanGroups: { id: 'scanGroups.id', public: 'scanGroups.public', system: 'scanGroups.system' }
}));

vi.mock('drizzle-orm', () => ({
    eq: vi.fn(),
    sql: vi.fn((strings, ...values) => ({ mapWith: vi.fn() }))
}));

import { getScanStats, getCharacterStats, getCorporationStats, getAllianceStats } from '../../../src/lib/database/stats.js';

describe('database/stats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getScanStats', () => {
        it('should fetch scan stats', async () => {
            const mockStats = { totalScans: 100 };
            const mockSelect = {
                from: vi.fn().mockReturnThis(),
                leftJoin: vi.fn().mockResolvedValue([mockStats])
            };
            mockDb.select.mockReturnValue(mockSelect);

            const result = await getScanStats();

            expect(mockDb.select).toHaveBeenCalled();
            expect(mockSelect.from).toHaveBeenCalled();
            expect(mockSelect.leftJoin).toHaveBeenCalled();
            expect(result).toEqual(mockStats);
        });
    });

    describe('getCharacterStats', () => {
        it('should fetch character stats', async () => {
            const mockStats = { totalCharacters: 500 };
            const mockSelect = {
                from: vi.fn().mockResolvedValue([mockStats])
            };
            mockDb.select.mockReturnValue(mockSelect);

            const result = await getCharacterStats();

            expect(mockDb.select).toHaveBeenCalled();
            expect(result).toEqual(mockStats);
        });
    });

    describe('getCorporationStats', () => {
        it('should fetch corporation stats', async () => {
            const mockStats = { totalCorporations: 50 };
            const mockSelect = {
                from: vi.fn().mockResolvedValue([mockStats])
            };
            mockDb.select.mockReturnValue(mockSelect);

            const result = await getCorporationStats();

            expect(mockDb.select).toHaveBeenCalled();
            expect(result).toEqual(mockStats);
        });
    });

    describe('getAllianceStats', () => {
        it('should fetch alliance stats', async () => {
            const mockStats = { totalAlliances: 10 };
            const mockSelect = {
                from: vi.fn().mockResolvedValue([mockStats])
            };
            mockDb.select.mockReturnValue(mockSelect);

            const result = await getAllianceStats();

            expect(mockDb.select).toHaveBeenCalled();
            expect(result).toEqual(mockStats);
        });
    });
});
