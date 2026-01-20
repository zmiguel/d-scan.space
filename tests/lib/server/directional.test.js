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
    scansProcessedCounter: { add: vi.fn() },
    scanItemsCount: { record: vi.fn() },
    scanDuration: { record: vi.fn() }
}));

vi.mock('../../../src/lib/database/sde.js', () => ({
    getTypeHierarchyMetadata: vi.fn(),
    getSystemByName: vi.fn()
}));

vi.mock('../../../src/lib/logger.js', () => ({
    default: {
        warn: vi.fn()
    }
}));

import { createNewDirectionalScan } from '../../../src/lib/server/directional.js';
import { getTypeHierarchyMetadata, getSystemByName } from '../../../src/lib/database/sde.js';

describe('directional', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('should process valid scan data', async () => {
        const rawData = [
            '123\tShip Name\tShip Type\t10 km',
            '456\tStation Name\tStation Type\t10 AU'
        ];

        const mockMetadata = new Map([
            [123, { typeId: 123, typeName: 'Ship Type', categoryId: 6, categoryName: 'Ship', groupId: 1, groupName: 'Frigate', mass: 1000 }],
            [456, { typeId: 456, typeName: 'Station Type', categoryId: 3, categoryName: 'Station', groupId: 2, groupName: 'Station Group', mass: 100000 }]
        ]);

        getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);
        getSystemByName.mockResolvedValue(null);

        const result = await createNewDirectionalScan(rawData);

        expect(result.on_grid.total_objects).toBe(1); // 10 km
        expect(result.off_grid.total_objects).toBe(1); // 10 AU
        expect(result.on_grid.objects[0].name).toBe('Ship');
        expect(result.off_grid.objects[0].name).toBe('Station');
    });

    it('should handle invalid lines', async () => {
        const rawData = 'invalid line\n123\tName\tType\t10 km';

        const mockMetadata = new Map([
            [123, { typeId: 123, typeName: 'Type', categoryId: 1, categoryName: 'Cat', groupId: 1, groupName: 'Grp', mass: 1 }]
        ]);
        getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);

        const result = await createNewDirectionalScan(rawData);

        expect(result.on_grid.total_objects).toBe(1);
    });

    it('should detect system name from scan', async () => {
        const rawData = '123\tJita IV - Moon 4 - Caldari Navy Assembly Plant\tStation\t10 km';

        const mockMetadata = new Map([
            [123, { typeId: 123, typeName: 'Station', categoryId: 3, categoryName: 'Station', groupId: 1, groupName: 'Station', mass: 1 }]
        ]);
        getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);

        getSystemByName.mockResolvedValue({
            id: 30000142,
            name: 'Jita',
            constellation: 'Kimotoro',
            region: 'The Forge',
            secStatus: 0.9
        });

        const result = await createNewDirectionalScan(rawData);

        expect(result.system.name).toBe('Jita');
    });

    describe('system name extraction', () => {
        it('should extract from Ansiblex Jump Bridge', async () => {
            const rawData = '123\tJita » Ansiblex\tAnsiblex Jump Gate\t10 km';
            const mockMetadata = new Map([
                [123, { typeId: 123, typeName: 'Ansiblex', categoryId: 65, categoryName: 'Structure', groupId: 1408, groupName: 'Ansiblex', mass: 1 }]
            ]);
            getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);
            getSystemByName.mockResolvedValue({ name: 'Jita' });

            const result = await createNewDirectionalScan(rawData);
            expect(result.system.name).toBe('Jita');
        });

        it('should extract from Player Structure', async () => {
            const rawData = '123\tJita - Structure Name\tAstrahus\t10 km';
            const mockMetadata = new Map([
                [123, { typeId: 123, typeName: 'Astrahus', categoryId: 65, categoryName: 'Structure', groupId: 1657, groupName: 'Citadel', mass: 1 }]
            ]);
            getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);
            getSystemByName.mockResolvedValue({ name: 'Jita' });

            const result = await createNewDirectionalScan(rawData);
            expect(result.system.name).toBe('Jita');
        });

        it('should extract from Sun', async () => {
            const rawData = '123\tJita - Star\tSun G5\t10 AU';
            const mockMetadata = new Map([
                [123, { typeId: 123, typeName: 'Sun G5', categoryId: 2, categoryName: 'Celestial', groupId: 6, groupName: 'Sun', mass: 1 }]
            ]);
            getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);
            getSystemByName.mockResolvedValue({ name: 'Jita' });

            const result = await createNewDirectionalScan(rawData);
            expect(result.system.name).toBe('Jita');
        });

        it('should extract from Planet/Moon', async () => {
            const rawData = '123\tJita IV - Moon 4\tMoon\t10 AU';
            const mockMetadata = new Map([
                [123, { typeId: 123, typeName: 'Moon', categoryId: 2, categoryName: 'Celestial', groupId: 8, groupName: 'Moon', mass: 1 }]
            ]);
            getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);
            getSystemByName.mockResolvedValue({ name: 'Jita' });

            const result = await createNewDirectionalScan(rawData);
            expect(result.system.name).toBe('Jita');
        });
    });

    describe('Edge Cases', () => {
        it('should handle empty input', async () => {
            const result = await createNewDirectionalScan('');
            expect(result.on_grid.total_objects).toBe(0);
        });

        it('should handle missing metadata', async () => {
            const raw = `12345\tItem\tType\t10 km`;
            getTypeHierarchyMetadata.mockResolvedValue(new Map()); // Empty map

            const result = await createNewDirectionalScan(raw);
            expect(result.on_grid.total_objects).toBe(1);
            expect(result.on_grid.objects[0].name).toContain('Unknown Category');
        });

        it('should handle invalid lines', async () => {
            const raw = [
                '', // Empty string
                '   ', // Whitespace
                '123\tItem', // Not enough parts
                'abc\tItem\tType\t10 km', // Invalid typeId
                null // Null line
            ];
            const result = await createNewDirectionalScan(raw);
            expect(result.on_grid.total_objects).toBe(0);
        });

        it('should handle invalid input type for normalizeLines', async () => {
            const result = await createNewDirectionalScan(123);
            expect(result.on_grid.total_objects).toBe(0);
        });

        it('should handle mixed types in input array', async () => {
            const raw = ['123\tItem\tType\t10 km', 123, null, undefined];
            const mockMetadata = new Map();
            getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);

            const result = await createNewDirectionalScan(raw);
            // 123 becomes "123" which is invalid line -> ignored
            // null/undefined -> ignored
            // Valid line -> processed (but unknown category)
            expect(result.on_grid.total_objects).toBe(1);
        });

        it('should handle isOnGrid fallback', async () => {
            const raw = `123\tItem\tType\t10 lightyears`; // Unknown unit
            getTypeHierarchyMetadata.mockResolvedValue(new Map([[123, { typeId: 123 }]]));
            const result = await createNewDirectionalScan(raw);
            expect(result.off_grid.total_objects).toBe(1); // Default to off grid
        });
    });

    it('should sort results correctly', async () => {
        const rawData = [
            '1\tA\tTypeA\t10 km',
            '1\tB\tTypeA\t10 km', // TypeA count: 2
            '2\tC\tTypeB\t10 km', // TypeB count: 1
            '3\tD\tTypeC\t10 km', // Group2
            '3\tE\tTypeC\t10 km',
            '3\tF\tTypeC\t10 km'  // Group2 count: 3
        ];

        const mockMetadata = new Map([
            [1, { typeId: 1, typeName: 'TypeA', categoryId: 1, categoryName: 'Cat1', groupId: 1, groupName: 'Group1' }],
            [2, { typeId: 2, typeName: 'TypeB', categoryId: 1, categoryName: 'Cat1', groupId: 1, groupName: 'Group1' }],
            [3, { typeId: 3, typeName: 'TypeC', categoryId: 2, categoryName: 'Cat2', groupId: 2, groupName: 'Group2' }]
        ]);
        getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);

        const result = await createNewDirectionalScan(rawData);

        // Verify Category Sort (Cat2 has 3 objects, Cat1 has 3 objects) - stable sort or order depends on implementation
        // Let's make Cat2 have more
        // Actually Cat1 has 3 objects (TypeA: 2, TypeB: 1)
        // Cat2 has 3 objects (TypeC: 3)

        // Verify Type Sort in Group1
        // TypeA (2) should be before TypeB (1)
        const group1 = result.on_grid.objects.find(c => c.id === 1).objects[0];
        expect(group1.objects[0].name).toBe('TypeA');
        expect(group1.objects[1].name).toBe('TypeB');
    });

    it('should handle different distance formats', async () => {
        const rawData = [
            '1\tA\tT\t1,000 km', // Comma
            '2\tB\tT\t1000 m', // Meters
            '3\tC\tT\t-', // Dash
            '4\tD\tT\t10 AU' // AU
        ];

        const mockMetadata = new Map([
            [1, { typeId: 1, categoryId: 1 }],
            [2, { typeId: 2, categoryId: 1 }],
            [3, { typeId: 3, categoryId: 1 }],
            [4, { typeId: 4, categoryId: 1 }]
        ]);
        getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);

        const result = await createNewDirectionalScan(rawData);

        expect(result.on_grid.total_objects).toBe(2);
        expect(result.off_grid.total_objects).toBe(2);
    });

    describe('System Name Detection Edge Cases', () => {
        it('should handle conflicting system candidates', async () => {
            const rawData = [
                '1\tJita - Station\tStation\t10 km',
                '2\tAmarr - Station\tStation\t10 km',
                '3\tJita - Gate\tGate\t10 km'
            ];
            // Need correct category/group IDs for detection to work
            // Station: Cat 3
            // Gate: Cat 0? Gate isn't in the list of detected types in determineSystemName?
            // determineSystemName supports:
            // Cat 65 (Structure), Cat 3 (Station), Cat 2 (Celestial)
            // Let's use Station (Cat 3) for all to be safe, or Celestial (Cat 2)
            const mockMetadata = new Map([
                [1, { typeId: 1, typeName: 'Station', categoryId: 3, groupId: 1 }],
                [2, { typeId: 2, typeName: 'Station', categoryId: 3, groupId: 1 }],
                [3, { typeId: 3, typeName: 'Gate', categoryId: 3, groupId: 1 }] // Pretend gate is station for detection
            ]);
            getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);
            getSystemByName.mockImplementation(async (name) => ({ name }));

            const result = await createNewDirectionalScan(rawData);
            expect(result.system.name).toBe('Jita');
        });

        it('should handle determineSystemName with null/unknown name', async () => {
            const rawData = '1\tUnknown System - Station\tStation\t10 km';
            const mockMetadata = new Map([[1, { typeId: 1, typeName: 'Station', categoryId: 3 }]]);
            getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);
            getSystemByName.mockResolvedValue(null);

            const result = await createNewDirectionalScan(rawData);
            expect(result.system).toBeUndefined();
        });

        it('should handle extraction edge cases (missing delimiters)', async () => {
            const rawData = [
                '1\tAnsiblexNoDelimiter\tAnsiblex Jump Gate\t10 km',
                '2\tStructureNoDelimiter\tAstrahus\t10 km',
                '3\tSunNoDelimiter\tSun G5\t10 AU',
                '4\tMoonNoDelimiter\tMoon\t10 AU'
            ];
            const mockMetadata = new Map([
                [1, { typeId: 1, typeName: 'Ansiblex Jump Gate', categoryId: 65, groupId: 1408 }],
                [2, { typeId: 2, typeName: 'Astrahus', categoryId: 65, groupId: 1657 }],
                [3, { typeId: 3, typeName: 'Sun G5', categoryId: 2, groupId: 6 }],
                [4, { typeId: 4, typeName: 'Moon', categoryId: 2, groupId: 8 }]
            ]);
            getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);
            getSystemByName.mockResolvedValue(null);

            const result = await createNewDirectionalScan(rawData);
            expect(result.system).toBeUndefined();
        });

        it('should handle structure name starting with delimiter', async () => {
            const rawData = '1\t - Structure Name\tAstrahus\t10 km';
            const mockMetadata = new Map([
                [1, { typeId: 1, typeName: 'Astrahus', categoryId: 65, groupId: 1657 }]
            ]);
            getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);
            getSystemByName.mockResolvedValue(null);

            const result = await createNewDirectionalScan(rawData);
            expect(result.system).toBeUndefined();
        });
    });

    describe('Parsing Edge Cases', () => {
        it('should handle empty/null name/type/distance in parseDirectionalLines', async () => {
            // Add dummy char at end to survive trim()
            const rawData = '123\t\t\t\tx';
            const mockMetadata = new Map([[123, { typeId: 123 }]]);
            getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);

            const result = await createNewDirectionalScan(rawData);
            expect(result.off_grid.total_objects).toBe(1);
            expect(result.on_grid.total_objects).toBe(0);
        });

        it('should handle isOnGrid with empty distance (via extra column)', async () => {
            const rawData = '123\tName\tType\t\tExtra';
            const mockMetadata = new Map([[123, { typeId: 123 }]]);
            getTypeHierarchyMetadata.mockResolvedValue(mockMetadata);

            const result = await createNewDirectionalScan(rawData);
            expect(result.off_grid.total_objects).toBe(1);
        });
    });
});
