import { withSpan } from '$lib/server/tracer';
import logger from '$lib/logger';
import {
	getLastInstalledSDEVersion,
	addSDEDataEntry,
	addOrUpdateSystemsDB
} from '$lib/database/sde';
import { SDE_FILE, SDE_VERSION } from '$lib/server/constants';
import fs from 'fs';
import path from 'path';
import { extractZipNonBlocking } from '$lib/workers/extract-worker.js';
import { addOrUpdateCorporationsDB } from '$lib/database/corporations';
import { fetchGET } from '$lib/server/wrappers';

export async function updateStaticData() {
	logger.info('[SDEUpdater] Updating static data...');
	await withSpan('CRON Static', async () => {
		// Get SDE version and compare it to the last entry in DB
		const [updated, version] = await withSpan('SDE Version Check', async (span) => {
			const lastInstalledVersion = await getLastInstalledSDEVersion();
			const latestOnlineVersion = await getOnlineVersion();

			span.setAttributes({
				'sde.installed': JSON.stringify(lastInstalledVersion),
				'sde.online': JSON.stringify(latestOnlineVersion)
			});

			// If no previous version exists, force an update
			if (!lastInstalledVersion) {
				logger.info('[SDEUpdater] No previous SDE data found, update needed.');
				return [false, latestOnlineVersion];
			}

			if (lastInstalledVersion.release_version === latestOnlineVersion.release_version) {
				logger.info('[SDEUpdater] Static data is up to date, no update needed.');
				return [true, latestOnlineVersion];
			}
			logger.info('[SDEUpdater] Static data is out of date, update needed.');
			return [false, latestOnlineVersion];
		});

		// no update needed
		if (updated) {
			return;
		}

		// update needed

		// extract only the files we need to save memory and time
		const filesToExtract = [
			// we need this to update NPC corps
			'npcCorporations.jsonl',
			// and these to update the universe
			'mapRegions.jsonl',
			'mapConstellations.jsonl',
			'mapSolarSystems.jsonl'
			// more...
		];

		logger.info('[SDEUpdater] Downloading and extracting SDE files...');

		await downloadAndExtractSDE(SDE_FILE, filesToExtract);

		// update NPC corps
		logger.info('[SDEUpdater] Updating NPC corporations...');
		const npcUpdateSuccess = await updateNPCCorps();
		logger.info(
			'[SDEUpdater] NPC corporations update ' + (npcUpdateSuccess ? 'succeeded' : 'failed')
		);

		// update the universe
		logger.info('[SDEUpdater] Updating universe data...');
		const universeUpdateSuccess = await updateUniverse();
		logger.info(
			'[SDEUpdater] Universe data update ' + (universeUpdateSuccess ? 'succeeded' : 'failed')
		);

		// save the SDE data entry
		const final_result = npcUpdateSuccess && universeUpdateSuccess;
		logger.info(
			'[SDEUpdater] Recording new SDE version in database... ' +
				(final_result ? 'success' : 'failure')
		);
		await addSDEDataEntry({
			release_date: version.release_date,
			release_version: version.release_version,
			success: final_result
		});

		// Update done
		// clean up files
		logger.info('[SDEUpdater] Cleaning up temporary files...');
		await cleanupTemp();
	});

	logger.info('[SDEUpdater] Static data update completed.');
	return true;
}

