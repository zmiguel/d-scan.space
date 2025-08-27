import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

export default defineConfig({
	schema: './src/lib/database/schema.js',
	dialect: 'postgresql',
	out: './drizzle',
	dbCredentials: { url: process.env.DATABASE_URL },
	verbose: true,
	strict: true
});
