export const config = {
	DATABASE_URL: process.env.DATABASE_URL,
	NODE_ENV: process.env.NODE_ENV || 'development',
	LOG_LEVEL: process.env.LOG_LEVEL || 'info',
	AGENT: process.env.AGENT || 'Updater',
	ORIGIN: process.env.ORIGIN,
	CONTACT_EMAIL: process.env.CONTACT_EMAIL,
	CONTACT_EVE: process.env.CONTACT_EVE,
	CONTACT_DISCORD: process.env.CONTACT_DISCORD,
	BUILD: process.env.BUILD === 'true',
	DB_ENV: process.env.DB_ENV || 'dev',

	// Cron Schedules
	DYNAMIC_UPDATE_CRON: process.env.DYNAMIC_UPDATE_CRON || '* * * * *', // Default every minute
	STATIC_UPDATE_CRON: process.env.STATIC_UPDATE_CRON || '30 11,12 * * *', // Default to daily at 11:30 and 12:30

	// OpenTelemetry
	OTEL_EXPORTER_OTLP_ENDPOINT: process.env.OTEL_EXPORTER_OTLP_ENDPOINT || 'http://localhost:4318',
	OTEL_EXPORTER_OTLP_AUTHORIZATION: process.env.OTEL_EXPORTER_OTLP_AUTHORIZATION || '',
	OTEL_SERVICE_NAME: process.env.OTEL_SERVICE_NAME || 'd-scan.space',
	PROMETHEUS_PORT: process.env.PROMETHEUS_PORT || 9464
};
