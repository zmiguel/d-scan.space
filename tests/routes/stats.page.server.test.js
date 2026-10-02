import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockScanStats } = vi.hoisted(() => ({ mockScanStats: vi.fn() }));

vi.mock('../../src/lib/server/tracer.js', () => ({
	withSpan: vi.fn((name, fn) => fn({ setAttributes: vi.fn() }))
}));

vi.mock('../../src/lib/database/stats.js', () => ({
	ACTIVITY_DAYS: 30,
	HOURS_DAYS: 90,
	getScanStats: mockScanStats,
	getCharacterStats: vi.fn(async () => ({ totalCharacters: 2 })),
	getCorporationStats: vi.fn(async () => ({ totalCorporations: 3 })),
	getAllianceStats: vi.fn(async () => ({ totalAlliances: 4 })),
	getScanActivity: vi.fn(async () => ({ perDay: [], perHour: [] })),
	getScanHighlights: vi.fn(async () => ({
		systems: [],
		regions: [],
		alliances: [],
		shipGroups: [],
		averages: {},
		pilotsPerDay: []
	}))
}));

vi.mock('../../src/lib/database/sde.js', () => ({
	getLastInstalledSDEVersion: vi.fn(async () => ({
		release_version: 3201939,
		release_date: new Date('2026-09-30T11:00:00Z')
	}))
}));

import { _resetStatsCache, load } from '../../src/routes/stats/+page.server.js';

describe('routes/stats load cache', () => {
	beforeEach(() => {
		vi.useRealTimers();
		vi.clearAllMocks();
		_resetStatsCache();
		mockScanStats.mockResolvedValue({ totalScans: 1 });
	});

	it('serves repeated loads within the TTL from one database round', async () => {
		await load({});
		const second = await load({});

		expect(mockScanStats).toHaveBeenCalledTimes(1);
		expect(second.scanStats).toEqual({ totalScans: 1 });
	});

	it('reloads after the TTL expires', async () => {
		vi.useFakeTimers({ now: 0 });
		await load({});
		vi.setSystemTime(61_000);
		await load({});

		expect(mockScanStats).toHaveBeenCalledTimes(2);
	});

	it('does not cache a failed load', async () => {
		mockScanStats.mockRejectedValueOnce(new Error('db down'));

		await expect(load({})).rejects.toThrow('db down');
		await expect(load({})).resolves.toMatchObject({ scanStats: { totalScans: 1 } });
		expect(mockScanStats).toHaveBeenCalledTimes(2);
	});
});
