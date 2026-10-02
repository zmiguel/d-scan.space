import { describe, it, expect } from 'vitest';
import { parseDistance, isDistanceColumn, isOnGrid } from '../../../src/lib/utils/distance.js';

describe('parseDistance', () => {
	it.each([
		['2,500 m', 2500, 'm'],
		['2.500 m', 2500, 'm'],
		['2 500 m', 2500, 'm'],
		['2\u00a0500 m', 2500, 'm'],
		['2\u202f500 m', 2500, 'm'],
		["2'500 m", 2500, 'm'],
		['850 m', 850, 'm'],
		['1,234 km', 1234, 'km'],
		['1.234 km', 1234, 'km'],
		['1,234,567 km', 1234567, 'km'],
		['1.234.567 km', 1234567, 'km'],
		['12 km', 12, 'km'],
		['12.5 AU', 12.5, 'AU'],
		['12,5 AU', 12.5, 'AU'],
		['1,234.5 AU', 1234.5, 'AU'],
		['1.234,5 AU', 1234.5, 'AU'],
		['0.1 au', 0.1, 'AU'],
		['  42 km  ', 42, 'km'],
		['42km', 42, 'km']
	])('parses %j as %d %s', (raw, value, unit) => {
		expect(parseDistance(raw)).toEqual({ value, unit });
	});

	it('treats a single separator in AU as decimal, not thousands', () => {
		expect(parseDistance('1,234 AU')).toEqual({ value: 1.234, unit: 'AU' });
		expect(parseDistance('1.234 AU')).toEqual({ value: 1.234, unit: 'AU' });
	});

	it.each(['-', '', '   ', 'invalid', '10 lightyears', 'km', '10', null, undefined])(
		'returns null for %j',
		(raw) => {
			expect(parseDistance(raw)).toBeNull();
		}
	);
});

describe('isDistanceColumn', () => {
	it('accepts a dash and any parsable distance', () => {
		expect(isDistanceColumn('-')).toBe(true);
		expect(isDistanceColumn(' - ')).toBe(true);
		expect(isDistanceColumn('1 234 km')).toBe(true);
		expect(isDistanceColumn('4,2 AU')).toBe(true);
	});

	it('rejects anything else', () => {
		expect(isDistanceColumn('')).toBe(false);
		expect(isDistanceColumn('--')).toBe(false);
		expect(isDistanceColumn('Extra')).toBe(false);
		expect(isDistanceColumn(null)).toBe(false);
	});
});

describe('isOnGrid', () => {
	const MAX_KM = 10000;

	it('includes objects exactly at the threshold and excludes those beyond it', () => {
		expect(isOnGrid('10,000 km', MAX_KM)).toBe(true);
		expect(isOnGrid('10.000 km', MAX_KM)).toBe(true);
		expect(isOnGrid('10\u00a0000 km', MAX_KM)).toBe(true);
		expect(isOnGrid('10,001 km', MAX_KM)).toBe(false);
		expect(isOnGrid('10 001 km', MAX_KM)).toBe(false);
	});

	it('converts metres to kilometres before comparing', () => {
		expect(isOnGrid('10,000,000 m', MAX_KM)).toBe(true);
		expect(isOnGrid('10,000,001 m', MAX_KM)).toBe(false);
		expect(isOnGrid('2,500 m', MAX_KM)).toBe(true);
	});

	it('treats AU distances as off-grid regardless of size', () => {
		expect(isOnGrid('0.1 AU', MAX_KM)).toBe(false);
		expect(isOnGrid('0,0 AU', MAX_KM)).toBe(false);
	});

	it('treats a dash or unparsable distance as off-grid', () => {
		expect(isOnGrid('-', MAX_KM)).toBe(false);
		expect(isOnGrid('invalid', MAX_KM)).toBe(false);
		expect(isOnGrid('', MAX_KM)).toBe(false);
	});

	it('respects the configured threshold', () => {
		expect(isOnGrid('500 km', 250)).toBe(false);
		expect(isOnGrid('250 km', 250)).toBe(true);
	});
});
