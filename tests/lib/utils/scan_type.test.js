import { describe, it, expect, vi } from 'vitest';
import { detectScanType } from '../../../src/lib/utils/scan_type.js';
import logger from '../../../src/lib/logger.js';

describe('scan_type detection', () => {
	it('returns unknown for empty or invalid input', () => {
		expect(detectScanType()).toEqual({ type: 'unknown' });
		expect(detectScanType([])).toEqual({ type: 'unknown' });
		expect(detectScanType(['a\tbad\tline'])).toEqual({ type: 'unknown' });
	});

	it('detects local scans with no tabs and <=2 spaces', () => {
		const lines = ['Pilot One', 'Pilot Two', 'PilotThree'];
		expect(detectScanType(lines)).toEqual({ type: 'local', supported: true });
	});

	it('rejects local lines that contain tabs or too many spaces', () => {
		const lines = ['Pilot One Two Three'];
		expect(detectScanType(lines)).toEqual({ type: 'unknown' });
		const tabbed = ['Pilot\tOne'];
		expect(detectScanType(tabbed)).toEqual({ type: 'unknown' });
	});

	it('detects directional scans with numeric first column and distance', () => {
		const lines = ['0.4\tRifter\tShip\t25 km', '12\tDrake\tShip\t1.2 AU'];
		expect(detectScanType(lines)).toEqual({ type: 'directional', supported: true });
	});

	it('detects directional scans with dash distance', () => {
		const lines = ['5\tSome\tThing\t-'];
		expect(detectScanType(lines)).toEqual({ type: 'directional', supported: true });
	});

	it('detects directional scans when name contains embedded tab characters', () => {
		const lines = ['22474\therק\tto the derק\tDamnation\t33 km'];
		expect(detectScanType(lines)).toEqual({ type: 'directional', supported: true });
	});

	it('detects directional scans with hidden control characters while preserving tabs', () => {
		const lines = ['22474\ther\u0007\tto the der\u200B\tDamnation\t33 km'];
		expect(detectScanType(lines)).toEqual({ type: 'directional', supported: true });
	});

	it('rejects directional scans with invalid last group', () => {
		const lines = ['5\tSome\tThing\tinvalid'];
		expect(detectScanType(lines)).toEqual({ type: 'unknown' });
	});

	it('rejects directional scans with missing first column', () => {
		const lines = ['\tSome\tThing\t10 km'];
		expect(detectScanType(lines)).toEqual({ type: 'unknown' });
	});

	it('rejects directional scans with extra columns', () => {
		const lines = ['5\tSome\tThing\t10 km\tExtra'];
		expect(detectScanType(lines)).toEqual({ type: 'unknown' });
	});

	it('rejects directional scans when split length mismatches', () => {
		const originalSplit = String.prototype.split;
		const line = '1\tSome\tThing\t10 km';
		const splitSpy = vi.spyOn(String.prototype, 'split').mockImplementation(function (separator) {
			if (this.toString() === line && separator === '\t') {
				return ['1', 'Some'];
			}
			return originalSplit.call(this, separator);
		});

		expect(detectScanType([line])).toEqual({ type: 'unknown' });

		splitSpy.mockRestore();
	});

	it('rejects directional scans when tabs do not match', () => {
		const lines = ['Not\tEnough Tabs'];
		expect(detectScanType(lines)).toEqual({ type: 'unknown' });
	});

	it('detects fleet scans as unsupported', () => {
		const lines = ['Pilot Name\tShip\tRole\tSquad\tWing\tA-B-C\tExtra'];
		expect(detectScanType(lines)).toEqual({ type: 'fleet', supported: false });
	});

	it('rejects fleet scans without a pilot name', () => {
		const lines = ['\tShip\tRole\tSquad\tWing\tA-B-C\tExtra'];
		expect(detectScanType(lines)).toEqual({ type: 'unknown' });
	});

	it('rejects fleet scans without dash group', () => {
		const lines = ['Pilot Name\tShip\tRole\tSquad\tWing\tNoDashes\tExtra'];
		expect(detectScanType(lines)).toEqual({ type: 'unknown' });
	});

	it('rejects fleet scans with missing columns', () => {
		const lines = ['Pilot Name\tShip\tRole\tSquad\tWing\tA-B-C'];
		expect(detectScanType(lines)).toEqual({ type: 'unknown' });
	});

	it('rejects fleet scans when split length mismatches', () => {
		const originalSplit = String.prototype.split;
		const line = 'Pilot Name\tShip\tRole\tSquad\tWing\tA-B-C\tExtra';
		const splitSpy = vi.spyOn(String.prototype, 'split').mockImplementation(function (separator) {
			if (this.toString() === line && separator === '\t') {
				return ['Pilot Name', 'Ship'];
			}
			return originalSplit.call(this, separator);
		});

		expect(detectScanType([line])).toEqual({ type: 'unknown' });

		splitSpy.mockRestore();
	});

	it('detects probe scans as unsupported', () => {
		const lines = ['EMI-472\t100\t0.50\tSignal\t100%\tExtra'];
		expect(detectScanType(lines)).toEqual({ type: 'probe', supported: false });
	});

	it('rejects probe scans with invalid prefix', () => {
		const lines = ['emi-472\t100\t0.50\tSignal\t100%\tExtra'];
		expect(detectScanType(lines)).toEqual({ type: 'unknown' });
	});

	it('rejects probe scans with missing columns', () => {
		const lines = ['EMI-472\t100\t0.50\tSignal\t100%'];
		expect(detectScanType(lines)).toEqual({ type: 'unknown' });
	});

	it('rejects probe scans when split length mismatches', () => {
		const originalSplit = String.prototype.split;
		const line = 'EMI-472\t100\t0.50\tSignal\t100%\tExtra';
		const splitSpy = vi.spyOn(String.prototype, 'split').mockImplementation(function (separator) {
			if (this.toString() === line && separator === '\t') {
				return ['EMI-472'];
			}
			return originalSplit.call(this, separator);
		});

		expect(detectScanType([line])).toEqual({ type: 'unknown' });

		splitSpy.mockRestore();
	});

	it('returns unknown when lines are mixed types', () => {
		const lines = ['Pilot One', '5\tSome\tThing\t-'];
		expect(detectScanType(lines)).toEqual({ type: 'unknown' });
	});

	it('logs closest matching type and failing lines for unknown scans', () => {
		const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
		const lines = ['Pilot One', 'Pilot Two Three Four'];

		expect(detectScanType(lines)).toEqual({ type: 'unknown' });
		expect(warnSpy).toHaveBeenCalledWith(
			expect.objectContaining({
				closest_type: 'local',
				match_percent: 50,
				matched_lines: 1,
				total_lines: 2,
				failed_lines: [{ line_number: 2, line: 'Pilot Two Three Four' }]
			}),
			'Scan type detection failed; closest scan type did not fully match'
		);
	});
});
