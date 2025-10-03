import pino from 'pino';

export default pino({
	level: process.env.LOG_LEVEL || 'info',
	formatters: {
		level(label, number) {
			return { level: label, priority: number };
		}
	},
	timestamp: pino.stdTimeFunctions.isoTime
});
