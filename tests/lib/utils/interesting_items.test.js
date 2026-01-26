import { describe, it, expect } from 'vitest';
import { buildInterestingItems } from '../../../src/lib/utils/interesting_items.js';

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
	it('supports legacy numeric ids list', () => {
		const result = buildInterestingItems(buildDirectional(), null, [30]);
		expect(result.map((i) => i.id)).toEqual([30]);
	});

	it('returns empty when no ids provided', () => {
		const result = buildInterestingItems(buildDirectional(), null, []);
		expect(result).toEqual([]);
	});

	it('uses default INTERESTING_RULES when not provided', () => {
		const result = buildInterestingItems(buildDirectional(), null);
		const ids = result.map((item) => item.id).sort();
		expect(ids).toEqual([30, 45534].sort());
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

		const result = buildInterestingItems(onGrid, offGrid, [
			{ id: 30, min_count: 1 },
			{ id: 1972, min_count: 1 }
		]);
		expect(result[0]).toMatchObject({ id: 30, total: 4, on: 1, off: 3 });
		expect(result[1]).toMatchObject({ id: 45534, total: 2, on: 2, off: 0 });
	});

	it('keeps null group when items have no group', () => {
		const onGrid = { objects: [{ id: 30, name: 'Titan', count: 1 }] };
		const result = buildInterestingItems(onGrid, null, [{ id: 30, min_count: 1 }]);
		expect(result[0].group).toBeNull();
	});

	it('returns empty when rules is not an array', () => {
		const result = buildInterestingItems(buildDirectional(), null, /** @type {any} */ ('bad'));
		expect(result).toEqual([]);
	});

	it('uses default rules when interestingIds is null', () => {
		const result = buildInterestingItems(buildDirectional(), null, /** @type {any} */ (null));
		const ids = result.map((i) => i.id).sort();
		expect(ids).toEqual([30, 45534].sort());
	});

	it('skips invalid rules (NaN ids / non-numeric ids)', () => {
		const result = buildInterestingItems(
			buildDirectional(),
			null,
			/** @type {any} */ ([
				NaN,
				null,
				'bad',
				{ id: 'abc', min_count: 1 },
				{ id: 30, min_count: 'nope', min_percent: 'nope' }
			])
		);
		// The only rule that survives normalization has no active thresholds, so nothing is interesting.
		expect(result).toEqual([]);
	});

	it('treats min_count=0 and min_percent=0 as disabled thresholds', () => {
		const onGrid = { objects: [{ id: 30, name: 'Titan', count: 10 }] };
		const result = buildInterestingItems(onGrid, null, [{ id: 30, min_count: 0, min_percent: 0 }]);
		expect(result).toEqual([]);
	});

	it('min_percent never matches when grand total is 0', () => {
		const onGrid = {
			objects: [{ id: 6, name: 'Ship', objects: [{ id: 30, name: 'Titan', count: 0 }] }]
		};
		const result = buildInterestingItems(onGrid, null, [{ id: 30, min_percent: 1 }]);
		expect(result).toEqual([]);
	});

	it('min_percent alone can include an item when it passes', () => {
		const onGrid = {
			objects: [
				{
					id: 6,
					name: 'Ship',
					objects: [
						{ id: 30, name: 'Titan', count: 1 },
						{ id: 999, name: 'Other', count: 49 }
					]
				}
			]
		};

		const result = buildInterestingItems(onGrid, null, [{ id: 30, min_percent: 2 }]);
		expect(result.map((i) => i.id)).toEqual([30]);
	});

	it('uses category name as group when category contains leaves directly', () => {
		const onGrid = {
			objects: [
				{
					id: 6,
					name: 'Ship',
					objects: [
						{ id: 30, name: 'Titan', count: 1 },
						{ id: 999, name: 'Other', count: 1 }
					]
				}
			]
		};

		const result = buildInterestingItems(onGrid, null, [{ id: 30, min_count: 1 }]);
		expect(result[0]).toMatchObject({ id: 30, group: 'Ship' });
	});

	it('handles null children when detecting nested groups', () => {
		const onGrid = {
			objects: [
				{
					id: 6,
					name: 'Ship',
					objects: [
						null,
						{
							id: 27,
							name: 'Battleship',
							objects: [{ id: 30, name: 'Titan', count: 1 }]
						}
					]
				}
			]
		};

		const result = buildInterestingItems(onGrid, null, [{ id: 30, min_count: 1 }]);
		expect(result.map((i) => i.id)).toEqual([30]);
	});

	it('uses name tie-breaker when totals match', () => {
		const onGrid = {
			objects: [
				{
					id: 6,
					name: 'Ship',
					objects: [
						{ id: 1, name: undefined, count: 1 },
						{ id: 2, name: 'Beta', count: 1 }
					]
				}
			]
		};

		const result = buildInterestingItems(onGrid, null, [
			{ id: 1, min_count: 1 },
			{ id: 2, min_count: 1 }
		]);
		expect(result.map((i) => i.id)).toEqual([1, 2]);
	});

	it('handles tie-break when both names are missing', () => {
		const onGrid = {
			objects: [
				{
					id: 6,
					name: 'Ship',
					objects: [
						{ id: 10, name: undefined, count: 1 },
						{ id: 11, name: null, count: 1 }
					]
				}
			]
		};

		const result = buildInterestingItems(onGrid, null, [
			{ id: 10, min_count: 1 },
			{ id: 11, min_count: 1 }
		]);
		expect(result.map((i) => i.id).sort()).toEqual([10, 11]);
	});

	it('filters by min_percent over total scan count when both thresholds are set', () => {
		// Total count = 300. Titan count = 1 => 0.33%
		const onGrid = {
			objects: [
				{
					id: 6,
					name: 'Ship',
					objects: [
						{ id: 30, name: 'Titan', count: 1 },
						{ id: 999, name: 'Other', count: 299 }
					]
				}
			]
		};

		const result = buildInterestingItems(onGrid, null, [{ id: 30, min_count: 1, min_percent: 2 }]);
		expect(result).toEqual([]);
	});

	it('uses group rule when no type rule exists', () => {
		const onGrid = buildDirectional();
		const result = buildInterestingItems(onGrid, null, [{ id: 27, min_count: 2 }]);
		const ids = result.map((i) => i.id).sort();
		expect(ids).toEqual([30, 12003].sort());
	});

	it('type rules override group rules (type has priority)', () => {
		const onGrid = buildDirectional();

		// Group Battleship (27) qualifies via min_count=2,
		// but Titan (30) is forced to require min_count=2 and will NOT qualify.
		const result = buildInterestingItems(onGrid, null, [
			{ id: 27, min_count: 2 },
			{ id: 30, min_count: 2 }
		]);

		expect(result.map((i) => i.id)).toEqual([12003]);
	});

	it('type rule can include a specific type even if group rule fails', () => {
		const onGrid = buildDirectional();

		// Group Battleship (27) fails (needs 50), but Titan (30) passes (needs 1).
		const result = buildInterestingItems(onGrid, null, [
			{ id: 27, min_count: 50 },
			{ id: 30, min_count: 1 }
		]);
		expect(result.map((i) => i.id)).toEqual([30]);
	});

	it('requires both thresholds when min_count and min_percent are set', () => {
		const onGrid = {
			objects: [
				{
					id: 6,
					name: 'Ship',
					objects: [
						{ id: 30, name: 'Titan', count: 1 },
						{ id: 999, name: 'Other', count: 49 }
					]
				}
			]
		};

		// count passes (>=1) but percent is 2% (1/50=2%) => passes at 2%, fails at 3%
		const pass = buildInterestingItems(onGrid, null, [{ id: 30, min_count: 1, min_percent: 2 }]);
		const fail = buildInterestingItems(onGrid, null, [{ id: 30, min_count: 1, min_percent: 3 }]);

		expect(pass.map((i) => i.id)).toEqual([30]);
		expect(fail).toEqual([]);
	});
});
