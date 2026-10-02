/**
 * Runs the real database modules against an in-memory Postgres (PGlite) with every
 * migration in ./drizzle applied, so SQL, constraints and migrations are exercised
 * together (the other database tests mock drizzle).
 */
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../../src/lib/server/tracer.js', () => ({
	withSpan: (name, fn) => fn({ setAttributes() {}, addEvent() {} })
}));

vi.mock('../../../src/lib/database/client.js', async () => {
	const { readFile } = await import('node:fs/promises');
	const { PGlite } = await import('@electric-sql/pglite');
	const { drizzle } = await import('drizzle-orm/pglite');
	const client = new PGlite();
	// Same statements, same order as drizzle's migrator. Executed with the simple query
	// protocol because 0000 contains several statements without breakpoints, which
	// PGlite's extended protocol (used by drizzle-orm/pglite's migrator) rejects.
	const journal = JSON.parse(await readFile('./drizzle/meta/_journal.json', 'utf8'));
	for (const { tag } of journal.entries) {
		const migration = await readFile(`./drizzle/${tag}.sql`, 'utf8');
		for (const statement of migration.split('--> statement-breakpoint')) {
			if (statement.trim()) await client.exec(statement);
		}
	}
	globalThis.__pgliteTestClient = client;
	return { db: drizzle(client), pool: null };
});

import { sql } from 'drizzle-orm';
import { db } from '../../../src/lib/database/client.js';
import {
	addOrUpdateCharactersDB,
	biomassCharacters,
	claimCharactersForRefresh,
	getCharactersByName
} from '../../../src/lib/database/characters.js';
import {
	createNewScan,
	getLatestScanIdInGroup,
	getPublicScansPage,
	getScanTimeline,
	getUserScansPage,
	SCAN_LIST_PAGE_SIZE,
	updateScan
} from '../../../src/lib/database/scans.js';
import { getScanStats } from '../../../src/lib/database/stats.js';
import {
	applyCorporationAllianceChange,
	claimCorporationsForRefresh
} from '../../../src/lib/database/corporations.js';
import { addOrUpdateCategoriesDB, addOrUpdateGroupsDB } from '../../../src/lib/database/sde.js';

async function resetData() {
	await db.execute(sql`
		TRUNCATE dev.scans, dev.scan_groups, characters, corporations, alliances, auth."user" CASCADE
	`);
	await db.execute(
		sql`INSERT INTO alliances (id, name, ticker) VALUES (99000001, 'Alliance', 'ALLY')`
	);
	await db.execute(sql`
		INSERT INTO corporations (id, name, ticker, alliance_id) VALUES
			(98000001, 'Corp', 'CORP', 99000001), (1000001, 'Doomheim', '666', NULL)
	`);
}

