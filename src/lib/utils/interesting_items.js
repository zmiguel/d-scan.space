import { SvelteMap } from 'svelte/reactivity';
import { getNodeCount, listGroups } from './directional.js';

export const INTERESTING_RULES = [
	// Ship Groups
	{ id: 25, min_count: 25, min_percent: 20 }, //		T1			Frigates
	{ id: 26, min_count: 25, min_percent: 20 }, //		T1			Cruiser
	{ id: 27, min_count: 20, min_percent: 10 }, //		T1			Battleships
	{ id: 30, min_count: 1, min_percent: null }, //		Cap			Titans
	{ id: 324, min_count: 5, min_percent: 10 }, //		T2			Assault Frigates
	{ id: 358, min_count: 10, min_percent: 10 }, //		T2			Heavy Assault Cruisers
	{ id: 419, min_count: 10, min_percent: 10 }, //		T1			Combat Battlecruisers
	{ id: 420, min_count: 10, min_percent: 20 }, //		T1			Destroyers
	{ id: 463, min_count: 5, min_percent: 10 }, //		T1			Mining Barges
	{ id: 485, min_count: 1, min_percent: 1 }, //		Cap			Dreads
	{ id: 513, min_count: 1, min_percent: null }, //	Cap			Freighters
	{ id: 540, min_count: 1, min_percent: 5 }, //		T2			Command Ships
	{ id: 541, min_count: 1, min_percent: 5 }, //		T2			Interdictors
	{ id: 543, min_count: 5, min_percent: 10 }, //		T2			Exhumer
	{ id: 547, min_count: 1, min_percent: 1 }, //		Cap			Carrier
	{ id: 659, min_count: 1, min_percent: null }, //	Cap			Super carriers
	{ id: 830, min_count: 20, min_percent: 10 }, //		T2			Covert Ops
	{ id: 831, min_count: 15, min_percent: 20 }, //		T2			Interceptor
	{ id: 832, min_count: 5, min_percent: 5 }, //		T2			Logistics
	{ id: 833, min_count: 5, min_percent: 10 }, //		T2			Force Recon Ship
	{ id: 834, min_count: 5, min_percent: 10 }, //		T2			Stealth Bomber
	{ id: 883, min_count: 1, min_percent: 1 }, //		Cap			Capital Industrial Ship
	{ id: 893, min_count: 5, min_percent: 10 }, //		T2			Electronic Attack Ship
	{ id: 894, min_count: 1, min_percent: 5 }, //		T2			Heavy Interdictor Cruiser
	{ id: 898, min_count: 5, min_percent: 2 }, //		T2			Black Ops
	{ id: 900, min_count: 5, min_percent: 5 }, //		T2			Marauder
	{ id: 902, min_count: 1, min_percent: null }, //	Cap			Jump Freighters
	{ id: 941, min_count: 1, min_percent: 2 }, //		T1			Industrial Command Ship
	{ id: 963, min_count: 5, min_percent: 5 }, //		T3			Strategic Cruiser
	{ id: 1022, min_count: 1, min_percent: null }, //	Special		Prototype Exploration Ship
	{ id: 1201, min_count: 10, min_percent: 10 }, //	T2			Attack Battlecruiser
	{ id: 1283, min_count: 25, min_percent: 20 }, //	T2			Expedition Frigate
	{ id: 1305, min_count: 5, min_percent: 10 }, //		T3			Tactical Destroyer
	{ id: 1527, min_count: 3, min_percent: 5 }, //		T2			Logistics Frigate
	{ id: 1534, min_count: 5, min_percent: 5 }, //		T2			Command Destroyer
	{ id: 1538, min_count: 1, min_percent: 1 }, //		Cap			Force Auxiliary
	{ id: 1972, min_count: 1, min_percent: null }, //	Special		Flag Cruisers
	{ id: 2001, min_count: 1, min_percent: null }, //	Special		Citizen Ships
	{ id: 4594, min_count: 1, min_percent: null }, //	T2			Lancer Dreadnought
	{ id: 4902, min_count: 1, min_percent: null }, //	T1			Expedition Command Ship
	// Individual Ship Types
	{ id: 615, min_count: 1, min_percent: null }, //	Special		Immolator
	{ id: 617, min_count: 1, min_percent: null }, //	Special		Echo
	{ id: 635, min_count: 1, min_percent: null }, //	Special		Opux Luxury Yacht
	{ id: 2078, min_count: 1, min_percent: null }, //	Special		Zephyr
	{ id: 2834, min_count: 1, min_percent: null }, //	AT			Utu
	{ id: 2836, min_count: 1, min_percent: null }, //	AT			Adrestia
	{ id: 3516, min_count: 1, min_percent: null }, //	AT			Malice
	{ id: 3518, min_count: 1, min_percent: null }, //	AT			Vangel
	{ id: 3532, min_count: 1, min_percent: null }, //	Special		Echelon
	{ id: 4005, min_count: 1, min_percent: null }, //	Special		Scorpion Ishukone Watch
	{ id: 4363, min_count: 1, min_percent: null }, //	Special		Miasmos Quafe Ultra Edition
	{ id: 4388, min_count: 1, min_percent: null }, //	Special		Miasmos Quafe Ultramarine Edition
	{ id: 11011, min_count: 1, min_percent: null }, //	Special		Guardian-Vexor
	{ id: 11936, min_count: 1, min_percent: null }, //	Special		Apocalypse Imperial Issue
	{ id: 11938, min_count: 1, min_percent: null }, //	Special		Armageddon Imperial Issue
	{ id: 11940, min_count: 1, min_percent: null }, //	Special		Gold Magnate
	{ id: 11942, min_count: 1, min_percent: null }, //	Special		Silver Magnate
	{ id: 13202, min_count: 1, min_percent: null }, //	Special		Megathron Federate Issue
	{ id: 21097, min_count: 1, min_percent: null }, //	Special		Goru's Shuttle
	{ id: 21628, min_count: 1, min_percent: null }, //	Special		Guristas Shuttle
	{ id: 26840, min_count: 1, min_percent: null }, //	Special		Raven State Issue
	{ id: 26842, min_count: 1, min_percent: null }, //	AT			Tempest Tribal Issue
	{ id: 30842, min_count: 1, min_percent: null }, //	Special		InterBus Shuttle
	{ id: 32207, min_count: 1, min_percent: null }, //	AT 			Freki
	{ id: 32209, min_count: 1, min_percent: null }, //	AT			Mimir
	{ id: 32788, min_count: 1, min_percent: null }, //	AT			Cambion
	{ id: 32790, min_count: 1, min_percent: null }, //	AT			Etana
	{ id: 32811, min_count: 1, min_percent: null }, //	Special		Miasmos Amastris Edition
	{ id: 32840, min_count: 1, min_percent: null }, //	Special		InterBus Catalyst
	{ id: 32842, min_count: 1, min_percent: null }, //	Special		Intaki Syndicate Catalyst
	{ id: 32844, min_count: 1, min_percent: null }, //	Special		Inner Zone Shipping Catalyst
	{ id: 32846, min_count: 1, min_percent: null }, //	Special		Quafe Catalyst
	{ id: 32848, min_count: 1, min_percent: null }, //	Special		Aliastra Catalyst
	{ id: 32983, min_count: 1, min_percent: null }, //	Special		Sukuuvestaa Heron
	{ id: 32985, min_count: 1, min_percent: null }, //	Special		Inner Zone Shipping Imicus
	{ id: 32987, min_count: 1, min_percent: null }, //	Special		Sarum Magnate
	{ id: 32989, min_count: 1, min_percent: null }, //	Special		Vherokior Probe
	{ id: 33079, min_count: 1, min_percent: null }, //	Special		Hematos
	{ id: 33081, min_count: 1, min_percent: null }, //	Special		Taipan
	{ id: 33083, min_count: 1, min_percent: null }, //	Special		Violator
	{ id: 33099, min_count: 1, min_percent: null }, //	Special		Nefantar Thrasher
	{ id: 33395, min_count: 1, min_percent: null }, //	AT			Moracha
	{ id: 33397, min_count: 1, min_percent: null }, //	AT			Chremoas
	{ id: 33513, min_count: 1, min_percent: null }, //	Special		Leopard
	{ id: 33553, min_count: 1, min_percent: null }, //	Special		Stratios Emergency Responder
	{ id: 33673, min_count: 1, min_percent: null }, //	AT			Whiptail
	{ id: 33675, min_count: 1, min_percent: null }, //	AT			Chameleon
	{ id: 34496, min_count: 1, min_percent: null }, //	Special		Council Diplomatic Shuttle
	{ id: 34590, min_count: 1, min_percent: null }, //	Special		Victorieux Luxury Yacht
	{ id: 35779, min_count: 1, min_percent: null }, //	AT			Imp
	{ id: 35781, min_count: 1, min_percent: null }, //	AT			Fiend
	{ id: 42245, min_count: 1, min_percent: null }, //	AT			Rabisu
	{ id: 42246, min_count: 1, min_percent: null }, //	AT			Caedes
	{ id: 60764, min_count: 1, min_percent: null }, //	AT			Laelaps
	{ id: 60765, min_count: 1, min_percent: null }, //	AT			Raiju
	{ id: 64034, min_count: 1, min_percent: null }, //	Special		Boobook
	{ id: 74141, min_count: 1, min_percent: null }, //	AT			Geri
	{ id: 74316, min_count: 1, min_percent: null } //	AT			Bestla
];

