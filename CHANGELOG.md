# Changelog

Notable changes to D-Scan Space. Work in progress is tracked in
[`docs/review-fixes-plan.md`](docs/review-fixes-plan.md).

## 1.3.2 – 2026-10-02

### Added

- **Stats page**: headline numbers (total scans, scans in the last 30 days, pilots
  tracked, alliances seen in the last 30 days); charts of scans per day (local / d-scan),
  pilots in local scans per day and the busiest UTC hours; and what scans of the last 30
  days contained: most scanned systems and regions, most seen alliances, the
  ship-class mix on d-scan, and average local / d-scan size. Lists that name systems,
  regions or alliances use public scans only; counts without names (ship mix, averages,
  pilots per day, scans per day/hour) include private scans. The installed SDE build is
  shown at the bottom.

### Changed

- Stats page: "Groups w/o System" is removed; cards use the white light-mode background
  of the rest of the site.

## 1.3.1 – 2026-10-02

### Added

- **Scan link previews**: shared scan links (Discord, etc.) show a generated 1200×630
  image per scan (`/scan/<group>/<scan>/og.png`): system with security, local pilot /
  corp / alliance counts with the top alliances, and the d-scan ship total, class bar,
  on/off grid and top classes. Rendered on the server with resvg (WASM) and bundled Inter
  fonts; cached for a day. The text preview uses "Top:" instead of "Top alliances:" /
  "Top ships:".

### Fixed

- `/scan` (listed in the sitemap) answered 500; it now redirects to the home page.

### Changed

- SEO: the home page is titled "EVE Online D-Scan & Local Scan Analyzer", its paste
  prompt is the page's `<h1>` and a one-line description sits under the form. All scan
  pages are `noindex` (public ones were indexable). Structured data adds a `WebSite`
  entry and the app's URL and free offer; the ignored `keywords` meta tag is gone.

## 1.3.0 (updater 1.1.0) – 2026-10-02

### Added

- **Scan composition bars** on the d-scan (Space tab and Overview), stacked with the
  on-grid share darker: ships by class (capitals incl. freighters, battleships incl. black
  ops and marauders, battlecruisers, cruisers incl. strategic cruisers, destroyers,
  frigates, industrial, pods, other), ships by fleet role on the same scale (DPS,
  logistics, command bursts, interdiction, recon & EWAR, bombers, non-combat; T1
  logistics/EWAR hulls and mining/exploration frigates are classified per type), and a
  thinner bar for drones, fighters, structures, starbases, deployables, probes and wrecks.
  Hovering a slice shows its name and counts; hovering or clicking it highlights /
  selects its ships the same way as clicking the groups themselves.
- **Compare scans** (`/compare/<before>/<after>`): difference between two scans of the
  same type, also across scan groups. D-scans: totals, ship/object classes, changed
  "interesting" types, and every group/type with before, after, change, new/gone and
  on↔off-grid moves. Local: pilots arrived/left/stayed, pilots who changed corporation or
  alliance, and per-alliance/corporation counts. Opened with the new "Compare" button on
  the scan page (preselects the previous scan of the same type; any scan or group link
  can be pasted) or from `/compare`. Swap button, warning when the systems differ; pages
  are not indexed.
