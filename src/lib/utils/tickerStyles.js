/**
 * Background colours of local-scan rows, derived from alliance/corporation tickers.
 *
 * A row gets its colours as CSS custom properties (`tickerRowStyle`) plus two static
 * classes defined in src/app.css:
 * - `ticker-hover`: background while hovered = the row's own ticker colour,
 * - `ticker-highlight`: background while part of the focused alliance/corp/pilot context.
 * The hover rule is more specific, so a hovered row shows its hover colour even when it is
 * highlighted (same precedence as the per-ticker style tags this replaced).
 */

export function normalizeTicker(ticker) {
	return ticker && ticker !== '' ? ticker : 'none';
}

/**
 * Stable colours per ticker (hash → hue).
 * @param {string | null | undefined} ticker
 * @returns {{ lightColor: string, darkColor: string }}
 */
export function getTickerColor(ticker) {
	if (!ticker || ticker === 'none') {
		return { lightColor: '#e5e7eb', darkColor: '#4b5563' };
	}

	let hash = 0;
	for (let i = 0; i < ticker.length; i++) {
		hash = ((hash << 5) - hash + ticker.charCodeAt(i)) & 0xffffffff;
	}

	const hue = Math.abs(hash) % 360;
	return {
		lightColor: `hsl(${hue}, 70%, 85%)`,
		darkColor: `hsl(${hue}, 60%, 25%)`
	};
}

/**
 * Inline style with the row's colour variables.
 * @param {string | null | undefined} hoverTicker ticker whose colour the row shows on hover
 * @param {string | null | undefined} [highlightTicker] colour of the active highlight, if any
 */
export function tickerRowStyle(hoverTicker, highlightTicker) {
	const hover = getTickerColor(normalizeTicker(hoverTicker));
	let style = `--ticker-hover-light: ${hover.lightColor}; --ticker-hover-dark: ${hover.darkColor};`;
	if (highlightTicker) {
		const highlight = getTickerColor(normalizeTicker(highlightTicker));
		style += ` --ticker-highlight-light: ${highlight.lightColor}; --ticker-highlight-dark: ${highlight.darkColor};`;
	}
	return style;
}
