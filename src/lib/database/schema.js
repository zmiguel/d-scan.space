import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// SCANS

export const scans = sqliteTable('scans', {
	id: text().primaryKey(),
	data: text().notNull(),
	scan_group_id: text()
		.notNull()
		.references(() => scanGroups.id),
	scan_type: text().notNull(),

	createdAt: text('created_at')
		.default(sql`CURRENT_TIMESTAMP`)
		.notNull()
});

export const scanGroups = sqliteTable('scan_groups', {
	id: text().primaryKey(),
	public: integer().notNull().default(0),
	system: text(),

	createdAt: text('created_at')
		.default(sql`CURRENT_TIMESTAMP`)
		.notNull()
});

// PLAYERS, CORPS & ALLIANCES

export const players = sqliteTable('players', {
	id: integer().primaryKey(),
	name: text().notNull(),
	corporation_id: integer()
		.references(() => corporations.id)
		.notNull(),
	alliance_id: integer().references(() => alliances.id),
	last_seen: text().default(sql`CURRENT_TIMESTAMP`).notNull(),
	created_at: text().default(sql`CURRENT_TIMESTAMP`).notNull(),
	updated_at: text().default(sql`CURRENT_TIMESTAMP`).notNull()
});

export const corporations = sqliteTable('corporations', {
	id: integer().primaryKey(),
	name: text().notNull(),
	ticker: text().notNull(),
	alliance_id: integer().references(() => alliances.id),
	created_at: text().default(sql`CURRENT_TIMESTAMP`).notNull(),
	updated_at: text().default(sql`CURRENT_TIMESTAMP`).notNull()
});

export const alliances = sqliteTable('alliances', {
	id: integer().primaryKey(),
	name: text().notNull(),
	ticker: text().notNull(),
	created_at: text().default(sql`CURRENT_TIMESTAMP`).notNull(),
	updated_at: text().default(sql`CURRENT_TIMESTAMP`).notNull()
});
