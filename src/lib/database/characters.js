/**
 * All DB functions related to characters
 */

import { players, corporations, alliances } from '../database/schema';

export async function getCharactersByName(db, names) {
	return await db
		.select(
			players.id,
			players.name,
			players.corporation_id,
			players.alliance_id,
			corporations.name.as('corporation_name'),
			alliances.name.as('alliance_name')
		)
		.from(players)
		.where(players.name.in(names))
		.leftJoin(corporations, players.corporation_id.eq(corporations.id))
		.leftJoin(alliances, players.alliance_id.eq(alliances.id))
		.run();
}