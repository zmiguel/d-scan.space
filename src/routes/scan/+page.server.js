import { newScanGroupId, newScanId } from '$lib/server/ids.js';
import { error, fail, redirect } from '@sveltejs/kit';
import { createNewScan, getScanGroupByID, updateScan } from '$lib/database/scans.js';
import { withSpan } from '$lib/server/tracer';
import logger from '$lib/logger';
import { scansProcessedCounter } from '$lib/server/metrics';
import {
	buildScanFromSubmission,
	readScanForm,
	rejectionPayload
} from '$lib/server/scan-submission.js';

/**
 * Paste problems (empty, too large, unrecognized format, nothing resolvable) are
 * returned with `fail()` so the form keeps the text and shows the reason and the first
 * offending lines. Programming/authorization errors still use `error()`.
 *
 * @satisfies {import('./$types').Actions}
 */
export const actions = {
	create: async (event) => {
		const { request, locals } = event;
		return await withSpan(
			'route.scan.create',
			async (span) => {
				const session = await locals.auth();
				const createdBy = session?.user?.id ?? null;
				const primaryCharacterName = session?.eve?.characterName ?? session?.user?.name ?? null;

				const form = await readScanForm(request);
				if (!form.ok) {
					return fail(form.status, rejectionPayload(form, span, 'create'));
				}
				const data = form.data;
				const content = data.get('scan_content');
				const is_public = data.has('is_public');

				const built = await buildScanFromSubmission(content, span, event);
				if (!built.ok) {
					return fail(built.status, rejectionPayload(built, span, 'create'));
				}

				const scanGroupId = newScanGroupId();
				const scanId = newScanId();

				span.setAttributes({
					'scan.is_public': is_public,
					'scan.group_id': scanGroupId,
					'scan.id': scanId,
					'user.id': createdBy ?? 'anonymous',
					'user.primary_character_name': primaryCharacterName ?? 'anonymous'
				});

				try {
					await withSpan(
						'route.scan.persist_new_scan',
						async () =>
							createNewScan({
								scanGroupId,
								scanId,
								is_public,
								type: built.type,
								data: built.result,
								raw_data: content,
								created_by: createdBy,
								primary_character_name: primaryCharacterName
							}),
						{
							'scan.group_id': scanGroupId,
							'scan.id': scanId,
							'scan.type': built.type,
							'scan.data_lines': built.lineCount,
							'scan.is_public': is_public
						}
					);
				} catch (err) {
					span.setAttributes({ 'scan.error': 'persist_failed', 'response.status': 500 });
					logger.error({ err }, 'Failed to store scan data');
					throw error(500, 'Failed to store scan data');
				}

				logger.info(`Created new scan with ID: ${scanId} in group: ${scanGroupId}`);
				scansProcessedCounter.add(1, { type: built.type, public: is_public.toString() });

				return redirect(303, `/scan/${scanGroupId}/${scanId}`);
			},
			{},
			{},
			event
		);
	},

	update: async (event) => {
		const { request, locals } = event;
		return await withSpan(
			'route.scan.update',
			async (span) => {
				const session = await locals.auth();
				const createdBy = session?.user?.id ?? null;
				const primaryCharacterName = session?.eve?.characterName ?? session?.user?.name ?? null;

				const form = await readScanForm(request);
				if (!form.ok) {
					return fail(form.status, rejectionPayload(form, span, 'update'));
				}
				const data = form.data;
				const content = data.get('scan_content');
				const originalScanGroupId = data.get('scan_group');

				if (typeof originalScanGroupId !== 'string' || !originalScanGroupId) {
					span.setAttributes({ 'scan.error': 'missing_group', 'response.status': 400 });
					logger.warn('Scan update rejected: no scan group provided');
					throw error(400, 'No scan group provided');
				}

				// Validate the target group before any ESI/SDE work.
				const existingGroup = await getScanGroupByID(originalScanGroupId);
				if (!existingGroup) {
					span.setAttributes({ 'scan.error': 'group_not_found', 'response.status': 404 });
					logger.warn('Scan update rejected: scan group not found');
					throw error(404, 'Scan group not found');
				}

				// Groups created while logged out (created_by NULL) are collaborative by
				// design: anyone with the link may append scans. Owned groups only accept
				// scans from their owner.
				if (existingGroup.created_by && existingGroup.created_by !== createdBy) {
					span.setAttributes({ 'scan.error': 'forbidden', 'response.status': 403 });
					logger.warn('Scan update rejected: user does not own this scan group');
					throw error(403, 'Forbidden');
				}

				const built = await buildScanFromSubmission(content, span, event);
				if (!built.ok) {
					return fail(built.status, rejectionPayload(built, span, 'update'));
				}

				const scanId = newScanId();
				let targetScanGroupId = originalScanGroupId;

				span.setAttributes({
					'scan.group_id': originalScanGroupId,
					'scan.id': scanId,
					'user.id': createdBy ?? 'anonymous',
					'user.primary_character_name': primaryCharacterName ?? 'anonymous'
				});

				// A d-scan from a different system than the group's starts a new group.
				let createAsNewGroup = false;
				if (built.type === 'directional') {
					const existingSystem = existingGroup.system ?? null;
					const directionalSystem = built.result?.system ?? null;

					if (
						existingSystem &&
						directionalSystem &&
						!systemsMatch(existingSystem, directionalSystem)
					) {
						createAsNewGroup = true;
						targetScanGroupId = newScanGroupId();
						span.setAttributes({
							'scan.group_id.original': originalScanGroupId,
							'scan.group_id.target': targetScanGroupId,
							'scan.system.mismatch': true,
							'scan.system.existing': existingSystem?.name ?? 'unknown',
							'scan.system.inferred': directionalSystem?.name ?? 'unknown'
						});
					}
				}

				const persisted = {
					scanGroupId: targetScanGroupId,
					scanId,
					type: built.type,
					data: built.result,
					raw_data: content,
					created_by: createdBy,
					primary_character_name: primaryCharacterName
				};
				const persistAttributes = {
					'scan.group_id': targetScanGroupId,
					'scan.id': scanId,
					'scan.type': built.type,
					'scan.data_lines': built.lineCount
				};

				try {
					if (createAsNewGroup) {
						await withSpan(
							'route.scan.persist_new_from_update_scan',
							async () => createNewScan({ ...persisted, is_public: false }),
							persistAttributes
						);
					} else {
						await withSpan(
							'route.scan.persist_update_scan',
							async () => updateScan(persisted),
							persistAttributes
						);
					}
				} catch (err) {
					span.setAttributes({ 'scan.error': 'persist_failed', 'response.status': 500 });
					logger.error({ err }, 'Failed to store scan data');
					throw error(500, 'Failed to store scan data');
				}

				logger.info(`Updated scan with ID: ${scanId} in group: ${targetScanGroupId}`);
				scansProcessedCounter.add(1, { type: built.type, public: 'false' });

				return redirect(303, `/scan/${targetScanGroupId}/${scanId}`);
			},
			{},
			{},
			event
		);
	}
};

/** Positive integer system id, or null (null/undefined/'' must not become 0). */
function systemId(system) {
	const id = Number(system?.id ?? NaN);
	return Number.isInteger(id) && id > 0 ? id : null;
}

function systemsMatch(existingSystem, inferredSystem) {
	const existingId = systemId(existingSystem);
	const inferredId = systemId(inferredSystem);

	if (existingId !== null && inferredId !== null) {
		return existingId === inferredId;
	}

	const existingName = String(existingSystem?.name ?? '')
		.trim()
		.toLowerCase();
	const inferredName = String(inferredSystem?.name ?? '')
		.trim()
		.toLowerCase();

	if (!existingName || !inferredName) {
		return false;
	}

	return existingName === inferredName;
}
