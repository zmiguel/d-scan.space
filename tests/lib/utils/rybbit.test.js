import { describe, expect, it, vi } from 'vitest';
import { getRybbitIdentity, syncRybbitIdentity } from '../../../src/lib/utils/rybbit.js';

describe('rybbit utilities', () => {
	describe('getRybbitIdentity', () => {
		it('returns null for anonymous sessions', () => {
			expect(getRybbitIdentity(null)).toBeNull();
			expect(getRybbitIdentity({ user: {} })).toBeNull();
		});

		it('uses primary character name as username', () => {
			const session = {
				user: { id: 'user-1', name: 'Fallback Name' },
				eve: { characterName: 'Primary Character' }
			};

			expect(getRybbitIdentity(session)).toEqual({
				userId: 'user-1',
				traits: {
					username: 'Primary Character',
					name: 'Primary Character'
				}
			});
		});

		it('falls back to session user name when character name is missing', () => {
			const session = {
				user: { id: 'user-2', name: 'Pilot Name' }
			};

			expect(getRybbitIdentity(session)).toEqual({
				userId: 'user-2',
				traits: {
					username: 'Pilot Name',
					name: 'Pilot Name'
				}
			});
		});

		it('keeps username traits as null when no display name exists', () => {
			const session = {
				user: { id: 'user-3' }
			};

			expect(getRybbitIdentity(session)).toEqual({
				userId: 'user-3',
				traits: {
					username: null,
					name: null
				}
			});
		});
	});

	describe('syncRybbitIdentity', () => {
		it('calls identify for authenticated users', () => {
			const rybbit = {
				identify: vi.fn(),
				clearUserId: vi.fn()
			};
			const session = {
				user: { id: 'user-1', name: 'Fallback Name' },
				eve: { characterName: 'Primary Character' }
			};

			syncRybbitIdentity(rybbit, session);

			expect(rybbit.identify).toHaveBeenCalledWith('user-1', {
				username: 'Primary Character',
				name: 'Primary Character'
			});
			expect(rybbit.clearUserId).not.toHaveBeenCalled();
		});

		it('does not throw if identify is unavailable for authenticated users', () => {
			const rybbit = {
				clearUserId: vi.fn()
			};
			const session = {
				user: { id: 'user-1', name: 'Fallback Name' },
				eve: { characterName: 'Primary Character' }
			};

			expect(() => syncRybbitIdentity(rybbit, session)).not.toThrow();
			expect(rybbit.clearUserId).not.toHaveBeenCalled();
		});

		it('calls clearUserId for anonymous users', () => {
			const rybbit = {
				identify: vi.fn(),
				clearUserId: vi.fn()
			};

			syncRybbitIdentity(rybbit, null);

			expect(rybbit.identify).not.toHaveBeenCalled();
			expect(rybbit.clearUserId).toHaveBeenCalledTimes(1);
		});

		it('is safe when rybbit object is unavailable', () => {
			expect(() => syncRybbitIdentity(undefined, null)).not.toThrow();
		});

		it('is safe when clearUserId is unavailable for anonymous users', () => {
			expect(() => syncRybbitIdentity({}, null)).not.toThrow();
		});
	});
});
