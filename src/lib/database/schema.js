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
import { sql } from 'drizzle-orm';

const dbEnvSchema =
	(typeof process !== 'undefined' && process.env?.DB_ENV?.trim())?.toLowerCase() || 'dev';

/**
 * All timestamps are `timestamp with time zone`. Values were always written in UTC
 * (JS Dates as ISO strings, `now()` on a UTC server); migration 0008 converted the
 * former `timestamp without time zone` columns with `AT TIME ZONE 'UTC'`.
 * @param {Parameters<typeof timestamp>[0]} [config]
 */
const timestamptz = (config = {}) => timestamp({ ...config, withTimezone: true });
const authSchema = pgSchema('auth');

// SCANS
//
// Scan tables exist once per deployment environment, each in its own Postgres schema
// (`dev`, `preview`, `prod`) inside the same database. All three are modelled here so
// drizzle-kit generates DDL (indexes, constraints, type changes) for every environment;
// previously only the active `DB_ENV` schema was modelled and the other two drifted.
// The app reads/writes the tables of its own environment through `scans`/`scanGroups`.

export const scanTypesEnum = pgEnum('scanTypes', ['local', 'directional']);

/** Environments that have scan tables in every database (created by migration 0001). */
export const SCAN_ENVIRONMENTS = /** @type {const} */ (['dev', 'preview', 'prod']);

/** @param {string} schemaName */
function defineScanTables(schemaName) {
	const schema = pgSchema(schemaName);

	const scanGroups = schema.table(
		'scan_groups',
		{
			id: text().primaryKey(),
			public: boolean().notNull().default(false),
			system: json(),

			created_at: timestamptz().defaultNow().notNull(),
			// Deleting a user keeps their scans, just without an owner.
			created_by: text().references(() => authUsers.id, { onDelete: 'set null' })
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

	const scans = schema.table(
		'scans',
		{
			id: text().primaryKey(),
			group_id: text()
				.notNull()
				.references(() => scanGroups.id),
			scan_type: scanTypesEnum().notNull(),
			data: json().notNull(),
			raw_data: text().notNull(),

			created_at: timestamptz().defaultNow().notNull(),
			created_by: text().references(() => authUsers.id, { onDelete: 'set null' })
		},
		(table) => ({
			// Group timeline and "latest scan of a group" (also serves plain group_id lookups).
			groupIdCreatedAtIdx: index('scans_group_id_created_at_idx').on(
				table.group_id,
				table.created_at
			),
			scansCreatedAtIdx: index('scans_created_at_idx').on(table.created_at),
			scanTypeIdx: index('scans_scan_type_idx').on(table.scan_type),
			createdByIdx: index('scans_created_by_idx').on(table.created_by),
			scanTypeCreatedIdx: index('scans_scan_type_created_idx').on(
				table.scan_type,
				table.created_by
			),
			groupIdScanTypeCreatedIdx: index('scans_group_id_scan_type_created_idx').on(
				table.group_id,
				table.scan_type,
				table.created_by
			)
		})
	);

	return { scans, scanGroups };
}

// drizzle-kit only picks up exported tables, so each environment is exported by name.
const devScanTables = defineScanTables('dev');
const previewScanTables = defineScanTables('preview');
const prodScanTables = defineScanTables('prod');

export const devScans = devScanTables.scans;
export const devScanGroups = devScanTables.scanGroups;
export const previewScans = previewScanTables.scans;
export const previewScanGroups = previewScanTables.scanGroups;
export const prodScans = prodScanTables.scans;
export const prodScanGroups = prodScanTables.scanGroups;

const scanTablesByEnv = {
	dev: devScanTables,
	preview: previewScanTables,
	prod: prodScanTables
};

// Unknown DB_ENV values keep working as before (their schema must exist in the database).
const activeScanTables = scanTablesByEnv[dbEnvSchema] ?? defineScanTables(dbEnvSchema);

/** Scan tables of the active environment (`DB_ENV`). Not exported to drizzle-kit as a
 * separate table: these are the same objects as one of the per-environment exports. */
export const scans = activeScanTables.scans;
export const scanGroups = activeScanTables.scanGroups;

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
		last_seen: timestamptz().defaultNow().notNull(),
		created_at: timestamptz().defaultNow().notNull(),
		updated_at: timestamptz().defaultNow().notNull(),
		deleted_at: timestamptz(),
		esi_cache_expires: timestamptz(),
		// Set when the updater claims the row for a refresh; failed refreshes wait an hour
		// before being retried instead of blocking the head of the queue (see claim*).
		refresh_attempted_at: timestamptz()
	},
	(table) => ({
		// Not unique: biomassed characters keep their name, which a live character can hold
		// later. Expression index because lookups are case-insensitive (getCharactersByName).
		nameLowerIdx: index('characters_name_lower_idx').on(sql`lower(${table.name})`),
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
		last_seen: timestamptz().defaultNow().notNull(),
		created_at: timestamptz().defaultNow().notNull(),
		updated_at: timestamptz().defaultNow().notNull(),
		refresh_attempted_at: timestamptz()
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
		last_seen: timestamptz().defaultNow().notNull(),
		created_at: timestamptz().defaultNow().notNull(),
		updated_at: timestamptz().defaultNow().notNull(),
		refresh_attempted_at: timestamptz()
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
		last_seen: timestamptz(),
		updated_at: timestamptz().defaultNow().notNull()
	},
	(table) => ({
		nameIdx: index('systems_name_idx').on(table.name)
	})
);

export const sde = pgTable('sde', {
	id: integer().primaryKey().generatedAlwaysAsIdentity(),
	release_date: timestamptz().defaultNow().notNull(),
	release_version: bigint({ mode: 'number' }).notNull(),
	run_date: timestamptz().defaultNow().notNull(),
	success: boolean().notNull().default(true)
});

export const invCategories = pgTable('inv_categories', {
	id: bigint({ mode: 'number' }).primaryKey(),
	name: text().notNull(),
	created_at: timestamptz().defaultNow().notNull(),
	updated_at: timestamptz().defaultNow().notNull()
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
	created_at: timestamptz().defaultNow().notNull(),
	updated_at: timestamptz().defaultNow().notNull()
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
	created_at: timestamptz().defaultNow().notNull(),
	updated_at: timestamptz().defaultNow().notNull()
});

// AUTH.JS (DRIZZLE ADAPTER)

export const authUsers = authSchema.table(
	'user',
	{
		id: text().primaryKey(),
		name: text(),
		email: text().unique(),
		emailVerified: timestamptz({ mode: 'date' }),
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
		// Token columns belong to the Auth.js adapter schema but are always NULL: tokens are
		// stripped before linking (src/auth.js) and were cleared by migration 0005.
		refresh_token: text(),
		access_token: text(),
		expires_at: integer(),
		token_type: text(),
		scope: text(),
		id_token: text(),
		session_state: text(),
		character_name: text(),
		character_image: text(),
		// EVE SSO CharacterOwnerHash seen when this character was linked/last signed in.
		// It changes when a character is transferred to another EVE account; see src/auth.js.
		character_owner_hash: text()
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
	expires: timestamptz({ mode: 'date' }).notNull()
});

export const authVerificationTokens = authSchema.table(
	'verificationToken',
	{
		identifier: text().notNull(),
		token: text().notNull(),
		expires: timestamptz({ mode: 'date' }).notNull()
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
