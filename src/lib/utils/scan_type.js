/**
 * Scan type detection for pasted scan content.
 */

const DISTANCE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:m|km|AU)\b/i;

const hasExactTabs = (line, count) => {
	const matches = line.match(/\t/g);
	return (matches ? matches.length : 0) === count;
};

const isLocalLine = (line) => {
	if (line.includes('\t')) {
		return false;
	}
	const spaces = line.match(/ /g);
	return (spaces ? spaces.length : 0) <= 2;
};

const isDirectionalLine = (line) => {
	if (!hasExactTabs(line, 3)) {
		return false;
	}
	const parts = line.split('\t');
	if (parts.length !== 4) {
		return false;
	}
	const [first, , , last] = parts;
	if (first === '' || Number.isNaN(Number.parseFloat(first))) {
		return false;
	}
	return last === '-' || DISTANCE_PATTERN.test(last);
};

const isFleetLine = (line) => {
	if (!hasExactTabs(line, 6)) {
		return false;
	}
	const parts = line.split('\t');
	if (parts.length !== 7) {
		return false;
	}
	const first = parts[0]?.trim();
	if (!first) {
		return false;
	}
	const groupSix = parts[5] ?? '';
	const dashMatches = groupSix.match(/-/g);
	return (dashMatches ? dashMatches.length : 0) >= 2;
};

const isProbeLine = (line) => {
	if (!hasExactTabs(line, 5)) {
		return false;
	}
	const parts = line.split('\t');
	if (parts.length !== 6) {
		return false;
	}
	return /^[A-Z]{3}-\d{3}/.test(parts[0] ?? '');
};

export function detectScanType(lines) {
	if (!Array.isArray(lines) || lines.length === 0) {
		return { type: 'unknown' };
	}

	const allMatch = (predicate) => lines.every((line) => predicate(line));

	if (allMatch(isLocalLine)) {
		return { type: 'local', supported: true };
	}

	if (allMatch(isDirectionalLine)) {
		return { type: 'directional', supported: true };
	}

	if (allMatch(isFleetLine)) {
		return { type: 'fleet', supported: false };
	}

	if (allMatch(isProbeLine)) {
		return { type: 'probe', supported: false };
	}

	return { type: 'unknown' };
}
