import { withSpan } from '$lib/server/tracer';
import logger from '$lib/logger';
import { getLastChecksums, addSDEDataEntry, addOrUpdateSystemsDB } from '$lib/database/sde_data';
import {
	SDE_FSD_CHECKSUM,
	SDE_BSD_CHECKSUM,
	SDE_UNIVERSE_CHECKSUM,
	SDE_FSD,
	SDE_BSD,
	SDE_UNIVERSE
} from '$lib/server/constants';
import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { extractZipNonBlocking } from '$lib/workers/extract-worker.js';
import { addOrUpdateCorporationsDB } from '$lib/database/corporations';

export async function updateStaticData() {
	logger.info('[SDEUpdater] Updating static data...');
	await withSpan('CRON Static', async () => {
		// Get SDE checksums and compare them to the last entry in DB
		const [results, onlineChecksums] = await withSpan('SDE Checksum Check', async () => {
			const dbChecksumsArray = await getLastChecksums();
			const dbChecksums = dbChecksumsArray[0]; // Get first result from array
			const onlineChecksums = await getOnlineChecksums();

			// If no previous checksums exist, force an update
			if (!dbChecksums) {
				logger.info('[SDEUpdater] No previous SDE data found, update needed.');
				return [1, onlineChecksums];
			}

			if (
				dbChecksums.fsd_checksum === onlineChecksums.fsd &&
				dbChecksums.bsd_checksum === onlineChecksums.bsd &&
				dbChecksums.universe_checksum === onlineChecksums.universe
			) {
				logger.info('[SDEUpdater] Static data is up to date, no update needed.');
				return [0, onlineChecksums];
			}
			logger.info('[SDEUpdater] Static data is out of date, update needed.');
			return [1, onlineChecksums];
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

		// UNIVERSE SDE Update
		const universe_status = await withSpan('UNIVERSE Update', async () => {
			// Download and extract the need files from UNIVERSE
			// We need all files
			logger.info('[SDEUpdater] Downloading and extracting UNIVERSE SDE...');
			await downloadAndExtractSDE(SDE_UNIVERSE, []);
			logger.info('[SDEUpdater] Downloading and extracting BSD SDE...');
			await downloadAndExtractSDE(SDE_BSD, ['invNames.yaml']);

			// 1. Update NPC Corps
			logger.info('[SDEUpdater] Updating UNIVERSE...');
			await updateUniverse();

			return 0;
		});
		await cleanupTemp();

		if (fsd_status === 0 && universe_status === 0) {
			logger.info('[SDEUpdater] Update succeeded.');
			await addSDEDataEntry(onlineChecksums);
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

			// Download the zip file using streaming to avoid blocking
			span.addEvent('Downloading SDE zip file');
			const response = await fetch(url);
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
	await withSpan('Update NPC Corps', async (span) => {
		try {
			const yamlFilePath = path.join('./temp', 'npcCorporations.yaml');

			span.addEvent('Reading npcCorporations.yaml file');

			// Check if the file exists
			if (!fs.existsSync(yamlFilePath)) {
				span.setStatus({ code: 2, message: 'npcCorporations.yaml file not found' });
				throw new Error('npcCorporations.yaml file not found in temp directory');
			}

			span.addEvent('Parsing NPC corporations data');

			// Read and parse the YAML file
			const yamlContent = fs.readFileSync(yamlFilePath, 'utf8');
			const npcCorps = yaml.load(yamlContent);

			if (!npcCorps || typeof npcCorps !== 'object') {
				span.setStatus({ code: 2, message: 'Invalid YAML format in npcCorporations.yaml' });
				throw new Error('Invalid YAML format in npcCorporations.yaml');
			}

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
					logger.warn(`Skipping NPC corporation ${corpId} due to missing name or ticker`);
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
			logger.error(`Error updating NPC corporations: ${errorMessage}`);
			span.setStatus({ code: 2, message: errorMessage });
			throw error;
		}
	});
}

async function updateUniverse() {
	await withSpan('Update Universe', async (span) => {
		try {
			const tempDir = './temp';
			const systemsData = [];
			let constellationCount = 0;

			span.addEvent('Starting universe data processing');

			// Load the invNames.yaml file to get proper names
			const invNamesPath = path.join(tempDir, 'invNames.yaml');
			let nameMap = new Map();

			if (fs.existsSync(invNamesPath)) {
				span.addEvent('Loading invNames.yaml file');
				const invNamesContent = fs.readFileSync(invNamesPath, 'utf8');
				const invNames = yaml.load(invNamesContent);

				// Create a map of itemID -> itemName for quick lookup
				if (Array.isArray(invNames)) {
					for (const item of invNames) {
						if (item.itemID && item.itemName) {
							nameMap.set(item.itemID, item.itemName);
						}
					}
				}

				span.addEvent('Loaded names', { totalNames: nameMap.size });
			} else {
				logger.warn('invNames.yaml not found, using folder names as fallback');
			}

			// Read all directories in temp (these are the universe type folders like "eve")
			const universeTypes = fs
				.readdirSync(tempDir, { withFileTypes: true })
				.filter((dirent) => dirent.isDirectory())
				.map((dirent) => dirent.name);

			for (const universeType of universeTypes) {
				const universeTypePath = path.join(tempDir, universeType);

				// Read all region folders
				const regions = fs
					.readdirSync(universeTypePath, { withFileTypes: true })
					.filter((dirent) => dirent.isDirectory())
					.map((dirent) => dirent.name);

				span.addEvent(`Processing universe type: ${universeType}`, {
					regionCount: regions.length
				});

				for (const regionName of regions) {
					const regionPath = path.join(universeTypePath, regionName);

					// Try to get region ID from region.yaml
					let regionId = null;
					let regionDisplayName = regionName;
					const regionYamlPath = path.join(regionPath, 'region.yaml');
					if (fs.existsSync(regionYamlPath)) {
						try {
							const regionYaml = yaml.load(fs.readFileSync(regionYamlPath, 'utf8'));
							if (regionYaml && regionYaml.regionID) {
								regionId = regionYaml.regionID;
								regionDisplayName = nameMap.get(regionId) || regionName;
							}
						} catch (error) {
							logger.warn(`Failed to parse ${regionYamlPath}: ${error.message}`);
						}
					}
					if (!regionDisplayName || regionDisplayName === regionName) {
						regionDisplayName = regionName;
					}

					// Read all constellation folders
					const constellations = fs
						.readdirSync(regionPath, { withFileTypes: true })
						.filter((dirent) => dirent.isDirectory())
						.map((dirent) => dirent.name);

					constellationCount += constellations.length;

					for (const constellationName of constellations) {
						const constellationPath = path.join(regionPath, constellationName);

						// Try to get constellation ID from constellation.yaml
						let constellationId = null;
						let constellationDisplayName = constellationName;
						const constellationYamlPath = path.join(constellationPath, 'constellation.yaml');
						if (fs.existsSync(constellationYamlPath)) {
							try {
								const constellationYaml = yaml.load(fs.readFileSync(constellationYamlPath, 'utf8'));
								if (constellationYaml && constellationYaml.constellationID) {
									constellationId = constellationYaml.constellationID;
									constellationDisplayName = nameMap.get(constellationId) || constellationName;
								}
							} catch (error) {
								logger.warn(`Failed to parse ${constellationYamlPath}: ${error.message}`);
							}
						}
						if (!constellationDisplayName || constellationDisplayName === constellationName) {
							constellationDisplayName = constellationName;
						}

						// Read all system folders
						const systems = fs
							.readdirSync(constellationPath, { withFileTypes: true })
							.filter((dirent) => dirent.isDirectory())
							.map((dirent) => dirent.name);

						for (const systemName of systems) {
							const systemPath = path.join(constellationPath, systemName);
							const solarSystemYamlPath = path.join(systemPath, 'solarsystem.yaml');

							// Check if solarsystem.yaml exists
							if (fs.existsSync(solarSystemYamlPath)) {
								try {
									// Read and parse the YAML file
									const yamlContent = fs.readFileSync(solarSystemYamlPath, 'utf8');
									const systemData = yaml.load(yamlContent);

									if (systemData && systemData.solarSystemID && systemData.security !== undefined) {
										// Get the proper system name from invNames
										const systemId = parseInt(systemData.solarSystemID, 10);
										const systemDisplayName = nameMap.get(systemId) || systemName;

										systemsData.push({
											id: systemId,
											name: systemDisplayName,
											constellation: constellationDisplayName,
											region: regionDisplayName,
											sec_status: parseFloat(systemData.security)
										});
									} else {
										logger.warn(
											`Invalid system data in ${solarSystemYamlPath}: missing solarSystemID or security`
										);
									}
								} catch (parseError) {
									logger.warn(`Failed to parse ${solarSystemYamlPath}: ${parseError.message}`);
								}
							} else {
								logger.warn(`Missing solarsystem.yaml in ${systemPath}`);
							}

							// Yield control every 100 systems to prevent blocking the event loop
							if (systemsData.length % 100 === 0) {
								await new Promise((resolve) => setImmediate(resolve));
							}
						}

						// Yield control after each constellation to prevent blocking
						await new Promise((resolve) => setImmediate(resolve));
					}

					// Log progress every 100 regions
					if (systemsData.length % 1000 === 0 && systemsData.length > 0) {
						span.addEvent('Processing progress', {
							systemsProcessed: systemsData.length,
							currentRegion: regionName
						});
					}
				}
			}

			span.setAttributes({
				'universe.regions_processed': universeTypes.length,
				'universe.constellations_found': constellationCount,
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
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			logger.error(`Error updating Universe: ${errorMessage}`);
			span.setStatus({ code: 2, message: errorMessage });
			throw error;
		}
	});
}
