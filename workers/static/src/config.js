import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env file from root if it exists, or local .env
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });
dotenv.config();

export const config = {
	DATABASE_URL: process.env.DATABASE_URL,
	LOG_LEVEL: process.env.LOG_LEVEL || 'info',
	OTEL_EXPORTER_OTLP_ENDPOINT:
		process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318/v1/traces',
	OTEL_EXPORTER_OTLP_AUTHORIZATION: process.env.OTEL_EXPORTER_OTLP_AUTHORIZATION || '',
	NODE_ENV: process.env.NODE_ENV || 'development',
	AGENT: process.env.AGENT || 'd-scan-space-static-worker',
	ORIGIN: process.env.ORIGIN,
	CONTACT_EMAIL: process.env.CONTACT_EMAIL,
	CONTACT_EVE: process.env.CONTACT_EVE,
	CONTACT_DISCORD: process.env.CONTACT_DISCORD,
	DB_ENV: process.env.DB_ENV || 'dev',
	OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME || 'd-scan.space',
	STATIC_UPDATE_CRON: process.env.STATIC_UPDATE_CRON || '0 0 * * *' // Default to daily at midnight
};
