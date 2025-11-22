import { describe, it, expect, vi, beforeEach } from 'vitest';

// Hoist mocks
const { mockSpan, mockDb } = vi.hoisted(() => {
    const mockSpan = {
        setAttributes: vi.fn(),
        addEvent: vi.fn(),
        end: vi.fn()
    };

    const mockDb = {
        select: vi.fn(),
        insert: vi.fn(),
        update: vi.fn(),
        from: vi.fn(),
        where: vi.fn(),
        orderBy: vi.fn(),
        limit: vi.fn(),
        values: vi.fn(),
        onConflictDoUpdate: vi.fn(),
        set: vi.fn(),
        leftJoin: vi.fn()
    };

    // Chainable mocks setup
    mockDb.select.mockReturnValue(mockDb);
    mockDb.from.mockReturnValue(mockDb);
    mockDb.where.mockReturnValue(mockDb);
    mockDb.orderBy.mockReturnValue(mockDb);
    mockDb.limit.mockReturnValue(mockDb);
    mockDb.insert.mockReturnValue(mockDb);
    mockDb.values.mockReturnValue(mockDb);
    mockDb.onConflictDoUpdate.mockReturnValue(mockDb);
    mockDb.update.mockReturnValue(mockDb);
    mockDb.set.mockReturnValue(mockDb);
    mockDb.leftJoin.mockReturnValue(mockDb);

    return { mockSpan, mockDb };
});

vi.mock('../../../src/lib/server/tracer.js', () => ({
    withSpan: vi.fn((name, fn) => fn(mockSpan))
}));

vi.mock('../../../src/lib/database/client.js', () => ({
    db: mockDb
}));

vi.mock('../../../src/lib/database/schema.js', () => ({
    sde: { success: 'success', run_date: 'run_date', release_date: 'release_date', release_version: 'release_version' },
    systems: { id: 'id', name: 'name', constellation: 'constellation', region: 'region', sec_status: 'sec_status', last_seen: 'last_seen' },
    invCategories: { id: 'id', name: 'name' },
    invGroups: { id: 'id', name: 'name', category_id: 'category_id', anchorable: 'anchorable', anchored: 'anchored', fittable_non_singleton: 'fittable_non_singleton', icon_id: 'icon_id' },
    invTypes: { id: 'id', name: 'name', mass: 'mass', volume: 'volume', capacity: 'capacity', faction_id: 'faction_id', race_id: 'race_id', group_id: 'group_id', market_group_id: 'market_group_id', icon_id: 'icon_id' }
}));

vi.mock('drizzle-orm', () => ({
    desc: vi.fn(),
    eq: vi.fn(),
    sql: vi.fn((strings) => strings[0]),
    inArray: vi.fn()
}));

import {
    getLastInstalledSDEVersion,
    addSDEDataEntry,
    addOrUpdateSystemsDB,
    addOrUpdateCategoriesDB,
    addOrUpdateGroupsDB,
    addOrUpdateTypesDB,
    getTypeHierarchyMetadata,
    getSystemByName
} from '../../../src/lib/database/sde.js';

