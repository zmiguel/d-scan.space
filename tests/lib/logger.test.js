import { describe, it, expect, vi } from 'vitest';

// Mock pino
const mockPino = vi.fn(() => ({
	info: vi.fn(),
	error: vi.fn()
}));
mockPino.stdTimeFunctions = { isoTime: vi.fn() };

vi.mock('pino', () => ({
	default: mockPino
}));

describe('logger', () => {
	it('should configure pino correctly', async () => {
		await import('../../src/lib/logger.js');

		expect(mockPino).toHaveBeenCalledWith(
			expect.objectContaining({
				level: expect.any(String),
				mixin: expect.any(Function),
				formatters: expect.objectContaining({
					level: expect.any(Function)
				}),
				timestamp: expect.any(Function)
			})
		);
	});

	it('should add app name in mixin', async () => {
		await import('../../src/lib/logger.js');

		const config = mockPino.mock.calls[0][0];
		const mixinResult = config.mixin();

		expect(mixinResult).toHaveProperty('app');
	});

	it('should format level correctly', async () => {
		await import('../../src/lib/logger.js');

		const config = mockPino.mock.calls[0][0];
		const levelResult = config.formatters.level('info', 30);

		expect(levelResult).toEqual({ level: 'info', priority: 30 });
	});

	it('should determine app name correctly', async () => {
		const { getAppName } = await import('../../src/lib/logger.js');

		// Default (MAIN)
		expect(getAppName()).toBe('MAIN');

		// Updater
		const originalArgv = process.argv;
		Object.defineProperty(process, 'argv', {
			value: ['node', 'updater.js'],
			writable: true
		});

		expect(getAppName()).toBe('UPDATER');

		Object.defineProperty(process, 'argv', {
			value: originalArgv,
			writable: true
		});
	});
});
