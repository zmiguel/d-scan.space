/**
 * D-scan composition: SDE ship groups → hull classes, ships → fleet roles, and non-ship
 * objects, for the composition bars. Ids are SDE `inv_groups.id` / `inv_types.id` /
 * `inv_categories.id`.
 *
 * Every ship belongs to exactly one class and exactly one role, so both bars add up to the
 * ship total. Ship groups not listed (e.g. added by a future SDE) count as class "Other"
 * and role "DPS".
 *
 * Colour classes are literal strings so Tailwind generates them.
 */
import { SHIP_CATEGORY_ID, getNodeCount, listGroups } from './directional.js';

export const SHIP_CLASSES = [
	{
		key: 'capitals',
		label: 'Capitals',
		// Titan, Supercarrier, Carrier, Dreadnought, Lancer Dreadnought, Force Auxiliary,
		// Capital Industrial Ship (Rorqual), Freighter, Jump Freighter
		groups: [30, 659, 547, 485, 4594, 1538, 883, 513, 902],
		color: 'bg-red-600'
	},
	{
		key: 'battleships',
		label: 'Battleships',
		// Battleship (T1 + navy/pirate faction), Elite Battleship, Black Ops, Marauder
		groups: [27, 381, 898, 900],
		color: 'bg-orange-500'
	},
	{
		key: 'battlecruisers',
		label: 'Battlecruisers',
		// Combat BC, Attack BC, Command Ship, Expedition Command Ship (Odysseus)
		groups: [419, 1201, 540, 4902],
		color: 'bg-yellow-400'
	},
	{
		key: 'cruisers',
		label: 'Cruisers',
		// Cruiser, HAC, Logistics, Force Recon, Combat Recon, HIC, Flag Cruiser (Monitor),
		// Strategic Cruiser
		groups: [26, 358, 832, 833, 906, 894, 1972, 963],
		color: 'bg-green-600'
	},
	{
		key: 'destroyers',
		label: 'Destroyers',
		// Destroyer, Interdictor, Tactical Destroyer, Command Destroyer
		groups: [420, 541, 1305, 1534],
		color: 'bg-teal-500'
	},
	{
		key: 'frigates',
		label: 'Frigates',
		// Frigate, Assault Frigate, Covert Ops, Interceptor, Stealth Bomber, EAF,
		// Expedition Frigate, Logistics Frigate, Prototype Exploration (Zephyr), Citizen Ships,
		// Corvette (rookie ships)
		groups: [25, 324, 830, 831, 834, 893, 1283, 1527, 1022, 2001, 237],
		color: 'bg-sky-500'
	},
	{
		key: 'industrial',
		label: 'Industrial',
		// Hauler, Deep Space Transport, Blockade Runner, Mining Barge, Exhumer,
		// Industrial Command Ship (Orca)
		groups: [28, 380, 1202, 463, 543, 941],
		color: 'bg-indigo-400'
	},
	{ key: 'pods', label: 'Pods', groups: [29], color: 'bg-slate-300' },
	{
		key: 'other',
		label: 'Other',
		// Shuttle + any ship group not listed above
		groups: [31],
		color: 'bg-gray-500'
	}
];

/**
 * Fleet roles, one per ship: a type listed in `types` takes that role, otherwise its group's
 * role; ships in no listed group are DPS. Types override groups because some SDE groups mix
 * roles (the Cruiser group holds T1 logistics and disruption cruisers, the Frigate group
 * T1 logistics/EWAR frigates and mining/exploration frigates).
 */
