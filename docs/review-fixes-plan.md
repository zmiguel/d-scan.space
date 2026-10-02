# Review Fixes – Upgrade Plan

Plan for fixing the issues found in the 2026-10 code review. Work is split into
batches that can each be finished (implemented, verified, documented) in one
working session. Batches are ordered by risk: security and data integrity first.

Status legend: `[ ]` pending · `[x]` done · `[~]` partially done / follow-up noted

## Ground rules

- **Backward compatible.** Existing databases, scan URLs, sessions and env files
  keep working. Schema changes ship as Drizzle migrations that run on top of the
  current `0004` state and preserve existing data.
- **ORM-first migrations.** `src/lib/database/schema.js` is the source of truth.
  Every schema change is made there first and the migration is produced with
  `drizzle-kit generate --name=<change>` (SQL + `meta/*_snapshot.json` + journal).
  Generated SQL may then be extended or adjusted by hand (data backfills, guards,
  dropping statements for objects that already exist), with a header comment
  explaining every manual edit. Data-only migrations use
  `drizzle-kit generate --custom`. After each change `drizzle-kit generate` must
  report "No schema changes" (schema ↔ snapshots in sync); CI enforces this in 5.7.
- **Per-environment scan schemas.** `scans` / `scan_groups` exist in `dev`,
  `preview` and `prod` schemas in every database, but `schema.js` and the
  snapshots currently only model the `DB_ENV` schema (`dev`), which is why the
  `preview`/`prod` indexes were missed. Batch 2 makes `schema.js` model all three
  so drizzle-kit generates their DDL (see 2.1).
- **Migrations are verified** against a throwaway Postgres (PGlite, as no
  Docker/psql is available locally) by replaying `0000`–`000N` on an empty
  database and then on a database seeded with legacy-shaped rows.
- **Never run Docker on the maintainer's machine** (no `docker`/`docker compose`
  commands, no starting Docker Desktop). Container changes are verified statically and
  by running the same commands outside Docker; image builds are verified by CI.
- **Docs and `CHANGELOG.md` are updated in the same batch as the code.**
- Each batch ends with `npm run lint`, `npm run check`, `npm test` and a smoke
  run of the changed path.

## Decisions (confirmed with the maintainer)

| Topic                                        | Decision                                                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anonymous scan groups (`created_by IS NULL`) | Stay open for anyone to append (collaborative by design). Document the behaviour; no edit tokens.                                                                                                            |
| On-grid classification                       | `m`/`km` distances up to a configurable threshold count as on-grid. Env `DSCAN_ON_GRID_MAX_KM`, default `50000` (maintainer adjusted from 10000). Farther, `AU`, or `-` = off-grid.                          |
| Localized clients                            | Fix number parsing now (NBSP / narrow NBSP / space / `.` thousands separators, `,` decimals). Localized unit strings are added later from real client samples. Russian/Chinese `*` markers are out of scope. |
| Scan type detection                          | Stays strict (100 % of lines must match), but the form stays on screen and shows the offending line numbers instead of the error page.                                                                       |
| Rybbit analytics / session replay            | Unchanged (self-hosted, first-party instance).                                                                                                                                                               |
| docker-compose Postgres                      | Compose is dev/self-host only. Switch to the PG18 volume layout (`/var/lib/postgresql`) and document the upgrade path for older volumes.                                                                     |
| Timestamps                                   | Production DB runs in UTC → migrate every `timestamp` column to `timestamptz` (`USING col AT TIME ZONE 'UTC'`).                                                                                              |
| Security status display                      | Keep the SDE value with 2 decimals in the label. Colour follows the in-game rounded value: round to 1 decimal, `0.0 < sec < 0.05` counts as `0.1`; `>= 0.5` high-sec, `> 0.0` low-sec, else null-sec.        |
| Trace data                                   | Keep as much as possible: full ESI request/response headers and bodies, DB upsert values, client address, failed scan lines. Logs stay free of pasted text. Later batches must not slim traces.              |
| Scan size limits                             | Only local scans are line-capped (`LOCAL_SCAN_MAX_LINES`, 12,000, maintainer-adjusted) because of ESI fan-out. D-scans are unlimited (big fights) and bounded only by `BODY_SIZE_LIMIT`, default 16M.        |

