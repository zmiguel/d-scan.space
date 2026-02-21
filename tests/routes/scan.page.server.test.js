import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockSpan,
	mockWithSpan,
	mockCreateNewLocalScan,
	mockCreateNewDirectionalScan,
	mockCreateNewScan,
	mockUpdateScan,
	mockDetectScanType,
	mockMetricsAdd,
	getNextId,
	resetIds
} = vi.hoisted(() => {
	let idCounter = 0;

	return {
		mockSpan: {
			setAttributes: vi.fn(),
			setStatus: vi.fn(),
			addEvent: vi.fn()
		},
		mockWithSpan: vi.fn((name, fn) => fn(mockSpan)),
		mockCreateNewLocalScan: vi.fn(async () => ({ total_pilots: 1 })),
		mockCreateNewDirectionalScan: vi.fn(async () => ({
			on_grid: { total_objects: 1 },
			off_grid: { total_objects: 0 }
		})),
		mockCreateNewScan: vi.fn(async () => undefined),
		mockUpdateScan: vi.fn(async () => undefined),
		mockDetectScanType: vi.fn(() => ({ type: 'local', supported: true })),
		mockMetricsAdd: vi.fn(),
		getNextId: () => `id-${++idCounter}`,
		resetIds: () => {
			idCounter = 0;
		}
	};
});

vi.mock('short-unique-id', () => ({
	default: class {
		randomUUID() {
			return getNextId();
		}
	}
}));

vi.mock('@sveltejs/kit', () => ({
	error: (status, message) => {
		const err = new Error(message);
		err.status = status;
		throw err;
	},
	redirect: (status, location) => ({ status, location, constructor: { name: 'Redirect' } })
}));

vi.mock('../../src/lib/server/tracer.js', () => ({
	withSpan: mockWithSpan
}));

vi.mock('../../src/lib/server/local.js', () => ({
	createNewLocalScan: mockCreateNewLocalScan
}));

vi.mock('../../src/lib/server/directional.js', () => ({
	createNewDirectionalScan: mockCreateNewDirectionalScan
}));

vi.mock('../../src/lib/database/scans.js', () => ({
	createNewScan: mockCreateNewScan,
	updateScan: mockUpdateScan
}));

vi.mock('../../src/lib/utils/scan_type.js', () => ({
	detectScanType: mockDetectScanType
}));

vi.mock('../../src/lib/server/metrics', () => ({
	scansProcessedCounter: {
		add: mockMetricsAdd
	}
}));

vi.mock('../../src/lib/logger', () => ({
	default: {
		warn: vi.fn(),
		error: vi.fn(),
		info: vi.fn()
	}
}));

import { actions } from '../../src/routes/scan/+page.server.js';

function buildRequest(formDataValues) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(formDataValues)) {
		if (value === true) {
			formData.set(key, 'on');
			continue;
		}
		if (value !== undefined && value !== null) {
			formData.set(key, String(value));
		}
	}

	return {
		formData: async () => formData
	};
}

