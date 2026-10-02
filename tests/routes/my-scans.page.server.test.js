import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSpan, mockGetUserScansPage } = vi.hoisted(() => {
	return {
		mockSpan: {
			setAttributes: vi.fn(),
			setStatus: vi.fn(),
			addEvent: vi.fn()
		},
		mockGetUserScansPage: vi.fn()
	};
});

vi.mock('../../src/lib/server/tracer.js', () => ({
	withSpan: vi.fn((name, fn) => fn(mockSpan))
}));

vi.mock('../../src/lib/database/scans.js', () => ({
	getUserScansPage: mockGetUserScansPage
}));

import { load } from '../../src/routes/my-scans/+page.server.js';

describe('routes/my-scans/+page.server.js', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns login prompt state when user is not authenticated', async () => {
		const event = {
			url: new URL('http://localhost/my-scans'),
			locals: {
				auth: vi.fn().mockResolvedValue(null)
			}
		};

		const result = await load(event);

		expect(result).toEqual({
			requiresLogin: true,
			scans: []
		});
		expect(mockGetUserScansPage).not.toHaveBeenCalled();
		expect(mockSpan.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				'page.type': 'my_scans_list',
				'auth.logged_in': false
			})
		);
	});

	it('passes URL filters to the user query and returns page data', async () => {
		const scans = [{ id: 'scan-1', group_id: 'group-1', public: true }];
		mockGetUserScansPage.mockResolvedValue({ rows: scans, total: 120, page: 3, pageSize: 50 });

		const event = {
			url: new URL('http://localhost/my-scans?page=3&q=%20jita%20&type=local'),
			locals: {
				auth: vi.fn().mockResolvedValue({
					user: { id: 'user-1', name: 'Fallback Name' },
					eve: { characterName: 'Main Character' }
				})
			}
		};

		const result = await load(event);

		expect(mockGetUserScansPage).toHaveBeenCalledWith('user-1', {
			page: 3,
			query: 'jita',
			type: 'local'
		});
		expect(result).toEqual({
			requiresLogin: false,
			scans,
			total: 120,
			page: 3,
			pageSize: 50,
			pageCount: 3,
			query: 'jita',
			type: 'local'
		});
		expect(mockSpan.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				'auth.logged_in': true,
				'user.id': 'user-1',
				'user.primary_character_name': 'Main Character'
			})
		);
	});

	it('ignores invalid page/type values and falls back to unknown character name', async () => {
		mockGetUserScansPage.mockResolvedValue({ rows: [], total: 0, page: 1, pageSize: 50 });

		const event = {
			url: new URL('http://localhost/my-scans?page=abc&type=wormhole'),
			locals: {
				auth: vi.fn().mockResolvedValue({
					user: { id: 'user-2' }
				})
			}
		};

		const result = await load(event);

		expect(mockGetUserScansPage).toHaveBeenCalledWith('user-2', { page: 1, query: '', type: '' });
		expect(result).toMatchObject({ scans: [], total: 0, page: 1, pageCount: 1, type: '' });
		expect(mockSpan.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				'scans.user_count': 0,
				'user.primary_character_name': 'unknown'
			})
		);
	});
});
