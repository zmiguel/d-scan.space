# D-Scan Space – Copilot Instructions

## Big picture

- SvelteKit + Svelte 5 app. UI routes live in `src/routes/**/+page.svelte`; server actions/loaders live beside them in `src/routes/**/+page.server.js`.
- Shared “business logic” sits in `src/lib/server/*` (scan parsing, ESI calls, tracing/metrics) and is reused by the Node worker in `workers/updater/`.
- PostgreSQL via Drizzle. DB wiring/migrations: `src/lib/database/client.js`; schema: `src/lib/database/schema.js`; queries/helpers: `src/lib/database/*.js`.

## Core flows (examples)

- Scan ingest: `src/routes/scan/+page.server.js` detects local vs directional (tab-separated lines; 50% threshold), then calls:
	- Local: `createNewLocalScan` in `src/lib/server/local.js` (dedupe → cache checks → ESI refresh → update `last_seen` → alliance→corp→character tree).
	- Directional: `createNewDirectionalScan` in `src/lib/server/directional.js` (parse lines → enrich via SDE `getTypeHierarchyMetadata` → bucket on/off grid → optional system inference).
- Persistence: `src/lib/database/scans.js` uses a transaction; “updates” append a new scan row and only set `scan_groups.system` if it was null.
- Updater worker: `workers/updater/src/index.js` runs cron jobs:
	- Dynamic: `workers/updater/src/services/dynamic.js` (TQ status gate → batch refresh characters/corps/alliances using constants in `src/lib/server/constants.js`).
	- Static: `workers/updater/src/services/static.js` (SDE version compare → download/extract JSONL slices into `./temp` → bulk upsert via `src/lib/database/sde.js` helpers → cleanup).

## Observability is not optional here

- Wrap I/O and multi-step work in `withSpan` from `src/lib/server/tracer.js` and add high-value attributes (route IDs, counts, IDs).
- In SvelteKit hooks/routes, pass the `event` to `withSpan(..., event)` to parent spans to SvelteKit’s request trace (see `src/hooks.server.js`).
- App OTEL setup: `src/instrumentation.server.js` (Prometheus exporter + optional OTLP metrics + OTLP traces with retry).
- Worker OTEL setup: `workers/updater/src/instrumentation.js`.

## ESI / HTTP conventions

- Use `fetchGET` / `fetchPOST` from `src/lib/server/wrappers.js` instead of raw `fetch` for ESI: undici pooling, retries/backoff, metrics (`recordEsiRequest`), and “deleted character” handling (calls `biomassCharacter`).
- USER_AGENT is constructed in `src/lib/server/constants.js` and expects env contact fields (`CONTACT_EMAIL`, `CONTACT_EVE`, `CONTACT_DISCORD`) plus `AGENT`/`ORIGIN`.

## DB / schema conventions

- The `scans` + `scan_groups` tables live in a schema named by `DB_ENV` (see `pgSchema(dbEnvSchema)` in `src/lib/database/schema.js`). Most other tables are in `public`.
- Drizzle tooling uses `drizzle.config.js` and filters schemas to `public` + `DB_ENV`.
- Migrations auto-run on boot unless `BUILD` or `SKIP_MIGRATIONS` is set (see `src/lib/database/client.js`).

## Dev workflows (repo-specific)

- Dev server: `npm run dev` (same as `dev-win`). Build: `npm run build`. Prod: `npm run prod` (runs `node build`).
- Checks/tests: `npm run check`, `npm run lint`, `npm run format`, `npm test` (Vitest).
- DB: set `DATABASE_URL` then `npm run db:generate|db:push|db:migrate|db:studio`.
- Docker: root `Dockerfile` builds with `BUILD=true`; `docker-compose.yml` runs `app` + `postgres` + `updater` (worker typically sets `SKIP_MIGRATIONS=true`).
