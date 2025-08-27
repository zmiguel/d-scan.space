import { withSpan } from '$lib/server/tracer';
import logger from '$lib/logger';
import { getLastChecksums, addSDEDataEntry } from '$lib/database/sde_data';
import {
	SDE_FSD_CHECKSUM,
	SDE_BSD_CHECKSUM,
	SDE_UNIVERSE_CHECKSUM,
	SDE_FSD
} from '$lib/server/constants';
import fs from 'fs';
import path from 'path';
import AdmZip from 'adm-zip';
import yaml from 'js-yaml';
import { addOrUpdateCorporationsDB } from '$lib/database/corporations';

export async function updateStaticData() {
	logger.info('[SDEUpdater] Updating static data...');
	await withSpan('CRON Static', async () => {
		// Get SDE checksums and compare them to the last entry in DB
		const [results, checksums] = await withSpan('SDE Checksum Check', async () => {
			const dbChecksums = await getLastChecksums();
			const onlineChecksums = await getOnlineChecksums();
			if (
				dbChecksums.fsd_checksum === onlineChecksums.fsd &&
				dbChecksums.bsd_checksum === onlineChecksums.bsd &&
				dbChecksums.universe_checksum === onlineChecksums.universe
			) {
				logger.info('[SDEUpdater] Static data is up to date, no update needed.');
				return { results: 0, onlineChecksums };
			}
			logger.info('[SDEUpdater] Static data is out of date, update needed.');
			return { results: 1, onlineChecksums };
		});

		// no update needed
		if (results === 0) {
			return;
		}

		// update needed

		// FSD SDE Update
		const fsd_status = await withSpan('FSD Update', async () => {
			// Download and extract the need files from FSD
			// Needed file are:
			// - npcCorporations.yaml
			logger.info('[SDEUpdater] Downloading and extracting FSD SDE...');
			await downloadAndExtractSDE(SDE_FSD, ['npcCorporations.yaml']);

			// 1. Update NPC Corps
			logger.info('[SDEUpdater] Updating NPC Corporations...');
			await updateNPCCorps();

			return 0;
		});
		await cleanupTemp();

		if (fsd_status !== 0) {
			logger.error('[SDEUpdater] FSD Update succeeded.');
			addSDEDataEntry(checksums);
		}
	});

	logger.info('[SDEUpdater] Static data update completed.');
	return true;
}

async function getOnlineChecksums() {
	return await withSpan('Get Online Checksums', async (span) => {
		// fetch the checksums from the SDE Links
		const fsdChecksumRes = await fetch(SDE_FSD_CHECKSUM);
		const fsdChecksum = (await fsdChecksumRes.text()).trim();

		const bsdChecksumRes = await fetch(SDE_BSD_CHECKSUM);
		const bsdChecksum = (await bsdChecksumRes.text()).trim();

		const universeChecksumRes = await fetch(SDE_UNIVERSE_CHECKSUM);
		const universeChecksum = (await universeChecksumRes.text()).trim();

		span.setAttributes({
			'sde.checksum.fsd': fsdChecksum,
			'sde.checksum.bsd': bsdChecksum,
			'sde.checksum.universe': universeChecksum
		});

		return {
			fsd: fsdChecksum,
			bsd: bsdChecksum,
			universe: universeChecksum
		};
	});
}

