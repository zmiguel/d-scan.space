/**
 * Shapes the raw activity rows of the stats page (src/lib/database/stats.js) into
 * gap-free series and the ship mix.
 */
import { SHIP_CATEGORY_ID } from './directional.js';
import { summarizeShips } from './shipClasses.js';

/**
 * One entry per UTC day, oldest first, ending today; days without rows get zeros.
 * @template {Record<string, number>} T
 * @param {Array<{ day: string } & Partial<T>>} rows `day` as YYYY-MM-DD (UTC)
 * @param {number} days
 * @param {T} zero value fields of an empty day
 * @param {Date} [now]
 * @returns {Array<{ day: string } & T>}
 */
export function fillDays(rows, days, zero, now = new Date()) {
	const byDay = new Map(rows.map((row) => [row.day, row]));
	const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
	return Array.from({ length: days }, (_, i) => {
		const day = new Date(today - (days - 1 - i) * 86_400_000).toISOString().slice(0, 10);
		const row = byDay.get(day);
		const values = Object.fromEntries(
			Object.entries(zero).map(([key, value]) => [key, Number(row?.[key] ?? value)])
		);
		return /** @type {{ day: string } & T} */ ({ day, ...values });
	});
}

/**
 * Scans per UTC hour of day, 0–23.
 * @param {Array<{ hour: number | string, scans: number | string }>} rows
 */
export function fillHours(rows) {
	const byHour = new Map(rows.map((row) => [Number(row.hour), Number(row.scans)]));
	return Array.from({ length: 24 }, (_, hour) => ({ hour, scans: byHour.get(hour) ?? 0 }));
}

/**
 * Ship classes seen on d-scan, with their share of all ships.
 * @param {Array<{ id: number | string, name: string, side: 'on' | 'off', total: number | string }>} rows
 *   ship group totals per grid side
 */
export function shipMix(rows) {
	const groups = new Map();
	for (const row of rows) {
		const id = Number(row.id);
		const group = groups.get(id) ?? {
			id,
			name: row.name,
			categoryId: SHIP_CATEGORY_ID,
			on: 0,
			off: 0,
			total: 0
		};
		group[row.side === 'on' ? 'on' : 'off'] += Number(row.total);
		group.total = group.on + group.off;
		groups.set(id, group);
	}
	const ships = summarizeShips([...groups.values()]);
	return {
		total: ships.total,
		classes: ships.classes.map((shipClass) => ({
			key: shipClass.key,
			label: shipClass.label,
			color: shipClass.color,
			total: shipClass.total,
			share: ships.total > 0 ? shipClass.total / ships.total : 0
		}))
	};
}
