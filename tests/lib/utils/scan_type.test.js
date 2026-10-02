import { describe, it, expect, vi, afterEach } from 'vitest';
import {
	detectScanType,
	normalizeScanLines,
	FAILED_LINES_SAMPLE
} from '../../../src/lib/utils/scan_type.js';
import logger from '../../../src/lib/logger.js';

afterEach(() => {
	vi.restoreAllMocks();
});

describe('normalizeScanLines', () => {
	it('splits CRLF, CR and LF line endings alike', () => {
		expect(normalizeScanLines('Alpha\r\nBravo\rCharlie\nDelta')).toEqual([
			'Alpha',
			'Bravo',
			'Charlie',
			'Delta'
		]);
	});

	it('removes zero-width characters, BOM and control characters', () => {
		expect(normalizeScanLines('\uFEFFBob\u200B Smith\r\nAl\u2060ice\u0007')).toEqual([
			'Bob Smith',
			'Alice'
		]);
	});

	it('drops empty, whitespace-only and invisible-only lines', () => {
		expect(normalizeScanLines('Bob\n\n   \n\u200B\uFEFF\r\nAlice\n')).toEqual(['Bob', 'Alice']);
	});

	it('trims spaces around a line but keeps tabs that separate columns', () => {
		expect(normalizeScanLines('  123\tName\tType\t10 km  ')).toEqual(['123\tName\tType\t10 km']);
		expect(normalizeScanLines('123\t\tType\t-\t')).toEqual(['123\t\tType\t-\t']);
	});

	it('collapses repeated inner spaces without touching tabs', () => {
		expect(normalizeScanLines('Bob    Smith')).toEqual(['Bob Smith']);
		expect(normalizeScanLines('Bob \u00a0Smith')).toEqual(['Bob Smith']);
		expect(normalizeScanLines('123\t\tMy  Ship\tRifter\t1  000 km')).toEqual([
			'123\t\tMy Ship\tRifter\t1 000 km'
		]);
	});

	it('returns no lines for missing content', () => {
		expect(normalizeScanLines(undefined)).toEqual([]);
		expect(normalizeScanLines(null)).toEqual([]);
		expect(normalizeScanLines('')).toEqual([]);
	});
});

