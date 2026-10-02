import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	span: { setAttributes: () => {}, setStatus: () => {}, addEvent: () => {} }
}));

vi.mock('../../../src/lib/server/tracer.js', () => ({
	withSpan: (name, fn) => fn(mocks.span)
}));

vi.mock('../../../src/lib/server/wrappers.js', () => ({
	fetchGET: vi.fn(),
	fetchPOST: vi.fn()
}));

vi.mock('../../../src/lib/server/corporations.js', () => ({
	addOrUpdateCorporations: vi.fn()
}));

vi.mock('../../../src/lib/server/alliances.js', () => ({
	addOrUpdateAlliances: vi.fn()
}));

vi.mock('../../../src/lib/database/characters.js', () => ({
	addOrUpdateCharactersDB: vi.fn(),
	biomassCharacters: vi.fn(),
	getCharactersByName: vi.fn()
}));

vi.mock('../../../src/lib/database/corporations.js', () => ({
	getCorporationsByID: vi.fn()
}));

vi.mock('../../../src/lib/database/alliances.js', () => ({
	getAlliancesByID: vi.fn()
}));

vi.mock('../../../src/lib/logger.js', () => ({
	default: { error: () => {}, warn: () => {}, info: () => {}, debug: () => {} }
}));

import {
	addCharactersFromESI,
	updateCharactersFromESI,
	updateAffiliationsFromESI,
	idsToCharacters
} from '../../../src/lib/server/characters.js';
import { fetchGET, fetchPOST } from '../../../src/lib/server/wrappers.js';
import {
	addOrUpdateCharactersDB,
	biomassCharacters,
	getCharactersByName
} from '../../../src/lib/database/characters.js';
import { getCorporationsByID } from '../../../src/lib/database/corporations.js';
import { getAlliancesByID } from '../../../src/lib/database/alliances.js';
import { _clearUnresolvableNames } from '../../../src/lib/server/unresolved-names.js';

const ESI = 'https://esi.evetech.net';
const IDS_URL = `${ESI}/universe/ids`;
const AFFILIATION_URL = `${ESI}/characters/affiliation`;
const DOOMHEIM = 1000001;

/** @param {unknown} data @param {number} [status] @param {Record<string,string>} [headers] */
const json = (data, status = 200, headers = {}) =>
	new Response(JSON.stringify(data), { status, headers });

/**
 * Fake ESI. `characters` maps id → { name, corporation_id, alliance_id? }.
 * Names resolve case-insensitively to the canonical name.
 */
function fakeEsi(characters, { deleted = [], failingGets = [] } = {}) {
	const byName = new Map(
		Object.entries(characters).map(([id, c]) => [
			c.name.toLowerCase(),
			{ id: Number(id), name: c.name }
		])
	);

	fetchPOST.mockImplementation(async (url, body) => {
		if (url === IDS_URL) {
			const found = body.map((n) => byName.get(n.toLowerCase())).filter(Boolean);
			return json(found.length ? { characters: found } : {});
		}
		if (url === AFFILIATION_URL) {
			return json(
				body
					.filter((id) => characters[id])
					.map((id) => ({
						character_id: id,
						corporation_id: characters[id].corporation_id,
						...(characters[id].alliance_id && { alliance_id: characters[id].alliance_id })
					}))
			);
		}
		throw new Error(`unexpected POST ${url}`);
	});

	fetchGET.mockImplementation(async (url) => {
		const id = Number(url.split('/').pop());
		if (deleted.includes(id)) return json({ error: 'Character has been deleted!' }, 404);
		if (failingGets.includes(id)) return null;
		const c = characters[id];
		if (!c) return json({ error: 'not found' }, 404);
		return json(
			{
				name: c.name,
				corporation_id: 1, // stale cached value; affiliation must win
				security_status: 1.5,
				description: 'long bio',
				title: 'CEO'
			},
			200,
			{ expires: 'Thu, 01 Oct 2026 12:00:00 GMT' }
		);
	});
}

