import { describe, it, expect, vi, beforeEach } from 'vitest';

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
	getSystemsByNames: vi.fn()
}));

vi.mock('../../../src/lib/logger.js', () => ({
	default: {
		warn: vi.fn()
	}
}));

import { createNewDirectionalScan } from '../../../src/lib/server/directional.js';
import { getTypeHierarchyMetadata, getSystemsByNames } from '../../../src/lib/database/sde.js';
import { DSCAN_ON_GRID_MAX_KM } from '../../../src/lib/server/constants.js';

/** `12345` -> `12,345` (EVE's English grouping). */
const grouped = (n) => n.toLocaleString('en-US');

/** Solar systems known to the mocked SDE. */
const SYSTEMS = [
	{
		id: 30000142,
		name: 'Jita',
		constellation: 'Kimotoro',
		region: 'The Forge',
		secStatus: '0.9459'
	},
	{ id: 30002187, name: 'Amarr', constellation: 'Throne Worlds', region: 'Domain', secStatus: 1 },
	{
		id: 30000144,
		name: 'Perimeter',
		constellation: 'Kimotoro',
		region: 'The Forge',
		secStatus: 0.95
	},
	{ id: 30004759, name: '1DQ1-A', constellation: '1P-VL2', region: 'Delve', secStatus: -0.38 }
];

/** Emulates the DB contract: case-insensitive lookup, Map keyed by lower-cased name. */
const mockSystemLookup = () =>
	getSystemsByNames.mockImplementation(async (names) => {
		const wanted = new Set(names.map((n) => n.toLowerCase()));
		return new Map(
			SYSTEMS.filter((s) => wanted.has(s.name.toLowerCase())).map((s) => [s.name.toLowerCase(), s])
		);
	});

const TYPES = {
	sun: { typeId: 45041, typeName: 'Sun G5 (Yellow)', categoryId: 2, groupId: 6 },
	planet: { typeId: 11, typeName: 'Planet (Temperate)', categoryId: 2, groupId: 7 },
	moon: { typeId: 14, typeName: 'Moon', categoryId: 2, groupId: 8 },
	belt: { typeId: 15, typeName: 'Asteroid Belt', categoryId: 2, groupId: 9 },
	stargate: { typeId: 16, typeName: 'Stargate (Caldari System)', categoryId: 2, groupId: 10 },
	npcStation: {
		typeId: 1529,
		typeName: 'Caldari Administrative Station',
		categoryId: 3,
		groupId: 15
	},
	astrahus: { typeId: 35832, typeName: 'Astrahus', categoryId: 65, groupId: 1657 },
	ansiblex: { typeId: 35841, typeName: 'Ansiblex Jump Bridge', categoryId: 65, groupId: 1408 },
	rifter: { typeId: 587, typeName: 'Rifter', categoryId: 6, groupId: 25 }
};

const mockTypes = () =>
	getTypeHierarchyMetadata.mockResolvedValue(
		new Map(
			Object.values(TYPES).map((t) => [
				t.typeId,
				{ ...t, categoryName: `Cat ${t.categoryId}`, groupName: `Group ${t.groupId}`, mass: 1 }
			])
		)
	);

const line = (type, name, distance = '5 AU') =>
	`${TYPES[type].typeId}\t${name}\t${TYPES[type].typeName}\t${distance}`;

