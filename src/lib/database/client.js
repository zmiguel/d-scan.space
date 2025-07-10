import { drizzle } from 'drizzle-orm/node-postgres';
import { DATABASE_URL } from '$env/static/private';

console.log("Using database:", DATABASE_URL);

export const db = drizzle(DATABASE_URL);
