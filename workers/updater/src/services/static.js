/**
 * Static data (SDE) import.
 *
 * When CCP publishes a new SDE build: stream the JSONL zip (~100 MB) to a private temp
 * directory, extract the needed files one entry at a time, read them line by line and
 * upsert NPC corporations, solar systems, categories, groups and types. Each table is
 * upserted in its own transaction (src/lib/database/sde.js), rows referencing a missing
 * parent are skipped instead of failing the table on its foreign key, and the temp
 * directory is always removed.
 */
import { withSpan } from '../../../../src/lib/server/tracer.js';
import logger from '../../../../src/lib/logger.js';
import {
	getLastInstalledSDEVersion,
	addSDEDataEntry,
	addOrUpdateSystemsDB,
	addOrUpdateCategoriesDB,
	addOrUpdateGroupsDB,
	addOrUpdateTypesDB
} from '../../../../src/lib/database/sde.js';
import { SDE_FILE, SDE_VERSION, USER_AGENT } from '../../../../src/lib/server/constants.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import readline from 'node:readline';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { extractZipEntries } from '../utils/extract.js';
import { addOrUpdateCorporationsDB } from '../../../../src/lib/database/corporations.js';
import { fetchGET } from '../../../../src/lib/server/wrappers.js';
import { recordCronJob } from '../../../../src/lib/server/metrics.js';

/** The SDE zip is ~100 MB; give slow links time but never hang forever. */
const DOWNLOAD_TIMEOUT_MS = 15 * 60 * 1000;
const PROGRESS_EVERY_BYTES = 10 * 1024 * 1024;

const SDE_FILES = [
	'npcCorporations.jsonl',
	'mapRegions.jsonl',
	'mapConstellations.jsonl',
	'mapSolarSystems.jsonl',
	'categories.jsonl',
	'groups.jsonl',
	'types.jsonl'
];

export async function updateStaticData() {
	const startTime = Date.now();

	try {
		logger.info('[SDEUpdater] Updating static data...');
		await withSpan('worker.static.cron', async () => {
			const [upToDate, version] = await withSpan('worker.static.check_version', async (span) => {
				const lastInstalledVersion = await getLastInstalledSDEVersion();
				const latestOnlineVersion = await getOnlineVersion();

				span.setAttributes({
					'sde.installed': JSON.stringify(lastInstalledVersion ?? null),
					'sde.online': JSON.stringify(latestOnlineVersion)
				});

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

			if (upToDate) return;

			const tempDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'dscan-sde-'));
			try {
				logger.info('[SDEUpdater] Downloading and extracting SDE files...');
				await downloadAndExtractSDE(SDE_FILE, tempDir, SDE_FILES);

				logger.info('[SDEUpdater] Updating NPC corporations...');
				const npcUpdateSuccess = await updateNPCCorps(tempDir);

				logger.info('[SDEUpdater] Updating universe data...');
				const universeUpdateSuccess = await updateUniverse(tempDir);

				logger.info('[SDEUpdater] Updating item data...');
				const itemUpdateSuccess = await updateItems(tempDir);

				const success = npcUpdateSuccess && universeUpdateSuccess && itemUpdateSuccess;
				logger.info(
					{ npcUpdateSuccess, universeUpdateSuccess, itemUpdateSuccess },
					`[SDEUpdater] Recording SDE build ${version.release_version}: ${success ? 'success' : 'failure'}`
				);
				// A failed import is recorded but not counted as installed, so it is retried.
				await addSDEDataEntry({
					release_date: version.release_date,
					release_version: version.release_version,
					success
				});
			} finally {
				await fs.promises.rm(tempDir, { recursive: true, force: true });
				logger.info('[SDEUpdater] Temporary files cleaned up');
			}
		});

		logger.info('[SDEUpdater] Static data update completed.');
		recordCronJob('updateStaticData', Date.now() - startTime, true);
		return true;
	} catch (error) {
		recordCronJob('updateStaticData', Date.now() - startTime, false);
		throw error;
	}
}

