/**
 * Scan type detection for pasted scan content.
 */

import logger from '$lib/logger';

const DISTANCE_PATTERN = /\b\d+(?:\.\d+)?\s*(?:m|km|AU)\b/i;
const HIDDEN_CONTROL_PATTERN =
	/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\uFEFF]/g; // eslint-disable-line no-control-regex

const sanitizeScanLine = (line) => line.replace(HIDDEN_CONTROL_PATTERN, '');

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
	const tabMatches = line.match(/\t/g);
	if ((tabMatches ? tabMatches.length : 0) < 3) {
		return false;
	}
	const parts = line.split('\t');
	if (parts.length < 4) {
		return false;
	}
	const first = parts[0];
	const last = parts[parts.length - 1];
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
	const groupSix = parts[5];
	const dashCount = groupSix.split('-').length - 1;
	return dashCount >= 2;
};

const isProbeLine = (line) => {
	if (!hasExactTabs(line, 5)) {
		return false;
	}
	const parts = line.split('\t');
	if (parts.length !== 6) {
		return false;
	}
	return /^[A-Z]{3}-\d{3}/.test(parts[0]);
};

const SCAN_TYPES = [
	{ type: 'local', supported: true, predicate: isLocalLine },
	{ type: 'directional', supported: true, predicate: isDirectionalLine },
	{ type: 'fleet', supported: false, predicate: isFleetLine },
	{ type: 'probe', supported: false, predicate: isProbeLine }
];

const getMatchResult = (lines, scanType) => {
	let matched = 0;
	const failedLines = [];

	for (const [index, line] of lines.entries()) {
		if (scanType.predicate(line)) {
			matched += 1;
			continue;
		}

		failedLines.push({
			line_number: index + 1,
			line
		});
	}

	const total = lines.length;
	const matchPercent = total > 0 ? (matched / total) * 100 : 0;

	return {
		type: scanType.type,
		supported: scanType.supported,
		matched,
		total,
		match_percent: Number(matchPercent.toFixed(2)),
		failed_lines: failedLines
	};
};

export function detectScanType(lines) {
	if (!Array.isArray(lines) || lines.length === 0) {
		return { type: 'unknown' };
	}

	const sanitizedLines = lines.map((line) =>
		typeof line === 'string' ? sanitizeScanLine(line) : String(line ?? '')
	);

	const matchResults = SCAN_TYPES.map((scanType) => getMatchResult(sanitizedLines, scanType));

	for (const result of matchResults) {
		if (result.matched === result.total) {
			return { type: result.type, supported: result.supported };
		}
	}

	const [closest] = matchResults.reduce(
		(best, current) => {
			if (!best[0] || current.matched > best[0].matched) {
				return [current];
			}

			return best;
		},
		[null]
	);

	if (closest) {
		logger.warn(
			{
				closest_type: closest.type,
				match_percent: closest.match_percent,
				matched_lines: closest.matched,
				total_lines: closest.total,
				failed_lines: closest.failed_lines
			},
			'Scan type detection failed; closest scan type did not fully match'
		);
	}

	return { type: 'unknown' };
}
