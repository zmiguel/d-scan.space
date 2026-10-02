import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockScanStats } = vi.hoisted(() => ({ mockScanStats: vi.fn() }));

vi.mock('../../src/lib/server/tracer.js', () => ({
	withSpan: vi.fn((name, fn) => fn({ setAttributes: vi.fn() }))
}));

vi.mock('../../src/lib/database/stats.js', () => ({
	getScanStats: mockScanStats,
	getCharacterStats: vi.fn(async () => ({ totalCharacters: 2 })),
	getCorporationStats: vi.fn(async () => ({ totalCorporations: 3 })),
	getAllianceStats: vi.fn(async () => ({ totalAlliances: 4 }))
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
