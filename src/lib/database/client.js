import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import logger from '../logger.js';

const env = process.env;

function parseDatabaseUrl(url) {
	try {
		const parsed = new URL(url);
		return {
			host: parsed.hostname || undefined,
			port: parsed.port ? Number(parsed.port) : undefined,
			database: parsed.pathname ? parsed.pathname.replace(/^\//, '') : undefined,
			user: parsed.username || undefined,
			password: parsed.password || undefined,
			ssl: parsed.searchParams.get('sslmode')?.toLowerCase() === 'disable' ? false : undefined
		};
	} catch {
		return {};
	}
}

// Create a connection pool
const databaseUrl = env.DATABASE_URL || process.env.DATABASE_URL;
const parsedConfig = databaseUrl ? parseDatabaseUrl(databaseUrl) : {};

export const pool = new Pool({
	connectionString: databaseUrl,
	max: 8, // Maximum number of connections in the pool
	idleTimeoutMillis: 90000, // Close idle connections after 90 seconds
	connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection could not be established
	...parsedConfig
});

export const db = drizzle(env.BUILD ? '' : pool);

if (!env.BUILD && !env.SKIP_MIGRATIONS) {
	logger.info('Starting database migrations...');
	migrate(db, {
		migrationsFolder: './drizzle'
	})
		.then(() => {
			logger.info('Database migrations completed successfully.');
		})
		.catch((err) => {
			logger.error({ err }, 'Database migration failed');
			process.exit(1);
		});
} else {
	logger.info('Skipping database migrations (BUILD or SKIP_MIGRATIONS set).');
}

// Graceful shutdown
process.on('SIGINT', async () => {
	await pool.end();
	process.exit(0);
});

process.on('SIGTERM', async () => {
	await pool.end();
	process.exit(0);
});
