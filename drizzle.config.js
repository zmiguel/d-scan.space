/**
 * @type {import('drizzle-kit').Config}
 */
const Config = {
	out: './drizzle/migrations',
	schema: './src/lib/database/schema.js',
	dialect: 'sqlite'
};

module.exports = Config;
