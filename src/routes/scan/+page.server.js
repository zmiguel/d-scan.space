import ShortUniqueId from 'short-unique-id';
import { redirect } from '@sveltejs/kit';
import { createNewLocalScan } from '$lib/server/local.js';
import { createNewScan, updateScan } from '$lib/database/scans.js';
import { withSpan } from '$lib/server/tracer';
import logger from '$lib/logger';

/** @satisfies {import('./$types').Actions} */
export const actions = {
	create: async ({ request, event }) => {
		return await withSpan(
			'Create Scan',
			async (span) => {
				const data = await request.formData();
				const content = /** @type {(string | null)} */ (data.get('scan_content'));
				const is_public = data.has('is_public');

				if (!content) {
					return { status: 400, body: 'No scan content provided' };
				}

				let lines = content.split('\n');
				// remove empty lines
				lines = lines.filter((line) => line.trim().length > 0);

				// Figure out if local or directional scan
				//  - Directional scans start with numbers and have 3 tabs per line
				const isDirectional = lines.every((line) => {
					const parts = line.split('\t');
					// @ts-ignore
					return parts.length === 4 && !isNaN(parts[0]);
				});

				const uid = new ShortUniqueId();
				const scanGroupId = uid.randomUUID(8);
				const scanId = uid.randomUUID(12);

				span.setAttributes({
					'scan.content_lines': lines.length,
					'scan.is_public': is_public,
					'scan.is_directional': isDirectional,
					'scan.group_id': scanGroupId,
					'scan.id': scanId
				});

				let result;
				// LOCAL SCAN
				if (!isDirectional) {
					result = await withSpan('Create Local Scan', async () => {
						return await createNewLocalScan(lines);
					});
				} else {
					// DIRECTIONAL SCAN
					//
					// TBD.
				}

				try {
					await withSpan(
						'Create Scan',
						async () => {
							return await createNewScan({
								scanGroupId,
								scanId,
								is_public,
								type: isDirectional ? 'directional' : 'local',
								data: result,
								raw_data: content
							});
						},
						{
							'scan.group_id': scanGroupId,
							'scan.id': scanId,
							'scan.type': isDirectional ? 'directional' : 'local',
							'scan.data_lines': lines.length,
							'scan.is_public': is_public
						}
					);
				} catch (e) {
					logger.error('Failed to store scan data', e);
					return { status: 500, body: 'Failed to store scan data' };
				}

				logger.info(`Created new scan with ID: ${scanId} in group: ${scanGroupId}`);
				return redirect(303, `/scan/${scanGroupId}/${scanId}`);
			},
			{},
			{},
			event
		);
	},

	update: async ({ request, event }) => {
		return await withSpan(
			'Update Scan',
			async (span) => {
				const data = await request.formData();
				const content = /** @type {(string | null)} */ (data.get('scan_content'));

				if (!content) {
					return { status: 400, body: 'No scan content provided' };
				}

				let lines = content.split('\n');
				// remove empty lines
				lines = lines.filter((line) => line.trim().length > 0);

				// Figure out if local or directional scan
				//  - Directional scans start with numbers and have 3 tabs per line
				const isDirectional = lines.every((line) => {
					const parts = line.split('\t');
					// @ts-ignore
					return parts.length === 4 && !isNaN(parts[0]);
				});

				const uid = new ShortUniqueId();
				const scanGroupId = data.get('scan_group');
				const scanId = uid.randomUUID(12);

				span.setAttributes({
					'scan.content_lines': lines.length,
					'scan.type': isDirectional ? 'directional' : 'local',
					'scan.group_id': scanGroupId,
					'scan.id': scanId
				});

				let result;
				// LOCAL SCAN
				if (!isDirectional) {
					result = await withSpan(
						'Create Local Scan',
						async () => {
							return await createNewLocalScan(lines);
						},
						{
							'scan.group_id': scanGroupId,
							'scan.id': scanId,
							'scan.type': 'local',
							'scan.data_lines': lines.length
						}
					);
				} else {
					// DIRECTIONAL SCAN
					//
					// TBD.
				}

				try {
					await withSpan(
						'Update Scan',
						async () => {
							return await updateScan({
								scanGroupId,
								scanId,
								type: isDirectional ? 'directional' : 'local',
								data: result,
								raw_data: content
							});
						},
						{
							'scan.group_id': scanGroupId,
							'scan.id': scanId,
							'scan.type': isDirectional ? 'directional' : 'local',
							'scan.data_lines': lines.length
						}
					);
				} catch (e) {
					logger.error('Failed to store scan data', e);
					return { status: 500, body: 'Failed to store scan data' };
				}

				logger.info(`Updated scan with ID: ${scanId} in group: ${scanGroupId}`);
				return redirect(303, `/scan/${scanGroupId}/${scanId}`);
			},
			{},
			{},
			event
		);
	}
};