- Copyright notice updated for CCP Games' rename to **Fenris Creations** (May 2026); the
  footer link reads "~~CCP~~ FC Copyright Notice" (screen readers get "Fenris Creations
  Copyright Notice"). The page stays at `/ccp` so existing links keep working.

### Security

- **EVE character transfers no longer grant access to the previous owner's account.**
  Linked characters now store their EVE SSO `CharacterOwnerHash`. Signing in with a
  character whose hash changed unlinks it from the previous user first, and existing
  sessions are dropped when their character was transferred or unlinked.
- OAuth access/refresh/id tokens are no longer stored in the database or the session
  cookie, and the browser only receives the session fields the UI renders.
- Scan and group IDs are generated from the OS CSPRNG instead of `Math.random`
  (same length and alphabet; existing links keep working).
- `/switch-main` only redirects to same-origin paths (fixes `//host` open redirect).
- The OTLP `Authorization` header value is no longer written to the startup log.
- Baseline security headers: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`.
- Docker images run as the unprivileged `node` user. Compose binds Adminer to
  `127.0.0.1` and only starts it with `--profile debug`.
- CI workflows default to `contents: read`; images are only published after the test
  workflow passed.

### Fixed

- D-scan: on-grid items never showed the full-name tooltip when their name was cut off
  (only off-grid and "Interesting" items did). All truncated names now get it, and
  tooltips re-check when columns resize, accordions open or tabs switch.
- D-scan: a selected or hovered group was invisible in light mode (same background as
  the others); highlighted groups and their items now use a light-blue background.
  Dark mode looks exactly as before.
- Highlight selections (d-scan groups, local alliances/corps/pilots) no longer carry
  over to the next scan when navigating within a group.
- "Interesting" rules: a ship _group_ rule could match an unrelated _type_ with the same
  number (and vice versa). Group and type rules are now looked up separately.
- The "link copied" toast after submitting a scan appeared even when copying failed.
- System security badge colour follows the in-game rounding (e.g. 0.45 shows as
  high-sec, 0.0 < sec < 0.05 as low-sec); the label still shows two decimals.
- The manual system search could show suggestions for an older query; superseded
  requests are cancelled.
- Local scans: pilots pasted in a different case (`chribba` for `Chribba`) were silently
  dropped, and the same pilot pasted twice in different cases could fail the scan. Names
  are now matched case-insensitively (EVE names are unique regardless of case).
- Local scans: CRLF line endings, zero-width/invisible characters, surrounding spaces and
  double spaces no longer make names unresolvable.
- One corporation or alliance that ESI failed to return no longer aborts the whole local
  scan (foreign-key error → 500); only the affected pilots are skipped.
- D-scan: any km distance used to count as on-grid (`1,234,567 km`). Objects are on-grid
  up to `DSCAN_ON_GRID_MAX_KM` (default 50,000 km). Distances with space, non-breaking
  space, apostrophe or dot thousands separators and decimal commas are parsed correctly.
- D-scan system inference: a few player structures or a structure named without the
  `System - ` prefix could outvote the sun and planets or yield no system. Evidence is now
  weighted (sun > celestials/NPC stations > structures), stargates are ignored, and all
  candidates are matched case-insensitively against real systems.
- Scan detection: directional lines are validated with the same rules the parser uses.
- `scans_processed_total` counted every scan twice; it is now counted once, after storing.
- A failed ESI lookup during biomassing could crash the process (unawaited promise).
- Appending a scan without a `scan_group` now returns 400, and to an unknown group 404,
  before any ESI work (previously ESI lookups ran and then failed with a 500).
- Opening `/scan/<group>/<scan>` with a group the scan does not belong to redirects to
  the scan's own group instead of mixing two groups' data and permissions.
- Private scans, `/my-scans` and error pages are marked `noindex`. Every page now has a
  single canonical URL (previously all pages also declared `/` as canonical).
- System search `limit` is truncated to an integer.
- `SKIP_MIGRATIONS=false` (the documented default) skipped migrations because any
  non-empty value counted as set. Only `true`/`1`/`yes`/`on` skip now.
- A dropped idle database connection (DB restart/failover) no longer crashes the process.
- Character lookups by name ignore biomassed characters and return one row per name;
  a new character holding a biomassed character's old name no longer fails to save.
- Saving the same character twice in one batch (e.g. `bob` and `Bob` in one local) no
  longer fails the whole scan, and very large batches are split under Postgres'
  parameter limit.
- Updater: a corporation's alliance change used to be written to its members only (and
  bumped their `updated_at`, so they skipped their own refresh); the corporation row kept
  the old alliance. Changes are now applied to the corporation and its living members in
  one transaction, both when the corporation's refresh shows it and when all refreshed
  members agree on a new alliance.
- Updater: characters whose refresh failed stayed first in the queue and were retried
  every minute, starving everyone else. Rows are now claimed (`refresh_attempted_at`)
  and a failed row waits an hour.
- Updater: a slow run could overlap the next tick, and several updater replicas ran the
  same jobs concurrently. Each job now skips a tick while it is still running and holds a
  Postgres advisory lock, so only one updater runs a given job at a time.
- Updater: SDE groups/types whose parent category/group is not in the SDE no longer fail
  the whole table on its foreign key; they are skipped and counted on the trace.
- Updater: SDE temp files are removed even when the import fails, and download progress
  events report real byte counts.
- Updater: `pg` and `undici` spans were missing because OpenTelemetry was started after
  they were loaded; it is now loaded with `node --import`.
- Updater trace export never worked with the default/base endpoint (spans were posted to
  the collector root). Both processes now accept the base URL (`http://collector:4318`)
  and the `/v1/traces` form and derive `/v1/traces` and `/v1/metrics` from it.
- NodeSDK added its own env-driven OTLP metric and log pipelines and a second
  MeterProvider next to the configured ones (metrics were posted to
  `…/v1/traces/v1/metrics`). Readers and views are now passed to the SDK explicitly.
- Span export failures were retried three times on top of the exporter's own retries
  and logged on every attempt; the exporter's retries are used and each distinct failure
  is logged at most once a minute (so a failing metrics endpoint cannot hide trace
  export failures).
- App shutdown waited ~30 s for an unreachable collector; the telemetry flush is now
  bounded to 3 s (app and worker).
- `npm run dev`: editing the instrumentation or the logger started a second OpenTelemetry
  SDK (failed registration, Prometheus port already in use); the SDK starts once per
  process.
- Traced code treated any thrown object with a numeric `status` (e.g. an upstream fetch
  error) as a handled SvelteKit `HttpError` and hid it; only SvelteKit's own redirects and
  errors are treated that way now. Their span events show the real message instead of
  `[object Object]`.
- Errors logged with pino positional arguments or string interpolation lost their stack;
  all error logs use `{ err }`.
- The `logger` test leaked `DB_ENV="undefined"` into later tests.

### Changed

- **Node.js 26 is required** (was 24): Docker images use `node:26-alpine`, CI runs on
  Node 26, and `engines` (`>=26.0.0`, enforced by `engine-strict`) covers the app and
  the worker.
- Dependencies updated to their latest releases (app and worker), among them Svelte
  5.57, SvelteKit 2.70, Vite 8.3, OpenTelemetry SDK 2.11 / 0.222 (auto-instrumentations
  0.80), `pg` 8.23, `undici` 8.11, Auth.js 1.11.3, ESLint 10, Vitest 5,
  `prettier-plugin-svelte` 4, PGlite 0.5 and `@types/node` 26. Held back on purpose:
  SvelteKit 3 / adapter-node 6 (Auth.js does not support SvelteKit 3 yet) and
  TypeScript 7 (SvelteKit, svelte-check and typescript-eslint support up to 6; TypeScript
  is 6.0). `@types/eslint` is removed (ESLint ships its own types). GitHub Actions moved
  to their current majors (checkout 7, setup-node 7, upload-artifact 7,
  download-artifact 8, Docker actions, paths-filter 4, cosign-installer 4 with cosign
  2.6.5).
- Vitest 5 clears mock call history before every test (`clearMocks` default); one test
  relied on calls recorded by earlier tests and was fixed. The test project inherits the
  root Vite config by default, so its self-referencing `extends` is gone.
- Scan pages no longer inject a `<style>` element per alliance/corporation ticker
  (~1,400 on a large local); row colours use CSS variables with the same colours.
- `/scans` and `/my-scans` are server-paginated (50 per page) with a system-name search
  and a type filter; rows are real links (middle-click / open in new tab work) and show
  time, system, type, the scan group (links to the group's latest scan, so related scans
  are easy to spot) and, on My Scans, visibility. The client-side datatable
  (`@flowbite-svelte-plugins/datatable`, `simple-datatables`) is removed.
- Scan pages say which other scan's data is shown and how much earlier it was taken
  ("Local data from … , 12 min before this scan"), and have an explicit "Copy link"
  button with a success or failure message.
- Accessibility: the login and user menus open from the keyboard (real buttons, Escape
  closes), "Change main" is an in-menu list instead of a hover-only flyout, d-scan group
  and local rows expose their selection (`aria-pressed`), local overview rows no longer
  nest the zKillboard link inside the expand button, element ids are unique, and the
  system search field is labelled.
- The saved light/dark preference is applied before the first paint; the stats page
  updates with new data (runes).
- Rejected pastes (empty, local scans over `LOCAL_SCAN_MAX_LINES` names, unrecognized
  format, unsupported type, nothing resolvable) no longer replace the page with the error
  page: the form keeps the pasted text and shows the reason and the first non-matching
  lines. D-scans have no line limit.
- ESI client rewritten per CCP's best-practice and rate-limit docs: at most
  `ESI_MAX_CONCURRENCY` requests in flight, per-attempt timeouts, retries only for
  network errors and 5xx (4xx are no longer retried three times), a global pause when the
  error limit runs low or on 420, `Retry-After` handling for 429, per-group slowdown when
  rate-limit buckets run low. Callers parse each response once; spans keep the full
  request/response headers and bodies (read from a clone).
- ESI batches use the documented maxima (500 names, 1,000 affiliation ids) and deleted
  characters are recognised from their affiliation (Doomheim) instead of a 404 per pilot.
- Names ESI cannot resolve are remembered for an hour, so re-submitting the same paste
  does not query ESI again for them.
- Default `BODY_SIZE_LIMIT` in `.env.example`/docker-compose changed from 256M to 16M. It is
  the only size limit for d-scans (≈400k typical lines; a 200k-line d-scan processed in
  ~0.5 s in testing). Without it adapter-node uses 512K. A paste over the limit now gets
  an inline "too large" message instead of a 500 error.
- Failed scan detection logs only counts and line numbers; the offending lines are recorded
  on the trace instead.
- `locals.auth()` is memoized per request (one session lookup per page load instead of two).
- Migrations run before the server accepts requests (SvelteKit `init` hook) under a
  Postgres advisory lock, so several replicas can start at once. A failed migration stops
  startup. The worker runs them at startup too (still skipped by docker-compose).
- Shutdown: adapter-node's graceful drain is no longer cut short; the database pool and
  telemetry are closed on `sveltekit:shutdown` instead of from extra signal handlers that
  called `process.exit`.
- Scan pages no longer send the full data of every scan in the group for the timeline,
  and the group link resolves the latest scan with one indexed query.
- `/stats` uses single-pass `count(*) FILTER` aggregates and is cached for 60 seconds.
- Removed the unreachable `src/routes/auth/[...auth]` route (`/auth/*` is handled by the
  Auth.js hook) and the `short-unique-id` dependency.
- Groups created while logged out stay collaborative: anyone with the link can append
  scans (documented behaviour, unchanged).
- Updater: due characters, corporations and alliances are selected in SQL
  (`FOR UPDATE SKIP LOCKED`, at most 1,000 of each per run) instead of loading the whole
  corporation and alliance tables every minute.
- Updater: the SDE zip (~100 MB) is streamed to disk with a timeout, the User-Agent and a
  size check, extracted one entry at a time (`yauzl` replaces `adm-zip`, which held the
  archive in memory), and JSONL files are read line by line. Each SDE table is upserted
  in one transaction, so a failure keeps the previous data. Output file names never come
  from the archive (no zip-slip).
- Updater shutdown waits for a running job (`SHUTDOWN_TIMEOUT_MS`, default 6000) and
  flushes telemetry for at most 3 s (an unreachable collector used to delay exit ~27 s)
  before closing the pool; failed jobs are logged instead of being unhandled rejections.
- Updater OpenTelemetry packages it imports are declared in its `package.json`.
- OTLP export is opt-in: without `OTEL_EXPORTER_OTLP_ENDPOINT` nothing is exported
  (Prometheus `/metrics` stays on). **Upgrade note:** deployments that relied on the
  implicit `http://localhost:4318/v1/traces` default must now set it explicitly.
  OTLP metrics are pushed every 15 s (`OTEL_METRIC_EXPORT_INTERVAL`) instead of every
  second; span batching uses the SDK defaults (`OTEL_BSP_*`). Collectors that accept
  traces but not metrics (previously failing silently) can set
  `OTEL_METRICS_EXPORTER=prometheus`.
- App and worker share one telemetry setup (`src/lib/server/telemetry.js`).
- Production startup validation: the app refuses to start without `DATABASE_URL` or
  `AUTH_SECRET`, the worker without `DATABASE_URL`; missing recommended variables
  (`ORIGIN`, `AUTH_EVEONLINE_*`, `BODY_SIZE_LIMIT`, `DB_ENV`, `CONTACT_EMAIL`) are logged.
- New `GET /healthz` (200 when the database answers, else 503). The app image's
  healthcheck uses it; the worker image's healthcheck checks that a job run succeeded
  within `HEALTHCHECK_MAX_AGE_MS` (default 15 min) instead of only that the process exists.
- Docker: `.dockerignore`; the app image runs `node build` directly (signals reach Node,
  so adapter-node drains requests), contains production dependencies only, and no
  longer sets placeholder env values (`DATABASE_URL=postgres://`, `ORIGIN=undefined`,
  `CONTACT_*=undefined`); it defaults `BODY_SIZE_LIMIT=16M`.
- docker-compose: **PostgreSQL 18 volume is mounted at `/var/lib/postgresql`** (the
  layout the postgres:18 image expects). Volumes created by PostgreSQL ≤ 17 must be
  dumped and restored (commands in the compose file header). Postgres and app
  healthchecks; the app waits for a healthy database and the updater for a healthy app.
  `AUTH_*`, scan/ESI tuning, `SHUTDOWN_TIMEOUT_MS` and `HEALTHCHECK_MAX_AGE_MS` are passed
  through; the OTLP endpoint defaults to empty.
- Dependencies: build/lint/test/type tooling moved to `devDependencies`; the
  OpenTelemetry packages the app imports are declared; unused `js-yaml`, `yaml`,
  `espree`, `tailwind-variants`, `@popperjs/core` and `@auth/core` removed as direct
  dependencies. The ineffective `external` option was removed from `svelte.config.js`.
- CI: `svelte-check` runs; a drizzle drift check for `dev`/`preview`/`prod` replaces
  `db:generate`; migrations are applied twice on PostgreSQL 18; lockfile/workflow
  changes trigger image builds; Dependabot also updates GitHub Actions and Docker images.
- `.env.example` matches the variables the code reads (adds `OTEL_METRIC_EXPORT_INTERVAL`,
  `ESI_TEST_FLAGS`, `HEALTHCHECK_*`; drops the unused `POSTGRES_PORT`).
- Local runs load `.env` into `process.env`: `npm run dev`, `preview`, `prod`, `db:*` and
  the worker's `npm run start` use Node's `--env-file-if-exists` (Node ≥ 22.9, declared in
  `engines`). Previously only SvelteKit's `$env` saw `.env`, so the database URL, ESI
  User-Agent contact fields, `DB_ENV`, `LOG_LEVEL` and `BODY_SIZE_LIMIT` had to be set
  in the shell. Shell/system variables still win over the file; tests do not load it.
- Node 26 printed `DEP0205` (`module.register()` is deprecated) on startup. The
  OpenTelemetry ESM hook now uses the in-thread `module.registerHooks()` loader via
  `import-in-the-middle/register-hooks.mjs` (3.5.2). As before, only the packages an
  instrumentation hooks are wrapped (their names arrive over import-in-the-middle's hook
  channel; `startTelemetry().ready` resolves once the loader has them). Wrapping every
  module would hand importers snapshots instead of live bindings, which in the production
  build left SvelteKit's private env empty for Auth.js. Tailwind (`tailwindcss`/`@tailwindcss/vite` 4.3.3)
  fixed the same warning upstream. Tailwind 4.3's default sans font stack now starts
  with `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto`; Windows and macOS render
  the same system font as before.

### Database

- Migration `0005_account_owner_hash`: adds `auth.account.character_owner_hash`,
  backfills it from the `owner` claim of previously stored EVE SSO access tokens, then
  clears the stored tokens. Runs automatically on boot; safe on existing data
  (undecodable tokens are skipped and pick up the hash on the next sign-in).
- Upgrade note: users whose stored token could not be decoded keep working; their
  hash is recorded at their next sign-in.
- Migration `0006_model_env_scan_schemas`: creates the indexes the `preview` and `prod`
  scan tables never had (only `dev` was indexed). `schema.js` now models the scan tables
  of all three environments so this cannot drift again.
- Migration `0007_scan_owner_set_null_and_indexes`: `created_by` foreign keys become
  `ON DELETE SET NULL`; `(group_id, created_at)` index on scans replaces `group_id`;
  `characters.name` index is no longer unique.
- Migration `0008_timestamptz`: every timestamp column becomes `timestamptz`, converted
  `AT TIME ZONE 'UTC'` (values were always written in UTC). Verified on the dev database
  in a rolled-back transaction: all 30 columns keep identical instants; ~2 s on current data.
- Migration `0009_characters_lower_name_index`: replaces the character name index with an
  index on `lower(name)` for case-insensitive lookups (~0.2 s on the dev database).
- Migration `0010_refresh_attempted_at`: adds nullable `refresh_attempted_at` to
  `characters`, `corporations` and `alliances` (metadata-only, instant). Existing rows are
  due as before.
