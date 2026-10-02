import { describe, it, expect } from 'vitest';
import {
	secStatusColor,
	securityBadgeColor,
	systemSecurityBand
} from '../../../src/lib/utils/secStatus.js';

describe('systemSecurityBand (in-game rounding)', () => {
	it.each([
		[1, 'high'],
		[0.5, 'high'],
		[0.45, 'high'], // shows as 0.5 in game
		[0.449, 'low'], // shows as 0.4
		[0.05, 'low'], // shows as 0.1
		[0.04, 'low'], // 0.0 < sec < 0.05 counts as 0.1
		[0.0001, 'low'],
		[0, 'null'],
		[-0.04, 'null'], // shows as -0.0
		[-1, 'null']
	])('%s -> %s', (security, band) => {
		expect(systemSecurityBand(security)).toBe(band);
	});

	it.each([[null], [undefined], [Number.NaN], [/** @type {any} */ ('0.9')]])(
		'is unknown for %j',
		(security) => {
			expect(systemSecurityBand(security)).toBeNull();
		}
	);

	it('maps bands to badge colours, purple when unknown', () => {
		expect([0.95, 0.04, -0.2, null].map(securityBadgeColor)).toEqual([
			'green',
			'yellow',
			'red',
			'purple'
		]);
	});
});

describe('secStatusColor', () => {
	it('should return gray for 0', () => {
		expect(secStatusColor(0)).toBe('hsl(0 0% 50%)');
	});

	it('should return red for -10', () => {
		expect(secStatusColor(-10)).toBe('hsl(0 75% 45%)');
	});

	it('should return green for 5', () => {
		expect(secStatusColor(5)).toBe('hsl(140 65% 40%)');
	});

	it('should handle string inputs', () => {
		expect(secStatusColor('0')).toBe('hsl(0 0% 50%)');
		expect(secStatusColor('-10')).toBe('hsl(0 75% 45%)');
	});

	it('should clamp values below -10', () => {
		expect(secStatusColor(-15)).toBe('hsl(0 75% 45%)');
	});

	it('should clamp values above 5', () => {
		expect(secStatusColor(10)).toBe('hsl(140 65% 40%)');
	});

	it('should interpolate negative values correctly', () => {
		// -5 is halfway between -10 and 0 linearly, but the easing is cubic
		// tLinear = (-5 + 10) / 10 = 0.5
		// t = 0.5^3 = 0.125
		// h = lerp(0, 0, 0.125) = 0
		// s = lerp(75, 0, 0.125) = 75 + (0 - 75) * 0.125 = 75 - 9.375 = 65.625 -> 66
		// l = lerp(45, 50, 0.125) = 45 + (50 - 45) * 0.125 = 45 + 0.625 = 45.625 -> 46
		expect(secStatusColor(-5)).toBe('hsl(0 66% 46%)');
	});

	it('should interpolate positive values correctly', () => {
		// 2.5 is halfway between 0 and 5 linearly
		// tLinear = 2.5 / 5 = 0.5
		// t = 0.5^(1/3) ≈ 0.7937
		// h = lerp(0, 140, 0.7937) ≈ 111.118 -> 111
		// s = lerp(0, 65, 0.7937) ≈ 51.59 -> 52
		// l = lerp(50, 40, 0.7937) ≈ 50 + (40-50)*0.7937 = 50 - 7.937 = 42.063 -> 42
		expect(secStatusColor(2.5)).toBe('hsl(111 52% 42%)');
	});
});
