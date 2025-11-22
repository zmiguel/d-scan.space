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
            transaction: vi.fn()
        }
    };
});

vi.mock('../../../src/lib/database/client.js', () => ({
    db: mockDb
}));

vi.mock('../../../src/lib/database/schema.js', () => ({
    scans: { id: 'scans.id', group_id: 'scans.group_id', scan_type: 'scans.scan_type', created_at: 'scans.created_at', data: 'scans.data', raw_data: 'scans.raw_data' },
    scanGroups: { id: 'scanGroups.id', system: 'scanGroups.system', public: 'scanGroups.public', created_at: 'scanGroups.created_at' }
}));

import { getScanByID, createNewScan, updateScan, getScansByGroupID, getPublicScans } from '../../../src/lib/database/scans.js';

describe('scans', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    describe('getScanByID', () => {
        it('should fetch scan by ID', async () => {
            const mockSelect = {
                from: vi.fn().mockReturnThis(),
                leftJoin: vi.fn().mockReturnThis(),
                where: vi.fn().mockResolvedValue([{ id: 1 }])
            };
            mockDb.select.mockReturnValue(mockSelect);

            const result = await getScanByID(1);

            expect(mockDb.select).toHaveBeenCalled();
            expect(mockSelect.from).toHaveBeenCalled();
            expect(mockSelect.leftJoin).toHaveBeenCalled();
            expect(mockSelect.where).toHaveBeenCalled();
            expect(result).toEqual([{ id: 1 }]);
        });
    });

    describe('getScansByGroupID', () => {
        it('should fetch scans by group ID', async () => {
            const mockSelect = {
                from: vi.fn().mockReturnThis(),
                where: vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }])
            };
            mockDb.select.mockReturnValue(mockSelect);

            const result = await getScansByGroupID('group1');

            expect(mockDb.select).toHaveBeenCalled();
            expect(mockSelect.from).toHaveBeenCalled();
            expect(mockSelect.where).toHaveBeenCalled();
            expect(result).toHaveLength(2);
        });
    });

    describe('createNewScan', () => {
        it('should create new scan in transaction', async () => {
            const data = {
                scanId: 'scan1',
                scanGroupId: 'group1',
                type: 'local',
                data: {},
                raw_data: [],
                is_public: false
            };

            mockDb.transaction.mockImplementation(async (callback) => {
                const tx = {
                    insert: vi.fn().mockReturnThis(),
                    values: vi.fn().mockResolvedValue()
                };
                await callback(tx);
                expect(tx.insert).toHaveBeenCalledTimes(2); // scanGroups and scans
            });

            await createNewScan(data);

            expect(mockDb.transaction).toHaveBeenCalled();
        });
    });

    describe('updateScan', () => {
        it('should update scan in transaction', async () => {
            const data = {
                scanId: 'scan2',
                scanGroupId: 'group1',
                type: 'directional',
                data: { system: { name: 'Jita' } },
                raw_data: []
            };

            mockDb.transaction.mockImplementation(async (callback) => {
                const tx = {
                    insert: vi.fn().mockReturnThis(),
                    values: vi.fn().mockResolvedValue(),
                    update: vi.fn().mockReturnThis(),
                    set: vi.fn().mockReturnThis(),
                    where: vi.fn().mockResolvedValue()
                };
                await callback(tx);
                expect(tx.insert).toHaveBeenCalled();
                expect(tx.update).toHaveBeenCalled(); // Should update system info
            });

            await updateScan(data);

            expect(mockDb.transaction).toHaveBeenCalled();
        });

    });


    describe('getPublicScans', () => {
        it('should fetch public scans', async () => {
            const mockSelect = {
                from: vi.fn().mockReturnThis(),
                leftJoin: vi.fn().mockReturnThis(),
                where: vi.fn().mockReturnThis(),
                orderBy: vi.fn().mockResolvedValue([{ id: 1 }])
            };
            mockDb.select.mockReturnValue(mockSelect);

            const result = await getPublicScans();

            expect(mockDb.select).toHaveBeenCalled();
            expect(mockSelect.from).toHaveBeenCalled();
            expect(mockSelect.leftJoin).toHaveBeenCalled();
            expect(mockSelect.where).toHaveBeenCalled();
            expect(mockSelect.orderBy).toHaveBeenCalled();
            expect(result).toHaveLength(1);
        });
    });
});

