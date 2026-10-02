/**
 * File for all Directional Scan related functions
 */
import logger from '../logger.js';
import { withSpan } from './tracer.js';
import { scanItemsCount, scanDuration } from './metrics.js';
import { getTypeHierarchyMetadata, getSystemsByNames } from '../database/sde.js';
import { DSCAN_ON_GRID_MAX_KM } from './constants.js';
import { isOnGrid } from '../utils/distance.js';

const GRID_BUCKETS = {
	ON: 'on_grid',
	OFF: 'off_grid'
};

const UNKNOWN_LABEL = 'Unknown';
const HIDDEN_CONTROL_PATTERN =
	/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u200B-\u200D\u2060\uFEFF]/g; // eslint-disable-line no-control-regex

const sanitizeDirectionalLine = (line) => line.replace(HIDDEN_CONTROL_PATTERN, '');

/**
 * Parses raw directional scan data and aggregates it into a structured result.
 * @param {string|string[]} rawData - The raw scan data (string or array of strings).
 * @returns {Promise<Object>} The structured scan result.
 */
export async function createNewDirectionalScan(rawData) {
	return await withSpan('server.directional.create_new', async (span) => {
		const startTime = Date.now();
		const parsed = parseDirectionalLines(rawData);
		span.setAttributes({
			'scan.type': 'directional',
			'scan.raw_line_count': parsed.rawCount,
			'scan.valid_line_count': parsed.entries.length
		});

		if (parsed.entries.length === 0) {
			return buildResult();
		}

		const uniqueTypeIds = Array.from(new Set(parsed.entries.map((entry) => entry.typeId)));
		const metadataMap = await getTypeHierarchyMetadata(uniqueTypeIds);
		const missingTypes = new Set();
		const buckets = {
			[GRID_BUCKETS.ON]: createBucket(),
			[GRID_BUCKETS.OFF]: createBucket()
		};
		/** @type {Map<string, { name: string, score: number, celestial: number }>} */
		const systemEvidence = new Map();

		for (const entry of parsed.entries) {
			const metadata = metadataMap.get(entry.typeId);
			if (!metadata) {
				missingTypes.add(entry.typeId);
			}

			const resolvedMetadata = metadata ?? {
				typeId: entry.typeId,
				typeName: entry.typeName,
				mass: 0,
				groupId: `unknown-group-${entry.typeId}`,
				groupName: `${UNKNOWN_LABEL} Group`,
				anchorable: false,
				anchored: false,
				categoryId: `unknown-category-${entry.typeId}`,
				categoryName: `${UNKNOWN_LABEL} Category`
			};

			const categoryId =
				typeof resolvedMetadata.categoryId === 'number' ? resolvedMetadata.categoryId : null;
			const groupId =
				typeof resolvedMetadata.groupId === 'number' ? resolvedMetadata.groupId : null;

			addSystemEvidence(systemEvidence, determineSystemEvidence(entry.name, categoryId, groupId));

			const bucketKey = entry.isOnGrid ? GRID_BUCKETS.ON : GRID_BUCKETS.OFF;
			const bucket = buckets[bucketKey];
			accumulateEntry(bucket, entry, resolvedMetadata);
		}

		const duration = Date.now() - startTime;
		scanItemsCount.record(parsed.entries.length, { type: 'directional' });
		scanDuration.record(duration / 1000, { type: 'directional' });
		// scans_processed_total is counted by the route once the scan is stored

		const systemDetails = await resolveSystem(systemEvidence);

		span.setAttributes({
			'scan.unique_type_ids': metadataMap.size,
			'scan.missing_type_ids': missingTypes.size,
			'scan.on_grid_objects': buckets[GRID_BUCKETS.ON].totalObjects,
			'scan.off_grid_objects': buckets[GRID_BUCKETS.OFF].totalObjects,
			'scan.unique_system_candidates_count': systemEvidence.size,
			'scan.system_candidate': systemDetails?.name ?? 'none'
		});

		const result = {
			[GRID_BUCKETS.ON]: finalizeBucket(buckets[GRID_BUCKETS.ON]),
			[GRID_BUCKETS.OFF]: finalizeBucket(buckets[GRID_BUCKETS.OFF])
		};

		if (systemDetails) {
			result.system = systemDetails;
		}

		return result;
	});
}

/**
 * Parses the raw lines into structured entries.
 * @param {string|string[]} rawData
 * @returns {{rawCount: number, entries: Array<Object>}}
 */
