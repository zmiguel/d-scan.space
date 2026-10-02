import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockGetScanByID, mockGetScanTimeline } = vi.hoisted(() => ({
	mockGetScanByID: vi.fn(),
	mockGetScanTimeline: vi.fn()
}));

vi.mock('../../src/lib/server/tracer.js', () => ({
	withSpan: vi.fn((name, fn) => fn({ setAttributes: vi.fn() }))
}));

vi.mock('../../src/lib/database/scans.js', () => ({
	getScanByID: mockGetScanByID,
	getScanTimeline: mockGetScanTimeline
}));

import { load as loadEntry } from '../../src/routes/compare/+page.server.js';
import { load as loadDetail } from '../../src/routes/compare/[a]/[b]/+page.server.js';

const scans = {
	oldLocal: {
		id: 'oldLocal',
		group_id: 'groupA',
		scan_type: 'local',
		created_at: new Date('2026-01-01T00:00:00Z'),
		data: { alliances: [] },
		system: { id: 30000142, name: 'Jita' }
	},
	newLocal: {
		id: 'newLocal',
		group_id: 'groupB',
		scan_type: 'local',
		created_at: new Date('2026-01-01T01:00:00Z'),
		data: { alliances: [] },
		system: { id: 30002187, name: 'Amarr' }
	},
	dscanAA: {
		id: 'dscanAA',
		group_id: 'groupA',
		scan_type: 'directional',
		created_at: new Date('2026-01-01T00:30:00Z'),
		data: {},
		system: null
	}
};

const entry = (a, b) => {
	const url = new URL('http://localhost/compare');
	if (a != null) url.searchParams.set('a', a);
	if (b != null) url.searchParams.set('b', b);
	return { url };
};

beforeEach(() => {
	vi.clearAllMocks();
	mockGetScanByID.mockImplementation(async (id) => (scans[id] ? [scans[id]] : []));
	mockGetScanTimeline.mockImplementation(async (groupId) =>
		Object.values(scans)
			.filter((s) => s.group_id === groupId)
			.sort((x, y) => x.created_at - y.created_at)
	);
});

describe('/compare entry', () => {
	it('shows the empty form without inputs', async () => {
		expect(await loadEntry(entry())).toEqual({ a: '', b: '', message: null });
	});

	it('redirects with the older scan first, whatever order the links were pasted in', async () => {
		await expect(
			loadEntry(entry('https://d-scan.space/scan/groupB/newLocal', 'oldLocal'))
		).rejects.toMatchObject({ status: 303, location: '/compare/oldLocal/newLocal' });
	});

	it('resolves a group link to that group’s latest scan of the same type', async () => {
		await expect(loadEntry(entry('newLocal', '/scan/groupA'))).rejects.toMatchObject({
			location: '/compare/oldLocal/newLocal'
		});
	});

	it('explains why two scans cannot be compared', async () => {
		expect((await loadEntry(entry('oldLocal', 'dscanAA'))).message).toMatch(/same type/);
		expect((await loadEntry(entry('oldLocal', 'missingXX'))).message).toMatch(/not found/);
		expect((await loadEntry(entry('oldLocal', 'oldLocal'))).message).toMatch(/two different/);
		expect((await loadEntry(entry('/scan/groupA', '/scan/groupB'))).message).toMatch(
			/specific scan/
		);
		expect((await loadEntry(entry('dscanAA', '/scan/groupB'))).message).toMatch(/no other d-scan/);
		expect((await loadEntry(entry('oldLocal', 'hello world'))).message).toMatch(/Paste two/);
	});
});

describe('/compare/[a]/[b]', () => {
	const detail = (a, b) => ({ params: { a, b } });

	it('keeps the URL order and returns only the diff and scan metadata', async () => {
		const result = await loadDetail(detail('newLocal', 'oldLocal'));
		expect(result.before.id).toBe('newLocal');
		expect(result.after.id).toBe('oldLocal');
		expect(result.before).not.toHaveProperty('data');
		expect(result.diff.totals).toMatchObject({ before: 0, after: 0 });
		expect(result.systemsDiffer).toBe(true);
		expect(result.choices.map((c) => c.id)).toEqual(['newLocal', 'oldLocal']);
	});

	it('rejects scans of different types and unknown scans', async () => {
		await expect(loadDetail(detail('oldLocal', 'dscanAA'))).rejects.toMatchObject({ status: 400 });
		await expect(loadDetail(detail('oldLocal', 'missingXX'))).rejects.toMatchObject({
			status: 404
		});
	});
});
