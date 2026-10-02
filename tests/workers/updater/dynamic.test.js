import { describe, it, expect, vi } from 'vitest';

vi.mock('../../../src/lib/database/client.js', () => ({ db: {}, pool: null }));

import { allianceByCorporation } from '../../../workers/updater/src/services/dynamic.js';

describe('updater/dynamic allianceByCorporation', () => {
	it('reports the alliance members agree on, null when they have none', () => {
		const result = allianceByCorporation([
			{ corporation_id: 1, alliance_id: 10 },
			{ corporation_id: 1, alliance_id: 10 },
			{ corporation_id: 2, alliance_id: null },
			{ corporation_id: 3 }
		]);

		expect([...result]).toEqual([
			[1, 10],
			[2, null],
			[3, null]
		]);
	});

	it('ignores corporations whose members disagree, even if one value repeats', () => {
		const result = allianceByCorporation([
			{ corporation_id: 1, alliance_id: 10 },
			{ corporation_id: 1, alliance_id: 11 },
			{ corporation_id: 1, alliance_id: 10 },
			{ corporation_id: 2, alliance_id: 20 }
		]);

		expect([...result]).toEqual([[2, 20]]);
	});
});
