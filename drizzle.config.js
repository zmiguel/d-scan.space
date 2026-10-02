import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not set');

// Scan tables for every environment are modelled in schema.js, so drizzle-kit must
// always see all of them regardless of DB_ENV (see SCAN_ENVIRONMENTS).
const scanSchemas = ['dev', 'preview', 'prod'];

export default defineConfig({
	schema: './src/lib/database/schema.js',
	dialect: 'postgresql',
	out: './drizzle',
	dbCredentials: { url: process.env.DATABASE_URL },
	verbose: true,
	strict: true,
	schemaFilter: ['public', 'auth', ...scanSchemas]
});
