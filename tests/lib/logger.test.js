import { afterEach, describe, it, expect, vi } from 'vitest';

const mockPino = vi.fn(() => ({ info: vi.fn(), error: vi.fn() }));
mockPino.stdTimeFunctions = { isoTime: vi.fn() };
vi.mock('pino', () => ({ default: mockPino }));

describe('logger', () => {
	afterEach(() => {
		vi.unstubAllEnvs();
		vi.resetModules();
		mockPino.mockClear();
	});

	it('tags every log line with the process and the DB_ENV environment', async () => {
		vi.stubEnv('DB_ENV', 'preview');
		await import('../../src/lib/logger.js');

		expect(mockPino.mock.calls[0][0].mixin()).toEqual({ app: 'MAIN', env: 'preview' });
	});

	it('identifies the updater worker from its entry script', async () => {
		const { getAppName } = await import('../../src/lib/logger.js');
		const originalArgv = process.argv;
		try {
			process.argv = ['node', '/app/workers/updater/src/index.js'];
			expect(getAppName()).toBe('UPDATER');
			process.argv = ['node', '/app/build/index.js'];
			expect(getAppName()).toBe('MAIN');
		} finally {
			process.argv = originalArgv;
		}
	});
});
