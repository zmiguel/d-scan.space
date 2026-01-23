# D-Scan Space – Copilot Instructions

## Big picture

- SvelteKit + Svelte 5 app. UI routes live in `src/routes/**/+page.svelte`; server actions/loaders live beside them in `src/routes/**/+page.server.js`.
- Shared “business logic” sits in `src/lib/server/*` (scan parsing, ESI calls, tracing/metrics) and is reused by the Node worker in `workers/updater/src/`.
- PostgreSQL via Drizzle. DB wiring/migrations: `src/lib/database/client.js`; schema: `src/lib/database/schema.js`; queries/helpers: `src/lib/database/*.js`.
- Source of truth is `src/` and `workers/updater/src/`; `build/` and `coverage/` are generated output (adapter-node build).

## Core flows (examples)

- Scan ingest in `src/routes/scan/+page.server.js`:
  - Detect directional when ≥50% of lines are 4-tab columns with numeric typeId; otherwise local.
  - IDs use `short-unique-id` (group 8 chars, scan 12 chars) then persist via `src/lib/database/scans.js`.
- Local scan: `createNewLocalScan` in `src/lib/server/local.js` (dedupe → cache checks → ESI refresh/affiliations → update `last_seen` → alliance→corp→character tree).
- Directional scan: `createNewDirectionalScan` in `src/lib/server/directional.js` (parse 4 columns → on-grid if km/m else off-grid for AU/"-" → enrich via `getTypeHierarchyMetadata` → bucket + optional system inference).
- Persistence: `src/lib/database/scans.js` uses a transaction; “updates” append a new scan row and only set `scan_groups.system` if it was null.
- Updater worker: `workers/updater/src/index.js` cron jobs:
  - Dynamic: `workers/updater/src/services/dynamic.js` (TQ status gate → batch refresh characters/corps/alliances using constants in `src/lib/server/constants.js`).
  - Static: `workers/updater/src/services/static.js` (SDE version compare → download/extract JSONL slices into `./temp` → bulk upsert via `src/lib/database/sde.js` helpers → cleanup).

## UI + Svelte conventions

- Svelte 5 runes are used (e.g. `$state`) in route components like `src/routes/+page.svelte`.
- UI uses Flowbite Svelte components and Tailwind v4 (`@import 'tailwindcss'`) with custom theme tokens in `src/app.css`.
- Datatable styling and plugin sources are wired in `src/app.css` (`@flowbite-svelte-plugins/datatable`, `simple-datatables`).

## Observability + HTTP

- Tracing is wired in `src/instrumentation.server.js` and `workers/updater/src/instrumentation.js`; see `TRACING_GUIDE.md` for local setup.
- Wrap I/O and multi-step work in `withSpan` from `src/lib/server/tracer.js` and add high-value attributes. In routes/hooks, pass `event` to join request traces (see `src/hooks.server.js`).
- Metrics counters/histograms live in `src/lib/server/metrics.js` and are used in scan flows.
- Use `fetchGET` / `fetchPOST` from `src/lib/server/wrappers.js` instead of raw `fetch` for ESI; USER\*AGENT is built in `src/lib/server/constants.js` from `CONTACT**`+`AGENT`/`ORIGIN`.

## DB / schema conventions

- The `scans` + `scan_groups` tables live in a schema named by `DB_ENV` (see `pgSchema(dbEnvSchema)` in `src/lib/database/schema.js`). Most other tables are in `public`.
- Drizzle tooling uses `drizzle.config.js` and filters schemas to `public` + `DB_ENV`.
- Migrations auto-run on boot unless `BUILD` or `SKIP_MIGRATIONS` is set (see `src/lib/database/client.js`).

## Dev workflows (repo-specific)

- Dev server: `npm run dev` (same as `dev-win`). Build: `npm run build`. Preview: `npm run preview`. Prod: `npm run prod` (runs `node build`).
- Checks/tests: `npm run check` or `npm run check:watch`, `npm run lint`, `npm run format`, `npm test` (Vitest + writes `coverage/`).
- DB: set `DATABASE_URL` then `npm run db:generate|db:push|db:migrate|db:studio`.
- Worker runs from `workers/updater/` via `npm run start` in that folder (entry: `workers/updater/src/index.js`).
- Docker: root `Dockerfile` builds with `BUILD=true`; `docker-compose.yml` runs `app` + `postgres` + `updater` (worker typically sets `SKIP_MIGRATIONS=true`).
