import {
	pgTable,
	text,
	bigint,
	integer,
	doublePrecision,
	timestamp,
	json,
	boolean,
	pgEnum
} from 'drizzle-orm/pg-core';

// SCANS

export const scanTypesEnum = pgEnum('scanTypes', ['local', 'directional']);

export const scans = pgTable('scans', {
	id: text().primaryKey(),
	group_id: text()
		.notNull()
		.references(() => scanGroups.id),
	scan_type: scanTypesEnum().notNull(),
	data: json().notNull(),
	raw_data: text().notNull(),

	created_at: timestamp().defaultNow().notNull()
});

export const scanGroups = pgTable('scan_groups', {
	id: text().primaryKey(),
	public: boolean().notNull().default(false),
	system: bigint({ mode: 'number' }).references(() => systems.id),

	created_at: timestamp().defaultNow().notNull()
});

// DYNAMIC DATA

export const characters = pgTable('characters', {
	id: bigint({ mode: 'number' }).primaryKey(),
	name: text().notNull(),
	sec_status: doublePrecision().notNull().default(0),
	corporation_id: bigint({ mode: 'number' })
		.references(() => corporations.id)
		.notNull(),
	alliance_id: bigint({ mode: 'number' }).references(() => alliances.id),
	last_seen: timestamp().defaultNow().notNull(),
	created_at: timestamp().defaultNow().notNull(),
	updated_at: timestamp().defaultNow().notNull(),
	deleted_at: timestamp()
});

export const corporations = pgTable('corporations', {
	id: bigint({ mode: 'number' }).primaryKey(),
	name: text().notNull(),
	ticker: text().notNull(),
	alliance_id: bigint({ mode: 'number' }).references(() => alliances.id),
	npc: boolean().notNull().default(false),
	last_seen: timestamp().defaultNow().notNull(),
	created_at: timestamp().defaultNow().notNull(),
	updated_at: timestamp().defaultNow().notNull()
});

export const alliances = pgTable('alliances', {
	id: bigint({ mode: 'number' }).primaryKey(),
	name: text().notNull(),
	ticker: text().notNull(),
	last_seen: timestamp().defaultNow().notNull(),
	created_at: timestamp().defaultNow().notNull(),
	updated_at: timestamp().defaultNow().notNull()
});

// STATIC DATA

export const systems = pgTable('systems', {
	id: bigint({ mode: 'number' }).primaryKey(),
	name: text().notNull(),
	constellation: text().notNull(),
	region: text().notNull(),
	sec_status: doublePrecision().notNull(),
	last_seen: timestamp(),
	updated_at: timestamp().defaultNow().notNull()
});

// STATIC DATA

export const sde_data = pgTable('sde_data', {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	install_date: timestamp().defaultNow().notNull(),
	fsd_checksum: text().notNull(),
	bsd_checksum: text().notNull(),
	universe_checksum: text().notNull(),
	success: boolean().notNull().default(true)
});
