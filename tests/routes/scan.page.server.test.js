import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockSpan,
	mockBuildScanFromSubmission,
	mockCreateNewScan,
	mockGetScanGroupByID,
	mockUpdateScan,
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
		mockBuildScanFromSubmission: vi.fn(),
		mockCreateNewScan: vi.fn(),
		mockGetScanGroupByID: vi.fn(),
		mockUpdateScan: vi.fn(),
		mockMetricsAdd: vi.fn(),
		getNextId: () => `id-${++idCounter}`,
		resetIds: () => {
			idCounter = 0;
		}
	};
});

vi.mock('../../src/lib/server/ids.js', () => ({
	newScanGroupId: () => `group-${getNextId()}`,
	newScanId: () => `scan-${getNextId()}`
}));

// Same shapes as SvelteKit: error()/redirect() throw, fail() returns an ActionFailure.
vi.mock('@sveltejs/kit', () => ({
	error: (status, message) => {
		throw { status, body: { message } };
	},
	redirect: (status, location) => {
		throw { status, location };
	},
	fail: (status, data) => ({ status, data })
}));

vi.mock('../../src/lib/server/tracer.js', () => ({
	withSpan: vi.fn((name, fn) => fn(mockSpan))
}));

// The real rejectionPayload is used; its module's scan builders are stubbed out.
vi.mock('../../src/lib/server/local.js', () => ({ createNewLocalScan: vi.fn() }));
vi.mock('../../src/lib/server/directional.js', () => ({ createNewDirectionalScan: vi.fn() }));

vi.mock('../../src/lib/server/scan-submission.js', async (importOriginal) => ({
	...(await importOriginal()),
	buildScanFromSubmission: mockBuildScanFromSubmission
}));

vi.mock('../../src/lib/database/scans.js', () => ({
	createNewScan: mockCreateNewScan,
	getScanGroupByID: mockGetScanGroupByID,
	updateScan: mockUpdateScan
}));

vi.mock('../../src/lib/server/metrics', () => ({
	scansProcessedCounter: { add: mockMetricsAdd }
}));

vi.mock('../../src/lib/logger', () => ({
	default: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
}));

import { actions } from '../../src/routes/scan/+page.server.js';

function buildEvent(formDataValues, session = null) {
	const formData = new FormData();
	for (const [key, value] of Object.entries(formDataValues)) {
		if (value === true) {
			formData.set(key, 'on');
		} else if (value !== undefined && value !== null) {
			formData.set(key, String(value));
		}
	}
	return {
		request: { formData: async () => formData },
		locals: { auth: vi.fn().mockResolvedValue(session) }
	};
}

/** Runs an action and returns what it threw (redirect/error) or returned (fail). */
async function run(action, event) {
	try {
		return { returned: await action(event) };
	} catch (thrown) {
		return { thrown };
	}
}

const localBuilt = { ok: true, type: 'local', result: { total_pilots: 2 }, lineCount: 2 };

function directionalBuilt(system) {
	return {
		ok: true,
		type: 'directional',
		result: { system, on_grid: { total_objects: 1 }, off_grid: { total_objects: 0 } },
		lineCount: 1
	};
}

const unknownFormat = {
	ok: false,
	status: 400,
	reason: 'unknown_format',
	message: 'Unrecognized scan format: 1 of 2 lines do not look like a local scan.',
	failedLines: [{ line_number: 2, line: 'garbage' }],
	failedLineCount: 1
};

const owner = { user: { id: 'user-1', name: 'Account' }, eve: { characterName: 'Main Pilot' } };