describe('detectScanType', () => {
	it('returns unknown without details for empty input', () => {
		expect(detectScanType()).toEqual({ type: 'unknown' });
		expect(detectScanType([])).toEqual({ type: 'unknown' });
	});

	describe('local', () => {
		it('detects names with at most two spaces and no tabs', () => {
			expect(detectScanType(['Pilot One', 'Pilot Two Three', 'PilotFour'])).toEqual({
				type: 'local',
				supported: true
			});
		});

		it('rejects names with more than two spaces', () => {
			expect(detectScanType(['Pilot One Two Three']).type).toBe('unknown');
		});
	});

	describe('directional', () => {
		it('detects lines with integer type id and a distance column', () => {
			expect(
				detectScanType([
					'587\tMy Rifter\tRifter\t2,500 m',
					'24698\tDrake\tDrake\t1,234 km',
					'11\tJita - Star\tSun G5 (Yellow)\t12.5 AU',
					'40\tJita IV\tPlanet (Temperate)\t-'
				])
			).toEqual({ type: 'directional', supported: true });
		});

		it('accepts locale-specific distance formats', () => {
			expect(
				detectScanType([
					'587\tA\tRifter\t1 234 km',
					'587\tB\tRifter\t1\u00a0234 km',
					'587\tC\tRifter\t1.234 km',
					"587\tD\tRifter\t1'234 km",
					'11\tE\tSun\t12,5 AU'
				])
			).toEqual({ type: 'directional', supported: true });
		});

		it('detects lines whose object name contains tabs (extra columns)', () => {
			expect(detectScanType(['22474\ther\tto the der\tDamnation\t33 km'])).toEqual({
				type: 'directional',
				supported: true
			});
		});

		it('ignores hidden characters inside columns', () => {
			expect(detectScanType(['\u200B22474\ther\u0007\tDamnation\t33 km\uFEFF'])).toEqual({
				type: 'directional',
				supported: true
			});
		});

		it.each([
			['type id with trailing letters', '12abc\tName\tType\t10 km'],
			['non-integer type id', '1.5\tName\tType\t10 km'],
			['zero type id', '0\tName\tType\t10 km'],
			['negative type id', '-5\tName\tType\t10 km'],
			['empty type id', '\tName\tType\t10 km'],
			['unparsable distance', '5\tName\tType\tinvalid'],
			['unknown distance unit', '5\tName\tType\t10 lightyears'],
			['fewer than four columns', '5\tName\t10 km']
		])('rejects a line with %s', (_label, line) => {
			expect(detectScanType([line]).type).toBe('unknown');
		});
	});

	describe('unsupported types', () => {
		it('detects fleet windows as unsupported', () => {
			expect(detectScanType(['Pilot Name\tShip\tRole\tSquad\tWing\tA-B-C\tExtra'])).toEqual({
				type: 'fleet',
				supported: false
			});
		});

		it('rejects fleet lines without a pilot name or position dashes', () => {
			expect(detectScanType(['\tShip\tRole\tSquad\tWing\tA-B-C\tExtra']).type).toBe('unknown');
			expect(detectScanType(['Pilot\tShip\tRole\tSquad\tWing\tNoDashes\tExtra']).type).toBe(
				'unknown'
			);
		});

		it('detects probe scanner results as unsupported', () => {
			expect(detectScanType(['EMI-472\tCosmic Signature\t\t\t0.0%\t4.21 AU'])).toEqual({
				type: 'probe',
				supported: false
			});
		});

		it('rejects probe lines with a lower-case signature id', () => {
			expect(detectScanType(['emi-472\tCosmic Signature\t\t\t0.0%\tExtra']).type).toBe('unknown');
		});
	});

	describe('strict detection failures', () => {
		it('rejects a paste where a single line does not match, reporting the closest type', () => {
			const lines = ['587\tA\tRifter\t10 km', '587\tB\tRifter\t20 km', 'Some Pilot'];

			expect(detectScanType(lines)).toEqual({
				type: 'unknown',
				closest: {
					type: 'directional',
					matched: 2,
					total: 3,
					failed_lines: [{ line_number: 3, line: 'Some Pilot' }],
					failed_count: 1
				}
			});
		});

		it('reports the type that matched the most lines as closest', () => {
			const result = detectScanType(['Pilot One', 'Pilot Two', '5\tName\tType\t-']);

			expect(result.closest).toMatchObject({ type: 'local', matched: 2, total: 3 });
			expect(result.closest.failed_lines).toEqual([{ line_number: 3, line: '5\tName\tType\t-' }]);
		});

		it('caps the failed line sample but counts every failed line', () => {
			const bad = Array.from({ length: 15 }, (_, i) => `Too Many Spaces Here ${i}`);
			const result = detectScanType(['Pilot One', ...bad]);

			expect(result.closest.failed_count).toBe(15);
			expect(result.closest.failed_lines).toHaveLength(FAILED_LINES_SAMPLE);
			expect(FAILED_LINES_SAMPLE).toBe(10);
			expect(result.closest.failed_lines[0]).toEqual({ line_number: 2, line: bad[0] });
			expect(result.closest.failed_lines.at(-1)).toEqual({ line_number: 11, line: bad[9] });
		});

		it('truncates long failed lines to 120 characters plus an ellipsis', () => {
			const exact = 'x '.repeat(60).slice(0, 120);
			const long = 'y '.repeat(100);
			const result = detectScanType(['Pilot One', exact, long]);

			const [first, second] = result.closest.failed_lines;
			expect(first.line).toBe(exact);
			expect(second.line).toBe(`${long.slice(0, 120)}…`);
			expect(second.line).toHaveLength(121);
		});

		it('never logs the pasted text', () => {
			const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
			const secret = 'Secret Pilot Name Here';

			detectScanType(['Pilot One', secret]);

			expect(warnSpy).toHaveBeenCalledTimes(1);
			const logged = JSON.stringify(warnSpy.mock.calls[0]);
			expect(logged).not.toContain(secret);
			expect(logged).not.toContain('Pilot One');
			expect(warnSpy.mock.calls[0][0]).toMatchObject({
				closest_type: 'local',
				matched_lines: 1,
				total_lines: 2,
				failed_line_numbers: [2]
			});
		});
	});
});
