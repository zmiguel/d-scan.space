/**
 * All DB functions related to characters
 */

import { characters, corporations, alliances } from '../database/schema';
import { eq, inArray } from 'drizzle-orm';

export async function getCharactersByName(db, names) {
	return await db
		.select({
			id: characters.id,
			name: characters.name,
			corporation_name: corporations.name,
			alliance_name: alliances.name,
			corporation_id: characters.corporation_id,
			alliance_id: characters.alliance_id
		})
		.from(characters)
		.leftJoin(corporations, eq(characters.corporation_id, corporations.id))
		.leftJoin(alliances, eq(characters.alliance_id, alliances.id))
		.where(inArray(characters.name, names))
		.all();
}

export async function addCharacter(db, data){
	return await db
		.insert(characters)
		.values({
			id: data.id,
			name: data.name,
			corporation_id: data.corporation_id,
			alliance_id: data.alliance_id
		})
		.onConflictDoNothing()
		.run();
}