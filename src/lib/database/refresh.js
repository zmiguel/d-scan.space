/**
 * Selection of characters/corporations/alliances due for an ESI refresh by the updater.
 *
 * A row is due when it was last refreshed more than REFRESH_AFTER ago, was seen in a
 * scan within SEEN_WITHIN, and was not already attempted within RETRY_AFTER. Claiming
 * sets `refresh_attempted_at` in the same statement (`FOR UPDATE SKIP LOCKED`), so:
 * - rows whose refresh fails (ESI error, missing corporation, ...) are not picked first
 *   again on every run; they wait RETRY_AFTER,
 * - concurrent updaters never claim the same rows.
 * A successful refresh bumps `updated_at`, which takes the row out of the due set.
 */
import { and, asc, gt, inArray, isNull, lt, or, sql } from 'drizzle-orm';
import { db } from './client.js';

export const REFRESH_AFTER = '23 hours 30 minutes';
export const RETRY_AFTER = '1 hour';
export const SEEN_WITHIN = '1 year';

/**
 * @param {any} table characters | corporations | alliances (needs id, updated_at,
 *   last_seen, refresh_attempted_at)
 * @param {number} limit
 * @param {import('drizzle-orm').SQL} [extraCondition]
 * @returns {Promise<any[]>} claimed rows (all columns)
 */
export async function claimDueRows(table, limit, extraCondition) {
	const due = db
		.select({ id: table.id })
		.from(table)
		.where(
			and(
				lt(table.updated_at, sql`now() - ${sql.raw(`interval '${REFRESH_AFTER}'`)}`),
				gt(table.last_seen, sql`now() - ${sql.raw(`interval '${SEEN_WITHIN}'`)}`),
				or(
					isNull(table.refresh_attempted_at),
					lt(table.refresh_attempted_at, sql`now() - ${sql.raw(`interval '${RETRY_AFTER}'`)}`)
				),
				extraCondition
			)
		)
		.orderBy(asc(table.updated_at))
		.limit(limit)
		.for('update', { skipLocked: true });

	return db
		.update(table)
		.set({ refresh_attempted_at: sql`now()` })
		.where(inArray(table.id, due))
		.returning();
}
