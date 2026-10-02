/**
 * Shared PostgreSQL pool + Drizzle instance for the app and the updater worker.
 *
 * Importing this module has no side effects beyond creating the (lazy) pool:
 * - migrations run when the process calls `runMigrations()` (app: `init` hook in
 *   src/hooks.server.js, worker: startup in workers/updater/src/index.js);
 * - the pool is closed by the process owner via `closeDb()` during its shutdown.
 */
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';
import logger from '../logger.js';

/**
 * Parses boolean-ish env flags. Only `1`, `true`, `yes`, `on` (case-insensitive) are
 * true, so `SKIP_MIGRATIONS=false` (as in .env.example) really means "do not skip".
 * @param {string | undefined} value
 */
export function envFlag(value) {
	return /^(1|true|yes|on)$/i.test(String(value ?? '').trim());
}

const isBuild = envFlag(process.env.BUILD);

export const pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL,
	max: 8, // Maximum number of connections in the pool
	idleTimeoutMillis: 90000, // Close idle connections after 90 seconds
	connectionTimeoutMillis: 5000 // Return an error after 5 seconds if connection could not be established
});

// An idle client losing its connection (DB restart, failover, network) emits 'error' on
// the pool. Without a listener Node treats it as an unhandled error and crashes the
// process; the pool already discards the broken client and reconnects on demand.
pool.on('error', (err) => {
	logger.error({ err }, 'Idle PostgreSQL client error');
});

export const db = drizzle(isBuild ? '' : pool);

/**
 * Arbitrary constant key for `pg_advisory_lock`, shared by every process that migrates
 * this database (app replicas and the worker).
 */
export const MIGRATION_LOCK_KEY = 4_729_301_118;

/** @type {Promise<boolean> | undefined} */
let migrationRun;

/**
 * Applies pending Drizzle migrations once per process.
 *
 * Runs on a dedicated connection holding a session-level advisory lock, so several
 * replicas starting at the same time apply each migration exactly once: the others wait
 * for the lock and then find nothing left to do. Skipped when `BUILD` or
 * `SKIP_MIGRATIONS` is set to a true value. Rejects on failure; callers decide whether
 * that is fatal (it is for the app and the worker).
 *
 * @param {{ migrationsFolder?: string }} [options]
 * @returns {Promise<boolean>} whether migrations were run
 */
export function runMigrations({ migrationsFolder = './drizzle' } = {}) {
	if (isBuild || envFlag(process.env.SKIP_MIGRATIONS)) {
		logger.info('Skipping database migrations (BUILD or SKIP_MIGRATIONS set).');
		return Promise.resolve(false);
	}

	migrationRun ??= (async () => {
		const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
		client.on('error', (err) => logger.error({ err }, 'Migration connection error'));
		await client.connect();
		try {
			logger.info('Waiting for migration lock...');
			await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK_KEY]);
			logger.info('Starting database migrations...');
			await migrate(drizzle(client), { migrationsFolder });
			logger.info('Database migrations completed successfully.');
			return true;
		} finally {
			await client
				.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK_KEY])
				.catch((err) => logger.warn({ err }, 'Failed to release migration lock'));
			await client.end().catch(() => {});
		}
	})();

	return migrationRun;
}

/** Closes the pool. Call once, from the process's own shutdown routine. */
export async function closeDb() {
	await pool.end();
}
