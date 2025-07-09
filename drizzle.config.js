/**
 * @type {import('drizzle-kit').Config}
 */
const Config = {
	dialect: 'postgresql',
	out: './drizzle',
	schema: './src/lib/database/schema.js',
	dbCredentials: {
		url: process.env.DATABASE_URL
	}
};

module.exports = Config;
