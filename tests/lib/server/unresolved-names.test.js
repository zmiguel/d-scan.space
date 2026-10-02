import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
	isKnownUnresolvable,
	rememberUnresolvable,
	_clearUnresolvableNames,
	UNRESOLVED_TTL_MS,
	UNRESOLVED_MAX_ENTRIES
} from '../../../src/lib/server/unresolved-names.js';

describe('unresolved-names', () => {
	beforeEach(() => {
		vi.useFakeTimers();
		_clearUnresolvableNames();
	});

	afterEach(() => {
		vi.useRealTimers();
	});

	it('matches remembered names case-insensitively', () => {
		rememberUnresolvable(['Ghost Pilot']);

		expect(isKnownUnresolvable('ghost pilot')).toBe(true);
		expect(isKnownUnresolvable('GHOST PILOT')).toBe(true);
		expect(isKnownUnresolvable('Ghost Pilot2')).toBe(false);
	});

	it('forgets names once the TTL has passed', () => {
		rememberUnresolvable(['Ghost']);

		vi.advanceTimersByTime(UNRESOLVED_TTL_MS - 1);
		expect(isKnownUnresolvable('Ghost')).toBe(true);
		vi.advanceTimersByTime(1);
		expect(isKnownUnresolvable('Ghost')).toBe(false);
	});

	it('restarts the TTL when a name is remembered again', () => {
		rememberUnresolvable(['Ghost']);
		vi.advanceTimersByTime(UNRESOLVED_TTL_MS - 1);
		rememberUnresolvable(['ghost']);

		vi.advanceTimersByTime(UNRESOLVED_TTL_MS - 1);
		expect(isKnownUnresolvable('Ghost')).toBe(true);
	});

	it('evicts the oldest entries beyond the cap, keeping refreshed ones', () => {
		rememberUnresolvable(['oldest', 'refreshed']);
		rememberUnresolvable(Array.from({ length: UNRESOLVED_MAX_ENTRIES - 2 }, (_, i) => `n${i}`));
		rememberUnresolvable(['Refreshed']); // moves to newest
		rememberUnresolvable(['newcomer']);

		expect(isKnownUnresolvable('oldest')).toBe(false);
		expect(isKnownUnresolvable('refreshed')).toBe(true);
		expect(isKnownUnresolvable('n0')).toBe(true);
		expect(isKnownUnresolvable('newcomer')).toBe(true);
	});
});
