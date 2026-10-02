import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
	mockSpan,
	mockCreateNewLocalScan,
	mockCreateNewDirectionalScan,
	mockDetectScanType,
	mockLogger
} = vi.hoisted(() => {
	const span = { setAttributes: vi.fn(), setStatus: vi.fn(), addEvent: vi.fn() };
	return {
		mockSpan: span,
		mockCreateNewLocalScan: vi.fn(),
		mockCreateNewDirectionalScan: vi.fn(),
		mockDetectScanType: vi.fn(),
		mockLogger: { warn: vi.fn(), error: vi.fn(), info: vi.fn(), debug: vi.fn() }
	};
});

vi.mock('../../../src/lib/server/tracer.js', () => ({
	withSpan: vi.fn((name, fn) => fn(mockSpan))
}));

vi.mock('../../../src/lib/server/local.js', () => ({
	createNewLocalScan: mockCreateNewLocalScan
}));

vi.mock('../../../src/lib/server/directional.js', () => ({
	createNewDirectionalScan: mockCreateNewDirectionalScan
}));

vi.mock('../../../src/lib/server/constants.js', () => ({
	LOCAL_SCAN_MAX_LINES: 10_000
}));

vi.mock('../../../src/lib/logger.js', () => ({ default: mockLogger }));

// Real normalization (line counting is part of the contract); detection is mocked.
vi.mock('../../../src/lib/utils/scan_type.js', async (importOriginal) => ({
	...(await importOriginal()),
	detectScanType: mockDetectScanType
}));

import {
	buildScanFromSubmission,
	readScanForm,
	rejectionPayload
} from '../../../src/lib/server/scan-submission.js';

const localResult = { total_pilots: 2 };
const directionalResult = { on_grid: { total_objects: 1 }, off_grid: { total_objects: 0 } };

function lines(count, text = 'Pilot') {
	return Array.from({ length: count }, (_, i) => `${text} ${i}`).join('\n');
}