describe('database (PGlite, all migrations applied)', () => {
	beforeEach(resetData);
	afterAll(async () => {
		await globalThis.__pgliteTestClient?.close();
	});

	describe('characters', () => {
		it('returns one live row per name, ignoring biomassed holders of the same name', async () => {
			await db.execute(sql`
				INSERT INTO characters (id, name, corporation_id, alliance_id, updated_at, deleted_at) VALUES
					(1, 'Reused Name', 1000001, NULL, now() - interval '2 days', now() - interval '2 days'),
					(2, 'Reused Name', 98000001, 99000001, now() - interval '1 day', NULL),
					(3, 'Reused Name', 98000001, 99000001, now(), NULL),
					(4, 'Other', 98000001, 99000001, now(), NULL)
			`);

			const rows = await getCharactersByName(['Reused Name', 'Other', 'Missing']);

			expect(rows.map((r) => [r.name, r.id]).sort()).toEqual([
				['Other', 4],
				['Reused Name', 3]
			]);
			expect(rows.find((r) => r.id === 3)).toMatchObject({
				corporation_ticker: 'CORP',
				alliance_ticker: 'ALLY'
			});
		});

		it('upserts duplicate ids in one call and batches beyond the parameter limit', async () => {
			const many = Array.from({ length: 12_000 }, (_, i) => ({
				id: 10_000 + i,
				name: `Pilot ${i}`,
				corporation_id: 98000001
			}));
			// Same character twice (e.g. "bob" and "Bob" resolved to one id): last one wins.
			many.push({ id: 10_000, name: 'Pilot Renamed', corporation_id: 98000001 });

			await addOrUpdateCharactersDB(many);

			const { rows } = await db.execute(
				sql`SELECT count(*)::int AS n, max(name) FILTER (WHERE id = 10000) AS renamed FROM characters`
			);
			expect(rows[0]).toEqual({ n: 12_000, renamed: 'Pilot Renamed' });

			const found = await getCharactersByName(many.slice(0, 6_000).map((c) => c.name));
			expect(found).toHaveLength(5_999); // "Pilot 0" was renamed
		});

		it('matches names case-insensitively and returns the canonical spelling', async () => {
			await db.execute(sql`
				INSERT INTO characters (id, name, corporation_id, alliance_id) VALUES
					(5, 'Chribba', 98000001, 99000001),
					(6, 'Other Pilot', 98000001, NULL)
			`);

			const rows = await getCharactersByName(['chribba', 'CHRIBBA', 'oThEr pIlOt']);

			expect(rows.map((r) => [r.id, r.name]).sort()).toEqual([
				[5, 'Chribba'],
				[6, 'Other Pilot']
			]);
		});

		it('biomasses only the given characters, hiding them from name lookups', async () => {
			await db.execute(sql`
				INSERT INTO characters (id, name, corporation_id, alliance_id) VALUES
					(7, 'Gone One', 98000001, 99000001),
					(8, 'Gone Two', 98000001, 99000001),
					(9, 'Still Here', 98000001, 99000001)
			`);

			await biomassCharacters([7, 8]);

			const { rows } = await db.execute(sql`
				SELECT id, corporation_id, alliance_id, deleted_at IS NOT NULL AS deleted
				FROM characters ORDER BY id
			`);
			expect(rows).toEqual([
				{ id: 7, corporation_id: 1000001, alliance_id: null, deleted: true },
				{ id: 8, corporation_id: 1000001, alliance_id: null, deleted: true },
				{ id: 9, corporation_id: 98000001, alliance_id: 99000001, deleted: false }
			]);
			const found = await getCharactersByName(['Gone One', 'Gone Two', 'Still Here']);
			expect(found.map((r) => r.id)).toEqual([9]);
		});
	});

	describe('scans', () => {
		it('serves the group timeline with counters only and finds the latest scan', async () => {
			await createNewScan({
				scanGroupId: 'g1',
				scanId: 's1',
				is_public: true,
				type: 'local',
				data: { total_pilots: 42, alliances: [] },
				raw_data: 'x'
			});
			await new Promise((r) => setTimeout(r, 5));
			await updateScan({
				scanGroupId: 'g1',
				scanId: 's2',
				type: 'directional',
				data: { on_grid: { total_objects: 7 }, off_grid: { total_objects: 120 } },
				raw_data: 'y'
			});

			const timeline = await getScanTimeline('g1');

			expect(timeline.map((r) => r.id)).toEqual(['s1', 's2']);
			expect(timeline[0]).toMatchObject({ scan_type: 'local', total_pilots: 42 });
			expect(timeline[1]).toMatchObject({
				scan_type: 'directional',
				total_pilots: null,
				on_grid_objects: 7,
				off_grid_objects: 120
			});
			expect(timeline[0].created_at).toBeInstanceOf(Date);
			expect(Object.keys(timeline[0])).not.toContain('data');

			expect(await getLatestScanIdInGroup('g1')).toBe('s2');
			expect(await getLatestScanIdInGroup('nope')).toBeNull();
		});

		it('keeps scans when their owner is deleted (created_by -> NULL)', async () => {
			await db.execute(sql`INSERT INTO auth."user" (id, name) VALUES ('u1', 'Owner')`);
			await createNewScan({
				scanGroupId: 'g2',
				scanId: 's3',
				is_public: false,
				type: 'local',
				data: { total_pilots: 1 },
				raw_data: 'x',
				created_by: 'u1'
			});

			await db.execute(sql`DELETE FROM auth."user" WHERE id = 'u1'`);

			const { rows } = await db.execute(
				sql`SELECT s.created_by AS scan_owner, g.created_by AS group_owner
				    FROM dev.scans s JOIN dev.scan_groups g ON g.id = s.group_id WHERE s.id = 's3'`
			);
			expect(rows).toEqual([{ scan_owner: null, group_owner: null }]);
		});

		it('stores timestamps as instants (timestamptz)', async () => {
			await db.execute(sql`SET TIME ZONE 'Asia/Tokyo'`);
			try {
				await createNewScan({
					scanGroupId: 'g3',
					scanId: 's4',
					is_public: false,
					type: 'local',
					data: { total_pilots: 1 },
					raw_data: 'x'
				});
				const [row] = await getScanTimeline('g3');
				expect(Math.abs(row.created_at.getTime() - Date.now())).toBeLessThan(60_000);
			} finally {
				await db.execute(sql`SET TIME ZONE 'UTC'`);
			}
		});

		describe('scan lists', () => {
			async function seedListScans() {
				await db.execute(
					sql`INSERT INTO auth."user" (id, name) VALUES ('u1', 'One'), ('u2', 'Two')`
				);
				await db.execute(sql`
					INSERT INTO dev.scan_groups (id, public, system, created_by) VALUES
						('gJ', true, '{"name":"Jita","security":0.95,"region":"The Forge"}', 'u1'),
						('gA', true, '{"name":"Amarr"}', 'u2'),
						('gP', false, '{"name":"Jita"}', 'u1'),
						('gN', true, NULL, NULL),
						('gW', true, '{"name":"100%_Safe"}', 'u2'),
						('gX', true, '{"name":"1000xSafe"}', 'u2'),
						('gB', true, ${JSON.stringify({ name: 'Back\\slash' })}::json, 'u2'),
						('gS', true, '{"name":"Saltsystem"}', 'u2')
				`);
				await db.execute(sql`
					INSERT INTO dev.scans (id, group_id, scan_type, data, raw_data, created_at, created_by) VALUES
						('j1', 'gJ', 'local', '{}', 'x', '2026-01-01T10:00:00Z', 'u1'),
						('j2', 'gJ', 'directional', '{}', 'x', '2026-01-01T11:00:00Z', 'u1'),
						('a1', 'gA', 'local', '{}', 'x', '2026-01-01T12:00:00Z', 'u2'),
						('p1', 'gP', 'local', '{}', 'x', '2026-01-01T13:00:00Z', 'u1'),
						('n1', 'gN', 'directional', '{}', 'x', '2026-01-01T09:00:00Z', NULL),
						('t1', 'gN', 'local', '{}', 'x', '2026-01-01T08:00:00Z', NULL),
						('t2', 'gN', 'local', '{}', 'x', '2026-01-01T08:00:00Z', NULL),
						('w1', 'gW', 'local', '{}', 'x', '2026-01-01T07:00:00Z', 'u2'),
						('x1', 'gX', 'local', '{}', 'x', '2026-01-01T06:00:00Z', 'u2'),
						('b1', 'gB', 'local', '{}', 'x', '2026-01-01T05:00:00Z', 'u2'),
						('s1', 'gS', 'local', '{}', 'x', '2026-01-01T04:00:00Z', 'u2')
				`);
			}

			it('lists public scans newest first (id desc on ties) with minimal columns', async () => {
				await seedListScans();

				const result = await getPublicScansPage();

				expect(result.rows.map((r) => r.id)).toEqual([
					'a1',
					'j2',
					'j1',
					'n1',
					't2',
					't1',
					'w1',
					'x1',
					'b1',
					's1'
				]);
				expect(result).toMatchObject({ total: 10, page: 1, pageSize: SCAN_LIST_PAGE_SIZE });
				expect(result.rows[1]).toEqual({
					id: 'j2',
					group_id: 'gJ',
					scan_type: 'directional',
					created_at: new Date('2026-01-01T11:00:00Z'),
					system: { name: 'Jita', security: 0.95, region: 'The Forge' }
				});
				expect(result.rows[0].system).toEqual({ name: 'Amarr', security: null, region: null });
				expect(result.rows[3].system).toBeNull();
			});

			it('filters by type and case-insensitive system name', async () => {
				await seedListScans();

				const jitaLocal = await getPublicScansPage({ query: ' jItA ', type: 'local' });
				expect(jitaLocal.rows.map((r) => r.id)).toEqual(['j1']);
				expect(jitaLocal.total).toBe(1);

				const directional = await getPublicScansPage({ type: 'directional' });
				expect(directional.rows.map((r) => r.id)).toEqual(['j2', 'n1']);

				const anyType = await getPublicScansPage({ type: 'wormhole' });
				expect(anyType.total).toBe(10);
			});

			it('matches %, _ and \\ in the search term literally', async () => {
				await seedListScans();

				expect((await getPublicScansPage({ query: '100%_' })).rows.map((r) => r.id)).toEqual([
					'w1'
				]);
				expect((await getPublicScansPage({ query: '%' })).rows.map((r) => r.id)).toEqual(['w1']);
				expect((await getPublicScansPage({ query: '_' })).rows.map((r) => r.id)).toEqual(['w1']);
				expect((await getPublicScansPage({ query: '\\s' })).rows.map((r) => r.id)).toEqual(['b1']);
			});

			it('scopes the personal list to the creator and includes private scans', async () => {
				await seedListScans();

				const mine = await getUserScansPage('u1');
				expect(mine.rows.map((r) => [r.id, r.public])).toEqual([
					['p1', false],
					['j2', true],
					['j1', true]
				]);
				expect(mine.total).toBe(3);

				const mineJitaLocal = await getUserScansPage('u1', { query: 'jita', type: 'local' });
				expect(mineJitaLocal.rows.map((r) => r.id)).toEqual(['p1', 'j1']);

				expect(await getUserScansPage('nobody')).toEqual({
					rows: [],
					total: 0,
					page: 1,
					pageSize: SCAN_LIST_PAGE_SIZE
				});
			});

			it('paginates and clamps the page into range', async () => {
				const count = SCAN_LIST_PAGE_SIZE + 5;
				await db.execute(sql`INSERT INTO dev.scan_groups (id, public) VALUES ('gBig', true)`);
				await db.execute(sql`
					INSERT INTO dev.scans (id, group_id, scan_type, data, raw_data, created_at)
					SELECT 'big' || lpad(i::text, 3, '0'), 'gBig', 'local', '{}', 'x',
						'2026-01-01T00:00:00Z'::timestamptz + i * interval '1 minute'
					FROM generate_series(1, ${count}) AS i
				`);

				const first = await getPublicScansPage({ page: 1 });
				expect(first.total).toBe(count);
				expect(first.rows).toHaveLength(SCAN_LIST_PAGE_SIZE);
				expect(first.rows[0].id).toBe('big055');

				const second = await getPublicScansPage({ page: 2 });
				expect(second.page).toBe(2);
				expect(second.rows.map((r) => r.id)).toEqual([
					'big005',
					'big004',
					'big003',
					'big002',
					'big001'
				]);

				expect((await getPublicScansPage({ page: 99 })).page).toBe(2);
				expect((await getPublicScansPage({ page: 0 })).page).toBe(1);
				expect((await getPublicScansPage({ page: 'abc' })).page).toBe(1);
			});
		});
	});

	describe('stats', () => {
		it('counts scans and groups without double counting', async () => {
			await createNewScan({
				scanGroupId: 'pub',
				scanId: 'a',
				is_public: true,
				type: 'local',
				data: {},
				raw_data: 'x'
			});
			await updateScan({
				scanGroupId: 'pub',
				scanId: 'b',
				type: 'directional',
				data: {},
				raw_data: 'x'
			});
			await createNewScan({
				scanGroupId: 'priv',
				scanId: 'c',
				is_public: false,
				type: 'local',
				data: {},
				raw_data: 'x'
			});

			expect(await getScanStats()).toEqual({
				totalScans: 3,
				publicScans: 2,
				localScans: 2,
				directionalScans: 1,
				totalScanGroups: 2,
				publicScanGroups: 1,
				scanGroupsWithoutSystem: 2
			});
		});
	});

	describe('updater refresh claims', () => {
		async function insertPilots() {
			await db.execute(sql`
				INSERT INTO characters
					(id, name, corporation_id, alliance_id, updated_at, last_seen, refresh_attempted_at, deleted_at)
				VALUES
					(1, 'Oldest', 98000001, 99000001, now() - interval '5 days', now(), NULL, NULL),
					(2, 'Due', 98000001, 99000001, now() - interval '2 days', now(), NULL, NULL),
					(3, 'Fresh', 98000001, 99000001, now() - interval '1 hour', now(), NULL, NULL),
					(4, 'Not seen in a year', 98000001, 99000001, now() - interval '5 days', now() - interval '400 days', NULL, NULL),
					(5, 'Attempted recently', 98000001, 99000001, now() - interval '5 days', now(), now() - interval '10 minutes', NULL),
					(6, 'Attempt expired', 98000001, 99000001, now() - interval '3 days', now(), now() - interval '2 hours', NULL),
					(7, 'Biomassed', 1000001, NULL, now() - interval '5 days', now(), NULL, now())
			`);
		}

		it('claims only due, recently seen, not recently attempted living rows, oldest first', async () => {
			await insertPilots();

			const claimed = await claimCharactersForRefresh(10);

			expect(claimed.map((c) => c.id)).toEqual(expect.arrayContaining([1, 2, 6]));
			expect(claimed).toHaveLength(3);
			expect(claimed.every((c) => c.refresh_attempted_at !== null)).toBe(true);
		});

		it('respects the limit and does not hand out claimed rows again within the retry window', async () => {
			await insertPilots();

			const first = await claimCharactersForRefresh(2);
			const second = await claimCharactersForRefresh(10);
			const third = await claimCharactersForRefresh(10);

			// oldest updated_at first: 1 (5 days), 6 (3 days); then 2 (2 days)
			expect(first.map((c) => c.id).sort()).toEqual([1, 6]);
			expect(second.map((c) => c.id)).toEqual([2]);
			expect(third).toEqual([]);
		});

		it('claims corporations by the same rules', async () => {
			await db.execute(sql`
				UPDATE corporations SET updated_at = now() - interval '2 days', last_seen = now()
				WHERE id = 98000001
			`);

			expect((await claimCorporationsForRefresh(10)).map((c) => c.id)).toEqual([98000001]);
			expect(await claimCorporationsForRefresh(10)).toEqual([]);
		});
	});

	describe('corporation alliance changes', () => {
		beforeEach(async () => {
			await db.execute(
				sql`INSERT INTO alliances (id, name, ticker) VALUES (99000002, 'Other Alliance', 'OTHR')`
			);
			await db.execute(sql`
				INSERT INTO characters (id, name, corporation_id, alliance_id, updated_at, deleted_at) VALUES
					(1, 'Member', 98000001, 99000001, now() - interval '2 days', NULL),
					(2, 'Member Two', 98000001, 99000001, now() - interval '2 days', NULL),
					(3, 'Biomassed member', 98000001, 99000001, now() - interval '2 days', now())
			`);
		});

		async function state() {
			const { rows } = await db.execute(sql`
				SELECT 'corp' AS kind, id, alliance_id, NULL::boolean AS stale FROM corporations WHERE id = 98000001
				UNION ALL
				SELECT 'char', id, alliance_id, updated_at < now() - interval '1 day' FROM characters
				ORDER BY kind, id
			`);
			return rows;
		}

		it('moves the corporation and its living members to the new alliance', async () => {
			expect(await applyCorporationAllianceChange(98000001, 99000002)).toBe(2);

			expect(await state()).toEqual([
				{ kind: 'char', id: 1, alliance_id: 99000002, stale: true },
				{ kind: 'char', id: 2, alliance_id: 99000002, stale: true },
				{ kind: 'char', id: 3, alliance_id: 99000001, stale: true },
				{ kind: 'corp', id: 98000001, alliance_id: 99000002, stale: null }
			]);
		});

		it('clears the alliance when the corporation left it', async () => {
			expect(await applyCorporationAllianceChange(98000001, null)).toBe(2);

			const rows = await state();
			expect(rows.filter((r) => r.id !== 3).every((r) => r.alliance_id === null)).toBe(true);
		});

		it('changes nothing when the alliance is unchanged', async () => {
			expect(await applyCorporationAllianceChange(98000001, 99000001)).toBe(0);
		});

		it('rolls back the corporation when the alliance is unknown', async () => {
			await expect(applyCorporationAllianceChange(98000001, 99999999)).rejects.toThrow();

			expect((await state()).every((r) => r.alliance_id === 99000001)).toBe(true);
		});
	});

	describe('SDE upserts', () => {
		it('rolls back the whole table when a later batch fails', async () => {
			await db.execute(sql`TRUNCATE inv_categories CASCADE`);
			await addOrUpdateCategoriesDB([{ id: 6, name: 'Ship' }]);

			const group = (id, categoryId) => ({
				id,
				name: `Group ${id}`,
				anchorable: false,
				anchored: false,
				fittable_non_singleton: false,
				category_id: categoryId,
				icon_id: null
			});
			// 1,000 valid groups (first batch), then one whose category does not exist.
			const groups = Array.from({ length: 1_000 }, (_, i) => group(i + 1, 6));
			groups.push(group(5_000, 404));

			await expect(addOrUpdateGroupsDB(groups)).rejects.toThrow();

			const { rows } = await db.execute(sql`SELECT count(*)::int AS n FROM inv_groups`);
			expect(rows[0].n).toBe(0);
		});
	});
});
