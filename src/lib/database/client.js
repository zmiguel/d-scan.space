import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { env } from '$env/dynamic/private';

export const db = drizzle(env.BUILD ? '' : env.DATABASE_URL);

if(!env.BUILD){
	migrate(db, {
		migrationsFolder: './drizzle',
	});
}

