import {
	pgTable,
	text,
	bigint,
	integer,
	doublePrecision,
	timestamp,
	json,
	boolean,
	pgEnum,
	index,
	uniqueIndex
} from 'drizzle-orm/pg-core';

// SCANS

export const scanTypesEnum = pgEnum('scanTypes', ['local', 'directional']);

export const scans = pgTable(
	'scans',
	{
		id: text().primaryKey(),
		group_id: text()
			.notNull()
			.references(() => scanGroups.id),
		scan_type: scanTypesEnum().notNull(),
		data: json().notNull(),
		raw_data: text().notNull(),

		created_at: timestamp().defaultNow().notNull()
	},
	(table) => ({
		groupIdIdx: index('scans_group_id_idx').on(table.group_id),
		createdAtIdx: index('scans_created_at_idx').on(table.created_at)
	})
);

export const scanGroups = pgTable(
	'scan_groups',
	{
		id: text().primaryKey(),
		public: boolean().notNull().default(false),
		system: json(),

		created_at: timestamp().defaultNow().notNull()
	},
	(table) => ({
		publicCreatedIdx: index('scan_groups_public_created_idx').on(table.public, table.created_at)
	})
);

// DYNAMIC DATA

export const characters = pgTable(
	'characters',
	{
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
		deleted_at: timestamp(),
		esi_cache_expires: timestamp()
	},
	(table) => ({
		nameIdx: uniqueIndex('characters_name_idx').on(table.name),
		refreshIdx: index('characters_refresh_idx').on(
			table.deleted_at,
			table.updated_at,
			table.last_seen
		)
	})
);

export const corporations = pgTable(
	'corporations',
	{
		id: bigint({ mode: 'number' }).primaryKey(),
		name: text().notNull(),
		ticker: text().notNull(),
		alliance_id: bigint({ mode: 'number' }).references(() => alliances.id),
		npc: boolean().notNull().default(false),
		last_seen: timestamp().defaultNow().notNull(),
		created_at: timestamp().defaultNow().notNull(),
		updated_at: timestamp().defaultNow().notNull()
	},
	(table) => ({
		refreshIdx: index('corporations_refresh_idx').on(table.last_seen, table.updated_at)
	})
);

export const alliances = pgTable(
	'alliances',
	{
		id: bigint({ mode: 'number' }).primaryKey(),
		name: text().notNull(),
		ticker: text().notNull(),
		last_seen: timestamp().defaultNow().notNull(),
		created_at: timestamp().defaultNow().notNull(),
		updated_at: timestamp().defaultNow().notNull()
	},
	(table) => ({
		refreshIdx: index('alliances_refresh_idx').on(table.last_seen, table.updated_at)
	})
);

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

export const sde = pgTable('sde', {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	release_date: timestamp().defaultNow().notNull(),
	release_version: bigint({ mode: 'number' }).notNull(),
	run_date: timestamp().defaultNow().notNull(),
	success: boolean().notNull().default(true)
});

export const invCategories = pgTable('inv_categories', {
	id: bigint({ mode: 'number' }).primaryKey(),
	name: text().notNull(),
	created_at: timestamp().defaultNow().notNull(),
	updated_at: timestamp().defaultNow().notNull()
});

export const invGroups = pgTable('inv_groups', {
	id: bigint({ mode: 'number' }).primaryKey(),
	name: text().notNull(),
	anchorable: boolean().notNull().default(false),
	anchored: boolean().notNull().default(false),
	fittable_non_singleton: boolean().notNull().default(false),
	category_id: bigint({ mode: 'number' })
		.notNull()
		.references(() => invCategories.id),
	icon_id: integer(),
	created_at: timestamp().defaultNow().notNull(),
	updated_at: timestamp().defaultNow().notNull()
});

export const invTypes = pgTable('inv_types', {
	id: bigint({ mode: 'number' }).primaryKey(),
	name: text().notNull(),
	mass: doublePrecision().notNull().default(0),
	volume: doublePrecision().notNull().default(0),
	capacity: doublePrecision(),
	faction_id: integer().notNull().default(0),
	race_id: integer().notNull().default(0),
	group_id: bigint({ mode: 'number' })
		.notNull()
		.references(() => invGroups.id),
	market_group_id: integer(),
	icon_id: integer(),
	created_at: timestamp().defaultNow().notNull(),
	updated_at: timestamp().defaultNow().notNull()
});
