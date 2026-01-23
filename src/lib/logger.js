import pino from 'pino';

export const getAppName = () => {
	const isUpdater = typeof process !== 'undefined' && process.argv?.[1]?.includes('updater');
	return isUpdater ? 'UPDATER' : 'MAIN';
};

const appName = getAppName();
const db_env = process.env.DB_ENV ? `${process.env.DB_ENV}` : 'dev';

export default pino({
	level: process.env.LOG_LEVEL || 'info',
	mixin() {
		return { app: appName, env: db_env };
	},
	formatters: {
		level(label, number) {
			return { level: label, priority: number };
		}
	},
	timestamp: pino.stdTimeFunctions.isoTime
});
