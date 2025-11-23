import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
    normalizeTicker,
    getTickerColor,
    ensureTickerStyles,
    getHoverClass,
    getHighlightClass,
    getPilotHoverClass
} from '../../../src/lib/utils/tickerStyles.js';

describe('tickerStyles', () => {
    beforeEach(() => {
        // Mock DOM
        global.document = {
            getElementById: vi.fn(),
            createElement: vi.fn(() => ({})),
            head: {
                appendChild: vi.fn()
            }
        };
    });

    afterEach(() => {
        vi.restoreAllMocks();
        delete global.document;
    });

    describe('normalizeTicker', () => {
        it('should return the ticker if present', () => {
            expect(normalizeTicker('ABC')).toBe('ABC');
        });

        it('should return "none" if ticker is empty string', () => {
            expect(normalizeTicker('')).toBe('none');
        });

        it('should return "none" if ticker is null/undefined', () => {
            expect(normalizeTicker(null)).toBe('none');
            expect(normalizeTicker(undefined)).toBe('none');
        });
    });

    describe('getTickerColor', () => {
        it('should return default colors for "none"', () => {
            const colors = getTickerColor('none');
            expect(colors).toEqual({
                lightColor: '#e5e7eb',
                darkColor: '#4b5563',
                customClass: 'ticker-none'
            });
        });

        it('should return consistent colors for a given ticker', () => {
            const colors1 = getTickerColor('TEST');
            const colors2 = getTickerColor('TEST');
            expect(colors1).toEqual(colors2);
            expect(colors1.customClass).toBe('ticker-TEST');
            expect(colors1.lightColor).toMatch(/hsl\(\d+, 70%, 85%\)/);
            expect(colors1.darkColor).toMatch(/hsl\(\d+, 60%, 25%\)/);
        });

        it('should sanitize ticker for class name', () => {
            const colors = getTickerColor('T.E-S_T');
            expect(colors.customClass).toBe('ticker-TEST');
        });
    });

    describe('ensureTickerStyles', () => {
        it('should add style element if not present', () => {
            const mockStyle = {};
            document.createElement.mockReturnValue(mockStyle);
            document.getElementById.mockReturnValue(null);

            ensureTickerStyles('NEW');

            expect(document.getElementById).toHaveBeenCalledWith('style-ticker-NEW');
            expect(document.createElement).toHaveBeenCalledWith('style');
            expect(mockStyle.id).toBe('style-ticker-NEW');
            expect(mockStyle.textContent).toContain('.ticker-NEW');
            expect(document.head.appendChild).toHaveBeenCalledWith(mockStyle);
        });

        it('should not add style element if already present in DOM', () => {
            document.getElementById.mockReturnValue({});

            ensureTickerStyles('EXISTING');

            expect(document.getElementById).toHaveBeenCalledWith('style-ticker-EXISTING');
            expect(document.createElement).not.toHaveBeenCalled();
            expect(document.head.appendChild).not.toHaveBeenCalled();
        });

        it('should not add style element if already in cache', () => {
            const mockStyle = {};
            document.createElement.mockReturnValue(mockStyle);
            document.getElementById.mockReturnValue(null);

            // First call adds to cache
            ensureTickerStyles('CACHED');

            // Reset mocks to verify second call
            document.createElement.mockClear();
            document.head.appendChild.mockClear();

            // Second call should hit cache
            ensureTickerStyles('CACHED');

            expect(document.createElement).not.toHaveBeenCalled();
            expect(document.head.appendChild).not.toHaveBeenCalled();
        });
    });

    describe('getHoverClass', () => {
        it('should return correct hover class', () => {
            document.getElementById.mockReturnValue({}); // Assume style exists
            expect(getHoverClass('ABC')).toBe('hover-ticker-ABC');
        });
    });

    describe('getHighlightClass', () => {
        it('should return correct highlight class', () => {
            document.getElementById.mockReturnValue({}); // Assume style exists
            expect(getHighlightClass('ABC')).toBe('ticker-ABC');
        });
    });

    describe('getPilotHoverClass', () => {
        it('should return correct pilot hover class', () => {
            document.getElementById.mockReturnValue({}); // Assume style exists
            expect(getPilotHoverClass('ABC')).toBe('hover-ticker-ABC');
        });
    });
});
