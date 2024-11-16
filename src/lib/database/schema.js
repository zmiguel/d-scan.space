import { sql } from 'drizzle-orm';
import { integer, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

// SCANS

export const scans = sqliteTable('scans', {
	id: text().primaryKey(),
	data: text().notNull(),
	scan_group_id: text()
		.notNull()
		.references(() => scanGroups.id),
	scan_type: text().notNull(),

	created_at: integer()
		.default(sql`(unixepoch())`)
		.notNull()
});

export const scanGroups = sqliteTable('scan_groups', {
	id: text().primaryKey(),
	public: integer().notNull().default(0),
	system: text(),

	created_at: integer()
		.default(sql`(unixepoch())`)
		.notNull()
});

// CHARACTERS, CORPS & ALLIANCES

export const characters = sqliteTable('characters', {
	id: integer().primaryKey(),
	name: text().notNull(),
	sec_status: real().notNull().default(0),
	corporation_id: integer()
		.references(() => corporations.id)
		.notNull(),
	alliance_id: integer().references(() => alliances.id),
	last_seen: integer().default(sql`(unixepoch())`).notNull(),
	created_at: integer().default(sql`(unixepoch())`).notNull(),
	updated_at: integer().default(sql`(unixepoch())`).notNull()
});

export const corporations = sqliteTable('corporations', {
	id: integer().primaryKey(),
	name: text().notNull(),
	ticker: text().notNull(),
	alliance_id: integer().references(() => alliances.id),
	created_at: integer().default(sql`(unixepoch())`).notNull(),
	updated_at: integer().default(sql`(unixepoch())`).notNull()
});

export const alliances = sqliteTable('alliances', {
	id: integer().primaryKey(),
	name: text().notNull(),
	ticker: text().notNull(),
	created_at: integer().default(sql`(unixepoch())`).notNull(),
	updated_at: integer().default(sql`(unixepoch())`).notNull()
});
