/**
 * All DB functions related to corporations
 */

import { corporations, alliances } from '../database/schema';


export async function getCorporationByID(db, id) {
	return await db
		.select(
			corporations.id,
			corporations.name,
			corporations.ticker,
			corporations.alliance_id,
			alliances.name.as('alliance_name')
		)
		.from(corporations)
		.where(corporations.id.eq(id))
		.leftJoin(alliances, corporations.alliance_id.eq(alliances.id))
		.run();
}

export async function updateCorporation(db, data) {
	return await db
		.update(corporations)
		.set({
			name: data.name,
			ticker: data.ticker,
			alliance_id: data.alliance_id? data.alliance_id : null
		})
		.where(corporations.id.eq(data.id))
		.run();
}

export async function addCorporation(db, data) {
	return await db
		.insert(corporations)
		.values({
			id: data.id,
			name: data.name,
			ticker: data.ticker,
			alliance_id: data.alliance_id? data.alliance_id : null
		})
		.run();
}