describe('directional', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockSystemLookup();
		mockTypes();
	});

	it('buckets objects by grid and aggregates category/group/type', async () => {
		const rawData = ['123\tShip Name\tShip Type\t10 km', '456\tStation Name\tStation Type\t10 AU'];

		getTypeHierarchyMetadata.mockResolvedValue(
			new Map([
				[
					123,
					{
						typeId: 123,
						typeName: 'Ship Type',
						categoryId: 6,
						categoryName: 'Ship',
						groupId: 1,
						groupName: 'Frigate',
						mass: 1000
					}
				],
				[
					456,
					{
						typeId: 456,
						typeName: 'Station Type',
						categoryId: 3,
						categoryName: 'Station',
						groupId: 2,
						groupName: 'Station Group',
						mass: 100000
					}
				]
			])
		);

		const result = await createNewDirectionalScan(rawData);

		expect(result.on_grid.total_objects).toBe(1);
		expect(result.on_grid.total_mass).toBe(1000);
		expect(result.off_grid.total_objects).toBe(1);
		expect(result.on_grid.objects[0].name).toBe('Ship');
		expect(result.off_grid.objects[0].name).toBe('Station');
		expect(result.system).toBeUndefined();
	});

	it('skips lines with an invalid format', async () => {
		const result = await createNewDirectionalScan(
			['invalid line', '587\tName\tRifter\t10 km', '12abc\tName\tRifter\t10 km'].join('\n')
		);

		expect(result.on_grid.total_objects).toBe(1);
		expect(result.off_grid.total_objects).toBe(0);
	});

	it('parses lines whose object name contains tabs', async () => {
		const result = await createNewDirectionalScan('587\ther\tto the der\tRifter\t33 km');

		expect(result.on_grid.total_objects).toBe(1);
		expect(result.on_grid.objects[0].objects[0].objects[0].name).toBe('Rifter');
	});

	it('skips lines whose type id is not a positive integer', async () => {
		const { default: logger } = await import('../../../src/lib/logger.js');

		const result = await createNewDirectionalScan([
			'587\tA\tRifter\t10 km',
			'1.5\tB\tRifter\t10 km',
			'0\tC\tRifter\t10 km'
		]);

		expect(result.on_grid.total_objects).toBe(1);
		expect(logger.warn).toHaveBeenCalledWith(expect.objectContaining({ count: 2, totalLines: 3 }));
	});

	it('removes U+2060 word joiners from object names', async () => {
		const result = await createNewDirectionalScan(line('astrahus', 'Ji\u2060ta - Market'));

		// the cleaned name "Jita" resolves; "Ji\u2060ta" would not match any system
		expect(result.system?.name).toBe('Jita');
	});

	it('strips hidden control characters without breaking tab parsing', async () => {
		const result = await createNewDirectionalScan('\u200B587\ther\u0007\tRifter\t33 km\r\n');

		expect(result.on_grid.total_objects).toBe(1);
		expect(result.on_grid.objects[0].objects[0].objects[0].name).toBe('Rifter');
	});

	describe('grid classification', () => {
		it('puts objects up to DSCAN_ON_GRID_MAX_KM on grid and everything further off grid', async () => {
			const max = DSCAN_ON_GRID_MAX_KM;
			const result = await createNewDirectionalScan([
				line('rifter', 'A', `${grouped(max)} km`),
				line('rifter', 'B', `${grouped(max - 1).replace(',', ' ')} km`),
				line('rifter', 'C', '2.500 m'),
				line('rifter', 'D', `${grouped(max + 1)} km`),
				line('rifter', 'E', '0,1 AU'),
				line('rifter', 'F', '-')
			]);

			expect(result.on_grid.total_objects).toBe(3);
			expect(result.off_grid.total_objects).toBe(3);
		});

		it('treats unknown distance units as off grid', async () => {
			const result = await createNewDirectionalScan(line('rifter', 'A', '10 lightyears'));

			expect(result.on_grid.total_objects).toBe(0);
			expect(result.off_grid.total_objects).toBe(1);
		});
	});

	describe('system inference', () => {
		it('returns the full system details of the inferred system', async () => {
			const result = await createNewDirectionalScan(line('sun', 'Jita - Star'));

			expect(result.system).toEqual({
				id: 30000142,
				name: 'Jita',
				constellation: 'Kimotoro',
				region: 'The Forge',
				security: 0.9459
			});
		});

		it('lets the sun outweigh several player structures', async () => {
			const result = await createNewDirectionalScan([
				line('sun', 'Jita - Star'),
				...Array.from({ length: 9 }, (_, i) => line('astrahus', `Amarr - Spam ${i}`, '10 km'))
			]);

			expect(result.system.name).toBe('Jita');
		});

		it('lets more structures win when there is no sun', async () => {
			const result = await createNewDirectionalScan([
				line('astrahus', 'Jita - Market'),
				line('astrahus', 'Amarr - One'),
				line('astrahus', 'Amarr - Two')
			]);

			expect(result.system.name).toBe('Amarr');
		});

		it('infers the system from planets, moons, belts and NPC stations', async () => {
			for (const [type, name] of [
				['planet', 'Jita IV'],
				['moon', 'Jita IV - Moon 4'],
				['belt', 'Jita VII - Asteroid Belt 1'],
				['npcStation', 'Jita IV - Moon 4 - Caldari Navy Assembly Plant']
			]) {
				const result = await createNewDirectionalScan(line(type, name));
				expect(result.system?.name, name).toBe('Jita');
			}
		});

		it('prefers celestial evidence when scores tie', async () => {
			// planet = 3, three structures = 3
			const result = await createNewDirectionalScan([
				line('astrahus', 'Amarr - A'),
				line('astrahus', 'Amarr - B'),
				line('astrahus', 'Amarr - C'),
				line('planet', 'Jita IV')
			]);

			expect(result.system.name).toBe('Jita');
		});

		it('breaks complete ties by name for determinism', async () => {
			const result = await createNewDirectionalScan([
				line('astrahus', 'Jita - A'),
				line('astrahus', 'Amarr - B')
			]);

			expect(result.system.name).toBe('Amarr');
		});

		it('ignores structures whose name has no " - " system prefix', async () => {
			const result = await createNewDirectionalScan([
				line('astrahus', 'Jita'),
				line('astrahus', 'Amarr')
			]);

			expect(result.system).toBeUndefined();
		});

		it('ignores candidates that are not real solar systems', async () => {
			const result = await createNewDirectionalScan([
				...Array.from({ length: 5 }, (_, i) => line('astrahus', `HQ - Keepstar ${i}`)),
				line('astrahus', 'Jita - Market')
			]);

			expect(result.system.name).toBe('Jita');
		});

		it('returns no system when no candidate resolves', async () => {
			const result = await createNewDirectionalScan([
				line('sun', 'Nowhere - Star'),
				line('astrahus', 'HQ - Keepstar')
			]);

			expect(result.system).toBeUndefined();
		});

		it('resolves lower-cased names to the canonical system name', async () => {
			const result = await createNewDirectionalScan(line('sun', 'jita - Star'));

			expect(result.system).toMatchObject({ id: 30000142, name: 'Jita' });
		});

		it('merges evidence for differently cased spellings of one system', async () => {
			// jita + JITA = 2 beats Amarr = 1; scored separately they would tie and Amarr would win by name
			const result = await createNewDirectionalScan([
				line('astrahus', 'jita - One'),
				line('astrahus', 'JITA - Two'),
				line('astrahus', 'Amarr - One')
			]);

			expect(result.system.name).toBe('Jita');
		});

		it('ignores stargates, which name the destination system', async () => {
			const result = await createNewDirectionalScan([
				line('stargate', 'Stargate (Amarr)'),
				line('stargate', 'Amarr - Stargate'),
				line('stargate', 'Perimeter - Stargate'),
				line('astrahus', 'Jita - Market')
			]);

			expect(result.system.name).toBe('Jita');

			const onlyGates = await createNewDirectionalScan([line('stargate', 'Amarr - Stargate')]);
			expect(onlyGates.system).toBeUndefined();
		});

		it('takes the source side of an Ansiblex name', async () => {
			const result = await createNewDirectionalScan(
				line('ansiblex', '1DQ1-A » Perimeter - Bridge')
			);

			expect(result.system.name).toBe('1DQ1-A');
		});

		it('ignores Ansiblex and sun names without their delimiter', async () => {
			const result = await createNewDirectionalScan([
				line('ansiblex', 'Jita Bridge'),
				line('sun', 'Jita')
			]);

			expect(result.system).toBeUndefined();
		});

		it('ignores objects without a name', async () => {
			const result = await createNewDirectionalScan(`${TYPES.astrahus.typeId}\t\tAstrahus\t10 km`);

			expect(result.on_grid.total_objects).toBe(1);
			expect(result.system).toBeUndefined();
		});
	});

	describe('edge cases', () => {
		it('returns empty buckets for empty or non-string input', async () => {
			for (const input of ['', 123, ['', '   ', null]]) {
				const result = await createNewDirectionalScan(input);
				expect(result.on_grid.total_objects).toBe(0);
				expect(result.off_grid.total_objects).toBe(0);
				expect(result.system).toBeUndefined();
			}
		});

		it('keeps objects with unknown type metadata under an unknown category', async () => {
			getTypeHierarchyMetadata.mockResolvedValue(new Map());

			const result = await createNewDirectionalScan('12345\tItem\tType\t10 km');

			expect(result.on_grid.total_objects).toBe(1);
			expect(result.on_grid.objects[0].name).toBe('Unknown Category');
			expect(result.on_grid.objects[0].objects[0].objects[0].name).toBe('Type');
		});

		it('skips non-directional entries in a mixed array', async () => {
			const result = await createNewDirectionalScan([
				'587\tItem\tRifter\t10 km',
				'123\tItem',
				'abc\tItem\tType\t10 km',
				123,
				null,
				undefined
			]);

			expect(result.on_grid.total_objects).toBe(1);
		});
	});

	it('sorts types within a group by count', async () => {
		getTypeHierarchyMetadata.mockResolvedValue(
			new Map([
				[
					1,
					{
						typeId: 1,
						typeName: 'TypeA',
						categoryId: 1,
						categoryName: 'Cat1',
						groupId: 1,
						groupName: 'Group1'
					}
				],
				[
					2,
					{
						typeId: 2,
						typeName: 'TypeB',
						categoryId: 1,
						categoryName: 'Cat1',
						groupId: 1,
						groupName: 'Group1'
					}
				],
				[
					3,
					{
						typeId: 3,
						typeName: 'TypeC',
						categoryId: 5,
						categoryName: 'Cat2',
						groupId: 2,
						groupName: 'Group2'
					}
				]
			])
		);

		const result = await createNewDirectionalScan([
			'2\tC\tTypeB\t10 km',
			'1\tA\tTypeA\t10 km',
			'1\tB\tTypeA\t10 km',
			'3\tD\tTypeC\t10 km',
			'3\tE\tTypeC\t10 km',
			'3\tF\tTypeC\t10 km',
			'3\tG\tTypeC\t10 km'
		]);

		expect(result.on_grid.objects.map((c) => c.name)).toEqual(['Cat2', 'Cat1']);
		const group1 = result.on_grid.objects.find((c) => c.id === 1).objects[0];
		expect(group1.objects.map((t) => [t.name, t.count])).toEqual([
			['TypeA', 2],
			['TypeB', 1]
		]);
	});
});
