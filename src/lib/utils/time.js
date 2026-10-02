/**
 * `YYYY-MM-DD HH:MM:SS` in UTC (the format used across scan pages).
 * @param {string | number | Date} value
 */
export function formatUtcTimestamp(value) {
	return new Date(value)
		.toISOString()
		.replace('T', ' ')
		.replace(/\.\d+Z$/, '');
}

/**
 * Compact duration for "x earlier" labels: `45 s`, `12 min`, `3 h 5 min`, `2 d 4 h`.
 * @param {number} ms non-negative duration in milliseconds
 */
export function formatDuration(ms) {
	const seconds = Math.max(0, Math.round(ms / 1000));
	if (seconds < 60) return `${seconds} s`;
	const minutes = Math.floor(seconds / 60);
	if (minutes < 60) return `${minutes} min`;
	const hours = Math.floor(minutes / 60);
	if (hours < 24) return minutes % 60 ? `${hours} h ${minutes % 60} min` : `${hours} h`;
	const days = Math.floor(hours / 24);
	return hours % 24 ? `${days} d ${hours % 24} h` : `${days} d`;
}