function parseDirectionalLines(rawData) {
	const lines = normalizeLines(rawData);
	if (lines.length === 0) {
		return { rawCount: 0, entries: [] };
	}

	const entries = [];
	let invalidLines = 0;

	for (const line of lines) {
		const trimmed = line.trim();
		if (!trimmed) continue;

		const parts = trimmed.split('\t');
		if (parts.length < 4) {
			invalidLines++;
			continue;
		}

		const typeIdRaw = parts[0];
		const distanceRaw = parts[parts.length - 1];
		const typeNameRaw = parts[parts.length - 2];
		const nameRaw = parts.slice(1, -2).join(' ');
		const typeId = Number(typeIdRaw);
		// Same rule as detection (src/lib/utils/scan_type.js): positive integer type ids only.
		if (!Number.isInteger(typeId) || typeId <= 0) {
			invalidLines++;
			continue;
		}

		entries.push({
			typeId,
			name: (nameRaw || '').trim() || UNKNOWN_LABEL,
			typeName: (typeNameRaw || '').trim() || UNKNOWN_LABEL,
			distance: distanceRaw.trim(),
			isOnGrid: isOnGrid(distanceRaw, DSCAN_ON_GRID_MAX_KM)
		});
	}

	if (invalidLines > 0) {
		logger.warn({
			msg: 'Directional scan lines skipped due to invalid format',
			count: invalidLines,
			totalLines: lines.length
		});
	}

	return { rawCount: lines.length, entries };
}

/**
 * Normalizes input data into an array of strings.
 * @param {string|string[]} rawData
 * @returns {string[]}
 */
function normalizeLines(rawData) {
	if (Array.isArray(rawData)) {
		return rawData.map((line) => {
			if (typeof line === 'string') return sanitizeDirectionalLine(line);
			if (line == null) return '';
			return sanitizeDirectionalLine(String(line));
		});
	}

	if (typeof rawData === 'string') {
		return rawData
			.replace(/\r/g, '')
			.split('\n')
			.map((line) => sanitizeDirectionalLine(line));
	}

	return [];
}

/**
 * Creates a new empty bucket structure.
 * @returns {Object}
 */
function createBucket() {
	return {
		totalObjects: 0,
		totalMass: 0,
		categories: new Map()
	};
}

/**
 * Accumulates a single entry into the bucket structure.
 * @param {Object} bucket
 * @param {Object} entry
 * @param {Object} metadata
 */
function accumulateEntry(bucket, entry, metadata) {
	const objectMass = metadata.mass || 0;
	bucket.totalObjects += 1;
	bucket.totalMass += objectMass;

	const categoryKey = metadata.categoryId ?? `unknown-category-${metadata.typeId}`;
	let category = bucket.categories.get(categoryKey);
	if (!category) {
		category = {
			id: metadata.categoryId,
			name: metadata.categoryName,
			totalObjects: 0,
			totalMass: 0,
			groups: new Map()
		};
		bucket.categories.set(categoryKey, category);
	}
	category.totalObjects += 1;
	category.totalMass += objectMass;

	const groupKey = metadata.groupId ?? `unknown-group-${metadata.typeId}`;
	let group = category.groups.get(groupKey);
	if (!group) {
		group = {
			id: metadata.groupId,
			name: metadata.groupName,
			anchored: Boolean(metadata.anchorable || metadata.anchored),
			totalObjects: 0,
			totalMass: 0,
			types: new Map()
		};
		category.groups.set(groupKey, group);
	}
	group.totalObjects += 1;
	group.totalMass += objectMass;

	let typeEntry = group.types.get(metadata.typeId);
	if (!typeEntry) {
		typeEntry = {
			id: metadata.typeId,
			name: metadata.typeName,
			mass: objectMass,
			totalMass: 0,
			count: 0
		};
		group.types.set(metadata.typeId, typeEntry);
	}
	typeEntry.count += 1;
	typeEntry.totalMass += objectMass;
}

/**
 * Converts the bucket map structure into the final sorted array format.
 * @param {Object} bucket
 * @returns {Object}
 */
function finalizeBucket(bucket) {
	return {
		total_objects: bucket.totalObjects,
		total_mass: bucket.totalMass,
		objects: Array.from(bucket.categories.values())
			.sort((a, b) => b.totalObjects - a.totalObjects)
			.map((category) => ({
				id: category.id,
				name: category.name,
				total_objects: category.totalObjects,
				total_mass: category.totalMass,
				objects: Array.from(category.groups.values())
					.sort((a, b) => b.totalObjects - a.totalObjects)
					.map((group) => ({
						id: group.id,
						name: group.name,
						anchored: group.anchored,
						total_objects: group.totalObjects,
						total_mass: group.totalMass,
						objects: Array.from(group.types.values())
							.sort((a, b) => b.count - a.count)
							.map((type) => ({
								id: type.id,
								name: type.name,
								count: type.count
							}))
					}))
			}))
	};
}

function buildResult() {
	return {
		[GRID_BUCKETS.ON]: finalizeBucket(createBucket()),
		[GRID_BUCKETS.OFF]: finalizeBucket(createBucket())
	};
}

