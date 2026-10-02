/**
 * Scan type detection for pasted scan content.
 */

import logger from '$lib/logger';
import { isDistanceColumn } from './distance.js';

const HIDDEN_CONTROL_PATTERN =
	/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g; // eslint-disable-line no-control-regex
/** Leading/trailing whitespace other than tabs (tabs separate d-scan columns). */
const EDGE_SPACES = /^[^\S\t]+|[^\S\t]+$/g;
/** Runs of two or more spaces (not tabs) inside a line. */
const INNER_SPACE_RUNS = /[^\S\t\n]{2,}/g;
/** Lines/characters shown back to the user or logged when detection fails. */
export const FAILED_LINES_SAMPLE = 10;
const FAILED_LINE_MAX_CHARS = 120;

const sanitizeScanLine = (line) => line.replace(HIDDEN_CONTROL_PATTERN, '');

/**
 * Splits pasted scan text into clean, non-empty lines. Applied before detection and
 * parsing so both see the same input:
 * - CRLF/CR line endings (native form posts, Windows clipboards) become LF,
 * - invisible characters (zero-width spaces, BOM, control characters copied from
 *   Discord/browsers) are removed,
 * - spaces around a line are trimmed and repeated inner spaces collapsed (EVE names
 *   never contain double spaces); tabs are kept because they separate d-scan columns.
 * @param {string} content
 * @returns {string[]}
 */
export function normalizeScanLines(content) {
	return String(content ?? '')
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((line) => sanitizeScanLine(line).replace(EDGE_SPACES, '').replace(INNER_SPACE_RUNS, ' '))
		.filter((line) => line.length > 0);
}

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
	const parts = line.split('\t');
	if (parts.length < 4) {
		return false;
	}
	// Same rules as the parser in src/lib/server/directional.js.
	const typeId = Number(parts[0]);
	return Number.isInteger(typeId) && typeId > 0 && isDistanceColumn(parts[parts.length - 1]);
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
	const matchPercent = (matched / total) * 100;

	return {
		type: scanType.type,
		supported: scanType.supported,
		matched,
		total,
		match_percent: Number(matchPercent.toFixed(2)),
		failed_lines: failedLines
	};
};

/**
 * Detects which EVE window the lines were copied from. Every line must match the same
 * type (strict). On failure the closest type and its non-matching lines are returned so
 * the user can fix the paste.
 * @param {string[]} lines
 * @returns {{ type: string, supported?: boolean,
 *   closest?: { type: string, matched: number, total: number,
 *     failed_lines: Array<{ line_number: number, line: string }>, failed_count: number } }}
 */
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

	const closest = matchResults.reduce((best, current) =>
		current.matched > best.matched ? current : best
	);
	const sample = closest.failed_lines
		.slice(0, FAILED_LINES_SAMPLE)
		.map(({ line_number, line }) => ({
			line_number,
			line: line.length > FAILED_LINE_MAX_CHARS ? `${line.slice(0, FAILED_LINE_MAX_CHARS)}…` : line
		}));

	// Pasted scans are user content: log counts and line numbers, never the text.
	logger.warn(
		{
			closest_type: closest.type,
			match_percent: closest.match_percent,
			matched_lines: closest.matched,
			total_lines: closest.total,
			failed_line_numbers: sample.map((l) => l.line_number)
		},
		'Scan type detection failed; closest scan type did not fully match'
	);

	return {
		type: 'unknown',
		closest: {
			type: closest.type,
			matched: closest.matched,
			total: closest.total,
			failed_lines: sample,
			failed_count: closest.failed_lines.length
		}
	};
}
