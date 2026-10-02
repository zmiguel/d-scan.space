import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetScanByID, mockGetScanGroupByID, mockGetScanTimeline } = vi.hoisted(() => ({
	mockGetScanByID: vi.fn(),
	mockGetScanGroupByID: vi.fn(),
	mockGetScanTimeline: vi.fn()
}));

vi.mock('../../src/lib/server/tracer.js', () => ({
	withSpan: vi.fn((name, fn) => fn({ setAttributes: vi.fn() }))
}));

vi.mock('../../src/lib/database/scans.js', () => ({
	getScanByID: mockGetScanByID,
	getScanGroupByID: mockGetScanGroupByID,
	getScanTimeline: mockGetScanTimeline,
	setScanGroupSystemIfOwnerAndUnset: vi.fn()
}));

vi.mock('../../src/lib/database/sde.js', () => ({
	getSystemByName: vi.fn()
}));

import { load } from '../../src/routes/scan/[group]/[scan]/+page.server.js';

const scanRow = {
	id: 'scanA',
	group_id: 'groupA',
	scan_type: 'local',
	created_at: new Date('2026-01-01T00:00:00Z'),
	data: { total_pilots: 1 },
	system: null
};

function event(group, scan) {
	return {
		params: { group, scan },
		locals: { auth: vi.fn().mockResolvedValue(null) }
	};
}

describe('routes/scan/[group]/[scan] load', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockGetScanByID.mockResolvedValue([scanRow]);
		mockGetScanGroupByID.mockResolvedValue({
			id: 'groupA',
			system: null,
			public: false,
			created_by: null
		});
		mockGetScanTimeline.mockResolvedValue([
			{ id: 'scanA', scan_type: 'local', created_at: scanRow.created_at, total_pilots: 1 }
		]);
	});

	it('redirects a scan opened under another group to its own group URL', async () => {
		await expect(load(event('groupB', 'scanA'))).rejects.toMatchObject({
			status: 301,
			location: '/scan/groupA/scanA'
		});
		expect(mockGetScanGroupByID).not.toHaveBeenCalled();
	});

	it('exposes the group visibility so private scans are not indexed', async () => {
		const result = await load(event('groupA', 'scanA'));
		expect(result.isPublic).toBe(false);
		expect(result.local).toEqual({ total_pilots: 1 });
	});

	it('pairs the latest earlier scan of the other type and keeps timeline rows lean', async () => {
		const directional = {
			id: 'scanD',
			group_id: 'groupA',
			scan_type: 'directional',
			created_at: new Date('2025-12-31T23:50:00Z'),
			data: { on_grid: { total_objects: 3 } },
			system: null
		};
		mockGetScanTimeline.mockResolvedValue([
			{ id: 'old', scan_type: 'directional', created_at: new Date('2025-12-31T20:00:00Z') },
			{ id: 'scanD', scan_type: 'directional', created_at: directional.created_at },
			{ id: 'scanA', scan_type: 'local', created_at: scanRow.created_at, total_pilots: 1 },
			{ id: 'later', scan_type: 'directional', created_at: new Date('2026-01-01T01:00:00Z') }
		]);
		mockGetScanByID.mockImplementation(async (id) =>
			id === 'scanA' ? [scanRow] : id === 'scanD' ? [directional] : []
		);

		const result = await load(event('groupA', 'scanA'));

		expect(result.directional).toEqual(directional.data);
		expect(result.related).toHaveLength(4);
		expect(result.related.every((row) => !('data' in row))).toBe(true);
	});
});
