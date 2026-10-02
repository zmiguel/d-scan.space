import { describe, it, expect } from 'vitest';
import { fillDays, fillHours, shipMix } from '../../../src/lib/utils/statsTrends.js';

describe('fillDays', () => {
	it('returns one UTC day per entry ending today, with zeros for missing days', () => {
		const now = new Date('2026-10-02T01:30:00Z');
		const days = fillDays(
			[{ day: '2026-10-01', local: '3', directional: 1 }],
			3,
			{ local: 0, directional: 0 },
			now
		);
		expect(days).toEqual([
			{ day: '2026-09-30', local: 0, directional: 0 },
			{ day: '2026-10-01', local: 3, directional: 1 },
			{ day: '2026-10-02', local: 0, directional: 0 }
		]);
	});
});

describe('fillHours', () => {
	it('covers all 24 hours', () => {
		const hours = fillHours([{ hour: 19, scans: '4' }]);
		expect(hours).toHaveLength(24);
		expect(hours[19]).toEqual({ hour: 19, scans: 4 });
		expect(hours[0]).toEqual({ hour: 0, scans: 0 });
	});
});

describe('shipMix', () => {
	it('merges on/off grid group totals into ship classes with shares', () => {
		const mix = shipMix([
			{ id: '27', name: 'Battleship', side: 'on', total: '3' },
			{ id: '27', name: 'Battleship', side: 'off', total: 1 },
			{ id: '900', name: 'Marauder', side: 'off', total: 2 },
			{ id: '26', name: 'Cruiser', side: 'on', total: 4 }
		]);
		expect(mix.total).toBe(10);
		expect(mix.classes.map((c) => [c.key, c.total, c.share])).toEqual([
			['battleships', 6, 0.6],
			['cruisers', 4, 0.4]
		]);
	});

	it('is empty without d-scans', () => {
		expect(shipMix([])).toEqual({ total: 0, classes: [] });
	});
});
