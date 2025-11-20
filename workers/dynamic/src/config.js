import dotenv from 'dotenv';
dotenv.config();

export const config = {
	DATABASE_URL: process.env.DATABASE_URL,
	NODE_ENV: process.env.NODE_ENV || 'development',
	LOG_LEVEL: process.env.LOG_LEVEL || 'info',
	AGENT: process.env.AGENT || 'dynamic-worker',
	ORIGIN: process.env.ORIGIN,
	CONTACT_EMAIL: process.env.CONTACT_EMAIL,
	CONTACT_EVE: process.env.CONTACT_EVE,
	CONTACT_DISCORD: process.env.CONTACT_DISCORD,
	BUILD: process.env.BUILD === 'true',
	DB_ENV: process.env.DB_ENV || 'dev',
	DYNAMIC_UPDATE_CRON: process.env.DYNAMIC_UPDATE_CRON || '*/5 * * * *', // Default every 5 minutes
	OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
	OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME || 'd-scan.space',
	PROMETHEUS_PORT: process.env.PROMETHEUS_PORT || 9464
};
