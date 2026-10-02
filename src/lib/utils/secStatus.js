// Returns a color string (HSL) for a security status value.
// Gradient mapping: -10 (red) → 0 (gray) → 5 (green)
export function secStatusColor(value) {
	const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
	const lerp = (a, b, t) => a + (b - a) * t;
	const hslToString = (h, s, l) => `hsl(${Math.round(h)} ${Math.round(s)}% ${Math.round(l)}%)`;
	const mixHsl = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

	const v = clamp(Number(value) || 0, -10, 5);
	// endpoints: red (-10), gray (0), green (5)
	const red = [0, 75, 45];
	const gray = [0, 0, 50];
	const green = [140, 65, 40];

	if (v === 0) return hslToString(...gray);

	if (v < 0) {
		// Ease to reduce gray near small negatives
		const tLinear = (v + 10) / 10; // -10 -> 0, 0 -> 1
		const t = Math.pow(tLinear, 3);
		const [h, s, l] = mixHsl(red, gray, t);
		return hslToString(h, s, l);
	}

	// v > 0 — Ease to reduce gray near small positives
	const tLinear = v / 5; // 0 -> 0, 5 -> 1
	const t = Math.pow(tLinear, 1 / 3);
	const [h, s, l] = mixHsl(gray, green, t);
	return hslToString(h, s, l);
}

/**
 * Security band of a solar system as the game shows it: the true security is rounded to
 * one decimal, except that 0.0 < sec < 0.05 counts as 0.1 (low-sec). >= 0.5 is high-sec,
 * > 0.0 low-sec, everything else null-sec.
 * @param {number | null | undefined} security true security status (SDE value)
 * @returns {'high' | 'low' | 'null' | null} null when unknown
 */
export function systemSecurityBand(security) {
	if (typeof security !== 'number' || !Number.isFinite(security)) return null;
	const rounded = security > 0 && security < 0.05 ? 0.1 : Math.round(security * 10) / 10;
	if (rounded >= 0.5) return 'high';
	if (rounded > 0) return 'low';
	return 'null';
}

const BAND_BADGE_COLOR = { high: 'green', low: 'yellow', null: 'red' };

/**
 * flowbite Badge colour for a system's security badge ('purple' when unknown).
 * @param {number | null | undefined} security
 */
export function securityBadgeColor(security) {
	const band = systemSecurityBand(security);
	return band ? BAND_BADGE_COLOR[band] : 'purple';
}
