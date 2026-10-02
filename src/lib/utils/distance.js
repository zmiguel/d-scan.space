/**
 * Parsing of the distance column of a directional scan (`2,500 m`, `1,234 km`, `12.5 AU`,
 * or `-` when the client shows no distance).
 *
 * Number formats depend on the client's locale settings, so separators are handled
 * generically: spaces, non-breaking/thin spaces and apostrophes as thousands
 * separators; `,` and `.` as either thousands or decimal separator. EVE shows m and km
 * without decimals, so for those a value like `1.234` or `1,234` is a grouped
 * thousand; for AU the single `,`/`.` is the decimal separator. Units are the English
 * ones (m, km, AU); localized unit strings are added once real client samples exist.
 */

/** Space-like characters used as thousands separators by different locales. */
const SPACE_SEPARATORS = /[\s\u00a0\u2007\u202f']/g;
const DISTANCE_PATTERN = /^([\d\s\u00a0\u2007\u202f'.,]*\d)\s*(m|km|au)$/i;
const GROUPED_THOUSANDS = /^\d{1,3}([.,]\d{3})+$/;

/**
 * @param {string} digits number without unit, spaces already removed
 * @param {boolean} decimalsAllowed
 */
function parseNumber(digits, decimalsAllowed) {
	if (!decimalsAllowed && GROUPED_THOUSANDS.test(digits)) {
		return Number(digits.replace(/[.,]/g, ''));
	}
	const lastComma = digits.lastIndexOf(',');
	const lastDot = digits.lastIndexOf('.');
	if (lastComma !== -1 && lastDot !== -1) {
		// Both present: the later one is the decimal separator.
		const decimal = lastComma > lastDot ? ',' : '.';
		const thousands = decimal === ',' ? '.' : ',';
		return Number(digits.split(thousands).join('').replace(decimal, '.'));
	}
	return Number(digits.replace(',', '.'));
}

/**
 * @param {string | null | undefined} raw
 * @returns {{ value: number, unit: 'm' | 'km' | 'AU' } | null} null for `-` or unparsable
 */
export function parseDistance(raw) {
	const text = String(raw ?? '').trim();
	const match = DISTANCE_PATTERN.exec(text);
	if (!match) return null;

	const unit = /** @type {'m' | 'km' | 'AU'} */ (
		match[2].toLowerCase() === 'au' ? 'AU' : match[2].toLowerCase()
	);
	const value = parseNumber(match[1].replace(SPACE_SEPARATORS, ''), unit === 'AU');
	return Number.isFinite(value) ? { value, unit } : null;
}

/** @param {string | null | undefined} raw */
export function isDistanceColumn(raw) {
	return String(raw ?? '').trim() === '-' || parseDistance(raw) !== null;
}

/**
 * Whether an object is on the scanner's grid. Grids are not a fixed size in EVE; any
 * object up to `maxKm` away counts as on-grid, AU distances and `-` are off-grid.
 * @param {string | null | undefined} raw
 * @param {number} maxKm
 */
export function isOnGrid(raw, maxKm) {
	const distance = parseDistance(raw);
	if (!distance || distance.unit === 'AU') return false;
	const km = distance.unit === 'm' ? distance.value / 1000 : distance.value;
	return km <= maxKm;
}
