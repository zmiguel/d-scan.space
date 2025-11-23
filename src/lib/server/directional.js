/**
 * File for all Directional Scan related functions
 */
import logger from '../logger.js';
import { withSpan } from './tracer.js';
import { scansProcessedCounter, scanItemsCount, scanDuration } from './metrics.js';
import { getTypeHierarchyMetadata, getSystemByName } from '../database/sde.js';

const GRID_BUCKETS = {
	ON: 'on_grid',
	OFF: 'off_grid'
};

const UNKNOWN_LABEL = 'Unknown';

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
		const systemNameCounts = new Map();

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

			const candidate = determineSystemName(entry.name, categoryId, groupId);
			if (candidate) {
				systemNameCounts.set(candidate, (systemNameCounts.get(candidate) || 0) + 1);
			}

			const bucketKey = entry.isOnGrid ? GRID_BUCKETS.ON : GRID_BUCKETS.OFF;
			const bucket = buckets[bucketKey];
			accumulateEntry(bucket, entry, resolvedMetadata);
		}

		// Find most common system name
		let systemNameCandidate = null;
		let maxCount = 0;
		let totalCandidates = 0;
		for (const [name, count] of systemNameCounts) {
			totalCandidates += count;
			if (count > maxCount) {
				maxCount = count;
				systemNameCandidate = name;
			}
		}

		span.setAttributes({
			'scan.unique_type_ids': metadataMap.size,
			'scan.missing_type_ids': missingTypes.size,
			'scan.on_grid_objects': buckets[GRID_BUCKETS.ON].totalObjects,
			'scan.off_grid_objects': buckets[GRID_BUCKETS.OFF].totalObjects,
			'scan.system_candidates_count': totalCandidates,
			'scan.unique_system_candidates_count': systemNameCounts.size,
			'scan.system_candidate': systemNameCandidate
		});

		const duration = Date.now() - startTime;
		scanItemsCount.record(parsed.entries.length, { type: 'directional' });
		scanDuration.record(duration / 1000, { type: 'directional' });
		scansProcessedCounter.add(1, { type: 'directional' });

		let systemDetails;
		if (systemNameCandidate) {
			const systemRow = await getSystemByName(systemNameCandidate);
			if (systemRow) {
				systemDetails = {
					id: systemRow.id,
					name: systemRow.name,
					constellation: systemRow.constellation,
					region: systemRow.region,
					security: Number(systemRow.secStatus)
				};
			}
		}

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

		const [typeIdRaw, nameRaw, typeNameRaw, distanceRaw] = parts;
		const typeId = Number(typeIdRaw);
		if (!Number.isFinite(typeId) || typeId <= 0) {
			invalidLines++;
			continue;
		}

		entries.push({
			typeId,
			name: (nameRaw || '').trim() || UNKNOWN_LABEL,
			typeName: (typeNameRaw || '').trim() || UNKNOWN_LABEL,
			distance: (distanceRaw || '').trim(),
			isOnGrid: isOnGrid((distanceRaw || '').trim())
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
			if (typeof line === 'string') return line;
			if (line == null) return '';
			return String(line);
		});
	}

	if (typeof rawData === 'string') {
		return rawData.replace(/\r/g, '').split('\n');
	}

	return [];
}

/**
 * Determines if an object is on grid based on distance string.
 * @param {string} distance
 * @returns {boolean}
 */
function isOnGrid(distance) {
	if (!distance) return false;
	const normalized = distance.toLowerCase();
	if (normalized === '-') return false;
	if (normalized.endsWith('au')) return false;
	if (normalized.endsWith('km')) {
		const numeric = Number(normalized.replace('km', '').trim().replace(/,/g, ''));
		return Number.isFinite(numeric);
	}
	if (normalized.endsWith('m')) {
		const numeric = Number(normalized.replace('m', '').trim().replace(/,/g, ''));
		return Number.isFinite(numeric);
	}
	return false;
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
 * Determines the system name from a scan entry based on its category and group.
 * @param {string} name
 * @param {number|null} categoryId
 * @param {number|null} groupId
 * @returns {string|null}
 */
function determineSystemName(name, categoryId, groupId) {
	if (!name || name === UNKNOWN_LABEL) return null;

	// Category 65: Structure (Player)
	if (categoryId === 65) {
		// Group 1408: Ansiblex Jump Bridge
		if (groupId === 1408) {
			return extractSystemFromAnsiblexName(name);
		}
		return extractSystemFromStructureName(name);
	}

	// Category 3: Station (NPC)
	if (categoryId === 3) {
		return extractSystemFromCelestialName(name);
	}

	// Category 2: Celestial
	if (categoryId === 2) {
		// Group 6: Sun
		if (groupId === 6) {
			return extractSystemFromSunName(name);
		}
		// Group 7: Planet, 8: Moon, 9: Asteroid Belt
		if (groupId === 7 || groupId === 8 || groupId === 9) {
			return extractSystemFromCelestialName(name);
		}
	}

	return null;
}

function extractSystemFromAnsiblexName(name) {
	const delimiter = ' » ';
	const delimiterIndex = name.indexOf(delimiter);
	const candidate = delimiterIndex === -1 ? null : name.slice(0, delimiterIndex).trim();
	return candidate && candidate.length > 0 ? candidate : null;
}

function extractSystemFromStructureName(name) {
	const delimiter = ' - ';
	const delimiterIndex = name.indexOf(delimiter);
	const candidate = delimiterIndex === -1 ? name.trim() : name.slice(0, delimiterIndex).trim();
	return candidate.length > 0 ? candidate : null;
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
