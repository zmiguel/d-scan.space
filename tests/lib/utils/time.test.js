import { describe, it, expect } from 'vitest';
import { formatDuration, formatUtcTimestamp } from '../../../src/lib/utils/time.js';

describe('formatDuration', () => {
	it.each([
		[0, '0 s'],
		[59_400, '59 s'],
		[59_600, '1 min'], // rounds to 60 s
		[60_000, '1 min'],
		[59 * 60_000 + 59_000, '59 min'],
		[3_600_000, '1 h'],
		[3_600_000 + 5 * 60_000, '1 h 5 min'],
		[24 * 3_600_000, '1 d'],
		[(2 * 24 + 4) * 3_600_000 + 30 * 60_000, '2 d 4 h']
	])('%i ms -> %s', (ms, label) => {
		expect(formatDuration(ms)).toBe(label);
	});

	it('never shows a negative duration', () => {
		expect(formatDuration(-5000)).toBe('0 s');
	});
});

describe('formatUtcTimestamp', () => {
	it('formats in UTC without milliseconds', () => {
		expect(formatUtcTimestamp('2025-11-19T16:22:21.838Z')).toBe('2025-11-19 16:22:21');
	});
});