export const SHIP_ROLES = [
	{ key: 'dps', label: 'DPS', groups: [], types: [], color: 'bg-rose-600' },
	{
		key: 'logistics',
		label: 'Logistics',
		// Logistics cruisers, Logistics Frigates, Force Auxiliaries
		groups: [832, 1527, 1538],
		// T1 logistics cruisers Augoror, Osprey, Exequror, Scythe;
		// T1 logistics frigates Bantam, Burst, Inquisitor, Navitas
		types: [625, 620, 634, 631, 582, 599, 590, 592],
		color: 'bg-emerald-500'
	},
	{
		key: 'command',
		label: 'Command bursts',
		// Command Ships, Command Destroyers, Flag Cruiser (Monitor), Expedition Command Ship
		groups: [540, 1534, 1972, 4902],
		types: [],
		color: 'bg-amber-400'
	},
	{
		key: 'interdiction',
		label: 'Interdiction',
		// Interdictors, Heavy Interdiction Cruisers
		groups: [541, 894],
		types: [],
		color: 'bg-sky-500'
	},
	{
		key: 'ewar',
		label: 'Recon & EWAR',
		// Force Recons, Combat Recons, Electronic Attack Ships
		groups: [833, 906, 893],
		// T1 EWAR frigates Crucifier, Griffin, Maulus, Vigil;
		// T1 disruption cruisers Arbitrator, Blackbird, Celestis, Bellicose
		types: [2161, 584, 609, 3766, 628, 632, 633, 630],
		color: 'bg-violet-500'
	},
	{ key: 'bombers', label: 'Bombers', groups: [834], types: [], color: 'bg-orange-500' },
	{
		key: 'non-combat',
		label: 'Non-combat',
		// Industrial class, Rorqual, Freighters, Jump Freighters, Capsules, Shuttles,
		// rookie ships, Covert Ops (scanning), Expedition Frigates, Zephyr, Citizen Ships
		groups: [28, 380, 1202, 463, 543, 941, 883, 513, 902, 29, 31, 237, 830, 1283, 1022, 2001],
		// Mining/exploration frigates Venture, Heron, Imicus, Magnate, Probe
		types: [32880, 605, 607, 29248, 586],
		color: 'bg-gray-400'
	}
];

/** Non-ship d-scan content. Celestials and NPC stations are left out. */
export const OBJECT_CLASSES = [
	{ key: 'drones', label: 'Drones', categories: [18], color: 'bg-emerald-500' },
	{ key: 'fighters', label: 'Fighters', categories: [87], color: 'bg-rose-500' },
	{
		key: 'structures',
		label: 'Structures',
		// Upwell structures, sovereignty structures, orbitals (skyhooks, customs offices)
		categories: [65, 40, 46],
		color: 'bg-violet-500'
	},
	{ key: 'starbases', label: 'Starbases', categories: [23], color: 'bg-purple-400' },
	{ key: 'deployables', label: 'Deployables', categories: [22], color: 'bg-cyan-500' },
	{ key: 'charges', label: 'Probes & charges', categories: [8], color: 'bg-stone-400' },
	{ key: 'wrecks', label: 'Wrecks', groups: [186], color: 'bg-neutral-500' }
];

const OTHER_SHIP_CLASS = SHIP_CLASSES.find((shipClass) => shipClass.key === 'other');
const SHIP_CLASS_BY_GROUP = new Map(
	SHIP_CLASSES.flatMap((shipClass) => shipClass.groups.map((id) => [id, shipClass]))
);
const DPS_ROLE = SHIP_ROLES.find((role) => role.key === 'dps');
const ROLE_BY_GROUP = new Map(SHIP_ROLES.flatMap((role) => role.groups.map((id) => [id, role])));
const ROLE_BY_TYPE = new Map(SHIP_ROLES.flatMap((role) => role.types.map((id) => [id, role])));

/** Role of a ship type in a ship group. */
export const shipRole = (groupId, typeId) =>
	ROLE_BY_TYPE.get(Number(typeId)) ?? ROLE_BY_GROUP.get(Number(groupId)) ?? DPS_ROLE;

/**
 * @typedef {{ id: number, name: string, categoryId: number | string, on: number, off: number, total: number }} GroupStat
 * @typedef {{ groups?: string[], types?: number[] }} HighlightTarget group names / type ids
 *   handed to GroupHighlight
 * @typedef {{ key: string, label: string, color?: string, on: number, off: number, total: number, target: HighlightTarget }} Bucket
 */

