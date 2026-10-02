import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockLogger } = vi.hoisted(() => ({ mockLogger: { warn: vi.fn() } }));
vi.mock('../../../src/lib/logger.js', () => ({ default: mockLogger }));

import {
	APP_RECOMMENDED,
	APP_REQUIRED,
	validateProductionEnv
} from '../../../src/lib/server/env-check.js';

const spec = { required: APP_REQUIRED, recommended: APP_RECOMMENDED };

describe('validateProductionEnv', () => {
	beforeEach(() => vi.clearAllMocks());

	it('names every missing required variable in one error', () => {
		expect(() =>
			validateProductionEnv('app', spec, { NODE_ENV: 'production', AUTH_SECRET: '  ' })
		).toThrow(/DATABASE_URL, AUTH_SECRET/);
	});

	it('only warns about missing recommended variables', () => {
		expect(() =>
			validateProductionEnv('app', spec, {
				NODE_ENV: 'production',
				DATABASE_URL: 'postgres://db/x',
				AUTH_SECRET: 'secret'
			})
		).not.toThrow();
		expect(mockLogger.warn).toHaveBeenCalledWith(
			{ missing: APP_RECOMMENDED },
			expect.stringContaining('Recommended')
		);
	});

	it('does not check outside production', () => {
		expect(() => validateProductionEnv('app', spec, { NODE_ENV: 'development' })).not.toThrow();
		expect(mockLogger.warn).not.toHaveBeenCalled();
	});
});
