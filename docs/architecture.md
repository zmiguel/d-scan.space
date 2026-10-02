# Architecture

## Project Structure

- `src/routes/` — SvelteKit pages (`+page.svelte`) and server logic (`+page.server.js`)
- `src/lib/server/` — shared server-side logic (ESI, scan processing, tracing, metrics)
- `src/lib/database/` — Drizzle schema, client, and query helpers
- `workers/updater/src/` — standalone cron worker (shares lib server code)
- `build/`, `coverage/` — generated output, not source

## Scan Ingest Flow (`src/routes/scan/+page.server.js`)

**Processing (`src/lib/server/scan-submission.js`, shared by create/update):**

1. Normalize (`normalizeScanLines`): CRLF/CR → LF, invisible characters removed, spaces trimmed (tabs kept), repeated spaces collapsed, empty lines dropped.
2. Detect (`detectScanType`, strict): every line must match one type. Local = no tabs and at most 2 spaces; directional = ≥4 tab columns, positive integer type id, distance or `-` in the last column (same rules as the parser).
3. Limit: local scans at most `LOCAL_SCAN_MAX_LINES` (default 12,000) names, else 413, because every name may need ESI lookups. D-scans have no line limit (they only look up their distinct type ids and can be huge in big fights); the request body is capped by `BODY_SIZE_LIMIT` (default 16M; adapter-node's own default when unset is 512K).
4. Build the local/directional result.

Paste problems (empty, too large, unrecognized format with the first 10 offending lines, unsupported type, nothing resolvable) are returned with `fail()`; the form keeps the pasted text and shows them inline (`ScanSubmitError.svelte`). Logs contain counts and line numbers, never pasted text. `scans_processed_total` is incremented once, after the scan is stored.

**IDs:** group ID = 8 chars, scan ID = 12 chars, base62 from the OS CSPRNG (`src/lib/server/ids.js`). Private scans are protected only by their URL, so IDs must stay unpredictable. Persisted via `src/lib/database/scans.js`.

**Updates (`?/update`):** `scan_group` is required (400) and must exist (404); both are checked before any ESI/SDE work. Groups owned by a user only accept scans from that user (403). Groups created while logged out (`created_by IS NULL`) are collaborative by design: anyone with the link can append scans.

### Local Scan (`src/lib/server/local.js` → `createNewLocalScan`)

1. Dedupe names case-insensitively (EVE names are unique regardless of case)
2. Look up stored characters case-insensitively (`lower(name)` index), split into fresh / stale-with-expired-ESI-cache / stale-with-valid-cache / missing
3. ESI (`src/lib/server/characters.js`): missing names → `/universe/ids` (500 per request; unknown names cached negatively for 1 h in memory) → `/characters/affiliation` (1000 per request) → characters in Doomheim are biomassed without fetching them → `GET /characters/{id}` for living ones (404 = deleted → biomassed). Corporations and their alliances are stored first; characters whose corporation/alliance could not be fetched are skipped instead of failing the scan
4. Re-read all names, update `last_seen`, build alliance → corp → character tree

### Directional Scan (`src/lib/server/directional.js` → `createNewDirectionalScan`)

1. Parse columns (type id, name, type name, distance)
2. Distances parsed by `src/lib/utils/distance.js` (locale thousands/decimal separators); on-grid when m/km ≤ `DSCAN_ON_GRID_MAX_KM` (default 50,000 km), off-grid for AU, `-` or farther
3. Enrich via `getTypeHierarchyMetadata`
4. Bucket by type
5. System inference: weighted evidence per object (sun 10, planets/moons/belts/NPC stations 3, `<System> - …` player structures and Ansiblex gates 1, stargates ignored); all candidates resolved case-insensitively in one query (`getSystemsByNames`), the highest-scoring real system wins

## Persistence (`src/lib/database/scans.js`)

- Uses a DB transaction
- "Updates" append a new scan row
- `scan_groups.system` is only set if currently null
- `/scan/<group>/<scan>` redirects (301) to the scan's own group when opened under another group id
- Private scans (`scan_groups.public = false`), `/my-scans` and error pages render `robots: noindex, nofollow`

## DB Schema (`src/lib/database/schema.js`)

- `scans` + `scan_groups` exist once per environment in the `dev`, `preview` and `prod` Postgres schemas of every database. `schema.js` models all three (`defineScanTables`, exported as `devScans`, `prodScanGroups`, …) so drizzle-kit generates DDL for each; the app uses the `DB_ENV` ones via the `scans` / `scanGroups` exports
- Auth.js tables live in the `auth` schema; characters/corporations/alliances and SDE tables in `public`
- `drizzle.config.js` always includes `public`, `auth`, `dev`, `preview`, `prod` (independent of `DB_ENV`)
- All timestamps are `timestamptz` (UTC instants); `created_by` → `auth.user` is `ON DELETE SET NULL`
- `characters.name` is not unique (biomassed characters keep their name); `getCharactersByName` returns one live row per name
- Lists passed to `IN (...)` and multi-row upserts are chunked (`src/lib/database/batching.js`, Postgres 65,535 parameter limit); upserts are de-duplicated by id
- Group timeline / latest-scan queries return counters only (`getScanTimeline`, `getLatestScanIdInGroup`), never the scan `data`
- `/stats` results are cached in memory for 60 s

### Migrations

- Source of truth is `src/lib/database/schema.js`. Change it, then `npm run db:generate -- --name=<change>`; drizzle-kit writes the SQL, snapshot and journal entry. Hand edits (data backfills, dropping statements for objects that already exist, `USING` clauses) are allowed and documented in the migration's header comment. `drizzle-kit generate` must then report "No schema changes"
- Applied by `runMigrations()` (`src/lib/database/client.js`): app from the SvelteKit `init` hook (before the first request is served; a failure stops startup), worker at startup. Runs under a Postgres advisory lock, so several replicas starting together migrate once
- Skipped when `BUILD` or `SKIP_MIGRATIONS` is `true`/`1`/`yes`/`on` (`false` means run)

### Lifecycle

- Importing `client.js` has no side effects besides creating the lazy pool (with an `error` listener so a dropped idle connection does not crash the process)
- App: adapter-node owns SIGINT/SIGTERM, drains requests, then emits `sveltekit:shutdown`; the pool (`closeDb()`) and telemetry (flush bounded to 3 s) are closed on that event
- Worker: its own SIGINT/SIGTERM handler stops the cron jobs, waits up to `SHUTDOWN_TIMEOUT_MS` (default 6 s) for a running job, flushes telemetry (at most 3 s), closes the pool and exits

## Updater Worker (`workers/updater/src/index.js`)

Started with `node --import ./src/instrumentation.js src/index.js` (package `start`, Dockerfile) so OpenTelemetry patches `pg` before it loads. In production it exits at startup without `DATABASE_URL`.

Health: the worker writes a heartbeat file (`HEALTHCHECK_FILE`) at startup and after every job run that did not throw (lock skips included); `src/healthcheck.js` (Docker `HEALTHCHECK`, no app imports) fails when it is older than `HEALTHCHECK_MAX_AGE_MS` (15 min).

Jobs run through `utils/jobs.js`: croner `protect` skips a tick while the previous run of that job is still going, and each run holds a Postgres session advisory lock (`pg_try_advisory_lock(hashtext('d-scan.space/updater/<job>'))`) on a dedicated connection, so with several updaters only one runs a job at a time; the others log a skip. Failures are logged, never unhandled.

**Dynamic** (`workers/updater/src/services/dynamic.js`)

- TQ (Tranquility) status gate (> 100 players, not VIP)
- Claims due rows with `claim*ForRefresh` (`src/lib/database/refresh.js`): `updated_at` older than 23.5 h, `last_seen` within a year, `refresh_attempted_at` unset or older than 1 h, oldest first, `FOR UPDATE SKIP LOCKED`; claiming sets `refresh_attempted_at`. At most 1,000 characters, corporations and alliances per run (`src/lib/server/constants.js`). A failed row waits an hour; a successful refresh bumps `updated_at`
- Characters: ESI details when their cache expired, otherwise affiliation only
- Alliance changes: `applyCorporationAllianceChange` updates the corporation and its living members in one transaction (members' `updated_at` untouched). Triggered by the corporation's refresh, or by refreshed members who all report a different alliance
- Corporations are stored through `storeCorporations` (their alliances first); a corporation whose new alliance could not be fetched keeps no alliance and does not propagate

**Static** (`workers/updater/src/services/static.js`)

- SDE build compare (`latest.jsonl`) → only on a new build:
- Stream the zip (~100 MB) to a private `mkdtemp` directory (timeout, User-Agent, `content-length` check), extract the needed `.jsonl` entries one at a time with `yauzl` (`utils/extract.js`; output names are the requested base names, never archive paths)
- Read JSONL line by line; skip invalid rows and groups/types whose parent is not in the SDE (counts on the span)
- Upsert via `src/lib/database/sde.js`, one transaction per table; record the build in `sde` (failed imports are retried at the next run)
- Temp directory removed in `finally`

## ESI / HTTP (`src/lib/server/wrappers.js`)

- `fetchGET` / `fetchPOST` for all ESI calls; follows CCP's [best practices](https://developers.eveonline.com/docs/services/esi/best-practices/) and [rate limiting](https://developers.eveonline.com/docs/services/esi/rate-limiting/) docs
- At most `ESI_MAX_CONCURRENCY` requests in flight per process; per-attempt timeout `ESI_REQUEST_TIMEOUT_MS`
- Retries only network errors/timeouts and 500/502/503/504; other 4xx are returned to the caller at once (each error costs ESI error budget / bucket tokens)
- Error limit: when `X-ESI-Error-Limit-Remain` ≤ 10 or a 420 arrives, every ESI request pauses until `X-ESI-Error-Limit-Reset`
- Bucket limit: 429 pauses that rate-limit group for `Retry-After`; when `X-Ratelimit-Remaining` ≤ 10 the group slows down
- Traces keep everything (maintainer decision: it has repeatedly saved debugging sessions): request URL/headers/body, response status/headers/body (JSON minus free-text `description`/`title`), attempts, limit headers, and error/retry events with bodies. Callers still parse each body once (the span reads a clone). If a tracing backend rejects large spans, cap them with the standard `OTEL_ATTRIBUTE_VALUE_LENGTH_LIMIT` env var
- User-Agent built in `src/lib/server/constants.js` (uses `ORIGIN`, `CONTACT_*`, `AGENT` env vars)

## Scan page UI (`src/routes/scan/[group]/[scan]/+page.svelte`)

- Load returns this scan plus the latest earlier scan of the other type in the group (local + d-scan pairing); `pairedScan` (id, type, time) drives `PairedScanNotice`: a clock icon at the right end of the tab row (`ScanTabs`, the tab list keeps room for it) whose flowbite Popover (hover/focus) says "Local data from …, 12 min before this scan" with a link to that scan. `related` carries timeline counters only
- `ScanTabs`: Overview (`OverviewLocal` + `OverviewSpace`), Local (`TabLocalScan`), Space (`TabDirectionalScan`); flowbite renders only the active tab. `corps`/`pilots` for the Local tab are new objects carrying `alliance_ticker` / `corporation_ticker` (the loaded data is not mutated)
- **Directional highlighting** (`OverviewSpace`, `TabDirectionalScan`, shared pieces in `src/lib/components/directional/`): one `GroupHighlight` per view (`src/lib/utils/groupHighlight.svelte.js`). Hover/focus on a `GroupSummary` button highlights that group's item rows in both grid columns; click / Enter / Space toggles a sticky selection (several groups at once, `aria-pressed`). Highlight colours: rows `bg-primary-100` / dark `bg-gray-800`, summaries `bg-primary-100` / dark `bg-gray-600`. Reset when navigating to another scan
- **Local highlighting** (`TabLocalScan`): clicking (sticky) or hovering an alliance, corporation or pilot highlights its context (alliance → its corps → their pilots; pilot → own corp → own alliance) in that ticker's colour. Colours: `src/lib/utils/tickerStyles.js` (hash → hue) set as CSS variables per row + `.ticker-hover` / `.ticker-highlight` in `src/app.css`; hover beats highlight (selector specificity, same as the former per-ticker style tags). `aria-pressed` marks the sticky selection; reset on scan navigation
- **Truncation tooltips**: `TruncatedText.svelte` measures itself with a ResizeObserver (re-checks on column resize, accordion open, tab switch, font load) and only while the text is cut mounts a flowbite `Tooltip` bound to its own `$props.id()`-based id. Used for directional item names (on-grid, off-grid, interesting) and the local overview's alliance/corp names. No document-wide listeners
- `OverviewLocal` rows use `LocalDisclosure.svelte` (flowbite flush-accordion look): the toggle button's `::after` overlay makes the whole row clickable while the zKillboard link sits beside the button, not inside it; truncated names are `relative z-10` above the overlay so their tooltip still gets hover
- `TopBar`: security badge colour from `securityBadgeColor` (`src/lib/utils/secStatus.js`, in-game rounding: 0.0 < sec < 0.05 counts as 0.1; label keeps two decimals); "Copy link" copies `/scan/<group>`; the manual system search is labelled and aborts superseded requests
- Clipboard (`src/lib/utils/clipboard.js`): the "link copied" toast after submitting a scan appears only when the write succeeded; the Copy link button shows a success or failure toast
- Scan lists (`/scans`, `/my-scans`, `ScanList.svelte`): server-side pages of 50 (`getPublicScansPage` / `getUserScansPage`), `?q=` system-name filter (ILIKE, escaped), `?type=local|directional`, rows are real links; columns time, system, type, group (link to `/scan/<group>`, so related scans are recognisable) and visibility on My Scans
- **Composition bars** (`directional/CompositionBar.svelte`, above the groups in both directional views), all from `src/lib/utils/shipClasses.js`: ships by hull class (`SHIP_CLASSES`, one class per SDE ship group, unlisted groups → "Other"), ships by fleet role on the same scale (`SHIP_ROLES`, exclusive: a type override beats the group's role, unlisted ships are DPS; `summarizeRoles` reads the on/off-grid sections because roles are per type) and non-ship `OBJECT_CLASSES` by category (wrecks by group; celestials/NPC stations left out). No legend: each slice is a button whose name/counts show in a CSS tooltip on hover/focus; a bar is one tab stop, arrow keys/Home/End move between slices. Slices drive the view's `GroupHighlight` with a target: class/object slices pass group names (group summaries light up too), role slices pass type ids (`isItemHighlighted` lights the rows of those types only). A target toggles as a whole (deselects only when all of it was selected)
- **Compare** (`src/routes/compare/`): `/compare?a=&b=` resolves pasted scan links, group links (= that group's latest scan of the other scan's type) or ids (`parseScanReference`, `src/lib/utils/scanRef.js`) and redirects to `/compare/<older>/<newer>`, or shows the form with the reason. `/compare/<a>/<b>` keeps URL order (Swap links to `/compare/<b>/<a>`), 404 for unknown scans, 400 for different types or the same scan. Diffs are computed on the server by `src/lib/utils/scanDiff.js` (`diffDirectional`: per class/group/type before/after on+off counts, `delta`, `status` new/gone/changed/same, `gridMoved` = objects that switched grid side; `notable` = changed types matched by the Interesting rules; `diffLocal`: arrived/left/stayed/moved pilots, alliance → corp counts) and only the diff is sent to the browser. The scan page's "Compare" button (`compare/CompareDialog.svelte` in `TopBar`) posts the same GET form; the timeline is unchanged

## Auth (`src/auth.js`, `src/hooks.server.js`)

- EVE SSO OAuth via Auth.js (`@auth/sveltekit`), JWT sessions, Drizzle adapter for users/accounts (`auth` schema)
- Callback URL: `<ORIGIN>/auth/callback/eveonline`; `/auth/*` is served entirely by `authHandle` in the hook
- Trusts `X-Forwarded-*` headers by default (`trustHost: true`)
- `locals.auth()` is memoized per request (`memoizeAuthHandle`)
- **Character ownership** (`src/lib/server/eve-ownership.js`): accounts are keyed by CharacterID, which survives character transfers. `auth.account.character_owner_hash` stores the EVE SSO CharacterOwnerHash.
  - Sign-in (`callbacks.signIn`): a different hash means the character changed EVE account → it is unlinked from the previous user (their primary character moves to another linked one) and Auth.js links it to a fresh user / the user signing in. Rows without a hash adopt the current one.
  - Every session read (`callbacks.jwt`): the session is dropped if its sign-in character is no longer linked to the session user or its owner hash changed.
  - Migration `0005` backfilled hashes from the previously stored access tokens (`owner` JWT claim).
- OAuth tokens are **not** stored (adapter `linkAccount` strips them; scope is `publicData`, identity only)
- Only `{ user: {id,name,image}, eve: {characterName, linkedCharacters} }` is sent to the browser (`src/lib/server/session.js`)
- `/switch-main` only redirects to same-origin paths (`src/lib/server/redirects.js`)
- Baseline security headers set in `securityHeadersHandle`: `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`

## Observability

- Setup shared by app and worker: `src/lib/server/telemetry.js` (`startTelemetry`), started by `src/instrumentation.server.js` (app, SvelteKit instrumentation hook) and `workers/updater/src/instrumentation.js` (worker, `--import`). Prometheus `/metrics` always; OTLP traces/metrics only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set (base URL or `/v1/traces` form); NodeSDK gets every reader explicitly, so no implicit env pipelines and a single MeterProvider; each distinct export error logged at most once a minute; flush on shutdown bounded to 3 s
- ESM patching: import-in-the-middle's in-thread loader (`module.registerHooks()`), restricted to the packages the instrumentations hook (names sent over its hook message channel; `startTelemetry().ready` resolves once the loader knows them, and both instrumentation entry points await it before application code loads). Unrestricted wrapping breaks live ESM bindings (e.g. SvelteKit's private env in the built app) — `tests/lib/server/telemetry.test.js` guards both sides (live binding intact, `pg` patched)
- Requests: `metricsHandle` wraps each request in a SERVER span `server.hooks.handle_request` (method, route, target, user agent, client address, status, duration) and records `http_request_duration_seconds`. It is a child of SvelteKit's INTERNAL `sveltekit.handle.root`; it is kept because trace views, span metrics and service graphs select requests by SERVER spans. `OTEL_METRICS_EXPORTER=prometheus` disables OTLP metrics for traces-only collectors; `startTelemetry` runs once per process (Vite dev reloads)
- `withSpan` (`src/lib/server/tracer.js`, shared with the worker, so no `@sveltejs/kit` import): SvelteKit redirects and 4xx `HttpError`s end the span OK with a `redirect`/`client_error`/`warning` event; anything else (including `Error`s that merely carry a `status`) is recorded as an error and logged with `{ err }`
- Metrics: `src/lib/server/metrics.js` — used in scan flows, exposed via Prometheus
- Logging: pino; errors are always logged as `{ err }` (stack via pino's serializer); pasted scan text is never logged
- See TRACING_GUIDE.md for configuration and local setup

## Deployment

- Health: `GET /healthz` (`src/routes/healthz/+server.js`) answers 200 when `SELECT 1` succeeds within 2 s, else 503 (`Cache-Control: no-store`, no error details)
- Startup validation (`src/lib/server/env-check.js`, `NODE_ENV=production` only): app requires `DATABASE_URL`, `AUTH_SECRET`; worker `DATABASE_URL`; recommended variables are warned about
- Images run as `node`, start `node` directly (signals reach it), and contain production dependencies only. Compose: Postgres 18 (`/var/lib/postgresql` volume, `pg_isready` healthcheck) → app (`/healthz`) → updater (heartbeat); Adminer behind the `debug` profile on 127.0.0.1
- Dependencies: adapter-node bundles everything except `dependencies`; runtime packages that instrumentation patches (OTEL, `pg`, `import-in-the-middle`) and packages that must be single instances (`@sveltejs/kit`, `svelte`, Auth.js) are in `dependencies`, tooling in `devDependencies`
