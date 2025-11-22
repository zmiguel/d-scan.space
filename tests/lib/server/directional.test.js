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
});
