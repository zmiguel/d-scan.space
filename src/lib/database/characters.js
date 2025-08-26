/**
 * All DB functions related to characters
 */
import { db } from '$lib/database/client';
import logger from '$lib/logger';
import { withSpan } from '$lib/server/tracer';
import { characters, corporations, alliances } from '../database/schema';
import { asc, eq, inArray, sql, and, lt, gt } from 'drizzle-orm';

export async function getCharactersByName(names) {
	return await withSpan('getCharactersByName', async () => {
		return db
			.select({
				id: characters.id,
				name: characters.name,
				sec_status: characters.sec_status,
				corporation_name: corporations.name,
				corporation_ticker: corporations.ticker,
				corporation_id: characters.corporation_id,
				alliance_name: alliances.name,
				alliance_ticker: alliances.ticker,
				alliance_id: characters.alliance_id,
				last_seen: characters.last_seen,
				updated_at: characters.updated_at
			})
			.from(characters)
			.leftJoin(corporations, eq(characters.corporation_id, corporations.id))
			.leftJoin(alliances, eq(characters.alliance_id, alliances.id))
			.where(inArray(characters.name, names));
	}, {
		'db.characters.get_by_name': names.length
	});
}

export async function getAllCharacters() {
	return db.select().from(characters);
}

export async function addOrUpdateCharactersDB(data) {
	await withSpan('addOrUpdateCharactersDB', async (span) => {
		if (!data || data.length === 0) {
			logger.warn('Tried to add characters from ESI but characters array was empty');
			return;
		}

		const values = data.map((character) => ({
			id: character.id,
			name: character.name,
			sec_status: character.security_status,
			corporation_id: character.corporation_id,
			alliance_id: character.alliance_id ?? null
		}));

		span.setAttributes({
			'db.characters.insert': values.length
		});

		await db
			.insert(characters)
			.values(values)
			.onConflictDoUpdate({
				target: characters.id,
				set: {
					name: sql`excluded.name`,
					sec_status: sql`excluded.sec_status`,
					corporation_id: sql`excluded.corporation_id`,
					alliance_id: sql`excluded.alliance_id`,
					updated_at: sql`now()`,
					last_seen: sql`now()`
				}
			});
	});
}

export function updateCharactersLastSeen(data) {
	db.update(characters)
		.set({
			last_seen: new Date()
		})
		.where(inArray(characters.id, data));
}

export async function getLeastRecentlyUpdatedCharacters(limit) {
	// this is used to find characters that haven't been updated in 23.5h
	// but we only care about the characters seen in the last 1 year
	return await withSpan('getLeastRecentlyUpdatedCharacters', async () => {
		return await db
			.select()
			.from(characters)
			.where(
				and(
					lt(characters.updated_at, sql`now() - interval '23 hours 30 minutes'`),
					gt(characters.last_seen, sql`now() - interval '1 year'`)
				)
			)
			.orderBy(asc(characters.updated_at))
			.limit(limit);
	});
}