## Batch 1 – Authentication & request security ✅

Verified: `npm run lint`, `npm run check`, `npm test` (363 tests); migration `0005`
replayed on PGlite with legacy rows (valid / foreign-`sub` / malformed / missing
tokens); production build smoke-run against a throwaway PGlite server (18 HTTP/DB
checks: headers, client session shape, legacy-cookie cleanup, buyer session drop,
open redirect, canonical group redirect, noindex, 400/404 update, real transfer
sign-in unlinking + primary reassignment).

- [x] **1.1 CharacterOwnerHash enforcement** (`src/auth.js`, schema, migration `0005`)
  - Add nullable `auth.account.character_owner_hash` in `schema.js`; migration
    `0005_account_owner_hash` generated by drizzle-kit, then extended by hand with
    the backfill and token cleanup below (documented in the file header).
  - Backfill: the stored EVE SSO v2 `access_token` is a JWT whose payload has an
    `owner` claim (owner hash at link time). Migration decodes it per row inside a
    guarded PL/pgSQL block (malformed tokens are skipped, never fail the migration).
  - `callbacks.signIn`: if an account row exists for the CharacterID and its stored
    hash differs from `profile.CharacterOwnerHash`, the character was transferred:
    unlink it from the previous user (and clear that user's primary character if
    it pointed at it) so Auth.js creates/links a fresh account for the new owner.
    Rows without a stored hash adopt the current one (trust on first use, only for
    rows the backfill could not decode).
  - New/updated links store the owner hash.
  - `callbacks.jwt` (non sign-in calls): drop the session (`return null`) when the
    signed-in character is no longer linked to `token.sub` or its owner hash
    changed. This revokes sessions held by a previous owner/buyer.
- [x] **1.2 Stop retaining OAuth tokens** – remove access/refresh/id tokens and the raw
      profile from the JWT, delete `session.eveDebug`, strip tokens before the adapter
      persists accounts, and null existing token columns in migration `0005` (after the
      backfill above). App scope is `publicData` only; nothing reads these tokens.
- [x] **1.3 Minimal client session** – `+layout.server.js` returns only the fields the
      UI uses instead of the whole Auth.js session.
- [x] **1.4 Open redirect** in `/switch-main` (`//evil`, `/\evil`).
- [x] **1.5 OTLP Authorization header** no longer logged at startup.
- [x] **1.6 Crypto-random scan/group IDs** (same lengths/alphabet so URLs look the same;
      old IDs remain valid).
- [x] **1.7 Scan ↔ group binding** on `/scan/[group]/[scan]`: a scan opened under the
      wrong group redirects to its canonical group URL.
- [x] **1.8 Update action validation** – `400` without `scan_group`, `404` for an unknown
      group, both before any ESI work; reuse the group row instead of fetching it twice;
      document the anonymous-group policy.
- [x] **1.9 Indexing hygiene** – `noindex` for private scans, `/my-scans` and error pages;
      remove the hard-coded canonical/description/robots duplicates from `app.html`.
- [x] **1.10 Misc** – remove the unreachable `src/routes/auth/[...auth]` route (after
      verifying `authHandle` serves `/auth/*`), integer-sanitise the system search
      `limit`, add `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy` headers.
      Also: `locals.auth()` memoized per request.

## Batch 2 – Database & data layer ✅

