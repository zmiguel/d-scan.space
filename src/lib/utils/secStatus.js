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
