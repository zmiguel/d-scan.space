# D-Scan Space – Copilot Instructions

## Big picture

- SvelteKit + Svelte 5 app. UI routes in `src/routes/**/+page.svelte`, server load/actions in adjacent `+page.server.js`.
- Shared scan/ESI/tracing logic is in `src/lib/server/*` and reused by the updater worker in `workers/updater/src/`.
- PostgreSQL via Drizzle. DB wiring/migrations: `src/lib/database/client.js`; schema: `src/lib/database/schema.js`; helpers in `src/lib/database/*.js`.
- Source of truth is `src/` and `workers/updater/src/`; `build/` and `coverage/` are generated output.
- Runtime config is env-driven; canonical defaults live in `.env.example` (see ORIGIN + CONTACT\_\* for ESI User-Agent).

## Core flows (examples)

- Scan ingest in `src/routes/scan/+page.server.js`:
  - Shared processing in `src/lib/server/scan-submission.js`: `normalizeScanLines` → strict `detectScanType` (every line must be local or directional) → `LOCAL_SCAN_MAX_LINES` for local scans only (d-scans are bounded by `BODY_SIZE_LIMIT`) → build; paste problems return `fail()` shown inline by the form.
  - IDs come from `src/lib/server/ids.js` (crypto-random base62; group 8 chars, scan 12 chars) then persist via `src/lib/database/scans.js`.
- Local scan: `createNewLocalScan` in `src/lib/server/local.js` (dedupe → cache checks → ESI refresh/affiliations → update `last_seen` → alliance→corp→character tree).
- Directional scan: `createNewDirectionalScan` in `src/lib/server/directional.js` (parse 4 columns → on-grid for m/km up to `DSCAN_ON_GRID_MAX_KM`, off-grid farther or for AU/"-" → enrich via `getTypeHierarchyMetadata` → bucket + weighted system inference).
- Persistence: `src/lib/database/scans.js` uses a transaction; “updates” append a new scan row and only set `scan_groups.system` if null.
- Updater worker (`workers/updater/src/index.js`, started with `node --import ./src/instrumentation.js`) runs cron jobs through `utils/jobs.js` (croner `protect` + per-job Postgres advisory lock):
  - Dynamic: `workers/updater/src/services/dynamic.js` (TQ status gate → claim due rows with `claim*ForRefresh` / `src/lib/database/refresh.js` (`refresh_attempted_at`, `FOR UPDATE SKIP LOCKED`, limits in `src/lib/server/constants.js`) → ESI refresh; alliance changes via `applyCorporationAllianceChange`).
  - Static: `workers/updater/src/services/static.js` (SDE version compare → streamed zip download + `yauzl` extraction → streamed JSONL → per-table transactional upsert via `src/lib/database/sde.js` → temp cleanup in `finally`).

## UI + Svelte conventions

- Svelte 5 runes are used (e.g., `$state`) in route components like `src/routes/+page.svelte`.
- UI uses Flowbite Svelte components and Tailwind v4; theme tokens live in `src/app.css`.
- Scan lists (`/scans`, `/my-scans`) are server-paginated (`src/lib/components/ScanList.svelte`, `getPublicScansPage` / `getUserScansPage`); local-scan row colours are CSS variables from `src/lib/utils/tickerStyles.js` + `.ticker-*` rules in `src/app.css`.
- D-scan composition bars: `src/lib/utils/shipClasses.js` (SDE ship group → class, ship → exclusive fleet role with per-type overrides, non-ship buckets) rendered by `src/lib/components/directional/CompositionBar.svelte`; they drive the view's existing `GroupHighlight` (group-name or type-id targets, no separate highlight state).
- Scan comparison: `/compare/<before>/<after>` (`src/routes/compare/`), diffs computed server-side in `src/lib/utils/scanDiff.js`; `/compare?a=&b=` resolves pasted links via `src/lib/utils/scanRef.js`. Don't add diff links/counters to the scan timeline.

## Observability + HTTP

- Telemetry: shared setup in `src/lib/server/telemetry.js`, started by `src/instrumentation.server.js` (app) and `workers/updater/src/instrumentation.js` (worker, via `node --import`); OTLP export only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set. Request details go on SvelteKit's root span in `src/hooks.server.js`. See `TRACING_GUIDE.md`.
- Log errors as `logger.error({ err }, 'static message')` (pino); never log pasted scan text.
- Wrap I/O or multi-step work in `withSpan` from `src/lib/server/tracer.js`; in routes/hooks pass `event` to join request traces (see `src/hooks.server.js`).
- Metrics live in `src/lib/server/metrics.js` and are used in scan flows.
- Use `fetchGET`/`fetchPOST` from `src/lib/server/wrappers.js` for ESI; USER\*AGENT is built in `src/lib/server/constants.js`.

## DB / schema conventions

- `scans` + `scan_groups` exist in the `dev`, `preview` and `prod` schemas; `schema.js` models all three and exports the `DB_ENV` ones as `scans` / `scanGroups`. Auth tables are in `auth`, everything else in `public`.
- Migrations are ORM-first: edit `schema.js`, run `drizzle-kit generate --name=<change>`, hand-edit the SQL only when needed (comment why in the file header). `drizzle.config.js` always includes all scan schemas.
- Migrations run via `runMigrations()` in `src/lib/database/client.js` (app `init` hook, worker startup) under an advisory lock; skipped when `BUILD`/`SKIP_MIGRATIONS` is `true`.
- Timestamps are `timestamptz` (use the `timestamptz()` helper in `schema.js`).

## Dev workflows (repo-specific)

- Dev: `npm run dev` (same as `dev-win`). Build: `npm run build`. Preview: `npm run preview`. Prod: `node build` (`npm run prod`).
- Checks/tests: `npm run check` / `check:watch`, `npm run lint`, `npm run format`, `npm test` (Vitest + `coverage/`).
- DB: set `DATABASE_URL` then `npm run db:generate|db:push|db:migrate|db:studio`.
- Worker runs from `workers/updater/` via `npm run start` (entry: `workers/updater/src/index.js`).
- Docker: root `Dockerfile` builds with `BUILD=true`, prunes devDependencies, runs `node build` as `node` with a `/healthz` healthcheck; the worker image runs as `node` with a heartbeat healthcheck (`workers/updater/src/healthcheck.js`). `docker-compose.yml` runs `app` + `postgres-main` (PG18) + `updater` (`SKIP_MIGRATIONS=true`, starts after the app is healthy); Adminer only with `--profile debug`.
- Dependencies: runtime packages in `dependencies` (adapter-node keeps them external; OTEL/pg must stay there), tooling in `devDependencies`. Production env is validated at startup (`src/lib/server/env-check.js`).
- Compose note: first run may require enabling `STATIC_UPDATE_CRON` briefly to populate SDE (see README).
