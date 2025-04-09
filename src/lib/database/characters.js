/**
 * All DB functions related to characters
 */

import { characters, corporations, alliances } from '../database/schema';
import { eq, inArray } from 'drizzle-orm';

export async function getCharactersByName(cf, names) {
	// make batches of 100 names to query in parallel
	const batchSize = 100;
	const batchPromises = [];

	for (let i = 0; i < names.length; i += batchSize) {
		const batch = names.slice(i, i + batchSize);
		const batchPromise = cf.db
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
			.where(inArray(characters.name, batch))
			.all();

		batchPromises.push(batchPromise);
	}

	const batchResults = await Promise.all(batchPromises);
	return batchResults.flat();
}

export async function addOrUpdateCharactersDB(cf, data) {
	if (!data || data.length === 0) {
		console.warn('Tried to add characters from ESI but characters array was empty');
		return;
	}

	let characterAddOrUpdateBatch = [];
	data.forEach((character) => {
		characterAddOrUpdateBatch.push(
			cf.db
				.insert(characters)
				.values({
					id: character.id,
					name: character.name,
					sec_status: character.sec_status,
					corporation_id: character.corporation_id,
					alliance_id: character.alliance_id ?? null
				})
				.onConflictDoUpdate({
					target: characters.id,
					set: {
						name: character.name,
						sec_status: character.sec_status,
						corporation_id: character.corporation_id,
						alliance_id: character.alliance_id ?? null,
						updated_at: Math.floor(Date.now() / 1000)
					}
				})
		);
	});

	await cf.db.batch(characterAddOrUpdateBatch);
}

export function updateCharactersLastSeen(cf, data) {
	const ids = data.map((char) => char.id);
	cf.db
		.update(characters)
		.set({
			last_seen: Math.floor(Date.now() / 1000)
		})
		.where(inArray(characters.id, ids))
		.run();
}