describe('buildScanFromSubmission', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mockDetectScanType.mockReturnValue({ type: 'local', supported: true });
		mockCreateNewLocalScan.mockResolvedValue(localResult);
		mockCreateNewDirectionalScan.mockResolvedValue(directionalResult);
	});

	it.each([
		['missing value', null],
		['non-string value (File)', new Blob(['Pilot'])],
		['empty string', ''],
		['whitespace only', '   \n\t\n  ']
	])('rejects %s with 400 missing_content', async (_label, content) => {
		const result = await buildScanFromSubmission(content, mockSpan);

		expect(result).toEqual({
			ok: false,
			status: 400,
			reason: 'missing_content',
			message: 'No scan content provided.'
		});
		expect(mockDetectScanType).not.toHaveBeenCalled();
		expect(mockCreateNewLocalScan).not.toHaveBeenCalled();
	});

	it('rejects content that normalizes to no lines (only hidden characters)', async () => {
		const result = await buildScanFromSubmission('\u200B\u200B\n\uFEFF', mockSpan);

		expect(result).toMatchObject({ ok: false, status: 400, reason: 'missing_content' });
		expect(mockDetectScanType).not.toHaveBeenCalled();
	});

	it('accepts a local scan with exactly LOCAL_SCAN_MAX_LINES names', async () => {
		const result = await buildScanFromSubmission(lines(10_000), mockSpan);

		expect(result).toEqual({ ok: true, type: 'local', result: localResult, lineCount: 10_000 });
	});

	it('rejects a local scan over LOCAL_SCAN_MAX_LINES with 413 before any ESI work', async () => {
		const result = await buildScanFromSubmission(lines(10_001), mockSpan);

		expect(result).toEqual({
			ok: false,
			status: 413,
			reason: 'too_many_lines',
			message: 'Local scan has 10,001 names; the maximum is 10,000.'
		});
		expect(mockCreateNewLocalScan).not.toHaveBeenCalled();
	});

	it('does not line-limit directional scans (big fights with many drones)', async () => {
		mockDetectScanType.mockReturnValue({ type: 'directional', supported: true });
		const big = Array.from({ length: 25_000 }, (_, i) => `2488\tDrone ${i}\tWarrior II\t5 km`);

		const result = await buildScanFromSubmission(big.join('\n'), mockSpan);

		expect(result).toMatchObject({ ok: true, type: 'directional', lineCount: 25_000 });
		expect(mockCreateNewDirectionalScan).toHaveBeenCalledTimes(1);
	});

	it('counts lines after normalization (blank lines do not count toward the limit)', async () => {
		const result = await buildScanFromSubmission(`${lines(10_000)}\n\n\r\n   \n`, mockSpan);

		expect(result).toMatchObject({ ok: true, lineCount: 10_000 });
	});

	it('passes normalized lines to detection and the local builder', async () => {
		const result = await buildScanFromSubmission('  Alpha  \r\n\r\nBeta\u200B\r', mockSpan);

		expect(mockDetectScanType).toHaveBeenCalledWith(['Alpha', 'Beta']);
		expect(mockCreateNewLocalScan).toHaveBeenCalledWith(['Alpha', 'Beta']);
		expect(mockCreateNewDirectionalScan).not.toHaveBeenCalled();
		expect(result).toEqual({ ok: true, type: 'local', result: localResult, lineCount: 2 });
	});

	it('builds directional scans with the directional builder', async () => {
		mockDetectScanType.mockReturnValue({ type: 'directional', supported: true });

		const result = await buildScanFromSubmission('1\tName\tType\t1 km', mockSpan);

		expect(mockCreateNewDirectionalScan).toHaveBeenCalledWith(['1\tName\tType\t1 km']);
		expect(mockCreateNewLocalScan).not.toHaveBeenCalled();
		expect(result).toEqual({
			ok: true,
			type: 'directional',
			result: directionalResult,
			lineCount: 1
		});
	});

	it('rejects unknown formats with 400 and passes the failed lines through', async () => {
		const failedLines = [
			{ line_number: 2, line: 'not a pilot' },
			{ line_number: 5, line: 'x'.repeat(120) + '…' }
		];
		mockDetectScanType.mockReturnValue({
			type: 'unknown',
			closest: {
				type: 'local',
				matched: 3,
				total: 17,
				failed_lines: failedLines,
				failed_count: 14
			}
		});

		const result = await buildScanFromSubmission(lines(17), mockSpan);

		expect(result).toEqual({
			ok: false,
			status: 400,
			reason: 'unknown_format',
			message:
				'Unrecognized scan format: 14 of 17 lines do not look like a local scan. Paste the whole Local member list or D-Scan result, nothing else.',
			failedLines,
			failedLineCount: 14
		});
		expect(mockCreateNewLocalScan).not.toHaveBeenCalled();
		expect(mockCreateNewDirectionalScan).not.toHaveBeenCalled();
	});

	it('rejects unknown formats without a closest match with a generic message', async () => {
		mockDetectScanType.mockReturnValue({ type: 'unknown' });

		const result = await buildScanFromSubmission('???', mockSpan);

		expect(result).toEqual({
			ok: false,
			status: 400,
			reason: 'unknown_format',
			message: 'Unrecognized scan format.'
		});
	});

	it.each([
		['recognized but unsupported type', { type: 'probe', supported: false }, 'probe'],
		['supported flag on a type without a builder', { type: 'mystery', supported: true }, 'mystery']
	])('rejects a %s with 422 unsupported_type', async (_label, detection, type) => {
		mockDetectScanType.mockReturnValue(detection);

		const result = await buildScanFromSubmission('line', mockSpan);

		expect(result).toEqual({
			ok: false,
			status: 422,
			reason: 'unsupported_type',
			message: `Unsupported scan type: ${type}.`
		});
		expect(mockCreateNewLocalScan).not.toHaveBeenCalled();
		expect(mockCreateNewDirectionalScan).not.toHaveBeenCalled();
	});

	it.each([
		['zero pilots', { total_pilots: 0 }],
		['missing pilot count', {}],
		['null result', null]
	])('rejects a local scan with %s as 418 no_valid_characters', async (_label, built) => {
		mockCreateNewLocalScan.mockResolvedValue(built);

		const result = await buildScanFromSubmission('Pilot', mockSpan);

		expect(result).toMatchObject({ ok: false, status: 418, reason: 'no_valid_characters' });
		expect(result.message).toMatch(/none of the names could be found/);
	});

	it.each([
		[
			'no objects on or off grid',
			{ on_grid: { total_objects: 0 }, off_grid: { total_objects: 0 } }
		],
		['missing grids', {}]
	])('rejects a directional scan with %s as 418 no_valid_objects', async (_label, built) => {
		mockDetectScanType.mockReturnValue({ type: 'directional', supported: true });
		mockCreateNewDirectionalScan.mockResolvedValue(built);

		const result = await buildScanFromSubmission('1\tA\tB\t-', mockSpan);

		expect(result).toMatchObject({ ok: false, status: 418, reason: 'no_valid_objects' });
		expect(result.message).toMatch(/contains no known objects/);
	});

	it('accepts a directional scan with only off-grid objects', async () => {
		mockDetectScanType.mockReturnValue({ type: 'directional', supported: true });
		const offGridOnly = { on_grid: { total_objects: 0 }, off_grid: { total_objects: 3 } };
		mockCreateNewDirectionalScan.mockResolvedValue(offGridOnly);

		const result = await buildScanFromSubmission('1\tA\tB\t1 AU', mockSpan);

		expect(result).toEqual({ ok: true, type: 'directional', result: offGridOnly, lineCount: 1 });
	});

	it('propagates unexpected builder errors instead of rejecting', async () => {
		mockCreateNewLocalScan.mockRejectedValue(new Error('ESI exploded'));

		await expect(buildScanFromSubmission('Pilot', mockSpan)).rejects.toThrow('ESI exploded');
	});
});

