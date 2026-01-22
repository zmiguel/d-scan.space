import { describe, it, expect } from 'vitest';
import {
	buildInterestingItems,
	INTERESTING_IDS
} from '../../../src/lib/utils/interesting_items.js';

const buildDirectional = () => ({
	objects: [
		{
			id: 6,
			name: 'Ship',
			total_objects: 3,
			objects: [
				{
					id: 27,
					name: 'Battleship',
					total_objects: 2,
					objects: [
						{ id: 30, name: 'Titan', count: 1 },
						{ id: 12003, name: 'Zealot', count: 1 }
					]
				},
				{
					id: 1972,
					name: 'Flag Cruiser',
					total_objects: 2,
					objects: [{ id: 45534, name: 'Monitor', count: 2 }]
				}
			]
		}
	]
});

describe('interesting items', () => {
	it('returns empty when no ids provided', () => {
		const result = buildInterestingItems(buildDirectional(), null, []);
		expect(result).toEqual([]);
	});

	it('uses default INTERESTING_IDS when not provided', () => {
		const result = buildInterestingItems(buildDirectional(), null);
		const ids = result.map((item) => item.id).sort();
		expect(ids).toEqual([30, 45534].sort());
		expect(INTERESTING_IDS).toEqual([30, 1972]);
	});

	it('aggregates on/off counts and sorts by total desc', () => {
		const onGrid = buildDirectional();
		const offGrid = {
			objects: [
				{
					id: 6,
					name: 'Ship',
					total_objects: 1,
					objects: [
						{
							id: 30,
							name: 'Titan',
							count: 3
						}
					]
				}
			]
		};

		const result = buildInterestingItems(onGrid, offGrid, [30, 1972]);
		expect(result[0]).toMatchObject({ id: 30, total: 4, on: 1, off: 3 });
		expect(result[1]).toMatchObject({ id: 45534, total: 2, on: 2, off: 0 });
	});

	it('keeps null group when items have no group', () => {
		const onGrid = { objects: [{ id: 30, name: 'Titan', count: 1 }] };
		const result = buildInterestingItems(onGrid, null, [30]);
		expect(result[0].group).toBeNull();
	});
});
