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
	uniqueIndex,
	pgSchema
} from 'drizzle-orm/pg-core';

const dbEnvSchema =
	(typeof process !== 'undefined' && process.env?.DB_ENV?.trim())?.toLowerCase() || 'dev';
const scanSchema = pgSchema(dbEnvSchema);
const authSchema = pgSchema('auth');

// SCANS

export const scanTypesEnum = pgEnum('scanTypes', ['local', 'directional']);

export const scans = scanSchema.table(
	'scans',
	{
		id: text().primaryKey(),
		group_id: text()
			.notNull()
			.references(() => scanGroups.id),
		scan_type: scanTypesEnum().notNull(),
		data: json().notNull(),
		raw_data: text().notNull(),

		created_at: timestamp().defaultNow().notNull(),
		created_by: text().references(() => authUsers.id)
	},
	(table) => ({
		groupIdIdx: index('scans_group_id_idx').on(table.group_id),
		scansCreatedAtIdx: index('scans_created_at_idx').on(table.created_at),
		scanTypeIdx: index('scans_scan_type_idx').on(table.scan_type),
		createdByIdx: index('scans_created_by_idx').on(table.created_by),
		scanTypeCreatedIdx: index('scans_scan_type_created_idx').on(table.scan_type, table.created_by),
		groupIdScanTypeCreatedIdx: index('scans_group_id_scan_type_created_idx').on(
			table.group_id,
			table.scan_type,
			table.created_by
		)
	})
);

export const scanGroups = scanSchema.table(
	'scan_groups',
	{
		id: text().primaryKey(),
		public: boolean().notNull().default(false),
		system: json(),

		created_at: timestamp().defaultNow().notNull(),
		created_by: text().references(() => authUsers.id)
	},
	(table) => ({
		publicCreatedIdx: index('scan_groups_public_created_idx').on(table.public, table.created_at),
		createdByIdx: index('scan_groups_created_by_idx').on(table.created_by),
		publicIdx: index('scan_groups_public_idx').on(table.public),
		createdByPublicIdx: index('scan_groups_created_by_public_idx').on(
			table.created_by,
			table.public
		)
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

export const systems = pgTable(
	'systems',
	{
		id: bigint({ mode: 'number' }).primaryKey(),
		name: text().notNull(),
		constellation: text().notNull(),
		region: text().notNull(),
		sec_status: doublePrecision().notNull(),
		last_seen: timestamp(),
		updated_at: timestamp().defaultNow().notNull()
	},
	(table) => ({
		nameIdx: index('systems_name_idx').on(table.name)
	})
);

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

// AUTH.JS (DRIZZLE ADAPTER)

export const authUsers = authSchema.table(
	'user',
	{
		id: text().primaryKey(),
		name: text(),
		email: text().unique(),
		emailVerified: timestamp({ mode: 'date' }),
		primary_character_id: bigint({ mode: 'number' }),
		image: text()
	},
	(table) => ({
		primaryCharacterIdx: index('user_primary_character_idx').on(table.primary_character_id),
		nameIdx: index('user_name_idx').on(table.name)
	})
);

export const authAccounts = authSchema.table(
	'account',
	{
		userId: text()
			.notNull()
			.references(() => authUsers.id, { onDelete: 'cascade' }),
		type: text().notNull(),
		provider: text().notNull(),
		providerAccountId: text().notNull(),
		refresh_token: text(),
		access_token: text(),
		expires_at: integer(),
		token_type: text(),
		scope: text(),
		id_token: text(),
		session_state: text(),
		character_name: text(),
		character_image: text()
	},
	(table) => ({
		providerAccountUnique: uniqueIndex('account_provider_provider_account_idx').on(
			table.provider,
			table.providerAccountId
		),
		character_nameIdx: index('account_character_name_idx').on(table.character_name)
	})
);

export const authSessions = authSchema.table('session', {
	sessionToken: text().primaryKey(),
	userId: text()
		.notNull()
		.references(() => authUsers.id, { onDelete: 'cascade' }),
	expires: timestamp({ mode: 'date' }).notNull()
});

export const authVerificationTokens = authSchema.table(
	'verificationToken',
	{
		identifier: text().notNull(),
		token: text().notNull(),
		expires: timestamp({ mode: 'date' }).notNull()
	},
	(table) => ({
		identifierTokenUnique: uniqueIndex('verification_token_identifier_token_idx').on(
			table.identifier,
			table.token
		)
	})
);

export const authAuthenticators = authSchema.table(
	'authenticator',
	{
		credentialID: text().notNull().unique(),
		userId: text()
			.notNull()
			.references(() => authUsers.id, { onDelete: 'cascade' }),
		providerAccountId: text().notNull(),
		credentialPublicKey: text().notNull(),
		counter: integer().notNull(),
		credentialDeviceType: text().notNull(),
		credentialBackedUp: boolean().notNull(),
		transports: text()
	},
	(table) => ({
		userCredentialUnique: uniqueIndex('authenticator_user_credential_idx').on(
			table.userId,
			table.credentialID
		)
	})
);
