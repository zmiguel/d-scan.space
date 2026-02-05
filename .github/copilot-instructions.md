# D-Scan Space – Copilot Instructions

## Big picture

- SvelteKit + Svelte 5 app. UI routes in `src/routes/**/+page.svelte`, server load/actions in adjacent `+page.server.js`.
- Shared scan/ESI/tracing logic is in `src/lib/server/*` and reused by the updater worker in `workers/updater/src/`.
- PostgreSQL via Drizzle. DB wiring/migrations: `src/lib/database/client.js`; schema: `src/lib/database/schema.js`; helpers in `src/lib/database/*.js`.
- Source of truth is `src/` and `workers/updater/src/`; `build/` and `coverage/` are generated output.
- Runtime config is env-driven; canonical defaults live in `.env.example` (see ORIGIN + CONTACT\_\* for ESI User-Agent).

## Core flows (examples)

- Scan ingest in `src/routes/scan/+page.server.js`:
  - Directional detection when ≥50% of lines are 4-tab columns with numeric `typeId`; otherwise local.
  - IDs use `short-unique-id` (group 8 chars, scan 12 chars) then persist via `src/lib/database/scans.js`.
- Local scan: `createNewLocalScan` in `src/lib/server/local.js` (dedupe → cache checks → ESI refresh/affiliations → update `last_seen` → alliance→corp→character tree).
- Directional scan: `createNewDirectionalScan` in `src/lib/server/directional.js` (parse 4 columns → on-grid if km/m else off-grid for AU/"-" → enrich via `getTypeHierarchyMetadata` → bucket + optional system inference).
- Persistence: `src/lib/database/scans.js` uses a transaction; “updates” append a new scan row and only set `scan_groups.system` if null.
- Updater worker (`workers/updater/src/index.js`) runs cron jobs:
  - Dynamic: `workers/updater/src/services/dynamic.js` (TQ status gate → batch refresh characters/corps/alliances via `src/lib/server/constants.js`).
  - Static: `workers/updater/src/services/static.js` (SDE version compare → download/extract JSONL → bulk upsert via `src/lib/database/sde.js` → cleanup).

## UI + Svelte conventions

- Svelte 5 runes are used (e.g., `$state`) in route components like `src/routes/+page.svelte`.
- UI uses Flowbite Svelte components and Tailwind v4; theme tokens live in `src/app.css`.
- Datatable styling and plugin sources are wired in `src/app.css` (`@flowbite-svelte-plugins/datatable`, `simple-datatables`).

## Observability + HTTP

- Tracing in `src/instrumentation.server.js` and `workers/updater/src/instrumentation.js`; see `TRACING_GUIDE.md` for local setup.
- Wrap I/O or multi-step work in `withSpan` from `src/lib/server/tracer.js`; in routes/hooks pass `event` to join request traces (see `src/hooks.server.js`).
- Metrics live in `src/lib/server/metrics.js` and are used in scan flows.
- Use `fetchGET`/`fetchPOST` from `src/lib/server/wrappers.js` for ESI; USER\*AGENT is built in `src/lib/server/constants.js`.

## DB / schema conventions

- `scans` + `scan_groups` live in schema named by `DB_ENV` (see `pgSchema(dbEnvSchema)` in `src/lib/database/schema.js`); most other tables are in `public`.
- Drizzle tooling uses `drizzle.config.js` and filters schemas to `public` + `DB_ENV`.
- Migrations auto-run on boot unless `BUILD` or `SKIP_MIGRATIONS` is set in `src/lib/database/client.js`.

## Dev workflows (repo-specific)

- Dev: `npm run dev` (same as `dev-win`). Build: `npm run build`. Preview: `npm run preview`. Prod: `npm run prod` (runs `node build`).
- Checks/tests: `npm run check` / `check:watch`, `npm run lint`, `npm run format`, `npm test` (Vitest + `coverage/`).
- DB: set `DATABASE_URL` then `npm run db:generate|db:push|db:migrate|db:studio`.
- Worker runs from `workers/updater/` via `npm run start` (entry: `workers/updater/src/index.js`).
- Docker: root `Dockerfile` builds with `BUILD=true`; `docker-compose.yml` runs `app` + `postgres` + `updater` (worker typically sets `SKIP_MIGRATIONS=true`).
- Compose note: first run may require enabling `STATIC_UPDATE_CRON` briefly to populate SDE (see README).
