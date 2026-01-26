import { describe, it, expect } from 'vitest';
import {
	SHIP_CATEGORY_ID,
	listGroups,
	getNodeCount,
	sortByTotal,
	sortCategories,
	collectAllLeaves,
	buildGroupStats
} from '../../../src/lib/utils/directional.js';

const buildDirectional = () => ({
	objects: [
		{
			id: SHIP_CATEGORY_ID,
			name: 'Ship',
			total_objects: 3,
			objects: [
				{
					id: 27,
					name: 'Battleship',
					total_objects: 2,
					objects: [
						{ id: 100, name: 'Raven', count: 1 },
						{ id: 101, name: 'Typhoon', count: 1 }
					]
				},
				{
					id: 1972,
					name: 'Flag Cruiser',
					total_objects: 1,
					objects: [{ id: 200, name: 'Monitor', count: 1 }]
				}
			]
		},
		{
			id: 65,
			name: 'Structure',
			total_objects: 5,
			objects: [
				{
					id: 1657,
					name: 'Citadel',
					total_objects: 5,
					objects: [{ id: 300, name: 'Fortizar', count: 5 }]
				}
			]
		}
	]
});

describe('directional utils', () => {
	it('listGroups returns objects or empty', () => {
		expect(listGroups(null)).toEqual([]);
		expect(listGroups({})).toEqual([]);
		expect(listGroups({ objects: 'nope' })).toEqual([]);
		expect(listGroups({ objects: [1, 2] })).toEqual([1, 2]);
	});

	it('getNodeCount resolves count or total_objects', () => {
		expect(getNodeCount({ count: 4, total_objects: 10 })).toBe(4);
		expect(getNodeCount({ total_objects: 7 })).toBe(7);
		expect(getNodeCount({})).toBe(0);
	});

	it('sortByTotal sorts by count desc then name', () => {
		const list = [
			{ name: 'Bravo', count: 2 },
			{ name: 'Alpha', count: 2 },
			{ name: 'Zulu', count: 5 }
		];
		const sorted = sortByTotal(list);
		expect(sorted.map((item) => item.name)).toEqual(['Zulu', 'Alpha', 'Bravo']);
	});

	it('sortByTotal handles missing names', () => {
		const list = [{ count: 1 }, { name: 'Beta', count: 1 }, { name: null, count: 1 }];
		const sorted = sortByTotal(list);
		expect(sorted[0].name).toBeUndefined();
	});

	it('sortCategories puts ship category first', () => {
		const list = [
			{ id: 65, name: 'Structure', total_objects: 10 },
			{ id: SHIP_CATEGORY_ID, name: 'Ship', total_objects: 1 },
			{ id: 2, name: 'Celestial', total_objects: 5 }
		];
		const sorted = sortCategories(list);
		expect(sorted[0].id).toBe(SHIP_CATEGORY_ID);
	});

	it('sortCategories uses name tie-breaker when counts equal', () => {
		const list = [
			{ id: 65, name: 'Zulu', total_objects: 2 },
			{ id: 2, name: 'Alpha', total_objects: 2 }
		];
		const sorted = sortCategories(list);
		expect(sorted.map((item) => item.name)).toEqual(['Alpha', 'Zulu']);
	});

	it('sortCategories handles missing names', () => {
		const list = [
			{ id: 2, total_objects: 1 },
			{ id: 3, name: 'Alpha', total_objects: 1 },
			{ id: 4, name: null, total_objects: 1 }
		];
		const sorted = sortCategories(list);
		expect(sorted[0].name).toBeUndefined();
	});

	it('collectAllLeaves returns leaf items with group/category', () => {
		const items = collectAllLeaves(buildDirectional());
		const raven = items.find((item) => item.name === 'Raven');
		const fortizar = items.find((item) => item.name === 'Fortizar');

		expect(raven).toMatchObject({ group: 'Battleship', category: 'Ship', count: 1 });
		expect(fortizar).toMatchObject({ group: 'Citadel', category: 'Structure', count: 5 });
	});

	it('collectAllLeaves handles empty objects arrays', () => {
		const section = {
			objects: [{ id: 777, name: 'Loose', objects: [], count: 2 }]
		};
		const items = collectAllLeaves(section);
		expect(items).toEqual([{ id: 777, name: 'Loose', count: 2, category: null, group: null }]);
	});

	it('collectAllLeaves skips invalid nodes', () => {
		const section = {
			objects: [null, 'bad', { id: 1, name: 'Ok', count: 1 }]
		};
		const items = collectAllLeaves(section);
		expect(items).toEqual([{ id: 1, name: 'Ok', count: 1, category: null, group: null }]);
	});

	it('collectAllLeaves ignores zero-count leaves', () => {
		const section = {
			objects: [{ id: 2, name: 'Zero', count: 0 }]
		};
		const items = collectAllLeaves(section);
		expect(items).toEqual([]);
	});

	it('buildGroupStats aggregates totals and ships first', () => {
		const onGrid = buildDirectional();
		const offGrid = {
			objects: [
				{
					id: 2,
					name: 'Celestial',
					total_objects: 4,
					objects: [
						{
							id: 10,
							name: 'Stargate',
							total_objects: 4,
							objects: [{ id: 400, name: 'Gate', count: 4 }]
						}
					]
				}
			]
		};

		const stats = buildGroupStats(onGrid, offGrid);
		expect(stats[0].categoryId).toBe(SHIP_CATEGORY_ID);

		const battleship = stats.find((group) => group.name === 'Battleship');
		expect(battleship).toMatchObject({ on: 2, off: 0, total: 2 });

		const stargate = stats.find((group) => group.name === 'Stargate');
		expect(stargate).toMatchObject({ on: 0, off: 4, total: 4 });
	});

	it('buildGroupStats skips zero-count leaves', () => {
		const onGrid = {
			objects: [
				{
					id: SHIP_CATEGORY_ID,
					name: 'Ship',
					total_objects: 0,
					objects: [
						{
							id: 27,
							name: 'Battleship',
							total_objects: 0,
							objects: [{ id: 1, name: 'X', count: 0 }]
						}
					]
				}
			]
		};
		const stats = buildGroupStats(onGrid, null);
		expect(stats).toEqual([]);
	});

	it('buildGroupStats handles null sections', () => {
		const stats = buildGroupStats(null, null);
		expect(stats).toEqual([]);
	});

	it('buildGroupStats handles missing category ids', () => {
		const onGrid = {
			objects: [
				{
					name: 'Unknown',
					total_objects: 1,
					objects: [
						{
							id: 10,
							name: 'Group',
							total_objects: 1,
							objects: [{ id: 1, name: 'Thing', count: 1 }]
						}
					]
				}
			]
		};
		const stats = buildGroupStats(onGrid, null);
		expect(stats).toHaveLength(1);
		expect(Number.isNaN(stats[0].categoryId)).toBe(true);
	});

	it('buildGroupStats skips leaves without group info', () => {
		const onGrid = {
			objects: [{ id: 999, name: 'Loose', count: 2 }]
		};
		const stats = buildGroupStats(onGrid, null);
		expect(stats).toEqual([]);
	});

	it('buildGroupStats skips invalid nodes', () => {
		const onGrid = {
			objects: [null]
		};
		const stats = buildGroupStats(onGrid, null);
		expect(stats).toEqual([]);
	});

	it('buildGroupStats uses name tie-breaker when totals equal', () => {
		const onGrid = {
			objects: [
				{
					id: 65,
					name: 'Structure',
					total_objects: 2,
					objects: [
						{
							id: 1657,
							name: 'Zulu',
							total_objects: 2,
							objects: [{ id: 500, name: 'Thing', count: 2 }]
						}
					]
				},
				{
					id: 2,
					name: 'Celestial',
					total_objects: 2,
					objects: [
						{
							id: 10,
							name: 'Alpha',
							total_objects: 2,
							objects: [{ id: 501, name: 'Other', count: 2 }]
						}
					]
				}
			]
		};

		const stats = buildGroupStats(onGrid, null);
		expect(stats.map((item) => item.name)).toEqual(['Alpha', 'Zulu']);
	});
});