describe('routes/scan/+page.server.js', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		resetIds();
		mockBuildScanFromSubmission.mockResolvedValue(localBuilt);
		mockGetScanGroupByID.mockResolvedValue({ id: 'group-1', created_by: null, system: null });
		mockCreateNewScan.mockResolvedValue(undefined);
		mockUpdateScan.mockResolvedValue(undefined);
	});

	describe('create', () => {
		it.each([
			[400, unknownFormat],
			[413, { ok: false, status: 413, reason: 'too_many_lines', message: 'Too many lines.' }],
			[422, { ok: false, status: 422, reason: 'unsupported_type', message: 'Unsupported.' }],
			[418, { ok: false, status: 418, reason: 'no_valid_characters', message: 'Teapot.' }]
		])('returns fail(%i) with the form payload and stores nothing', async (status, rejection) => {
			mockBuildScanFromSubmission.mockResolvedValue(rejection);

			const { returned, thrown } = await run(
				actions.create,
				buildEvent({ scan_content: 'Pilot\ngarbage' })
			);

			expect(thrown).toBeUndefined();
			expect(returned).toEqual({
				status,
				data: {
					message: rejection.message,
					failedLines: rejection.failedLines ?? [],
					failedLineCount: rejection.failedLineCount ?? 0
				}
			});
			expect(mockCreateNewScan).not.toHaveBeenCalled();
			expect(mockMetricsAdd).not.toHaveBeenCalled();
		});

		it('hands the raw form value to the submission builder', async () => {
			const event = buildEvent({ scan_content: 'Pilot One\r\nPilot Two' });

			await run(actions.create, event);

			expect(mockBuildScanFromSubmission).toHaveBeenCalledWith(
				'Pilot One\r\nPilot Two',
				mockSpan,
				event
			);
		});

		it('passes a missing scan_content as null to the builder', async () => {
			await run(actions.create, buildEvent({}));

			expect(mockBuildScanFromSubmission.mock.calls[0][0]).toBeNull();
		});

		it('stores a public scan for the logged-in user and redirects to it', async () => {
			const { thrown } = await run(
				actions.create,
				buildEvent({ scan_content: 'Pilot One\nPilot Two', is_public: true }, owner)
			);

			expect(mockCreateNewScan).toHaveBeenCalledTimes(1);
			expect(mockCreateNewScan).toHaveBeenCalledWith({
				scanGroupId: 'group-id-1',
				scanId: 'scan-id-2',
				is_public: true,
				type: 'local',
				data: localBuilt.result,
				raw_data: 'Pilot One\nPilot Two',
				created_by: 'user-1',
				primary_character_name: 'Main Pilot'
			});
			expect(thrown).toEqual({ status: 303, location: '/scan/group-id-1/scan-id-2' });
		});

		it('stores an anonymous private scan when not logged in and is_public is absent', async () => {
			await run(actions.create, buildEvent({ scan_content: 'Pilot' }));

			expect(mockCreateNewScan).toHaveBeenCalledWith(
				expect.objectContaining({
					is_public: false,
					created_by: null,
					primary_character_name: null
				})
			);
		});

		it('falls back to the account name when no EVE character is linked', async () => {
			await run(
				actions.create,
				buildEvent({ scan_content: 'Pilot' }, { user: { id: 'user-2', name: 'Fallback' } })
			);

			expect(mockCreateNewScan).toHaveBeenCalledWith(
				expect.objectContaining({ created_by: 'user-2', primary_character_name: 'Fallback' })
			);
		});

		it.each([
			['local', localBuilt, true, 'true'],
			['directional', directionalBuilt(null), false, 'false']
		])(
			'counts a stored %s scan once with type and public labels',
			async (type, built, isPublic, label) => {
				mockBuildScanFromSubmission.mockResolvedValue(built);

				await run(
					actions.create,
					buildEvent({ scan_content: 'x', is_public: isPublic || undefined })
				);

				expect(mockMetricsAdd).toHaveBeenCalledTimes(1);
				expect(mockMetricsAdd).toHaveBeenCalledWith(1, { type, public: label });
			}
		);

		it('answers 500 when persistence fails and does not count the scan', async () => {
			mockCreateNewScan.mockRejectedValue(new Error('db down'));

			const { thrown } = await run(actions.create, buildEvent({ scan_content: 'Pilot' }));

			expect(thrown).toEqual({ status: 500, body: { message: 'Failed to store scan data' } });
			expect(mockMetricsAdd).not.toHaveBeenCalled();
		});

		it('propagates unexpected builder errors', async () => {
			mockBuildScanFromSubmission.mockRejectedValue(new Error('ESI exploded'));

			const { thrown } = await run(actions.create, buildEvent({ scan_content: 'Pilot' }));

			expect(thrown).toBeInstanceOf(Error);
			expect(thrown.message).toBe('ESI exploded');
			expect(mockCreateNewScan).not.toHaveBeenCalled();
		});
	});

	describe('update', () => {
		describe('group validation happens before any scan processing', () => {
			it.each([
				['missing', {}],
				['empty', { scan_group: '' }]
			])('rejects a %s scan_group with 400', async (_label, group) => {
				const { thrown } = await run(
					actions.update,
					buildEvent({ scan_content: 'Pilot', ...group })
				);

				expect(thrown).toEqual({ status: 400, body: { message: 'No scan group provided' } });
				expect(mockGetScanGroupByID).not.toHaveBeenCalled();
				expect(mockBuildScanFromSubmission).not.toHaveBeenCalled();
			});

			it('rejects an unknown scan_group with 404', async () => {
				mockGetScanGroupByID.mockResolvedValue(null);

				const { thrown } = await run(
					actions.update,
					buildEvent({ scan_content: 'Pilot', scan_group: 'missing' })
				);

				expect(mockGetScanGroupByID).toHaveBeenCalledWith('missing');
				expect(thrown).toEqual({ status: 404, body: { message: 'Scan group not found' } });
				expect(mockBuildScanFromSubmission).not.toHaveBeenCalled();
			});

			it('rejects an unknown group with 404 even when the paste is invalid', async () => {
				mockGetScanGroupByID.mockResolvedValue(null);
				mockBuildScanFromSubmission.mockResolvedValue(unknownFormat);

				const { thrown } = await run(
					actions.update,
					buildEvent({ scan_content: 'garbage', scan_group: 'missing' })
				);

				expect(thrown).toMatchObject({ status: 404 });
			});

			it.each([
				['an anonymous visitor', null],
				['a different user', { user: { id: 'intruder' } }]
			])('rejects %s appending to an owned group with 403', async (_label, session) => {
				mockGetScanGroupByID.mockResolvedValue({ id: 'group-1', created_by: 'user-1' });

				const { thrown } = await run(
					actions.update,
					buildEvent({ scan_content: 'Pilot', scan_group: 'group-1' }, session)
				);

				expect(thrown).toEqual({ status: 403, body: { message: 'Forbidden' } });
				expect(mockBuildScanFromSubmission).not.toHaveBeenCalled();
				expect(mockUpdateScan).not.toHaveBeenCalled();
			});
		});

		it('lets the owner append to their group', async () => {
			mockGetScanGroupByID.mockResolvedValue({ id: 'group-1', created_by: 'user-1', system: null });

			const { thrown } = await run(
				actions.update,
				buildEvent({ scan_content: 'Pilot', scan_group: 'group-1' }, owner)
			);

			expect(mockUpdateScan).toHaveBeenCalledWith({
				scanGroupId: 'group-1',
				scanId: 'scan-id-1',
				type: 'local',
				data: localBuilt.result,
				raw_data: 'Pilot',
				created_by: 'user-1',
				primary_character_name: 'Main Pilot'
			});
			expect(thrown).toEqual({ status: 303, location: '/scan/group-1/scan-id-1' });
		});

		it('lets anyone append to an anonymous (created_by NULL) group', async () => {
			const { thrown } = await run(
				actions.update,
				buildEvent({ scan_content: 'Pilot', scan_group: 'group-1' }, { user: { id: 'other' } })
			);

			expect(mockUpdateScan).toHaveBeenCalledTimes(1);
			expect(thrown).toEqual({ status: 303, location: '/scan/group-1/scan-id-1' });
		});

		it('returns fail() with the rejection payload and stores nothing', async () => {
			mockBuildScanFromSubmission.mockResolvedValue(unknownFormat);

			const { returned, thrown } = await run(
				actions.update,
				buildEvent({ scan_content: 'Pilot\ngarbage', scan_group: 'group-1' })
			);

			expect(thrown).toBeUndefined();
			expect(returned).toEqual({
				status: 400,
				data: {
					message: unknownFormat.message,
					failedLines: unknownFormat.failedLines,
					failedLineCount: 1
				}
			});
			expect(mockUpdateScan).not.toHaveBeenCalled();
			expect(mockCreateNewScan).not.toHaveBeenCalled();
			expect(mockMetricsAdd).not.toHaveBeenCalled();
		});

		it('answers 500 when persistence fails and does not count the scan', async () => {
			mockUpdateScan.mockRejectedValue(new Error('db down'));

			const { thrown } = await run(
				actions.update,
				buildEvent({ scan_content: 'Pilot', scan_group: 'group-1' })
			);

			expect(thrown).toEqual({ status: 500, body: { message: 'Failed to store scan data' } });
			expect(mockMetricsAdd).not.toHaveBeenCalled();
		});

		it('counts an appended scan once as non-public with its type', async () => {
			mockBuildScanFromSubmission.mockResolvedValue(directionalBuilt(null));

			await run(actions.update, buildEvent({ scan_content: 'x', scan_group: 'group-1' }));

			expect(mockMetricsAdd).toHaveBeenCalledTimes(1);
			expect(mockMetricsAdd).toHaveBeenCalledWith(1, { type: 'directional', public: 'false' });
		});

		describe('directional system of the group', () => {
			const jita = { id: 30000142, name: 'Jita' };

			it('starts a new private group when the d-scan is from a different system', async () => {
				mockGetScanGroupByID.mockResolvedValue({ id: 'group-1', created_by: null, system: jita });
				mockBuildScanFromSubmission.mockResolvedValue(
					directionalBuilt({ id: 30002187, name: 'Amarr' })
				);

				const { thrown } = await run(
					actions.update,
					buildEvent({ scan_content: 'x', scan_group: 'group-1' }, owner)
				);

				expect(mockUpdateScan).not.toHaveBeenCalled();
				expect(mockCreateNewScan).toHaveBeenCalledWith(
					expect.objectContaining({
						scanGroupId: 'group-id-2',
						scanId: 'scan-id-1',
						is_public: false,
						type: 'directional',
						created_by: 'user-1'
					})
				);
				expect(thrown).toEqual({ status: 303, location: '/scan/group-id-2/scan-id-1' });
				expect(mockMetricsAdd).toHaveBeenCalledTimes(1);
				expect(mockMetricsAdd).toHaveBeenCalledWith(1, { type: 'directional', public: 'false' });
			});

			it('answers 500 when storing the new group fails', async () => {
				mockGetScanGroupByID.mockResolvedValue({ id: 'group-1', created_by: null, system: jita });
				mockBuildScanFromSubmission.mockResolvedValue(
					directionalBuilt({ id: 30002187, name: 'Amarr' })
				);
				mockCreateNewScan.mockRejectedValue(new Error('db down'));

				const { thrown } = await run(
					actions.update,
					buildEvent({ scan_content: 'x', scan_group: 'group-1' })
				);

				expect(thrown).toMatchObject({ status: 500 });
				expect(mockMetricsAdd).not.toHaveBeenCalled();
			});

			it.each([
				['the same id', { id: 30000142, name: 'Renamed' }],
				['the same id as a string', { id: '30000142', name: 'Jita' }],
				['the same name ignoring case/space when ids are absent', { name: '  jita ' }]
			])('appends to the group for %s', async (_label, inferred) => {
				mockGetScanGroupByID.mockResolvedValue({
					id: 'group-1',
					created_by: null,
					system: inferred.id === undefined ? { name: 'Jita' } : jita
				});
				mockBuildScanFromSubmission.mockResolvedValue(directionalBuilt(inferred));

				const { thrown } = await run(
					actions.update,
					buildEvent({ scan_content: 'x', scan_group: 'group-1' })
				);

				expect(mockCreateNewScan).not.toHaveBeenCalled();
				expect(mockUpdateScan).toHaveBeenCalledWith(
					expect.objectContaining({ scanGroupId: 'group-1' })
				);
				expect(thrown).toEqual({ status: 303, location: '/scan/group-1/scan-id-1' });
			});

			it('starts a new group when the systems have no comparable id or name', async () => {
				mockGetScanGroupByID.mockResolvedValue({
					id: 'group-1',
					created_by: null,
					system: { name: '' }
				});
				mockBuildScanFromSubmission.mockResolvedValue(directionalBuilt({ name: 'Jita' }));

				await run(actions.update, buildEvent({ scan_content: 'x', scan_group: 'group-1' }));

				expect(mockUpdateScan).not.toHaveBeenCalled();
				expect(mockCreateNewScan).toHaveBeenCalledWith(
					expect.objectContaining({ scanGroupId: 'group-id-2', is_public: false })
				);
			});

			it.each([
				['the group has no system yet', null, { id: 30002187, name: 'Amarr' }],
				['no system was inferred from the d-scan', jita, null]
			])('appends to the group when %s', async (_label, groupSystem, inferred) => {
				mockGetScanGroupByID.mockResolvedValue({
					id: 'group-1',
					created_by: null,
					system: groupSystem
				});
				mockBuildScanFromSubmission.mockResolvedValue(directionalBuilt(inferred));

				await run(actions.update, buildEvent({ scan_content: 'x', scan_group: 'group-1' }));

				expect(mockCreateNewScan).not.toHaveBeenCalled();
				expect(mockUpdateScan).toHaveBeenCalledWith(
					expect.objectContaining({ scanGroupId: 'group-1', type: 'directional' })
				);
			});

			it('compares names, not null ids: a different system starts a new private group', async () => {
				mockGetScanGroupByID.mockResolvedValue({
					id: 'group-1',
					created_by: null,
					system: { id: null, name: 'Jita' }
				});
				mockBuildScanFromSubmission.mockResolvedValue(
					directionalBuilt({ id: null, name: 'Amarr' })
				);

				const { thrown } = await run(
					actions.update,
					buildEvent({ scan_content: 'x', scan_group: 'group-1' })
				);

				expect(mockUpdateScan).not.toHaveBeenCalled();
				expect(mockCreateNewScan).toHaveBeenCalledWith(
					expect.objectContaining({ scanGroupId: 'group-id-2', is_public: false })
				);
				expect(thrown).toEqual({ status: 303, location: '/scan/group-id-2/scan-id-1' });
			});

			it('compares names, not null ids: the same system appends to the group', async () => {
				mockGetScanGroupByID.mockResolvedValue({
					id: 'group-1',
					created_by: null,
					system: { id: null, name: 'Jita' }
				});
				mockBuildScanFromSubmission.mockResolvedValue(
					directionalBuilt({ id: null, name: ' jita ' })
				);

				const { thrown } = await run(
					actions.update,
					buildEvent({ scan_content: 'x', scan_group: 'group-1' })
				);

				expect(mockCreateNewScan).not.toHaveBeenCalled();
				expect(mockUpdateScan).toHaveBeenCalledWith(
					expect.objectContaining({ scanGroupId: 'group-1' })
				);
				expect(thrown).toEqual({ status: 303, location: '/scan/group-1/scan-id-1' });
			});

			it('never splits groups for local scans, whatever the group system', async () => {
				mockGetScanGroupByID.mockResolvedValue({ id: 'group-1', created_by: null, system: jita });
				mockBuildScanFromSubmission.mockResolvedValue({
					...localBuilt,
					result: { ...localBuilt.result, system: { id: 1, name: 'Elsewhere' } }
				});

				await run(actions.update, buildEvent({ scan_content: 'x', scan_group: 'group-1' }));

				expect(mockCreateNewScan).not.toHaveBeenCalled();
				expect(mockUpdateScan).toHaveBeenCalledWith(
					expect.objectContaining({ scanGroupId: 'group-1', type: 'local' })
				);
			});
		});
	});
});