async function getOnlineVersion() {
	return await withSpan('worker.static.get_online_version', async (span) => {
		const response = await fetchGET(SDE_VERSION);
		if (!response || !response.ok) {
			throw new Error(
				`Failed to fetch SDE version (${response ? response.status : 'no response'})`
			);
		}

		// The version file is JSONL: one object per line, the first one is the SDE build.
		const text = (await response.text()).trim();
		const sdeData = JSON.parse(text.split('\n')[0]);
		if (!sdeData?.buildNumber) {
			throw new Error('Failed to parse SDE version data');
		}

		span.setAttributes({
			'sde.build_number': sdeData.buildNumber,
			'sde.release_date': sdeData.releaseDate
		});
		return { release_version: sdeData.buildNumber, release_date: sdeData.releaseDate };
	});
}

/**
 * Streams the SDE zip to disk (backpressure, timeout, size check), then extracts the
 * requested files. The zip itself is deleted afterwards.
 */
async function downloadAndExtractSDE(url, tempDir, files) {
	await withSpan('worker.static.download_extract', async (span) => {
		const zipPath = path.join(tempDir, 'sde.zip');
		try {
			const response = await fetch(url, {
				headers: { 'User-Agent': USER_AGENT },
				signal: AbortSignal.timeout(DOWNLOAD_TIMEOUT_MS)
			});
			if (!response.ok || !response.body) {
				throw new Error(`Failed to download SDE: HTTP ${response.status} ${response.statusText}`);
			}

			const expectedBytes = Number(response.headers.get('content-length')) || null;
			let downloadedBytes = 0;
			let nextProgress = PROGRESS_EVERY_BYTES;
			const progress = new Transform({
				transform(chunk, _encoding, callback) {
					downloadedBytes += chunk.length;
					if (downloadedBytes >= nextProgress) {
						nextProgress += PROGRESS_EVERY_BYTES;
						span.addEvent('Download progress', {
							downloadedBytes,
							expectedBytes: expectedBytes ?? -1
						});
					}
					callback(null, chunk);
				}
			});

			await pipeline(Readable.fromWeb(response.body), progress, fs.createWriteStream(zipPath));

			if (expectedBytes !== null && downloadedBytes !== expectedBytes) {
				throw new Error(`SDE download truncated: ${downloadedBytes} of ${expectedBytes} bytes`);
			}
			span.setAttributes({ 'sde.download_bytes': downloadedBytes, 'sde.url': response.url });

			const result = await extractZipEntries(zipPath, tempDir, files);
			span.setAttributes({
				'sde.extracted_files': result.extractedFiles,
				'sde.extracted_bytes': result.totalBytes
			});
		} finally {
			await fs.promises.rm(zipPath, { force: true });
		}
	});
}

/**
 * Calls `onRecord` for every JSON line of a JSONL file, streaming (never holds the file).
 * Unparsable lines are counted and skipped.
 * @param {string} filePath
 * @param {(record: any) => void} onRecord
 * @returns {Promise<{ lines: number, invalid: number }>}
 */
export async function readJsonLines(filePath, onRecord) {
	const input = fs.createReadStream(filePath, { encoding: 'utf8' });
	const lines = readline.createInterface({ input, crlfDelay: Infinity });
	let count = 0;
	let invalid = 0;
	for await (const line of lines) {
		if (!line.trim()) continue;
		count++;
		let record;
		try {
			record = JSON.parse(line);
		} catch {
			invalid++;
			continue;
		}
		onRecord(record);
	}
	return { lines: count, invalid };
}

// Row mappers: SDE JSONL record -> database row, or null when it must be skipped.

export function toNpcCorporation(record) {
	if (record.deleted === true) return null;
	const name = record.name?.en;
	const ticker = record.tickerName;
	if (!record._key || !name || !ticker) return null;
	return { id: record._key, name, ticker, alliance_id: null, npc: true };
}

export function toSystem(record, constellationNames, regionNames) {
	const { _key: id, constellationID, regionID, securityStatus } = record;
	const name = record.name?.en;
	if (!id || !name || securityStatus === undefined) return null;
	const constellation = constellationNames.get(constellationID);
	const region = regionNames.get(regionID);
	if (!constellation || !region) return null;
	return { id, name, constellation, region, sec_status: Number(securityStatus) };
}

export function toCategory(record) {
	const name = record.name?.en;
	if (!record._key || !name) return null;
	return { id: record._key, name };
}