describe('rejectionPayload', () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	it('returns message, failed lines and count for the form', () => {
		const failedLines = [{ line_number: 1, line: 'bad' }];

		const payload = rejectionPayload(
			{
				ok: false,
				status: 400,
				reason: 'unknown_format',
				message: 'Unrecognized scan format.',
				failedLines,
				failedLineCount: 7
			},
			mockSpan,
			'create'
		);

		expect(payload).toEqual({
			message: 'Unrecognized scan format.',
			failedLines,
			failedLineCount: 7
		});
		expect(mockSpan.setAttributes).toHaveBeenCalledWith({
			'scan.error': 'unknown_format',
			'response.status': 400,
			'scan.error.message': 'Unrecognized scan format.',
			// the trace keeps the offending lines (logs never do)
			'scan.error.failed_lines': JSON.stringify(failedLines),
			'scan.error.failed_line_count': 7
		});
	});

	it('defaults to no failed lines when the rejection has none', () => {
		const payload = rejectionPayload(
			{ ok: false, status: 413, reason: 'too_many_lines', message: 'Too many.' },
			mockSpan,
			'update'
		);

		expect(payload).toEqual({ message: 'Too many.', failedLines: [], failedLineCount: 0 });
	});

	it('never logs the pasted lines', () => {
		rejectionPayload(
			{
				ok: false,
				status: 400,
				reason: 'unknown_format',
				message: 'Unrecognized scan format.',
				failedLines: [{ line_number: 1, line: 'SECRET PASTE' }],
				failedLineCount: 1
			},
			mockSpan,
			'create'
		);

		expect(mockLogger.warn).toHaveBeenCalledTimes(1);
		expect(JSON.stringify(mockLogger.warn.mock.calls)).not.toContain('SECRET PASTE');
	});
});

describe('readScanForm', () => {
	const requestWith = (formData, headers = {}) => ({
		headers: new Headers(headers),
		formData
	});

	it('returns the parsed form', async () => {
		const data = new FormData();
		data.set('scan_content', 'Pilot');
		await expect(readScanForm(requestWith(async () => data))).resolves.toEqual({ ok: true, data });
	});

	it('turns an over-limit body (413 cause from adapter-node) into a 413 rejection', async () => {
		const tooLarge = Object.assign(new Error('Payload Too Large'), { status: 413 });
		const parseError = new TypeError('Failed to parse body as FormData.', { cause: tooLarge });

		const result = await readScanForm(
			requestWith(async () => {
				throw parseError;
			})
		);

		expect(result).toMatchObject({ ok: false, status: 413, reason: 'payload_too_large' });
	});

	it('treats a Content-Length above BODY_SIZE_LIMIT as too large', async () => {
		const previous = process.env.BODY_SIZE_LIMIT;
		process.env.BODY_SIZE_LIMIT = '1M';
		try {
			const result = await readScanForm(
				requestWith(
					async () => {
						throw new TypeError('Failed to parse body as FormData.');
					},
					{ 'content-length': String(2 * 1024 * 1024) }
				)
			);
			expect(result).toMatchObject({ ok: false, status: 413, reason: 'payload_too_large' });
			expect(result.message).toContain('1M');
		} finally {
			if (previous === undefined) delete process.env.BODY_SIZE_LIMIT;
			else process.env.BODY_SIZE_LIMIT = previous;
		}
	});

	it('rethrows other form parsing errors', async () => {
		await expect(
			readScanForm(
				requestWith(
					async () => {
						throw new TypeError('boom');
					},
					{ 'content-length': '10' }
				)
			)
		).rejects.toThrow('boom');
	});
});
