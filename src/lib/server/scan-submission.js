/**
 * Shared processing of a pasted scan for the create and update actions
 * (src/routes/scan/+page.server.js): normalize → limit → detect → build.
 *
 * Problems with the paste itself are returned as `{ ok: false, ... }` so the actions can
 * answer with `fail()` and the form keeps the pasted text and shows what is wrong
 * (including the first offending lines). Unexpected errors still throw.
 */
import { createNewLocalScan } from './local.js';
import { createNewDirectionalScan } from './directional.js';
import { withSpan } from './tracer.js';
import logger from '../logger.js';
import { LOCAL_SCAN_MAX_LINES } from './constants.js';
import { detectScanType, normalizeScanLines } from '../utils/scan_type.js';

/** adapter-node's BODY_SIZE_LIMIT syntax: bytes or a K/M/G suffix; 512K when unset. */
function bodySizeLimitBytes() {
	const raw = (process.env.BODY_SIZE_LIMIT ?? '512K').trim();
	const match = /^(\d+)([KMG]?)$/i.exec(raw);
	if (!match) return Infinity;
	const multiplier = { '': 1, K: 1024, M: 1024 ** 2, G: 1024 ** 3 }[match[2].toUpperCase()];
	return Number(match[1]) * multiplier;
}

function isPayloadTooLarge(err, request) {
	for (let e = err; e; e = e.cause) {
		if (e.status === 413) return true;
	}
	const length = Number(request.headers.get('content-length'));
	return Number.isFinite(length) && length > bodySizeLimitBytes();
}

/**
 * Reads the scan form. A body over adapter-node's BODY_SIZE_LIMIT surfaces from
 * `formData()` as a generic parse error (a 500); turn it into a rejection the form can
 * show instead. Other errors propagate.
 * @param {Request} request
 * @returns {Promise<{ ok: true, data: FormData } | ScanRejection>}
 */
export async function readScanForm(request) {
	try {
		return { ok: true, data: await request.formData() };
	} catch (err) {
		if (!isPayloadTooLarge(err, request)) throw err;
		return reject(
			413,
			'payload_too_large',
			`This scan is too large to upload (limit ${process.env.BODY_SIZE_LIMIT ?? '512K'}). Split it into smaller pastes, or ask the site admin to raise BODY_SIZE_LIMIT.`
		);
	}
}

/**
 * @typedef {{ ok: false, status: number, reason: string, message: string,
 *   failedLines?: Array<{ line_number: number, line: string }>, failedLineCount?: number }} ScanRejection
 * @typedef {{ ok: true, type: 'local' | 'directional', result: any, lineCount: number }} ScanBuilt
 */

/** @returns {ScanRejection} */
function reject(status, reason, message, extra = {}) {
	return { ok: false, status, reason, message, ...extra };
}

/**
 * @param {unknown} content raw `scan_content` form value
 * @param {import('@opentelemetry/api').Span} span span of the calling action
 * @param {any} [event] SvelteKit RequestEvent, to attach child spans to the request
 * @returns {Promise<ScanBuilt | ScanRejection>}
 */
export async function buildScanFromSubmission(content, span, event) {
	if (typeof content !== 'string' || content.trim() === '') {
		return reject(400, 'missing_content', 'No scan content provided.');
	}

	const lines = normalizeScanLines(content);
	span.setAttributes({ 'scan.content_lines': lines.length });

	if (lines.length === 0) {
		return reject(400, 'missing_content', 'No scan content provided.');
	}

	const detection = await withSpan(
		'scan.detect_type',
		async (childSpan) => {
			childSpan.setAttributes({ 'scan.content_lines': lines.length });
			return detectScanType(lines);
		},
		{},
		{},
		event
	);

	if (detection.type === 'unknown') {
		const closest = detection.closest;
		return reject(
			400,
			'unknown_format',
			closest
				? `Unrecognized scan format: ${closest.failed_count} of ${closest.total} lines do not look like a ${closest.type} scan. Paste the whole Local member list or D-Scan result, nothing else.`
				: 'Unrecognized scan format.',
			closest ? { failedLines: closest.failed_lines, failedLineCount: closest.failed_count } : {}
		);
	}

	if (!detection.supported || (detection.type !== 'local' && detection.type !== 'directional')) {
		return reject(422, 'unsupported_type', `Unsupported scan type: ${detection.type}.`);
	}

	const type = /** @type {'local' | 'directional'} */ (detection.type);
	span.setAttributes({ 'scan.type': type });

	// Only local scans are capped: every name may need ESI lookups. D-scans only look up
	// their (few) distinct type ids, so big fights with many drones/fighters are fine;
	// their size is bounded by BODY_SIZE_LIMIT alone.
	if (type === 'local' && lines.length > LOCAL_SCAN_MAX_LINES) {
		return reject(
			413,
			'too_many_lines',
			`Local scan has ${lines.length.toLocaleString('en-US')} names; the maximum is ${LOCAL_SCAN_MAX_LINES.toLocaleString('en-US')}.`
		);
	}

	const result =
		type === 'local' ? await createNewLocalScan(lines) : await createNewDirectionalScan(lines);

	if (type === 'local' && (result?.total_pilots ?? 0) === 0) {
		return reject(
			418,
			'no_valid_characters',
			"I'm a teapot, but so are you! The scan was well formatted, but none of the names could be found. Are you sure you copied the right thing?"
		);
	}

	if (
		type === 'directional' &&
		(result?.on_grid?.total_objects ?? 0) + (result?.off_grid?.total_objects ?? 0) === 0
	) {
		return reject(
			418,
			'no_valid_objects',
			"I'm a teapot, but so are you! The scan was well formatted, but it contains no known objects. Are you sure you copied the right thing?"
		);
	}

	return { ok: true, type, result, lineCount: lines.length };
}

/**
 * Records a rejection on the span/log and builds the `fail()` payload for the form.
 * @param {ScanRejection} rejection
 * @param {import('@opentelemetry/api').Span} span
 * @param {string} action 'create' | 'update'
 */
export function rejectionPayload(rejection, span, action) {
	span.setAttributes({
		'scan.error': rejection.reason,
		'response.status': rejection.status,
		'scan.error.message': rejection.message,
		// Traces keep the offending lines for debugging; logs never contain pasted text.
		...(rejection.failedLines?.length && {
			'scan.error.failed_lines': JSON.stringify(rejection.failedLines),
			'scan.error.failed_line_count': rejection.failedLineCount ?? rejection.failedLines.length
		})
	});
	logger.warn({ reason: rejection.reason, status: rejection.status }, `Scan ${action} rejected`);
	return {
		message: rejection.message,
		failedLines: rejection.failedLines ?? [],
		failedLineCount: rejection.failedLineCount ?? 0
	};
}
