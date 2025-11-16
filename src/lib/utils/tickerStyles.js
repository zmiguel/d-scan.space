const styleCache = new Set();

export function normalizeTicker(ticker) {
	return ticker && ticker !== '' ? ticker : 'none';
}

export function getTickerColor(ticker) {
	if (!ticker || ticker === 'none') {
		return {
			lightColor: '#e5e7eb',
			darkColor: '#4b5563',
			customClass: 'ticker-none'
		};
	}

	let hash = 0;
	for (let i = 0; i < ticker.length; i++) {
		hash = ((hash << 5) - hash + ticker.charCodeAt(i)) & 0xffffffff;
	}

	const hue = Math.abs(hash) % 360;
	const lightColor = `hsl(${hue}, 70%, 85%)`;
	const darkColor = `hsl(${hue}, 60%, 25%)`;

	return {
		lightColor,
		darkColor,
		customClass: `ticker-${ticker.replace(/[^a-zA-Z0-9]/g, '')}`
	};
}

function addTickerStyles(ticker, colors) {
	const className = colors.customClass;
	if (styleCache.has(className)) return;

	const styleId = `style-${className}`;
	if (!document.getElementById(styleId)) {
		const style = document.createElement('style');
		style.id = styleId;
		style.textContent = `
			.${className} { background-color: ${colors.lightColor} !important; }
			.dark .${className} { background-color: ${colors.darkColor} !important; }
			.hover-${className}:hover { background-color: ${colors.lightColor} !important; }
			.dark .hover-${className}:hover { background-color: ${colors.darkColor} !important; }
		`;
		document.head.appendChild(style);
		styleCache.add(className);
	}
}

export function ensureTickerStyles(ticker) {
	const normalizedTicker = normalizeTicker(ticker);
	const colors = getTickerColor(normalizedTicker);
	addTickerStyles(normalizedTicker, colors);
	return colors;
}

export function getHoverClass(ticker) {
	return `hover-${ensureTickerStyles(ticker).customClass}`;
}

export function getHighlightClass(ticker) {
	return ensureTickerStyles(ticker).customClass;
}

export function getPilotHoverClass(corpTicker) {
	return getHoverClass(corpTicker);
}