/** @returns {Bucket} */
const emptyBucket = ({ key, label, color }, target) => ({
	key,
	label,
	color,
	on: 0,
	off: 0,
	total: 0,
	target
});

function addCounts(bucket, counts) {
	bucket.on += counts.on;
	bucket.off += counts.off;
	bucket.total += counts.total;
}

const isShipGroup = (group) => Number(group.categoryId) === SHIP_CATEGORY_ID;
const totals = (buckets) =>
	buckets.reduce(
		(sum, bucket) => ({
			on: sum.on + bucket.on,
			off: sum.off + bucket.off,
			total: sum.total + bucket.total
		}),
		{ on: 0, off: 0, total: 0 }
	);

/**
 * Ship classes present in the scan, in SHIP_CLASSES order.
 * @param {GroupStat[]} groupStats from buildGroupStats
 */
export function summarizeShips(groupStats) {
	const buckets = new Map(
		SHIP_CLASSES.map((shipClass) => [shipClass.key, emptyBucket(shipClass, { groups: [] })])
	);
	for (const group of groupStats) {
		if (!isShipGroup(group)) continue;
		const bucket = buckets.get((SHIP_CLASS_BY_GROUP.get(Number(group.id)) ?? OTHER_SHIP_CLASS).key);
		addCounts(bucket, group);
		bucket.target.groups.push(group.name);
	}
	const classes = [...buckets.values()].filter((bucket) => bucket.total > 0);
	return { ...totals(classes), classes };
}

/**
 * On/off-grid count per ship type, with its group id.
 * @param {any} onGrid d-scan `on_grid` section
 * @param {any} offGrid d-scan `off_grid` section
 */
function shipTypeCounts(onGrid, offGrid) {
	const types = new Map();
	const add = (section, side) => {
		for (const category of listGroups(section)) {
			if (Number(category?.id) !== SHIP_CATEGORY_ID) continue;
			for (const group of category.objects ?? []) {
				for (const type of group?.objects ?? []) {
					const count = getNodeCount(type);
					if (count <= 0) continue;
					const entry = types.get(type.id) ?? {
						id: type.id,
						groupId: group.id,
						on: 0,
						off: 0,
						total: 0
					};
					entry[side] += count;
					entry.total += count;
					types.set(type.id, entry);
				}
			}
		}
	};
	add(onGrid, 'on');
	add(offGrid, 'off');
	return [...types.values()];
}

/**
 * Ships per fleet role (SHIP_ROLES order, non-combat last); adds up to the ship total.
 * @param {any} onGrid d-scan `on_grid` section
 * @param {any} offGrid d-scan `off_grid` section
 */
export function summarizeRoles(onGrid, offGrid) {
	const buckets = new Map(SHIP_ROLES.map((role) => [role.key, emptyBucket(role, { types: [] })]));
	for (const type of shipTypeCounts(onGrid, offGrid)) {
		const bucket = buckets.get(shipRole(type.groupId, type.id).key);
		addCounts(bucket, type);
		bucket.target.types.push(type.id);
	}
	const roles = [...buckets.values()].filter((bucket) => bucket.total > 0);
	return { ...totals(roles), roles };
}

/**
 * Non-ship object classes present in the scan.
 * @param {GroupStat[]} groupStats
 */
export function summarizeObjects(groupStats) {
	const classes = OBJECT_CLASSES.map((objectClass) => {
		const bucket = emptyBucket(objectClass, { groups: [] });
		for (const group of groupStats) {
			const matches = objectClass.groups
				? objectClass.groups.includes(Number(group.id))
				: objectClass.categories.includes(Number(group.categoryId));
			if (!matches) continue;
			addCounts(bucket, group);
			bucket.target.groups.push(group.name);
		}
		return bucket;
	}).filter((bucket) => bucket.total > 0);
	return { ...totals(classes), classes };
}