/**
 * How much one object counts towards "the scan was taken in system X".
 * Celestials outweigh player structures: their names are generated by the game from
 * the system name, while structures can be numerous (one citadel spam outvotes the sun)
 * and Ansiblex names point at two systems.
 */
const EVIDENCE_WEIGHT = {
	sun: 10, // exactly one per system, d-scan name "<System> - Star"
	celestial: 3, // planets, moons, belts, NPC stations
	structure: 1 // player structures ("<System> - <name>") and Ansiblex gates
};

/**
 * System evidence from one scanned object, or null. Stargates are ignored on purpose:
 * "Stargate (X)" names the destination, not the current system.
 * @param {string} name
 * @param {number|null} categoryId
 * @param {number|null} groupId
 * @returns {{ name: string, weight: number, celestial: boolean } | null}
 */
function determineSystemEvidence(name, categoryId, groupId) {
	if (!name || name === UNKNOWN_LABEL) return null;

	let candidate = null;
	let weight = 0;

	// Category 65: Structure (Player)
	if (categoryId === 65) {
		// Group 1408: Ansiblex Jump Bridge
		candidate =
			groupId === 1408 ? extractSystemFromAnsiblexName(name) : extractSystemFromStructureName(name);
		weight = EVIDENCE_WEIGHT.structure;
	}

	// Category 3: Station (NPC)
	if (categoryId === 3) {
		candidate = extractSystemFromCelestialName(name);
		weight = EVIDENCE_WEIGHT.celestial;
	}

	// Category 2: Celestial
	if (categoryId === 2) {
		// Group 6: Sun
		if (groupId === 6) {
			candidate = extractSystemFromSunName(name);
			weight = EVIDENCE_WEIGHT.sun;
		}
		// Group 7: Planet, 8: Moon, 9: Asteroid Belt
		if (groupId === 7 || groupId === 8 || groupId === 9) {
			candidate = extractSystemFromCelestialName(name);
			weight = EVIDENCE_WEIGHT.celestial;
		}
	}

	return candidate
		? { name: candidate, weight, celestial: weight > EVIDENCE_WEIGHT.structure }
		: null;
}

/**
 * @param {Map<string, { name: string, score: number, celestial: number }>} evidence
 * @param {{ name: string, weight: number, celestial: boolean } | null} item
 */
function addSystemEvidence(evidence, item) {
	if (!item) return;
	const key = item.name.toLowerCase();
	const entry = evidence.get(key) ?? { name: item.name, score: 0, celestial: 0 };
	entry.score += item.weight;
	if (item.celestial) entry.celestial += 1;
	evidence.set(key, entry);
}

/**
 * Picks the best-supported candidate that is a real solar system (one case-insensitive
 * lookup for all candidates, so a structure called "HQ" can never win). Ties prefer
 * more celestial evidence, then the name, for determinism.
 * @param {Map<string, { name: string, score: number, celestial: number }>} evidence
 */
async function resolveSystem(evidence) {
	if (evidence.size === 0) return undefined;

	const systemsByName = await getSystemsByNames([...evidence.values()].map((e) => e.name));
	const [best] = [...evidence.entries()]
		.filter(([key]) => systemsByName.has(key))
		.sort(
			([keyA, a], [keyB, b]) =>
				b.score - a.score || b.celestial - a.celestial || keyA.localeCompare(keyB)
		);
	if (!best) return undefined;

	const systemRow = systemsByName.get(best[0]);
	return {
		id: systemRow.id,
		name: systemRow.name,
		constellation: systemRow.constellation,
		region: systemRow.region,
		security: Number(systemRow.secStatus)
	};
}

function extractSystemFromAnsiblexName(name) {
	const delimiter = ' » ';
	const delimiterIndex = name.indexOf(delimiter);
	const candidate = delimiterIndex === -1 ? null : name.slice(0, delimiterIndex).trim();
	return candidate && candidate.length > 0 ? candidate : null;
}

/**
 * Upwell structure names are shown as "<System> - <name>"; without that delimiter the
 * name says nothing about the system.
 */
function extractSystemFromStructureName(name) {
	const delimiter = ' - ';
	const delimiterIndex = name.indexOf(delimiter);
	return delimiterIndex === -1 ? null : name.slice(0, delimiterIndex).trim() || null;
}

function extractSystemFromSunName(name) {
	const delimiter = ' - ';
	const delimiterIndex = name.indexOf(delimiter);
	return delimiterIndex === -1 ? null : name.slice(0, delimiterIndex).trim();
}

function extractSystemFromCelestialName(name) {
	const delimiter = ' - ';
	const delimiterIndex = name.indexOf(delimiter);
	const celestialName = delimiterIndex === -1 ? name.trim() : name.slice(0, delimiterIndex).trim();

	// Remove Roman Numerals (I, II, IV, X, etc) from the end
	return celestialName.replace(/\s+[IVX]+$/, '');
}
