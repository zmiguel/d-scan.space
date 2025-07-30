import pino from 'pino';

const formatters = {
    level (label, number) {
        return { level: label, priority: number };
    }
}

export default pino({
	level: process.env.LOG_LEVEL || 'info',
	formatters: formatters
});
