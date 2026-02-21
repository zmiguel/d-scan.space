import { beforeEach, describe, expect, it, vi } from 'vitest';

const { mockWithSpan, mockSpan, mockSearchSystemsByName } = vi.hoisted(() => ({
	mockSpan: {
		setAttributes: vi.fn(),
		setStatus: vi.fn(),
		addEvent: vi.fn()
	},
	mockWithSpan: vi.fn((name, fn) => fn(mockSpan)),
	mockSearchSystemsByName: vi.fn()
}));

vi.mock('../../src/lib/server/tracer.js', () => ({
	withSpan: mockWithSpan
}));

vi.mock('../../src/lib/database/sde.js', () => ({
	searchSystemsByName: mockSearchSystemsByName
}));

import { GET } from '../../src/routes/api/systems/search/+server.js';

describe('route api/systems/search', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns system suggestions', async () => {
		mockSearchSystemsByName.mockResolvedValue([{ id: 1, name: 'Jita' }]);

		const event = {
			url: new URL('http://localhost/api/systems/search?q=Ji&limit=5'),
			locals: {
				auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		};

		const response = await GET(event);
		const body = await response.json();

		expect(mockSearchSystemsByName).toHaveBeenCalledWith('Ji', 5);
		expect(body).toEqual({ systems: [{ id: 1, name: 'Jita' }] });
	});

	it('uses default parameters when query is omitted', async () => {
		mockSearchSystemsByName.mockResolvedValue([]);

		const event = {
			url: new URL('http://localhost/api/systems/search'),
			locals: {
				auth: vi.fn().mockResolvedValue({ user: { id: 'user-1' } })
			}
		};

		const response = await GET(event);
		const body = await response.json();

		expect(mockSearchSystemsByName).toHaveBeenCalledWith('', 10);
		expect(body).toEqual({ systems: [] });
	});

	it('returns 401 for anonymous users', async () => {
		const event = {
			url: new URL('http://localhost/api/systems/search?q=Ji&limit=5'),
			locals: {
				auth: vi.fn().mockResolvedValue(null)
			}
		};

		const response = await GET(event);
		const body = await response.json();

		expect(response.status).toBe(401);
		expect(body).toEqual({ message: 'Unauthorized' });
		expect(mockSearchSystemsByName).not.toHaveBeenCalled();
	});
});
