import { describe, it, expect } from 'vitest';
import { diffDirectional, diffLocal } from '../../../src/lib/utils/scanDiff.js';

/** d-scan section: categories -> groups -> types */
const section = (groups) => ({
	objects: [
		{
			id: 6,
			name: 'Ship',
			objects: groups.map(([id, name, types]) => ({
				id,
				name,
				objects: types.map(([typeId, typeName, count]) => ({ id: typeId, name: typeName, count }))
			}))
		}
	]
});

describe('diffDirectional', () => {
	const before = {
		on_grid: section([[27, 'Battleship', [[641, 'Megathron', 3]]]]),
		off_grid: section([
			[27, 'Battleship', [[641, 'Megathron', 2]]],
			[26, 'Cruiser', [[627, 'Thorax', 4]]]
		])
	};
	const after = {
		on_grid: section([
			[27, 'Battleship', [[641, 'Megathron', 5]]],
			[30, 'Titan', [[671, 'Erebus', 1]]]
		]),
		off_grid: section([[26, 'Cruiser', [[627, 'Thorax', 4]]]])
	};
	const diff = diffDirectional(before, after);
	const type = (id) => diff.types.find((t) => t.id === id);

	it('counts each type before/after with its on/off-grid split', () => {
		expect(type(641)).toMatchObject({
			before: { on: 3, off: 2, total: 5 },
			after: { on: 5, off: 0, total: 5 },
			delta: 0,
			status: 'changed', // same total, but moved on grid
			gridMoved: 2
		});
		expect(type(627)).toMatchObject({ delta: 0, status: 'same' });
		expect(type(671)).toMatchObject({ delta: 1, status: 'new', group: 'Titan' });
	});

	it('counts grid moves only when one side grew and the other shrank', () => {
		const scan = (on, off) => ({
			on_grid: section([[27, 'Battleship', [[641, 'Megathron', on]]]]),
			off_grid: section([[27, 'Battleship', [[641, 'Megathron', off]]]])
		});
		const moved = (a, b) => diffDirectional(scan(...a), scan(...b)).types[0].gridMoved;
		expect(moved([10, 4], [12, 10])).toBe(0); // arrivals on both sides
		expect(moved([5, 1], [1, 3])).toBe(2); // 4 fewer on grid, 2 more off grid
		expect(moved([5, 1], [1, 1])).toBe(0); // left from grid, nothing new off grid
	});

	it('marks types that disappeared', () => {
		const reverse = diffDirectional(after, before);
		expect(reverse.types.find((t) => t.id === 671)).toMatchObject({ delta: -1, status: 'gone' });
	});

	it('sorts by size of change first', () => {
		expect(diff.types[0].id).toBe(671);
	});

	it('summarises ship classes before/after', () => {
		expect(diff.shipClasses.map((c) => [c.key, c.before.total, c.after.total, c.delta])).toEqual([
			['battleships', 5, 5, 0],
			['cruisers', 4, 4, 0],
			['capitals', 0, 1, 1]
		]);
		expect(diff.totals).toMatchObject({ before: 9, after: 10, shipsBefore: 9, shipsAfter: 10 });
	});

	it('lists changed types that the "Interesting" rules flag (a new Titan)', () => {
		expect(diff.notable.map((t) => t.name)).toEqual(['Erebus']);
	});
});

describe('diffLocal', () => {
	const local = (alliances) => ({ alliances });
	const alliance = (id, ticker, corps) => ({
		id,
		ticker,
		name: ticker ? `${ticker} Alliance` : null,
		corporations: corps
	});
	const corp = (id, ticker, pilots) => ({
		id,
		ticker,
		name: `${ticker} Corp`,
		characters: pilots.map(([pid, name]) => ({ id: pid, name }))
	});

	const before = local([
		alliance(1, 'AAA', [
			corp(10, 'AC1', [
				[100, 'Alice'],
				[101, 'Bob']
			])
		]),
		alliance(0, null, [corp(20, 'SOLO', [[200, 'Carol']])])
	]);
	const after = local([
		alliance(1, 'AAA', [
			corp(10, 'AC1', [[100, 'Alice']]),
			corp(11, 'AC2', [
				[102, 'Dave'],
				[103, 'Eve']
			])
		]),
		alliance(2, 'BBB', [corp(30, 'BC1', [[200, 'Carol']])])
	]);
	const diff = diffLocal(before, after);

	it('splits pilots into arrived, left and stayed', () => {
		expect(diff.totals).toEqual({ before: 3, after: 4, arrived: 2, left: 1, stayed: 2, moved: 1 });
		expect(diff.arrived.map((p) => p.name)).toEqual(['Dave', 'Eve']);
		expect(diff.left).toEqual([{ id: 101, name: 'Bob', corpTicker: 'AC1', allianceTicker: 'AAA' }]);
	});

	it('reports pilots who changed corporation or alliance between the scans', () => {
		expect(diff.moved).toEqual([
			{
				id: 200,
				name: 'Carol',
				from: { corpTicker: 'SOLO', allianceTicker: null },
				to: { corpTicker: 'BC1', allianceTicker: 'BBB' }
			}
		]);
	});

	it('counts alliances and corporations before/after, biggest change first', () => {
		expect(diff.alliances.map((a) => [a.ticker, a.before, a.after, a.delta])).toEqual([
			['AAA', 2, 3, 1],
			['BBB', 0, 1, 1],
			[null, 1, 0, -1]
		]);
		expect(diff.alliances[0].corps.map((c) => [c.ticker, c.before, c.after, c.delta])).toEqual([
			['AC2', 0, 2, 2],
			['AC1', 2, 1, -1]
		]);
		expect(diff.alliances[2].name).toBe('No Alliance');
	});
});