describe('sde', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset chainable mocks return values
        mockDb.select.mockReturnValue(mockDb);
        mockDb.from.mockReturnValue(mockDb);
        mockDb.where.mockReturnValue(mockDb);
        mockDb.orderBy.mockReturnValue(mockDb);
        mockDb.limit.mockReturnValue(mockDb);
        mockDb.insert.mockReturnValue(mockDb);
        mockDb.values.mockReturnValue(mockDb);
        mockDb.onConflictDoUpdate.mockReturnValue(mockDb);
        mockDb.update.mockReturnValue(mockDb);
        mockDb.set.mockReturnValue(mockDb);
        mockDb.leftJoin.mockReturnValue(mockDb);
    });

    describe('getLastInstalledSDEVersion', () => {
        it('should return the last installed version', async () => {
            const mockResult = [{ release_version: '1.0' }];
            mockDb.limit.mockResolvedValue(mockResult);

            const result = await getLastInstalledSDEVersion();

            expect(mockDb.select).toHaveBeenCalled();
            expect(mockDb.from).toHaveBeenCalled();
            expect(mockDb.where).toHaveBeenCalled();
            expect(mockDb.orderBy).toHaveBeenCalled();
            expect(mockDb.limit).toHaveBeenCalledWith(1);
            expect(result).toEqual(mockResult[0]);
        });
    });

    describe('addSDEDataEntry', () => {
        it('should insert a new SDE data entry', async () => {
            const data = {
                release_date: '2023-01-01',
                release_version: '1.0',
                success: true
            };

            await addSDEDataEntry(data);

            expect(mockDb.insert).toHaveBeenCalled();
            expect(mockDb.values).toHaveBeenCalledWith(expect.objectContaining({
                release_version: '1.0',
                success: true
            }));
        });
    });

    describe('addOrUpdateSystemsDB', () => {
        it('should do nothing if data is empty', async () => {
            await addOrUpdateSystemsDB([]);
            expect(mockDb.insert).not.toHaveBeenCalled();
        });

        it('should batch insert/update categories', async () => {
            const data = [{ id: 1, name: 'Cat' }];
            await addOrUpdateCategoriesDB(data);

            expect(mockDb.insert).toHaveBeenCalledTimes(1);
            expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
        });
    });

    describe('addOrUpdateGroupsDB', () => {
        it('should do nothing if data is empty', async () => {
            await addOrUpdateGroupsDB([]);
            expect(mockDb.insert).not.toHaveBeenCalled();
        });

        it('should batch insert/update groups', async () => {
            const data = [{ id: 1, name: 'Group' }];
            await addOrUpdateGroupsDB(data);

            expect(mockDb.insert).toHaveBeenCalledTimes(1);
            expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
        });
    });

    describe('addOrUpdateTypesDB', () => {
        it('should do nothing if data is empty', async () => {
            await addOrUpdateTypesDB([]);
            expect(mockDb.insert).not.toHaveBeenCalled();
        });

        it('should batch insert/update types', async () => {
            const data = [{ id: 1, name: 'Type' }];
            await addOrUpdateTypesDB(data);

            expect(mockDb.insert).toHaveBeenCalledTimes(1);
            expect(mockDb.onConflictDoUpdate).toHaveBeenCalled();
        });
    });

    describe('getTypeHierarchyMetadata', () => {
        it('should return empty map for empty input', async () => {
            const result = await getTypeHierarchyMetadata([]);
            expect(result.size).toBe(0);
        });

        it('should return hierarchy metadata', async () => {
            const mockRows = [
                {
                    typeId: 1,
                    typeName: 'Type1',
                    mass: 100,
                    groupId: 10,
                    groupName: 'Group1',
                    anchorable: true,
                    anchored: false,
                    categoryId: 100,
                    categoryName: 'Category1'
                }
            ];
            mockDb.where.mockResolvedValue(mockRows);

            const result = await getTypeHierarchyMetadata([1]);

            expect(result.size).toBe(1);
            expect(result.get(1)).toEqual({
                typeId: 1,
                typeName: 'Type1',
                mass: 100,
                groupId: 10,
                groupName: 'Group1',
                anchorable: true,
                anchored: false,
                categoryId: 100,
                categoryName: 'Category1'
            });
        });
    });

    describe('getSystemByName', () => {
        it('should return null for empty name', async () => {
            const result = await getSystemByName('');
            expect(result).toBeNull();
        });

        it('should return system by name', async () => {
            const mockSystem = { id: 1, name: 'Jita' };
            mockDb.limit.mockResolvedValue([mockSystem]);

            const result = await getSystemByName('Jita');

            expect(mockDb.select).toHaveBeenCalled();
            expect(mockDb.where).toHaveBeenCalled();
            expect(result).toEqual(mockSystem);
        });
    });
});
