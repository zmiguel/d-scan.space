import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockSpan, mockGetScansByUser } = vi.hoisted(() => {
	return {
		mockSpan: {
			setAttributes: vi.fn(),
			setStatus: vi.fn(),
			addEvent: vi.fn()
		},
		mockGetScansByUser: vi.fn()
	};
});

vi.mock('../../src/lib/server/tracer.js', () => ({
	withSpan: vi.fn((name, fn) => fn(mockSpan))
}));

vi.mock('../../src/lib/database/scans.js', () => ({
	getScansByUser: mockGetScansByUser
}));

import { load } from '../../src/routes/my-scans/+page.server.js';

describe('routes/my-scans/+page.server.js', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns login prompt state when user is not authenticated', async () => {
		const event = {
			locals: {
				auth: vi.fn().mockResolvedValue(null)
			}
		};

		const result = await load(event);

		expect(result).toEqual({
			requiresLogin: true,
			scans: []
		});
		expect(mockGetScansByUser).not.toHaveBeenCalled();
		expect(mockSpan.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				'page.type': 'my_scans_list',
				'auth.logged_in': false
			})
		);
	});

	it('returns user scans and includes primary character name in tracing attributes', async () => {
		const scans = [{ id: 'scan-1', group_id: 'group-1', public: true }];
		mockGetScansByUser.mockResolvedValue(scans);

		const event = {
			locals: {
				auth: vi.fn().mockResolvedValue({
					user: { id: 'user-1', name: 'Fallback Name' },
					eve: { characterName: 'Main Character' }
				})
			}
		};

		const result = await load(event);

		expect(mockGetScansByUser).toHaveBeenCalledWith('user-1');
		expect(result).toEqual({
			requiresLogin: false,
			scans
		});
		expect(result.scans[0].public).toBe(true);
		expect(mockSpan.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				'auth.logged_in': true,
				'user.id': 'user-1',
				'user.primary_character_name': 'Main Character'
			})
		);
	});

	it('falls back to unknown primary character name when not present in session', async () => {
		mockGetScansByUser.mockResolvedValue(null);

		const event = {
			locals: {
				auth: vi.fn().mockResolvedValue({
					user: { id: 'user-2' }
				})
			}
		};

		const result = await load(event);

		expect(mockGetScansByUser).toHaveBeenCalledWith('user-2');
		expect(result).toEqual({
			requiresLogin: false,
			scans: null
		});
		expect(mockSpan.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				'scans.user_count': 0,
				'user.primary_character_name': 'unknown'
			})
		);
	});
});
