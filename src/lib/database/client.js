import { drizzle } from 'drizzle-orm/node-postgres';
import { DATABASE_URL } from '$env/dynamic/private';

export const db = drizzle(DATABASE_URL);