/** Bodies sent to a POST url. */
const postBodies = (url) => fetchPOST.mock.calls.filter(([u]) => u === url).map(([, b]) => b);
const getIds = () => fetchGET.mock.calls.map(([u]) => Number(u.split('/').pop()));
const storedIds = () =>
	addOrUpdateCharactersDB.mock.calls.flatMap(([rows]) => rows.map((r) => r.id));
const biomassedIds = () => biomassCharacters.mock.calls.flatMap(([ids]) => ids);

describe('characters service', () => {
	beforeEach(() => {
		vi.resetAllMocks();
		_clearUnresolvableNames();
		// every corporation/alliance lookup succeeds unless a test says otherwise
		getCorporationsByID.mockImplementation(async (ids) => ids.map((id) => ({ id })));
		getAlliancesByID.mockImplementation(async (ids) => ids.map((id) => ({ id })));
		getCharactersByName.mockResolvedValue([]);
	});

	describe('addCharactersFromESI', () => {
		it('stores characters with details from GET and affiliation from /characters/affiliation', async () => {
			fakeEsi({
				1: { name: 'Char One', corporation_id: 10, alliance_id: 100 },
				2: { name: 'Char Two', corporation_id: 20 }
			});

			await addCharactersFromESI(['Char One', 'Char Two']);

			expect(addOrUpdateCharactersDB).toHaveBeenCalledTimes(1);
			const rows = addOrUpdateCharactersDB.mock.calls[0][0];
			expect(rows).toHaveLength(2);
			const one = rows.find((r) => r.id === 1);
			expect(one).toMatchObject({
				id: 1,
				name: 'Char One',
				corporation_id: 10,
				alliance_id: 100,
				security_status: 1.5,
				esi_cache_expires: new Date('2026-10-01T12:00:00Z')
			});
			expect(one).not.toHaveProperty('description');
			expect(one).not.toHaveProperty('title');
			expect(rows.find((r) => r.id === 2)).toMatchObject({ corporation_id: 20, alliance_id: null });
		});

		it('does not call ESI for an empty list', async () => {
			await addCharactersFromESI([]);
			expect(fetchPOST).not.toHaveBeenCalled();
			expect(fetchGET).not.toHaveBeenCalled();
		});

		it('skips ESI when sanityCheck finds every name already stored', async () => {
			getCharactersByName.mockResolvedValue([{ id: 1 }, { id: 2 }]);
			fakeEsi({});

			await addCharactersFromESI(['Char One', 'Char Two'], true);

			expect(fetchPOST).not.toHaveBeenCalled();
		});

		it('still resolves names when sanityCheck finds only some stored', async () => {
			getCharactersByName.mockResolvedValue([{ id: 1 }]);
			fakeEsi({
				1: { name: 'Char One', corporation_id: 10 },
				2: { name: 'Char Two', corporation_id: 10 }
			});

			await addCharactersFromESI(['Char One', 'Char Two'], true);

			expect(storedIds().sort()).toEqual([1, 2]);
		});

		it('resolves names in batches of 500', async () => {
			fakeEsi({});
			const names = Array.from({ length: 1200 }, (_, i) => `Pilot ${i}`);

			await addCharactersFromESI(names);

			const batches = postBodies(IDS_URL);
			expect(batches.map((b) => b.length)).toEqual([500, 500, 200]);
			expect(batches.flat()).toEqual(names);
		});

		it('negatively caches unknown names so they are not sent to /universe/ids again', async () => {
			fakeEsi({ 1: { name: 'Char One', corporation_id: 10 } });

			await addCharactersFromESI(['Char One', 'Ghost Pilot']);
			fetchPOST.mockClear();

			await addCharactersFromESI(['Char One', 'GHOST PILOT']);

			expect(postBodies(IDS_URL)).toEqual([['Char One']]);
		});

		it('does not call ESI at all when every name is a cached miss', async () => {
			fakeEsi({});
			await addCharactersFromESI(['Ghost', 'Nobody']);
			fetchPOST.mockClear();

			await addCharactersFromESI(['ghost', 'NOBODY']);

			expect(fetchPOST).not.toHaveBeenCalled();
			expect(addOrUpdateCharactersDB).not.toHaveBeenCalled();
		});

		it('treats names resolved under a different case as found, not as misses', async () => {
			fakeEsi({ 1: { name: 'Char One', corporation_id: 10 } });

			await addCharactersFromESI(['cHaR oNe']);
			expect(storedIds()).toEqual([1]);
			expect(addOrUpdateCharactersDB.mock.calls[0][0][0].name).toBe('Char One');

			fetchPOST.mockClear();
			await addCharactersFromESI(['cHaR oNe']);
			expect(postBodies(IDS_URL)).toEqual([['cHaR oNe']]);
		});

		it('does not cache misses when a /universe/ids batch failed', async () => {
			fakeEsi({});
			const names = Array.from({ length: 501 }, (_, i) => `Pilot ${i}`);
			const ok = fetchPOST.getMockImplementation();
			fetchPOST.mockImplementation(async (url, body) => (body.length === 1 ? null : ok(url, body)));

			await addCharactersFromESI(names);
			fetchPOST.mockClear();
			fakeEsi({});

			await addCharactersFromESI(names);

			expect(postBodies(IDS_URL).flat()).toEqual(names);
		});

		it('still stores characters from successful batches when another batch fails', async () => {
			const chars = Object.fromEntries(
				Array.from({ length: 501 }, (_, i) => [
					i + 1,
					{ name: `Pilot ${i + 1}`, corporation_id: 10 }
				])
			);
			fakeEsi(chars);
			const ok = fetchPOST.getMockImplementation();
			fetchPOST.mockImplementation(async (url, body) =>
				url === IDS_URL && body.length === 1 ? json({}, 503) : ok(url, body)
			);

			await addCharactersFromESI(Object.values(chars).map((c) => c.name));

			expect(storedIds()).toHaveLength(500);
		});
	});

	describe('idsToCharacters', () => {
		it('requests affiliations in batches of 1000', async () => {
			fakeEsi({});
			const ids = Array.from({ length: 2500 }, (_, i) => i + 1);

			await idsToCharacters(ids);

			const batches = postBodies(AFFILIATION_URL);
			expect(batches.map((b) => b.length)).toEqual([1000, 1000, 500]);
			expect(batches.flat()).toEqual(ids);
		});

		it('biomasses Doomheim characters without requesting their details', async () => {
			fakeEsi({
				1: { name: 'Alive', corporation_id: 10 },
				2: { name: 'Dead', corporation_id: DOOMHEIM }
			});

			const result = await idsToCharacters([1, 2]);

			expect(biomassedIds()).toEqual([2]);
			expect(getIds()).toEqual([1]);
			expect(result.map((c) => c.id)).toEqual([1]);
		});

		it('biomasses a character whose details answer 404 and leaves it out', async () => {
			fakeEsi(
				{
					1: { name: 'Alive', corporation_id: 10 },
					2: { name: 'Just Deleted', corporation_id: 10 }
				},
				{ deleted: [2] }
			);

			const result = await idsToCharacters([1, 2]);

			expect(biomassCharacters).toHaveBeenCalledWith([2]);
			expect(result.map((c) => c.id)).toEqual([1]);
		});

		it('leaves out characters whose details could not be fetched without biomassing them', async () => {
			fakeEsi(
				{
					1: { name: 'Alive', corporation_id: 10 },
					2: { name: 'Unlucky', corporation_id: 10 }
				},
				{ failingGets: [2] }
			);

			const result = await idsToCharacters([1, 2]);

			expect(result.map((c) => c.id)).toEqual([1]);
			expect(biomassedIds()).not.toContain(2);
		});

		it('takes corporation and alliance from the affiliation, not the cached details', async () => {
			fakeEsi({ 1: { name: 'Mover', corporation_id: 10, alliance_id: 100 } });

			const [character] = await idsToCharacters([1]);

			expect(character).toMatchObject({ id: 1, corporation_id: 10, alliance_id: 100 });
		});
	});

	describe('updateCharactersFromESI', () => {
		it('returns and stores only characters whose corporation and alliance exist', async () => {
			fakeEsi({
				1: { name: 'Fine', corporation_id: 10, alliance_id: 100 },
				2: { name: 'Corp Missing', corporation_id: 20 },
				3: { name: 'Alliance Missing', corporation_id: 10, alliance_id: 200 },
				4: { name: 'No Alliance', corporation_id: 10 }
			});
			getCorporationsByID.mockImplementation(async (ids) =>
				ids.filter((id) => id !== 20).map((id) => ({ id }))
			);
			getAlliancesByID.mockImplementation(async (ids) =>
				ids.filter((id) => id !== 200).map((id) => ({ id }))
			);

			const stored = await updateCharactersFromESI([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);

			expect(stored.map((c) => c.id).sort()).toEqual([1, 4]);
			expect(storedIds().sort()).toEqual([1, 4]);
		});

		it('returns an empty list when nothing could be fetched', async () => {
			fetchPOST.mockResolvedValue(null);

			await expect(updateCharactersFromESI([{ id: 1 }])).resolves.toEqual([]);
			expect(fetchGET).not.toHaveBeenCalled();
		});
	});

	describe('updateAffiliationsFromESI', () => {
		it('applies new affiliations without fetching character details', async () => {
			fakeEsi({
				1: { name: 'Joined Alliance', corporation_id: 11, alliance_id: 101 },
				2: { name: 'Left Alliance', corporation_id: 22 }
			});

			const stored = await updateAffiliationsFromESI([
				{ id: 1, corporation_id: 10, alliance_id: null },
				{ id: 2, corporation_id: 20, alliance_id: 200 }
			]);

			expect(fetchGET).not.toHaveBeenCalled();
			expect(stored).toEqual([
				expect.objectContaining({ id: 1, corporation_id: 11, alliance_id: 101 }),
				expect.objectContaining({ id: 2, corporation_id: 22, alliance_id: null })
			]);
		});

		it('biomasses Doomheim characters and does not store them', async () => {
			fakeEsi({
				1: { name: 'Alive', corporation_id: 10 },
				2: { name: 'Dead', corporation_id: DOOMHEIM }
			});

			const stored = await updateAffiliationsFromESI([
				{ id: 1, corporation_id: 10, alliance_id: null },
				{ id: 2, corporation_id: 10, alliance_id: null }
			]);

			expect(biomassedIds()).toEqual([2]);
			expect(stored.map((c) => c.id)).toEqual([1]);
		});

		it('leaves characters missing from the affiliation response untouched', async () => {
			fakeEsi({ 1: { name: 'Known', corporation_id: 10 } });

			const stored = await updateAffiliationsFromESI([
				{ id: 1, corporation_id: 10, alliance_id: null },
				{ id: 2, corporation_id: 20, alliance_id: null }
			]);

			expect(stored.map((c) => c.id)).toEqual([1]);
		});

		it('skips characters whose new corporation could not be stored', async () => {
			fakeEsi({
				1: { name: 'Stays', corporation_id: 10 },
				2: { name: 'Moves', corporation_id: 30 }
			});
			getCorporationsByID.mockImplementation(async (ids) =>
				ids.filter((id) => id !== 30).map((id) => ({ id }))
			);

			const stored = await updateAffiliationsFromESI([
				{ id: 1, corporation_id: 10, alliance_id: null },
				{ id: 2, corporation_id: 20, alliance_id: null }
			]);

			expect(stored.map((c) => c.id)).toEqual([1]);
			expect(storedIds()).toEqual([1]);
		});
	});
});
