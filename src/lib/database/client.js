import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { Pool } from 'pg';
import { env } from '$env/dynamic/private';

// Create a connection pool
const pool = new Pool({
    connectionString: env.DATABASE_URL,
    max: 8, // Maximum number of connections in the pool
    idleTimeoutMillis: 60000, // Close idle connections after 60 seconds
    connectionTimeoutMillis: 5000, // Return an error after 5 seconds if connection could not be established
});

export const db = drizzle(env.BUILD ? '' : pool);

if (!env.BUILD) {
    migrate(db, {
        migrationsFolder: './drizzle'
    });
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
