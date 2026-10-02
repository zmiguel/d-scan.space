import { describe, it, expect } from 'vitest';
import {
	normalizeTicker,
	getTickerColor,
	tickerRowStyle
} from '../../../src/lib/utils/tickerStyles.js';

describe('tickerStyles', () => {
	it('treats a missing ticker as "none"', () => {
		expect(normalizeTicker('ABC')).toBe('ABC');
		expect(normalizeTicker('')).toBe('none');
		expect(normalizeTicker(null)).toBe('none');
		expect(normalizeTicker(undefined)).toBe('none');
	});

	it('uses neutral greys for pilots/corps without a ticker', () => {
		expect(getTickerColor('none')).toEqual({ lightColor: '#e5e7eb', darkColor: '#4b5563' });
	});

	it('gives every ticker a stable light/dark colour pair of the same hue', () => {
		const colors = getTickerColor('TEST');
		expect(getTickerColor('TEST')).toEqual(colors);
		const lightHue = colors.lightColor.match(/^hsl\((\d+), 70%, 85%\)$/)?.[1];
		const darkHue = colors.darkColor.match(/^hsl\((\d+), 60%, 25%\)$/)?.[1];
		expect(lightHue).toBeDefined();
		expect(darkHue).toBe(lightHue);
		expect(getTickerColor('OTHER').lightColor).not.toBe(colors.lightColor);
	});

	it('sets hover colours, and highlight colours only while highlighted', () => {
		const corp = getTickerColor('CORP');
		const alliance = getTickerColor('ALLY');

		const idle = tickerRowStyle('CORP');
		expect(idle).toContain(`--ticker-hover-light: ${corp.lightColor}`);
		expect(idle).toContain(`--ticker-hover-dark: ${corp.darkColor}`);
		expect(idle).not.toContain('--ticker-highlight');

		const highlighted = tickerRowStyle('CORP', 'ALLY');
		expect(highlighted).toContain(`--ticker-highlight-light: ${alliance.lightColor}`);
		expect(highlighted).toContain(`--ticker-highlight-dark: ${alliance.darkColor}`);
	});

	it('uses the "none" colours for rows without a ticker', () => {
		expect(tickerRowStyle('', 'none')).toContain('--ticker-highlight-light: #e5e7eb');
	});
});
