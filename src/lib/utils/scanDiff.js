/**
 * Differences between two scans of the same type (compare page). Pure functions over the
 * stored scan `data`; the server computes the diff so the browser never receives two full
 * scans.
 */
import { buildGroupStats, collectAllLeaves } from './directional.js';
import { buildInterestingItems } from './interesting_items.js';
import { summarizeObjects, summarizeShips } from './shipClasses.js';

/** @typedef {{ on: number, off: number, total: number }} Counts */

const emptyCounts = () => ({ on: 0, off: 0, total: 0 });
const byChange = (a, b) =>
	Math.abs(b.delta) - Math.abs(a.delta) ||
	b.after.total - a.after.total ||
	String(a.name ?? '').localeCompare(String(b.name ?? ''));

/** @param {Counts} before @param {Counts} after */
function status(before, after) {
	if (before.total === 0) return 'new';
	if (after.total === 0) return 'gone';
	if (before.on !== after.on || before.off !== after.off) return 'changed';
	return 'same';
}

/**
 * Merges per-side lists keyed by `key` into rows with before/after counts and a delta.
 * @template T
 * @param {T[]} beforeList
 * @param {T[]} afterList
 * @param {(item: T) => string | number} key
 * @param {(item: T) => object} describe identifying fields of a row
 */
function mergeCounts(beforeList, afterList, key, describe) {
	const rows = new Map();
	const add = (list, side) => {
		for (const item of list) {
			const id = key(item);
			const row = rows.get(id) ?? {
				...describe(item),
				before: emptyCounts(),
				after: emptyCounts()
			};
			row[side].on += item.on;
			row[side].off += item.off;
			row[side].total += item.total;
			rows.set(id, row);
		}
	};
	add(beforeList, 'before');
	add(afterList, 'after');
	return [...rows.values()].map((row) => ({
		...row,
		delta: row.after.total - row.before.total,
		status: status(row.before, row.after),
		gridMoved: gridMoved(row.before, row.after)
	}));
}

/**
 * Objects that (at least) switched between on- and off-grid: only when one side grew while
 * the other shrank; growing on both sides is arrivals, not a move.
 * @param {Counts} before @param {Counts} after
 */
function gridMoved(before, after) {
	const onChange = after.on - before.on;
	const offChange = after.off - before.off;
	return Math.sign(onChange) * Math.sign(offChange) < 0
		? Math.min(Math.abs(onChange), Math.abs(offChange))
		: 0;
}

/** Per-type on/off counts of a directional scan. */
function typeCounts(data) {
	const types = new Map();
	for (const [section, side] of [
		[data?.on_grid, 'on'],
		[data?.off_grid, 'off']
	]) {
		for (const leaf of collectAllLeaves(section)) {
			const entry = types.get(leaf.id) ?? {
				id: leaf.id,
				name: leaf.name,
				group: leaf.group,
				category: leaf.category,
				on: 0,
				off: 0,
				total: 0
			};
			entry[side] += leaf.count;
			entry.total += leaf.count;
			types.set(leaf.id, entry);
		}
	}
	return [...types.values()];
}

/**
 * @param {any} before directional scan data (`{ on_grid, off_grid }`), the older scan
 * @param {any} after directional scan data, the newer scan
 */
export function diffDirectional(before, after) {
	const groupsBefore = buildGroupStats(before?.on_grid, before?.off_grid);
	const groupsAfter = buildGroupStats(after?.on_grid, after?.off_grid);

	const types = mergeCounts(
		typeCounts(before),
		typeCounts(after),
		(t) => t.id,
		(t) => ({
			id: t.id,
			name: t.name,
			group: t.group,
			category: t.category
		})
	).sort(byChange);

	const groups = mergeCounts(
		groupsBefore,
		groupsAfter,
		(g) => g.id,
		(g) => ({
			id: g.id,
			name: g.name,
			categoryId: g.categoryId
		})
	).sort(byChange);

	const bucketRows = (beforeBuckets, afterBuckets, order) =>
		mergeCounts(
			beforeBuckets,
			afterBuckets,
			(b) => b.key,
			(b) => ({
				key: b.key,
				label: b.label,
				color: b.color
			})
		).sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));

	const shipsBefore = summarizeShips(groupsBefore);
	const shipsAfter = summarizeShips(groupsAfter);
	const shipOrder = [...shipsBefore.classes, ...shipsAfter.classes].map((c) => c.key);
	const objectsBefore = summarizeObjects(groupsBefore);
	const objectsAfter = summarizeObjects(groupsAfter);
	const objectOrder = [...objectsBefore.classes, ...objectsAfter.classes].map((c) => c.key);

	// Types that are "interesting" in either scan and changed in count.
	const interestingIds = new Set(
		[
			...buildInterestingItems(before?.on_grid, before?.off_grid),
			...buildInterestingItems(after?.on_grid, after?.off_grid)
		].map((item) => item.id)
	);
	const notable = types.filter((t) => interestingIds.has(t.id) && t.delta !== 0);

	const total = (list) => list.reduce((sum, t) => sum + t.total, 0);
	return {
		totals: {
			before: total(typeCounts(before)),
			after: total(typeCounts(after)),
			shipsBefore: shipsBefore.total,
			shipsAfter: shipsAfter.total
		},
		shipClasses: bucketRows(shipsBefore.classes, shipsAfter.classes, shipOrder),
		objectClasses: bucketRows(objectsBefore.classes, objectsAfter.classes, objectOrder),
		notable,
		groups,
		types
	};
}