Migrations `0006`–`0008`, all generated by drizzle-kit from `schema.js` (manual edits
documented in each file header). Verified: lint, check, tests (incl. new PGlite
integration test running the real SQL on all migrations); `0006`–`0008` replayed on
PGlite with legacy rows and applied to the dev database inside a rolled-back
transaction (30/30 timestamp columns unchanged as instants, ~2 s); production build run
as two simultaneous instances against a scratch database on the dev server (advisory
lock serialized them, 9 migrations recorded once, fresh install on PostgreSQL 18), then
route smoke checks; the scratch database was dropped. Not exercised: SIGTERM graceful
shutdown (Windows cannot deliver POSIX signals to Node).

- [x] **2.1 Model all env scan schemas in `schema.js` + missing indexes.** Build the
      `scans`/`scan_groups` tables for `dev`, `preview` and `prod` from one factory
      (the app keeps using the `DB_ENV` one), include all three in `drizzle.config.js`
      `schemaFilter`, and let drizzle-kit generate the migration. The generated
      `CREATE TABLE`/FK statements for `preview`/`prod` (they already exist) are
      removed by hand; the generated indexes stay. Also add `(group_id, created_at)`
      for timeline/latest queries.
- [x] **2.2 `created_by` FKs → `ON DELETE SET NULL`** (all schemas) so users can be deleted.
- [x] **2.3 `characters.name`** unique index → non-unique (renamed/biomassed names can be
      reused); name lookups prefer the live, most recently updated row.
- [x] **2.4 `timestamp` → `timestamptz`** for every column (`AT TIME ZONE 'UTC'`).
- [x] **2.5 Pool hygiene** – `pool.on('error')`, remove dead `parseDatabaseUrl`.
- [x] **2.6 Env flag parsing** – `SKIP_MIGRATIONS=false` / `BUILD=false` must not skip
      migrations (string truthiness bug).
- [x] **2.7 Migrations before serving** – awaited from the SvelteKit `init` hook, under a
      Postgres advisory lock (safe with several replicas); no `process.exit` from a
      library module.
- [x] **2.8 Single shutdown owner** – remove signal handlers from `client.js`; app closes
      the pool on `sveltekit:shutdown`, worker in its own shutdown routine. Also moved the
      app's OTEL flush from SIGTERM/`process.exit` to `sveltekit:shutdown`.
- [x] **2.9 Lean scan queries** – latest-scan-id query for `/scan/[group]`, timeline
      summary query (counters only) instead of full `data`, reuse loaded rows.
- [x] **2.10 Stats** – `count(*) FILTER`, no join, 60 s in-memory cache.
- [x] **2.11 Chunk large `IN` lists / multi-row upserts** (Postgres 65 535 parameter limit).
      Upserts are also de-duplicated by id, which fixes the DB half of 3.5.

## Batch 3 – Scan ingest & ESI client ✅

