/**
 * All DB functions related to characters
 */

import { characters, corporations, alliances } from '../database/schema';

export async function getCharactersByName(db, names) {
	return await db
		.select(
			characters.id,
			characters.name,
			characters.corporation_id,
			characters.alliance_id,
			corporations.name.as('corporation_name'),
			alliances.name.as('alliance_name')
		)
		.from(characters)
		.where(characters.name.in(names))
		.leftJoin(corporations, characters.corporation_id.eq(corporations.id))
		.leftJoin(alliances, characters.alliance_id.eq(alliances.id))
		.run();
}