/** Pilots of a local scan with their corporation and alliance. */
function localPilots(data) {
	const pilots = new Map();
	for (const alliance of data?.alliances ?? []) {
		const allianceInfo = alliance?.ticker
			? { id: alliance.id, name: alliance.name, ticker: alliance.ticker }
			: null;
		for (const corp of alliance?.corporations ?? []) {
			const corpInfo = { id: corp.id, name: corp.name, ticker: corp.ticker };
			for (const pilot of corp?.characters ?? []) {
				pilots.set(pilot.id, {
					id: pilot.id,
					name: pilot.name,
					corp: corpInfo,
					alliance: allianceInfo
				});
			}
		}
	}
	return pilots;
}

const allianceKey = (alliance) => (alliance ? String(alliance.id) : 'none');
const byName = (a, b) => String(a.name ?? '').localeCompare(String(b.name ?? ''));
const toListEntry = (pilot) => ({
	id: pilot.id,
	name: pilot.name,
	corpTicker: pilot.corp.ticker,
	allianceTicker: pilot.alliance?.ticker ?? null
});

/**
 * @param {any} before local scan data (`{ alliances: [...] }`), the older scan
 * @param {any} after local scan data, the newer scan
 */
export function diffLocal(before, after) {
	const pilotsBefore = localPilots(before);
	const pilotsAfter = localPilots(after);

	const arrived = [...pilotsAfter.values()].filter((p) => !pilotsBefore.has(p.id));
	const left = [...pilotsBefore.values()].filter((p) => !pilotsAfter.has(p.id));
	const stayed = [...pilotsAfter.values()].filter((p) => pilotsBefore.has(p.id));
	const moved = stayed
		.map((p) => ({ now: p, then: pilotsBefore.get(p.id) }))
		.filter(
			({ now, then }) =>
				now.corp.id !== then.corp.id || allianceKey(now.alliance) !== allianceKey(then.alliance)
		);

	// alliance -> corporation counts on both sides
	const alliances = new Map();
	const count = (pilots, side) => {
		for (const pilot of pilots.values()) {
			const aKey = allianceKey(pilot.alliance);
			const alliance = alliances.get(aKey) ?? {
				id: pilot.alliance?.id ?? null,
				name: pilot.alliance?.name ?? 'No Alliance',
				ticker: pilot.alliance?.ticker ?? null,
				before: 0,
				after: 0,
				corps: new Map()
			};
			alliance[side]++;
			const corp = alliance.corps.get(pilot.corp.id) ?? {
				id: pilot.corp.id,
				name: pilot.corp.name,
				ticker: pilot.corp.ticker,
				before: 0,
				after: 0
			};
			corp[side]++;
			alliance.corps.set(pilot.corp.id, corp);
			alliances.set(aKey, alliance);
		}
	};
	count(pilotsBefore, 'before');
	count(pilotsAfter, 'after');

	const withDelta = (row) => ({ ...row, delta: row.after - row.before });
	const byLocalChange = (a, b) =>
		Math.abs(b.delta) - Math.abs(a.delta) || b.after - a.after || byName(a, b);

	return {
		totals: {
			before: pilotsBefore.size,
			after: pilotsAfter.size,
			arrived: arrived.length,
			left: left.length,
			stayed: stayed.length,
			moved: moved.length
		},
		alliances: [...alliances.values()]
			.map((alliance) => ({
				...withDelta(alliance),
				corps: [...alliance.corps.values()].map(withDelta).sort(byLocalChange)
			}))
			.sort(byLocalChange),
		arrived: arrived.map(toListEntry).sort(byName),
		left: left.map(toListEntry).sort(byName),
		moved: moved
			.map(({ now, then }) => ({
				id: now.id,
				name: now.name,
				from: { corpTicker: then.corp.ticker, allianceTicker: then.alliance?.ticker ?? null },
				to: { corpTicker: now.corp.ticker, allianceTicker: now.alliance?.ticker ?? null }
			}))
			.sort(byName)
	};
}
