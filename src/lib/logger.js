import pino from 'pino';

const isUpdater = typeof process !== 'undefined' && process.argv?.[1]?.includes('updater');
const appName = isUpdater ? 'UPDATER' : 'MAIN';

export default pino({
	level: process.env.LOG_LEVEL || 'info',
	mixin() {
		return { app: appName };
	},
	formatters: {
		level(label, number) {
			return { level: label, priority: number };
		}
	},
	timestamp: pino.stdTimeFunctions.isoTime
});
