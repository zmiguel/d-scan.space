import ShortUniqueId from 'short-unique-id';
import { error, redirect } from '@sveltejs/kit';
import { createNewLocalScan } from '$lib/server/local.js';
import { createNewDirectionalScan } from '$lib/server/directional.js';
import { createNewScan, updateScan } from '$lib/database/scans.js';
import { withSpan } from '$lib/server/tracer';
import logger from '$lib/logger';
import { scansProcessedCounter } from '$lib/server/metrics';
import { detectScanType } from '$lib/utils/scan_type.js';

/** @satisfies {import('./$types').Actions} */
export const actions = {
	create: async ({ request, event }) => {
		return await withSpan(
			'route.scan.create',
			async (span) => {
				const data = await request.formData();
				const content = /** @type {(string | null)} */ (data.get('scan_content'));
				const is_public = data.has('is_public');

				if (!content) {
					span.setAttributes({
						'scan.error': 'missing_content',
						'response.status': 400
					});
					logger.warn('Scan create rejected: no scan content provided');
					throw error(400, 'No scan content provided');
				}

				let lines = content.split('\n');
				// remove empty lines
				lines = lines.filter((line) => line.trim().length > 0);

				const scanTypeResult = await withSpan(
					'scan.detect_type',
					async (childSpan) => {
						childSpan.setAttributes({
							'scan.content_lines': lines.length
						});
						return detectScanType(lines);
					},
					{},
					{},
					event
				);

				if (scanTypeResult.type === 'unknown') {
					span.setAttributes({
						'scan.error': 'unknown_format',
						'response.status': 400
					});
					logger.warn('Scan create rejected: unrecognized scan format');
					throw error(400, 'Unrecognized scan format');
				}

				if (!scanTypeResult.supported) {
					span.setAttributes({
						'scan.error': 'unsupported_type',
						'scan.type': scanTypeResult.type,
						'response.status': 422
					});
					logger.warn(`Scan create rejected: unsupported scan type ${scanTypeResult.type}`);
					throw error(422, `Unsupported scan type: ${scanTypeResult.type}`);
				}

				const uid = new ShortUniqueId();
				const scanGroupId = uid.randomUUID(8);
				const scanId = uid.randomUUID(12);

				span.setAttributes({
					'scan.content_lines': lines.length,
					'scan.is_public': is_public,
					'scan.type': scanTypeResult.type,
					'scan.group_id': scanGroupId,
					'scan.id': scanId
				});

				let result;
				switch (scanTypeResult.type) {
					case 'local':
						result = await createNewLocalScan(lines);
						break;
					case 'directional':
						result = await createNewDirectionalScan(lines);
						break;
					default:
						span.setAttributes({
							'scan.error': 'unsupported_type',
							'scan.type': scanTypeResult.type,
							'response.status': 422
						});
						logger.warn(`Scan create rejected: unsupported scan type ${scanTypeResult.type}`);
						throw error(422, `Unsupported scan type: ${scanTypeResult.type}`);
				}

				switch (scanTypeResult.type) {
					case 'local': {
						const totalPilots = result?.total_pilots ?? 0;
						if (totalPilots === 0) {
							span.setAttributes({
								'scan.error': 'no_valid_characters',
								'scan.type': scanTypeResult.type,
								'response.status': 418
							});
							logger.warn('Scan create rejected: no valid characters found');
							throw error(418, 'No valid characters found in scan');
						}
						break;
					}
					case 'directional': {
						const onGrid = result?.on_grid?.total_objects ?? 0;
						const offGrid = result?.off_grid?.total_objects ?? 0;
						if (onGrid + offGrid === 0) {
							span.setAttributes({
								'scan.error': 'no_valid_objects',
								'scan.type': scanTypeResult.type,
								'response.status': 418
							});
							logger.warn('Scan create rejected: no valid objects found');
							throw error(418, 'No valid objects found in scan');
						}
						break;
					}
					default:
						break;
				}

				try {
					await withSpan(
						'route.scan.persist_new_scan',
						async () => {
							return await createNewScan({
								scanGroupId,
								scanId,
								is_public,
								type: scanTypeResult.type,
								data: result,
								raw_data: content
							});
						},
						{
							'scan.group_id': scanGroupId,
							'scan.id': scanId,
							'scan.type': scanTypeResult.type,
							'scan.data_lines': lines.length,
							'scan.is_public': is_public
						}
					);
				} catch (e) {
					span.setAttributes({
						'scan.error': 'persist_failed',
						'response.status': 500
					});
					logger.error('Failed to store scan data', e);
					throw error(500, 'Failed to store scan data');
				}

				logger.info(`Created new scan with ID: ${scanId} in group: ${scanGroupId}`);

				// Record metric for scan processed
				scansProcessedCounter.add(1, {
					type: scanTypeResult.type,
					public: is_public.toString()
				});

				return redirect(303, `/scan/${scanGroupId}/${scanId}`);
			},
			{},
			{},
			event
		);
	},

	update: async ({ request, event }) => {
		return await withSpan(
			'route.scan.update',
			async (span) => {
				const data = await request.formData();
				const content = /** @type {(string | null)} */ (data.get('scan_content'));

				if (!content) {
					span.setAttributes({
						'scan.error': 'missing_content',
						'response.status': 400
					});
					logger.warn('Scan update rejected: no scan content provided');
					throw error(400, 'No scan content provided');
				}

				let lines = content.split('\n');
				// remove empty lines
				lines = lines.filter((line) => line.trim().length > 0);

				const scanTypeResult = await withSpan(
					'scan.detect_type',
					async (childSpan) => {
						childSpan.setAttributes({
							'scan.content_lines': lines.length
						});
						return detectScanType(lines);
					},
					{},
					{},
					event
				);

				if (scanTypeResult.type === 'unknown') {
					span.setAttributes({
						'scan.error': 'unknown_format',
						'response.status': 400
					});
					logger.warn('Scan update rejected: unrecognized scan format');
					throw error(400, 'Unrecognized scan format');
				}

				if (!scanTypeResult.supported) {
					span.setAttributes({
						'scan.error': 'unsupported_type',
						'scan.type': scanTypeResult.type,
						'response.status': 422
					});
					logger.warn(`Scan update rejected: unsupported scan type ${scanTypeResult.type}`);
					throw error(422, `Unsupported scan type: ${scanTypeResult.type}`);
				}

				const uid = new ShortUniqueId();
				const scanGroupId = data.get('scan_group');
				const scanId = uid.randomUUID(12);

				span.setAttributes({
					'scan.content_lines': lines.length,
					'scan.type': scanTypeResult.type,
					'scan.group_id': scanGroupId,
					'scan.id': scanId
				});

				let result;
				switch (scanTypeResult.type) {
					case 'local':
						result = await createNewLocalScan(lines);
						break;
					case 'directional':
						result = await createNewDirectionalScan(lines);
						break;
					default:
						span.setAttributes({
							'scan.error': 'unsupported_type',
							'scan.type': scanTypeResult.type,
							'response.status': 422
						});
						logger.warn(`Scan update rejected: unsupported scan type ${scanTypeResult.type}`);
						throw error(422, `Unsupported scan type: ${scanTypeResult.type}`);
				}

				switch (scanTypeResult.type) {
					case 'local': {
						const totalPilots = result?.total_pilots ?? 0;
						if (totalPilots === 0) {
							span.setAttributes({
								'scan.error': 'no_valid_characters',
								'scan.type': scanTypeResult.type,
								'response.status': 418
							});
							logger.warn('Scan update rejected: no valid characters found');
							throw error(418, 'No valid characters found in scan');
						}
						break;
					}
					case 'directional': {
						const onGrid = result?.on_grid?.total_objects ?? 0;
						const offGrid = result?.off_grid?.total_objects ?? 0;
						if (onGrid + offGrid === 0) {
							span.setAttributes({
								'scan.error': 'no_valid_objects',
								'scan.type': scanTypeResult.type,
								'response.status': 418
							});
							logger.warn('Scan update rejected: no valid objects found');
							throw error(418, 'No valid objects found in scan');
						}
						break;
					}
					default:
						break;
				}

				try {
					await withSpan(
						'route.scan.persist_update_scan',
						async () => {
							return await updateScan({
								scanGroupId,
								scanId,
								type: scanTypeResult.type,
								data: result,
								raw_data: content
							});
						},
						{
							'scan.group_id': scanGroupId,
							'scan.id': scanId,
							'scan.type': scanTypeResult.type,
							'scan.data_lines': lines.length
						}
					);
				} catch (e) {
					span.setAttributes({
						'scan.error': 'persist_failed',
						'response.status': 500
					});
					logger.error('Failed to store scan data', e);
					throw error(500, 'Failed to store scan data');
				}

				logger.info(`Updated scan with ID: ${scanId} in group: ${scanGroupId}`);

				// Record metric for scan processed (update)
				scansProcessedCounter.add(1, {
					type: scanTypeResult.type,
					public: 'false' // Updates are always on existing scans
				});

				return redirect(303, `/scan/${scanGroupId}/${scanId}`);
			},
			{},
			{},
			event
		);
	}
};
