/**
 * All DB functions related to characters
 */
import { db } from '$lib/database/client';
import { characters, corporations, alliances } from '../database/schema';
import { eq, inArray, sql } from 'drizzle-orm';

export async function getCharactersByName(names) {

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

}

export async function addOrUpdateCharactersDB(data) {
	if (!data || data.length === 0) {
		console.warn('Tried to add characters from ESI but characters array was empty');
		return;
	}

	const values = data.map(character => ({
		id: character.id,
		name: character.name,
		sec_status: character.sec_status,
		corporation_id: character.corporation_id,
		alliance_id: character.alliance_id ?? null
	}));

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
				updated_at: sql`now()`
			}
		});
}

export function updateCharactersLastSeen(cf, data) {
	db
		.update(characters)
		.set({
			last_seen: Math.floor(Date.now())
		})
		.where(inArray(characters.id, data));
}