Grounded in CCP's ESI docs ([overview](https://developers.eveonline.com/docs/services/esi/overview/),
[best practices](https://developers.eveonline.com/docs/services/esi/best-practices/),
[rate limiting](https://developers.eveonline.com/docs/services/esi/rate-limiting/)) and live
ESI probes: `/universe/ids` is case-insensitive and returns canonical names; every 4xx costs
error budget; `/characters/affiliation` reports deleted characters in Doomheim (200, no
batch failure) while `GET /characters/{id}` answers 404; OpenAPI maxItems are 500 / 1000;
the routes used have no bucket rate limit (error limit applies).
Migration `0009` (lower(name) index) generated by drizzle-kit; dry run on the dev database
in a rolled-back transaction (0.2 s, index scan confirmed). Smoke: production build on a
scratch database (SDE copied read-only from dev) with live ESI, 15 checks (case variants,
CRLF/zero-width, negative cache, 445-pilot example local, both d-scan examples incl. system
inference, grid threshold, inline 400/413/418 rejections).

- [x] **3.1 Shared ingest helper** for create/update (`src/lib/server/scan-submission.js`).
- [x] **3.2 Input normalization** – CRLF, hidden/zero-width characters, trimming, before
      detection and parsing.
- [x] **3.3 Input limits** – `LOCAL_SCAN_MAX_LINES` (default 12,000, local only; d-scans
      unlimited), default `BODY_SIZE_LIMIT` 16M in `.env.example`/compose.
- [x] **3.4 Strict detection with inline errors** – actions return `fail()` with the
      offending lines; form keeps the pasted text and shows them.
- [x] **3.5 Name case variants** – case-insensitive dedupe and lookups (`lower(name)`
      index); upserts de-duplicated by id (from 2.11).
- [x] **3.6 ESI client** – retry only network/5xx, `Retry-After` on 429 (per rate-limit
      group), global pause on 420 / low `x-esi-error-limit-remain`, per-group slowdown on
      low `X-Ratelimit-Remaining`, timeouts, shared concurrency limit, batch sizes 500/1000,
      callers parse JSON once; full request/response detail kept on spans (decision above).
- [x] **3.7 Partial ESI failure tolerance** – characters with an unavailable corp/alliance
      are skipped; corporations' own alliances are stored first.
- [x] **3.8 Unawaited `biomassCharacter`**; biomassing moved out of `wrappers.js`, batched,
      and based on affiliation (no 404 per deleted pilot).
- [x] **3.9 On-grid threshold + separator parsing** (`src/lib/utils/distance.js`).
- [x] **3.10 System inference** – weighted evidence (sun > celestials > structures,
      stargates ignored), one case-insensitive lookup of all candidates.
- [x] **3.11 Negative cache** for names ESI cannot resolve (1 h, in-memory, capped).
- [x] **3.12 Metrics/logging** – count scans once, no pasted text in logs, real
      `RequestEvent` passed to `withSpan` in actions.

## Batch 4 – Updater worker ✅

Verified: lint, `svelte-check`, full vitest (459; PGlite integration tests for claiming,
retry window, alliance propagation and SDE rollback), no drizzle drift for
dev/preview/prod, `0010` dry-run on the dev database (rolled back; 4 ms, 1,000-row claims
≤ 0.2 s). Two real workers on a scratch database: live SDE import (build 3561556, 6 s),
cross-process lock skips, 300 seeded pilots refreshed with a tampered corporation
alliance restored, SIGTERM during a job (drained, exit after 3.7 s) and drain timeout.
Not exercised: croner `protect` skip (runs finished within one tick).

- [x] **4.1 No overlapping runs** – croner `protect` + `pg_try_advisory_lock` per job
      (`workers/updater/src/utils/jobs.js`).
- [x] **4.2 Due rows in SQL** – `refresh_attempted_at` (migration `0010`) +
      `FOR UPDATE SKIP LOCKED` claims with a per-run limit (`src/lib/database/refresh.js`).
- [x] **4.3 Alliance propagation** – `applyCorporationAllianceChange` updates corporation
      and members in one transaction without bumping `updated_at`; dead guards removed.
- [x] **4.4 Failed character refreshes** wait 1 h (`refresh_attempted_at`) instead of
      staying at the head of the queue.
- [x] **4.5 SDE download/import** – streamed download (timeout, User-Agent, size check,
      backpressure), `yauzl` streaming extraction, shared streaming JSONL reader,
      per-table transactions, orphan rows skipped, temp cleanup in `finally`, real
      progress events.
- [x] **4.6 `extract.js`** – extract-all branch removed; output paths never come from the
      archive.
- [x] **4.7 Graceful shutdown** – waits for the running job (`SHUTDOWN_TIMEOUT_MS`),
      flushes telemetry, closes the pool.
- [x] **4.8 Instrumentation** loaded with `node --import`; imported OTEL packages declared
      in `workers/updater/package.json`.

## Batch 5 – Infra, observability, CI, docs ✅ (images verified by CI only)

Verified: lint, `svelte-check`, full vitest (469), no drizzle drift for dev/preview/prod,
`docker compose config` (static) for default and `debug` profiles. Production build run
from a `npm ci --omit=dev` install (the new dependency split) against a scratch
database: migrations, `/healthz` 200 + `no-store`, pages, Prometheus HTTP/pg metrics,
OTLP to a fake collector with the base endpoint form (traces → `/v1/traces`, metrics →
`/v1/metrics`, Authorization header, request attributes on the request span), startup refused without
`AUTH_SECRET`. Worker with the `/v1/traces` form: both signals exported, SIGTERM flush,
heartbeat written, healthcheck exit 0. Not verified locally (no Docker, by maintainer
rule): image builds, `USER node` runtime, container healthchecks, compose startup order,
the PG18 volume layout; the CI `docker-build-test` job builds both images on PRs.

- [x] **5.1 OTEL** – shared `src/lib/server/telemetry.js`: explicit readers/views (no
      implicit env metric/log pipelines, one MeterProvider), base or `/v1/traces`
      endpoint, OTLP only when configured, 15 s metric interval, SDK batch defaults,
      exporter's own retries, throttled export-error logging, bounded flush.
- [x] **5.2 Logging** – `logger.error({ err }, msg)` everywhere.
- [~] **5.3 Small observability fixes** – the request SERVER span
  `server.hooks.handle_request` is **kept** (maintainer report: removing it in favour of
  Kit's INTERNAL `sveltekit.handle.root` made request traces disappear from trace views
  that select server spans). Kit's `isRedirect`/`isHttpError` cannot be imported because
  `tracer.js` is shared with the worker (no `@sveltejs/kit` there); replaced by a precise
  structural check (Kit's classes are not `Error` subclasses), tested with real
  `error()`/`redirect()` results. Follow-up from the same report: per-message export
  error throttling, `OTEL_METRICS_EXPORTER=prometheus` for traces-only collectors, one
  SDK per process under `vite dev` — verified with `vite dev` against a fake collector
  and the real endpoint (traces 200, metrics 404).
- [x] **5.4 docker-compose** – PG18 volume at `/var/lib/postgresql` + upgrade steps,
      `AUTH_*` and tuning vars, Adminer on 127.0.0.1 behind `debug`, healthchecks +
      `depends_on: service_healthy`, OTLP endpoint default empty.
- [x] **5.5 Dockerfiles** – `.dockerignore`, `USER node`, `CMD ["node","build"]`, no
      placeholder `ENV`, `BODY_SIZE_LIMIT=16M`, `/healthz`, worker heartbeat healthcheck.
- [x] **5.6 Dependencies** – tooling in `devDependencies`, OTEL/`globals`/
      `simple-datatables` declared, unused direct deps removed, dead adapter option removed.
- [x] **5.7 CI** – `contents: read`, `svelte-check`, drift check + migrations twice on
      PG18, publish gated on `test.yml`, lockfile/workflow path filters, Dependabot for
      actions + docker.
- [x] **5.8 Env drift** – `.env.example` matches the code; production startup validation
      (`src/lib/server/env-check.js`).
- [x] **5.9 Docs** – README, development, architecture, tracing guide, copilot
      instructions, CLAUDE.md; `logger.test.js` rewritten without the env leak.

## Batch 6 – UI / UX ✅

Verified with a behaviour baseline recorded in a browser **before** any change (real scan
groups copied read-only from the dev database into a scratch DB) and re-run after:
directional hover/click/keyboard highlighting (exact rows per group, multi-select,
deselect), local alliance/corp/pilot highlighting (rows per column and exact RGB colours),
truncation tooltips. Dark mode: identical to the baseline. Light mode: only the intended
change (highlight now visible). Tooltips: Space tab 6/6 truncated names (was 2/6: on-grid
typo), 55/55 at a narrow viewport, overview 40/40 sampled. Plus: Overview tab highlighting,
disclosure rows (row click toggles, zKillboard link and names above the overlay), selection
reset on navigation, paired-scan notice, Copy link success/failure toasts, badge colour,
no duplicate ids, scan lists (filters, escaping, clamp, links). lint, svelte-check,
vitest (499).

- [x] **6.1 Paired scan age** – `pairedScan` from the load, `PairedScanNotice`. (Lean
      queries were done in 2.9.)
- [x] **6.2 Truncation tooltips** – `TruncatedText.svelte` (ResizeObserver, unique id, no
      document listeners), on-grid typo gone with the shared code; `OverviewSpace` and
      `TabDirectionalScan` share `src/lib/components/directional/*` + `GroupHighlight`.
- [x] **6.3 Security badge colour** – `systemSecurityBand` / `securityBadgeColor`.
- [x] **6.4 Selection highlight** – visible in light mode (`primary-100`), dark unchanged,
      `aria-pressed` (directional + local), reset on scan navigation.
- [x] **6.5 Clipboard** – `copyText` result gates the toast; "Copy link" button in TopBar.
- [x] **6.6 Scan lists** – server-side pages of 50 with system-name search and type
      filter, real links, minimal columns plus the group id (maintainer request: shows
      which scans belong together); datatable dependency removed.
- [x] **6.7 Accessibility** – button triggers + Escape for login/user menus, in-menu
      "Change main" disclosure, `LocalDisclosure` (no links inside buttons), unique ids,
      labelled + cancellable system search. (Logged-in menus checked by code only.)
- [x] **6.8 Svelte hygiene** – stats runes, no mutation in `ScanTabs` `$derived`, ticker
      colours via CSS variables (0 injected style tags, was ~1,400 on a 2k-pilot local),
      separate type/group rule maps (fixes group rule 30 matching type 30), no `{@html}`
      in `HtmlTimelineItem`, dark-mode preference applied before paint.

## Out of scope (suggestions, not defects)

Standings colouring, scan deletion, owner tokens for anonymous groups, per-environment
databases instead of schemas.

## Follow-up features ✅

- [x] **Ship-class composition bars** – `shipClasses.js` + `CompositionBar.svelte` in the
      Space tab and Overview: class bar, exclusive role bar (DPS + per-type overrides) on
      the same scale, object bar; tooltips instead of a legend; drives the existing
      `GroupHighlight` (type-level targets for roles). Paired-scan notice moved into a
      clock icon on the tab row. Behaviour probe re-run afterwards: dark mode identical to
      the baseline, light mode only differs by the intended Batch 6 highlight colour.
- [x] **Scan diff** – `/compare/<before>/<after>` + `/compare` resolver, `scanDiff.js`,
      "Compare" dialog on the scan page (no timeline changes). Smoke-tested on copied
      scans: d-scan and local diffs, cross-group/system warning, group-link resolution,
      older-first ordering, swap, and all error paths.

## Release prep – Node 26 and dependency update ✅

- [x] Node 26 everywhere: `engines >=26.0.0` (app + worker, `engine-strict`), Dockerfiles
      `node:26-alpine`, CI `node-version: 26`, docs. Pre-26 loader fallback removed.
- [x] All npm dependencies (app + worker) to latest, lockfiles regenerated. Held back:
      SvelteKit 3 / adapter-node 6 (maintainer decision: Auth.js 1.11.3 still imports
      `$app/environment` and `base`, both gone in Kit 3) and TypeScript 7 (tooling caps at 6).
      GitHub Actions to current majors; cosign stays on v2 (2.6.5).
- [x] Upgrade fixes: Vitest 5 `clearMocks` default (one leak-dependent assertion removed),
      redundant `extends` in the test project, `@types/eslint` dropped. Found while smoke
      testing the production build: the sync ESM loader wrapped every module and broke live
      bindings (all pages 500, Auth.js `MissingSecret`); now restricted to hooked packages
      with a regression test.
- Verified: lint, `svelte-check`, Vitest (536), production build, no drizzle drift for
  dev/preview/prod; built app on a scratch DB (pages, compare, EVE SSO redirect, CSRF,
  pg + request spans to a local OTLP sink, scan-page highlight/tooltip probe matching
  the baseline 9/15/6 rows); worker dynamic job, healthcheck and spans. Docker images
  and the updated workflows are verified by CI only.