export function toGroup(record) {
	const name = record.name?.en;
	if (!record._key || !name || !record.categoryID) return null;
	return {
		id: record._key,
		name,
		anchorable: record.anchorable || false,
		anchored: record.anchored || false,
		fittable_non_singleton: record.fittableNonSingleton || false,
		category_id: record.categoryID,
		icon_id: record.iconID || null
	};
}

export function toType(record) {
	const name = record.name?.en;
	if (!record._key || !name || !record.groupID) return null;
	return {
		id: record._key,
		name,
		mass: record.mass || 0,
		volume: record.volume || 0,
		capacity: record.capacity || null,
		faction_id: record.factionID || 0,
		race_id: record.raceID || 0,
		group_id: record.groupID,
		market_group_id: record.marketGroupID || null,
		icon_id: record.iconID || null
	};
}

/**
 * Reads a JSONL file through a mapper and records counts on the span.
 * @returns {Promise<any[]>} mapped rows
 */
async function readRows(tempDir, fileName, mapper, span, label) {
	const rows = [];
	let skipped = 0;
	const { lines, invalid } = await readJsonLines(path.join(tempDir, fileName), (record) => {
		const row = mapper(record);
		if (row) rows.push(row);
		else skipped++;
	});
	span.setAttributes({
		[`${label}.lines`]: lines,
		[`${label}.invalid_json`]: invalid,
		[`${label}.skipped`]: skipped,
		[`${label}.valid`]: rows.length
	});
	if (invalid + skipped > 0) {
		logger.warn({ file: fileName, invalid, skipped }, '[SDEUpdater] Skipped SDE records');
	}
	return rows;
}

/** Runs an import step; failures are logged/recorded and reported as `false`. */
async function importStep(spanName, fn) {
	return await withSpan(spanName, async (span) => {
		try {
			await fn(span);
			return true;
		} catch (error) {
			logger.error({ err: error }, `[SDEUpdater] ${spanName} failed`);
			span.setStatus({ code: 2, message: error?.message ?? String(error) });
			return false;
		}
	});
}

function updateNPCCorps(tempDir) {
	return importStep('worker.static.update_npc_corps', async (span) => {
		const corporations = await readRows(
			tempDir,
			'npcCorporations.jsonl',
			toNpcCorporation,
			span,
			'npc_corps'
		);
		await addOrUpdateCorporationsDB(corporations);
	});
}

function updateUniverse(tempDir) {
	return importStep('worker.static.update_universe', async (span) => {
		const names = (rows) => new Map(rows.map((row) => [row.id, row.name]));
		const named = (record) =>
			record._key && record.name?.en ? { id: record._key, name: record.name.en } : null;

		const regions = names(await readRows(tempDir, 'mapRegions.jsonl', named, span, 'regions'));
		const constellations = names(
			await readRows(tempDir, 'mapConstellations.jsonl', named, span, 'constellations')
		);
		const systems = await readRows(
			tempDir,
			'mapSolarSystems.jsonl',
			(record) => toSystem(record, constellations, regions),
			span,
			'systems'
		);
		await addOrUpdateSystemsDB(systems);
	});
}

function updateItems(tempDir) {
	return importStep('worker.static.update_items', async (span) => {
		const categories = await readRows(tempDir, 'categories.jsonl', toCategory, span, 'categories');
		const categoryIds = new Set(categories.map((c) => c.id));

		// inv_groups.category_id and inv_types.group_id are foreign keys: rows whose parent
		// is not part of this SDE are skipped instead of failing the whole table.
		const allGroups = await readRows(tempDir, 'groups.jsonl', toGroup, span, 'groups');
		const groups = allGroups.filter((group) => categoryIds.has(group.category_id));
		const groupIds = new Set(groups.map((g) => g.id));

		const allTypes = await readRows(tempDir, 'types.jsonl', toType, span, 'types');
		const types = allTypes.filter((type) => groupIds.has(type.group_id));

		span.setAttributes({
			'groups.orphaned': allGroups.length - groups.length,
			'types.orphaned': allTypes.length - types.length
		});

		await addOrUpdateCategoriesDB(categories);
		await addOrUpdateGroupsDB(groups);
		await addOrUpdateTypesDB(types);
	});
}