function toNumber(value) {
	if (value === null || value === undefined) return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function normalizeRules(rules) {
	if (!Array.isArray(rules) || rules.length === 0) return [];

	const normalized = [];
	for (const rule of rules) {
		if (typeof rule === 'number') {
			const id = toNumber(rule);
			if (id === null) continue;
			normalized.push({ id, min_count: 1, min_percent: null });
			continue;
		}

		if (!rule || typeof rule !== 'object') continue;
		const id = toNumber(rule.id);
		if (id === null) continue;

		normalized.push({
			id,
			min_count: toNumber(rule.min_count),
			min_percent: toNumber(rule.min_percent)
		});
	}

	return normalized;
}

function rulePasses(totalCount, grandTotal, rule) {
	const minCount = toNumber(rule.min_count);
	const minPercent = toNumber(rule.min_percent);

	const hasMinCount = minCount !== null && minCount > 0;
	const hasMinPercent = minPercent !== null && minPercent > 0;

	const countOk = hasMinCount ? totalCount >= minCount : false;
	const percentOk =
		hasMinPercent && grandTotal > 0 ? (totalCount / grandTotal) * 100 >= minPercent : false;

	if (hasMinCount && hasMinPercent) return countOk && percentOk;
	if (hasMinCount) return countOk;
	if (hasMinPercent) return percentOk;
	return false;
}

function collectTotals(section, location, state) {
	const visit = (node, groupInfo) => {
		if (!node || typeof node !== 'object') return;

		if (Array.isArray(node.objects) && node.objects.length > 0) {
			const childHasObjects = node.objects.some((child) => Array.isArray(child?.objects));
			const nextGroupInfo = childHasObjects
				? groupInfo
				: {
						id: node.id,
						name: node.name
					};
			node.objects.forEach((child) => visit(child, nextGroupInfo));
			return;
		}

		const count = getNodeCount(node);
		if (count <= 0) return;

		state.total += count;

		const groupId = groupInfo?.id ?? null;
		const groupName = groupInfo?.name ?? null;

		const typeEntry = state.types.get(node.id) ?? {
			id: node.id,
			name: node.name,
			groupId,
			group: groupName,
			on: 0,
			off: 0,
			total: 0
		};

		if (location === 'on') typeEntry.on += count;
		if (location === 'off') typeEntry.off += count;
		typeEntry.total = typeEntry.on + typeEntry.off;
		state.types.set(node.id, typeEntry);

		if (groupId !== null) {
			const groupEntry = state.groups.get(groupId) ?? {
				id: groupId,
				name: groupName,
				on: 0,
				off: 0,
				total: 0
			};

			if (location === 'on') groupEntry.on += count;
			if (location === 'off') groupEntry.off += count;
			groupEntry.total = groupEntry.on + groupEntry.off;
			state.groups.set(groupId, groupEntry);
		}
	};

	listGroups(section).forEach((node) => visit(node, null));
}

/**
 * Builds the list of interesting leaf items for a directional scan.
 *
 * Rules are evaluated with type-id priority over group-id:
 * - If a leaf typeId has a rule, that rule decides whether it's interesting.
 * - Otherwise, if its parent groupId has a rule, the group rule decides.
 *
 * An item is interesting if:
 * - both `min_count` and `min_percent` pass when both are provided, or
 * - the single provided threshold passes.
 * - `min_count`: minimum count (type or group total)
 * - `min_percent`: minimum percentage of total scan items (on+off), in percent points (e.g. 1 == 1%)
 */
export function buildInterestingItems(onGrid, offGrid, interestingIds = INTERESTING_RULES) {
	const rules = normalizeRules(interestingIds ?? INTERESTING_RULES);
	if (rules.length === 0) return [];

	const ruleById = new Map();
	for (const rule of rules) ruleById.set(rule.id, rule);

	const state = {
		total: 0,
		types: new SvelteMap(),
		groups: new SvelteMap()
	};

	collectTotals(onGrid, 'on', state);
	collectTotals(offGrid, 'off', state);

	const interesting = [];
	for (const typeEntry of state.types.values()) {
		const typeRule = ruleById.get(typeEntry.id) ?? null;
		const groupRule = typeEntry.groupId !== null ? (ruleById.get(typeEntry.groupId) ?? null) : null;

		let isInteresting = false;
		if (typeRule) {
			isInteresting = rulePasses(typeEntry.total, state.total, typeRule);
		} else if (groupRule) {
			const groupTotal = state.groups.get(typeEntry.groupId).total;
			isInteresting = rulePasses(groupTotal, state.total, groupRule);
		}

		if (!isInteresting) continue;

		interesting.push({
			id: typeEntry.id,
			name: typeEntry.name,
			group: typeEntry.group ?? null,
			on: typeEntry.on,
			off: typeEntry.off,
			total: typeEntry.total
		});
	}

	return interesting.sort((a, b) => {
		const totalDiff = b.total - a.total;
		if (totalDiff !== 0) return totalDiff;
		return (a.name ?? '').localeCompare(b.name ?? '');
	});
}