async function downloadAndExtractSDE(url, files = []) {
	await withSpan('Download and Extract SDE', async (span) => {
		const tempDir = './temp';
		const zipPath = path.join(tempDir, 'sde_download.zip');

		try {
			// Create temp directory if it doesn't exist
			if (!fs.existsSync(tempDir)) {
				fs.mkdirSync(tempDir, { recursive: true });
			}

			// Download the zip file
			span.addEvent('Downloading SDE zip file');
			const response = await fetch(url);
			if (!response.ok) {
				span.setStatus({ code: 2, message: `Failed to download SDE: HTTP ${response.status}` });
				throw new Error(`Failed to download SDE: HTTP ${response.status} ${response.statusText}`);
			}

			// Get response as array buffer and write to file
			const arrayBuffer = await response.arrayBuffer();
			const buffer = Buffer.from(arrayBuffer);
			fs.writeFileSync(zipPath, buffer);

			span.addEvent('SDE zip file downloaded', { size: buffer.length });

			// Extract the zip file
			span.addEvent('Extracting zip file');
			const zip = new AdmZip(zipPath);
			const zipEntries = zip.getEntries();

			if (files.length === 0) {
				// Extract all files if no specific files requested
				zip.extractAllTo(tempDir, true);
				span.addEvent('Extracted all files', { totalFiles: zipEntries.length });
			} else {
				// Extract only specified files
				let extractedCount = 0;
				for (const fileName of files) {
					const entry = zipEntries.find(
						(e) => e.entryName === fileName || e.entryName.endsWith(`/${fileName}`)
					);
					if (entry) {
						zip.extractEntryTo(entry, tempDir, false, true);
						extractedCount++;
						span.addEvent('File extracted', { fileName: fileName });
					} else {
						span.setStatus({ code: 2, message: `Missing file in zip: ${fileName}` });
						throw new Error(`Missing file in zip: ${fileName}`);
					}
				}

				// Verify that all requested files were extracted
				for (const fileName of files) {
					const extractedPath = path.join(tempDir, fileName);
					if (!fs.existsSync(extractedPath)) {
						span.setStatus({ code: 2, message: `Failed to extract file: ${fileName}` });
						throw new Error(`Failed to extract file: ${fileName}`);
					}
				}

				span.addEvent('Extraction completed', {
					requestedFiles: files.length,
					extractedFiles: extractedCount
				});
			}
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			span.setStatus({ code: 2, message: errorMessage });
			throw error;
		} finally {
			// Always clean up the zip file
			if (fs.existsSync(zipPath)) {
				fs.unlinkSync(zipPath);
				span.addEvent('Zip file deleted');
			}
		}

		span.setStatus({ code: 0, message: 'SDE extraction completed successfully' });
	});
}

async function updateNPCCorps() {
	await withSpan('Update NPC Corps', async (span) => {
		try {
			const yamlFilePath = path.join('./temp', 'npcCorporations.yaml');

			// Check if the file exists
			if (!fs.existsSync(yamlFilePath)) {
				span.setStatus({ code: 2, message: 'npcCorporations.yaml file not found' });
				throw new Error('npcCorporations.yaml file not found in temp directory');
			}

			span.addEvent('Reading npcCorporations.yaml file');

			// Read and parse the YAML file
			const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
			const npcCorps = yaml.load(yamlContent);

			if (!npcCorps || typeof npcCorps !== 'object') {
				span.setStatus({ code: 2, message: 'Invalid YAML format in npcCorporations.yaml' });
				throw new Error('Invalid YAML format in npcCorporations.yaml');
			}

			span.addEvent('Parsing NPC corporations data');

			// Transform the data to match our database schema
			const corporationsData = [];

			for (const [corpId, corpData] of Object.entries(npcCorps)) {
				// Skip if corporation is deleted
				if (corpData.deleted === true) {
					continue;
				}

				// Extract the required fields
				const id = parseInt(corpId, 10);
				const name = corpData.nameID?.en;
				const ticker = corpData.tickerName;

				// Validate required fields
				if (!name || !ticker) {
					span.addEvent('Skipping corporation with missing data', {
						corpId,
						hasName: !!name,
						hasTicker: !!ticker
					});
					continue;
				}

				corporationsData.push({
					id,
					name,
					ticker,
					alliance_id: null, // NPC corps don't have alliances
					npc: true // Mark as NPC corporation
				});
			}

			span.setAttributes({
				'npc_corps.total_in_file': Object.keys(npcCorps).length,
				'npc_corps.valid_corps': corporationsData.length
			});

			span.addEvent('Updating NPC corporations in database', {
				corporationsCount: corporationsData.length
			});

			// Update the database with NPC corporations
			await addOrUpdateCorporationsDB(corporationsData);

			span.addEvent('NPC corporations updated successfully', {
				updatedCount: corporationsData.length
			});

			span.setStatus({ code: 0, message: 'NPC corporations updated successfully' });
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error('Error updating NPC corporations', { error: errorMessage });
			span.setStatus({ code: 2, message: errorMessage });
			throw error;
		}
	});
}

async function cleanupTemp() {
	// cleans up the ./temp directory after tasks are done
	const tempDir = './temp';
	if (fs.existsSync(tempDir)) {
		fs.rmSync(tempDir, { recursive: true, force: true });
		logger.info('Temporary files cleaned up');
	}
}