describe('routes/scan/+page.server.js tracing', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetIds();
		mockDetectScanType.mockReturnValue({ type: 'local', supported: true });
		mockCreateNewLocalScan.mockResolvedValue({ total_pilots: 1 });
		mockCreateNewDirectionalScan.mockResolvedValue({
			on_grid: { total_objects: 1 },
			off_grid: { total_objects: 0 }
		});
		mockCreateNewScan.mockResolvedValue(undefined);
		mockUpdateScan.mockResolvedValue(undefined);
	});

	it('create fails when scan content is missing', async () => {
		const request = buildRequest({});

		await expect(
			actions.create({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 400, message: 'No scan content provided' });
	});

	it('create fails for unknown scan format', async () => {
		const request = buildRequest({ scan_content: 'line' });
		mockDetectScanType.mockReturnValue({ type: 'unknown', supported: false });

		await expect(
			actions.create({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 400, message: 'Unrecognized scan format' });
	});

	it('create fails for unsupported scan type', async () => {
		const request = buildRequest({ scan_content: 'line' });
		mockDetectScanType.mockReturnValue({ type: 'probe', supported: false });

		await expect(
			actions.create({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 422, message: 'Unsupported scan type: probe' });
	});

	it('create fails in switch default for unexpected supported type', async () => {
		const request = buildRequest({ scan_content: 'line' });
		mockDetectScanType.mockReturnValue({ type: 'mystery', supported: true });

		await expect(
			actions.create({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 422, message: 'Unsupported scan type: mystery' });
	});

	it('create fails for local scans with no valid pilots', async () => {
		const request = buildRequest({ scan_content: 'line' });
		mockDetectScanType.mockReturnValue({ type: 'local', supported: true });
		mockCreateNewLocalScan.mockResolvedValue({ total_pilots: 0 });

		await expect(
			actions.create({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 418, message: 'No valid characters found in scan' });
	});

	it('create uses nullish fallback when local result has no total_pilots', async () => {
		const request = buildRequest({ scan_content: 'line' });
		mockDetectScanType.mockReturnValue({ type: 'local', supported: true });
		mockCreateNewLocalScan.mockResolvedValue({});

		await expect(
			actions.create({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 418, message: 'No valid characters found in scan' });
	});

	it('create fails for directional scans with no valid objects', async () => {
		const request = buildRequest({ scan_content: 'line' });
		mockDetectScanType.mockReturnValue({ type: 'directional', supported: true });
		mockCreateNewDirectionalScan.mockResolvedValue({
			on_grid: { total_objects: 0 },
			off_grid: { total_objects: 0 }
		});

		await expect(
			actions.create({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 418, message: 'No valid objects found in scan' });
	});

	it('create uses nullish fallback when directional result has missing object buckets', async () => {
		const request = buildRequest({ scan_content: 'line' });
		mockDetectScanType.mockReturnValue({ type: 'directional', supported: true });
		mockCreateNewDirectionalScan.mockResolvedValue({});

		await expect(
			actions.create({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 418, message: 'No valid objects found in scan' });
	});

	it('create fails when persistence throws', async () => {
		const request = buildRequest({ scan_content: 'line', is_public: true });
		mockCreateNewScan.mockRejectedValue(new Error('db fail'));

		await expect(
			actions.create({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 500, message: 'Failed to store scan data' });
	});

	it('includes primary character name in create scan spans and persistence payload', async () => {
		const request = buildRequest({
			scan_content: 'Pilot One\nPilot Two',
			is_public: true
		});

		const locals = {
			auth: vi.fn().mockResolvedValue({
				user: { id: 'user-1', name: 'Fallback Name' },
				eve: { characterName: 'Primary Pilot' }
			})
		};

		const result = await actions.create({ request, event: {}, locals });

		expect(result).toEqual(
			expect.objectContaining({
				status: 303,
				location: expect.stringContaining('/scan/')
			})
		);
		expect(mockSpan.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				'user.primary_character_name': 'Primary Pilot'
			})
		);
		expect(mockCreateNewScan).toHaveBeenCalledWith(
			expect.objectContaining({
				created_by: 'user-1',
				primary_character_name: 'Primary Pilot'
			})
		);
		expect(mockWithSpan).toHaveBeenCalledWith(
			'route.scan.persist_new_scan',
			expect.any(Function),
			expect.objectContaining({
				'user.primary_character_name': 'Primary Pilot',
				'user.id': 'user-1'
			})
		);
	});

	it('falls back to session user name when EVE character name is unavailable', async () => {
		const request = buildRequest({ scan_content: 'Pilot One\nPilot Two' });
		const locals = {
			auth: vi.fn().mockResolvedValue({
				user: { id: 'user-fallback', name: 'Session Name' }
			})
		};

		await actions.create({ request, event: {}, locals });

		expect(mockCreateNewScan).toHaveBeenCalledWith(
			expect.objectContaining({
				created_by: 'user-fallback',
				primary_character_name: 'Session Name'
			})
		);
	});

	it('create succeeds for directional scans and records metric', async () => {
		const request = buildRequest({ scan_content: 'line' });
		mockDetectScanType.mockReturnValue({ type: 'directional', supported: true });
		mockCreateNewDirectionalScan.mockResolvedValue({
			on_grid: { total_objects: 1 },
			off_grid: { total_objects: 2 }
		});

		const result = await actions.create({
			request,
			event: {},
			locals: { auth: vi.fn().mockResolvedValue(null) }
		});

		expect(result).toEqual(expect.objectContaining({ status: 303 }));
		expect(mockMetricsAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({ type: 'directional' })
		);
	});

	it('create handles second switch default branch without failing', async () => {
		const request = buildRequest({ scan_content: 'line' });
		let typeReadCount = 0;
		mockDetectScanType.mockReturnValue({
			get type() {
				typeReadCount += 1;
				return typeReadCount >= 4 ? 'fallback' : 'local';
			},
			supported: true
		});

		const result = await actions.create({
			request,
			event: {},
			locals: { auth: vi.fn().mockResolvedValue(null) }
		});

		expect(result).toEqual(expect.objectContaining({ status: 303 }));
	});

	it('update fails when scan content is missing', async () => {
		const request = buildRequest({ scan_group: 'group-1' });

		await expect(
			actions.update({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 400, message: 'No scan content provided' });
	});

	it('update fails for unknown scan format', async () => {
		const request = buildRequest({ scan_content: 'line', scan_group: 'group-1' });
		mockDetectScanType.mockReturnValue({ type: 'unknown', supported: false });

		await expect(
			actions.update({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 400, message: 'Unrecognized scan format' });
	});

	it('update fails for unsupported scan type', async () => {
		const request = buildRequest({ scan_content: 'line', scan_group: 'group-1' });
		mockDetectScanType.mockReturnValue({ type: 'probe', supported: false });

		await expect(
			actions.update({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 422, message: 'Unsupported scan type: probe' });
	});

	it('update fails in switch default for unexpected supported type', async () => {
		const request = buildRequest({ scan_content: 'line', scan_group: 'group-1' });
		mockDetectScanType.mockReturnValue({ type: 'mystery', supported: true });

		await expect(
			actions.update({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 422, message: 'Unsupported scan type: mystery' });
	});

	it('update fails for local scans with no valid pilots', async () => {
		const request = buildRequest({ scan_content: 'line', scan_group: 'group-1' });
		mockDetectScanType.mockReturnValue({ type: 'local', supported: true });
		mockCreateNewLocalScan.mockResolvedValue({ total_pilots: 0 });

		await expect(
			actions.update({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 418, message: 'No valid characters found in scan' });
	});

	it('update uses nullish fallback when local result has no total_pilots', async () => {
		const request = buildRequest({ scan_content: 'line', scan_group: 'group-1' });
		mockDetectScanType.mockReturnValue({ type: 'local', supported: true });
		mockCreateNewLocalScan.mockResolvedValue({});

		await expect(
			actions.update({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 418, message: 'No valid characters found in scan' });
	});

	it('update fails for directional scans with no valid objects', async () => {
		const request = buildRequest({ scan_content: 'line', scan_group: 'group-1' });
		mockDetectScanType.mockReturnValue({ type: 'directional', supported: true });
		mockCreateNewDirectionalScan.mockResolvedValue({
			on_grid: { total_objects: 0 },
			off_grid: { total_objects: 0 }
		});

		await expect(
			actions.update({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 418, message: 'No valid objects found in scan' });
	});

	it('update uses nullish fallback when directional result has missing object buckets', async () => {
		const request = buildRequest({ scan_content: 'line', scan_group: 'group-1' });
		mockDetectScanType.mockReturnValue({ type: 'directional', supported: true });
		mockCreateNewDirectionalScan.mockResolvedValue({});

		await expect(
			actions.update({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 418, message: 'No valid objects found in scan' });
	});

	it('update fails when persistence throws', async () => {
		const request = buildRequest({ scan_content: 'line', scan_group: 'group-1' });
		mockUpdateScan.mockRejectedValue(new Error('db fail'));

		await expect(
			actions.update({
				request,
				event: {},
				locals: { auth: vi.fn().mockResolvedValue(null) }
			})
		).rejects.toMatchObject({ status: 500, message: 'Failed to store scan data' });
	});

	it('includes primary character name in update scan spans and persistence payload', async () => {
		const request = buildRequest({
			scan_content: 'Pilot One\nPilot Two',
			scan_group: 'group-1'
		});

		const locals = {
			auth: vi.fn().mockResolvedValue({
				user: { id: 'user-2', name: 'Fallback Name' },
				eve: { characterName: 'Main Alt' }
			})
		};

		const result = await actions.update({ request, event: {}, locals });

		expect(result).toEqual(
			expect.objectContaining({
				status: 303,
				location: expect.stringContaining('/scan/group-1/')
			})
		);
		expect(mockSpan.setAttributes).toHaveBeenCalledWith(
			expect.objectContaining({
				'user.primary_character_name': 'Main Alt'
			})
		);
		expect(mockUpdateScan).toHaveBeenCalledWith(
			expect.objectContaining({
				created_by: 'user-2',
				primary_character_name: 'Main Alt'
			})
		);
		expect(mockWithSpan).toHaveBeenCalledWith(
			'route.scan.persist_update_scan',
			expect.any(Function),
			expect.objectContaining({
				'user.primary_character_name': 'Main Alt',
				'user.id': 'user-2'
			})
		);
	});

	it('update succeeds for directional scans and records update metric', async () => {
		const request = buildRequest({ scan_content: 'line', scan_group: 'group-1' });
		mockDetectScanType.mockReturnValue({ type: 'directional', supported: true });
		mockCreateNewDirectionalScan.mockResolvedValue({
			on_grid: { total_objects: 2 },
			off_grid: { total_objects: 1 }
		});

		const result = await actions.update({
			request,
			event: {},
			locals: { auth: vi.fn().mockResolvedValue(null) }
		});

		expect(result).toEqual(expect.objectContaining({ status: 303 }));
		expect(mockMetricsAdd).toHaveBeenCalledWith(
			1,
			expect.objectContaining({
				type: 'directional',
				public: 'false'
			})
		);
	});

	it('update handles second switch default branch without failing', async () => {
		const request = buildRequest({ scan_content: 'line', scan_group: 'group-1' });
		let typeReadCount = 0;
		mockDetectScanType.mockReturnValue({
			get type() {
				typeReadCount += 1;
				return typeReadCount >= 4 ? 'fallback' : 'local';
			},
			supported: true
		});

		const result = await actions.update({
			request,
			event: {},
			locals: { auth: vi.fn().mockResolvedValue(null) }
		});

		expect(result).toEqual(expect.objectContaining({ status: 303 }));
	});
});