async function getOnlineVersion() {
	return await withSpan('Get Online Version', async (span) => {
		try {
			// fetch the version data from the SDE Links
			const response = await fetchGET(SDE_VERSION);

			if (!response.ok) {
				throw new Error(`Failed to fetch SDE version: HTTP ${response.status}`);
			}

			// Get the JSONL content
			const jsonlContent = await response.text();

			// Parse the JSONL (assuming single line for SDE data)
			const lines = jsonlContent.trim().split('\n');
			const sdeData = JSON.parse(lines[0]); // Get first line

			// Extract version information
			const buildNumber = sdeData.buildNumber;
			const releaseDate = sdeData.releaseDate;

			span.setAttributes({
				'sde.build_number': buildNumber,
				'sde.release_date': releaseDate
			});

			return {
				release_version: buildNumber,
				release_date: releaseDate
			};
		} catch (error) {
			span.setStatus({ code: 2, message: `Failed to get online version: ${error.message}` });
			throw error;
		}
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

			// Download the zip file using streaming to avoid blocking
			span.addEvent('Downloading SDE zip file');
			const response = await fetchGET(url);
			if (!response.ok) {
				span.setStatus({ code: 2, message: `Failed to download SDE: HTTP ${response.status}` });
				throw new Error(`Failed to download SDE: HTTP ${response.status} ${response.statusText}`);
			}

			// Stream the download to avoid blocking the event loop
			const fileStream = fs.createWriteStream(zipPath);
			const reader = response.body.getReader();
			let downloadedBytes = 0;
			const contentLength = parseInt(response.headers.get('content-length') || '0', 10);

			try {
				while (true) {
					const { done, value } = await reader.read();
					if (done) break;

					fileStream.write(value);
					downloadedBytes += value.length;

					// Yield control periodically during download (every ~1MB)
					if (downloadedBytes % (1024 * 1024) === 0) {
						await new Promise((resolve) => setImmediate(resolve));
						span.addEvent('Download progress', {
							downloadedBytes,
							totalBytes: contentLength,
							progress: contentLength > 0 ? Math.round((downloadedBytes / contentLength) * 100) : 0
						});
					}
				}
			} finally {
				reader.releaseLock();
				fileStream.end();
			}

			// Wait for the file to be fully written
			await new Promise((resolve, reject) => {
				fileStream.on('finish', resolve);
				fileStream.on('error', reject);
			});

			span.addEvent('SDE zip file downloaded', { size: downloadedBytes });

			// Extract the zip file using non-blocking extraction with fallback
			span.addEvent('Extracting zip file');
			const extractionResult = await extractZipNonBlocking(zipPath, tempDir, files);
			span.addEvent('Extraction completed', {
				...extractionResult,
				message: `Extracted ${extractionResult.extractedFiles} files using ${extractionResult.method}`
			});
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

async function cleanupTemp() {
	// cleans up the ./temp directory after tasks are done
	const tempDir = './temp';
	if (fs.existsSync(tempDir)) {
		fs.rmSync(tempDir, { recursive: true, force: true });
		logger.info('Temporary files cleaned up');
	}
}

async function updateNPCCorps() {
	return await withSpan('Update NPC Corps', async (span) => {
		try {
			const jsonlFilePath = path.join('./temp', 'npcCorporations.jsonl');

			span.addEvent('Reading npcCorporations.jsonl file');

			// Check if the file exists
			if (!fs.existsSync(jsonlFilePath)) {
				span.setStatus({ code: 2, message: 'npcCorporations.jsonl file not found' });
				throw new Error('npcCorporations.jsonl file not found in temp directory');
			}

			span.addEvent('Parsing NPC corporations data');

			// Helper function to read JSONL file asynchronously without blocking
			const readJSONLAsync = async (filePath) => {
				return new Promise((resolve, reject) => {
					const lines = [];
					const stream = fs.createReadStream(filePath, {
						encoding: 'utf8',
						highWaterMark: 64 * 1024
					});
					let buffer = '';

					stream.on('data', (chunk) => {
						buffer += chunk;
						const newlineIndex = buffer.lastIndexOf('\n');
						if (newlineIndex !== -1) {
							const completeLines = buffer.substring(0, newlineIndex);
							buffer = buffer.substring(newlineIndex + 1);
							lines.push(...completeLines.split('\n'));
						}
					});

					stream.on('end', () => {
						if (buffer.trim()) {
							lines.push(buffer);
						}
						resolve(lines);
					});

					stream.on('error', reject);
				});
			};

			// Read and parse the JSONL file
			const lines = await readJSONLAsync(jsonlFilePath);

			// Transform the data to match our database schema
			const corporationsData = [];
			let totalCorps = 0;
			let skippedCorps = 0;

			for (const line of lines) {
				if (!line.trim()) continue; // Skip empty lines

				totalCorps++;
				const corpData = JSON.parse(line);

				// Skip if corporation is deleted
				if (corpData.deleted === true) {
					skippedCorps++;
					continue;
				}

				// Extract the required fields
				const id = corpData._key;
				const name = corpData.name?.en;
				const ticker = corpData.tickerName;

				// Validate required fields
				if (!name || !ticker) {
					logger.warn(`Skipping NPC corporation ${id} due to missing name or ticker`);
					span.addEvent('Skipping corporation with missing data', {
						corpId: id,
						hasName: !!name,
						hasTicker: !!ticker
					});
					skippedCorps++;
					continue;
				}

				corporationsData.push({
					id,
					name,
					ticker,
					alliance_id: null, // NPC corps don't have alliances
					npc: true // Mark as NPC corporation
				});

				// Yield control every 50 corporations to prevent blocking the event loop
				if (totalCorps % 50 === 0) {
					await new Promise((resolve) => setImmediate(resolve));
				}
			}

			span.setAttributes({
				'npc_corps.total_in_file': totalCorps,
				'npc_corps.skipped': skippedCorps,
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
			return true;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Error updating NPC corporations: ${errorMessage}`);
			span.setStatus({ code: 2, message: errorMessage });
			return false;
		}
	});
}

async function updateUniverse() {
	return await withSpan('Update Universe', async (span) => {
		try {
			const tempDir = './temp';
			const systemsData = [];

			span.addEvent('Starting universe data processing');

			// Helper function to read JSONL file asynchronously without blocking
			const readJSONLAsync = async (filePath) => {
				return new Promise((resolve, reject) => {
					const lines = [];
					const stream = fs.createReadStream(filePath, {
						encoding: 'utf8',
						highWaterMark: 64 * 1024
					});
					let buffer = '';

					stream.on('data', (chunk) => {
						buffer += chunk;
						const newlineIndex = buffer.lastIndexOf('\n');
						if (newlineIndex !== -1) {
							const completeLines = buffer.substring(0, newlineIndex);
							buffer = buffer.substring(newlineIndex + 1);
							lines.push(...completeLines.split('\n'));
						}
					});

					stream.on('end', () => {
						if (buffer.trim()) {
							lines.push(buffer);
						}
						resolve(lines);
					});

					stream.on('error', reject);
				});
			};

			// Load regions from mapRegions.jsonl
			const regionsPath = path.join(tempDir, 'mapRegions.jsonl');
			const regionMap = new Map(); // regionID -> region name

			if (!fs.existsSync(regionsPath)) {
				span.setStatus({ code: 2, message: 'mapRegions.jsonl file not found' });
				throw new Error('mapRegions.jsonl file not found in temp directory');
			}

			span.addEvent('Reading mapRegions.jsonl file');
			const regionLines = await readJSONLAsync(regionsPath);

			let regionCount = 0;
			for (const line of regionLines) {
				if (!line.trim()) continue;
				const regionData = JSON.parse(line);
				const regionId = regionData._key;
				const regionName = regionData.name?.en;

				if (regionId && regionName) {
					regionMap.set(regionId, regionName);
					regionCount++;
				}

				// Yield control every 10 regions
				if (regionCount % 10 === 0) {
					await new Promise((resolve) => setImmediate(resolve));
				}
			}

			span.addEvent('Loaded regions', { totalRegions: regionMap.size });

			// Load constellations from mapConstellations.jsonl
			const constellationsPath = path.join(tempDir, 'mapConstellations.jsonl');
			const constellationMap = new Map(); // constellationID -> constellation name

			if (!fs.existsSync(constellationsPath)) {
				span.setStatus({ code: 2, message: 'mapConstellations.jsonl file not found' });
				throw new Error('mapConstellations.jsonl file not found in temp directory');
			}

			span.addEvent('Reading mapConstellations.jsonl file');
			const constellationLines = await readJSONLAsync(constellationsPath);

			let constellationCount = 0;
			for (const line of constellationLines) {
				if (!line.trim()) continue;
				const constellationData = JSON.parse(line);
				const constellationId = constellationData._key;
				const constellationName = constellationData.name?.en;

				if (constellationId && constellationName) {
					constellationMap.set(constellationId, constellationName);
					constellationCount++;
				}

				// Yield control every 20 constellations
				if (constellationCount % 20 === 0) {
					await new Promise((resolve) => setImmediate(resolve));
				}
			}

			span.addEvent('Loaded constellations', { totalConstellations: constellationMap.size });

			// Load solar systems from mapSolarSystems.jsonl
			const solarSystemsPath = path.join(tempDir, 'mapSolarSystems.jsonl');

			if (!fs.existsSync(solarSystemsPath)) {
				span.setStatus({ code: 2, message: 'mapSolarSystems.jsonl file not found' });
				throw new Error('mapSolarSystems.jsonl file not found in temp directory');
			}

			span.addEvent('Reading mapSolarSystems.jsonl file');
			const solarSystemLines = await readJSONLAsync(solarSystemsPath);

			let processedSystems = 0;
			let skippedSystems = 0;

			for (const line of solarSystemLines) {
				if (!line.trim()) continue;

				try {
					const systemData = JSON.parse(line);
					const systemId = systemData._key;
					const systemName = systemData.name?.en;
					const constellationId = systemData.constellationID;
					const regionId = systemData.regionID;
					const securityStatus = systemData.securityStatus;

					// Validate required fields
					if (
						!systemId ||
						!systemName ||
						constellationId === undefined ||
						regionId === undefined ||
						securityStatus === undefined
					) {
						logger.warn(`Skipping solar system ${systemId} due to missing required fields`);
						span.addEvent('Skipping system with missing data', {
							systemId,
							hasName: !!systemName,
							hasConstellationId: constellationId !== undefined,
							hasRegionId: regionId !== undefined,
							hasSecurityStatus: securityStatus !== undefined
						});
						skippedSystems++;
						continue;
					}

					// Get constellation and region names from maps
					const constellationName = constellationMap.get(constellationId);
					const regionName = regionMap.get(regionId);

					if (!constellationName || !regionName) {
						logger.warn(
							`Skipping solar system ${systemId} (${systemName}) due to missing constellation or region mapping`
						);
						span.addEvent('Skipping system with missing mapping', {
							systemId,
							systemName,
							constellationId,
							regionId,
							hasConstellationMapping: !!constellationName,
							hasRegionMapping: !!regionName
						});
						skippedSystems++;
						continue;
					}

					systemsData.push({
						id: systemId,
						name: systemName,
						constellation: constellationName,
						region: regionName,
						sec_status: parseFloat(securityStatus)
					});

					processedSystems++;

					// Yield control every 50 systems to prevent blocking the event loop
					if (processedSystems % 50 === 0) {
						await new Promise((resolve) => setImmediate(resolve));
					}

					// Log progress every 1000 systems
					if (processedSystems % 1000 === 0) {
						span.addEvent('Processing progress', {
							systemsProcessed: processedSystems,
							systemsSkipped: skippedSystems
						});
					}
				} catch (parseError) {
					logger.warn(`Failed to parse solar system line: ${parseError.message}`);
					skippedSystems++;
				}
			}

			span.setAttributes({
				'universe.regions_loaded': regionMap.size,
				'universe.constellations_loaded': constellationMap.size,
				'universe.systems_processed': processedSystems,
				'universe.systems_skipped': skippedSystems,
				'universe.systems_found': systemsData.length
			});

			span.addEvent('Updating systems in database', {
				systemsCount: systemsData.length
			});

			// Update the database with systems data
			if (systemsData.length > 0) {
				await addOrUpdateSystemsDB(systemsData);
				span.addEvent('Systems updated successfully', {
					updatedCount: systemsData.length
				});
			} else {
				span.addEvent('No systems found to update');
			}

			span.setStatus({ code: 0, message: 'Universe data updated successfully' });
			return true;
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Error updating Universe: ${errorMessage}`);
			span.setStatus({ code: 2, message: errorMessage });
			return false;
		}
	});
}
