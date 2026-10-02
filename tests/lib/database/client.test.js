import { describe, expect, it } from 'vitest';
import { envFlag } from '../../../src/lib/database/client.js';

describe('envFlag (BUILD / SKIP_MIGRATIONS parsing)', () => {
	it.each(['true', 'TRUE', '1', 'yes', ' on '])('treats %j as set', (value) => {
		expect(envFlag(value)).toBe(true);
	});

	it.each(['false', '0', 'no', '', undefined])(
		'treats %j as not set (SKIP_MIGRATIONS=false must run migrations)',
		(value) => {
			expect(envFlag(value)).toBe(false);
		}
	);
});
