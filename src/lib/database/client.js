import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '$env/dynamic/private';

export const db = drizzle(env.DATABASE_URL);

await migrate(db);
