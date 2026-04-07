# Architecture

## Project Structure

- `src/routes/` — SvelteKit pages (`+page.svelte`) and server logic (`+page.server.js`)
- `src/lib/server/` — shared server-side logic (ESI, scan processing, tracing, metrics)
- `src/lib/database/` — Drizzle schema, client, and query helpers
- `workers/updater/src/` — standalone cron worker (shares lib server code)
- `build/`, `coverage/` — generated output, not source

## Scan Ingest Flow (`src/routes/scan/+page.server.js`)

**Type detection:** ≥50% of lines are 4-tab columns with numeric `typeId` → directional scan; otherwise local scan.

**IDs:** group ID = 8 chars, scan ID = 12 chars via `short-unique-id`. Persisted via `src/lib/database/scans.js`.

### Local Scan (`src/lib/server/local.js` → `createNewLocalScan`)

1. Dedupe + cache checks
2. ESI refresh for character affiliations
3. Update `last_seen`
4. Build alliance → corp → character tree

### Directional Scan (`src/lib/server/directional.js` → `createNewDirectionalScan`)

1. Parse 4 columns from raw text
2. On-grid if distance in km/m; off-grid for AU or "-"
3. Enrich via `getTypeHierarchyMetadata`
4. Bucket by type + optional system inference

## Persistence (`src/lib/database/scans.js`)

- Uses a DB transaction
- "Updates" append a new scan row
- `scan_groups.system` is only set if currently null

## DB Schema (`src/lib/database/schema.js`)

- `scans` + `scan_groups` tables live in schema named by `DB_ENV` env var (`pgSchema(dbEnvSchema)`)
- All other tables (`users`, `accounts`, SDE tables) in `public`
- Drizzle config filters to `public` + `DB_ENV` schemas
- Migrations auto-run on boot unless `BUILD=true` or `SKIP_MIGRATIONS=true`

## Updater Worker (`workers/updater/src/index.js`)

Two cron job types:

**Dynamic** (`workers/updater/src/services/dynamic.js`)

- TQ (Tranquility) status gate
- Batch refresh: characters → corps → alliances via ESI
- Uses rate limits from `src/lib/server/constants.js`

**Static** (`workers/updater/src/services/static.js`)

- SDE version compare → download/extract JSONL
- Bulk upsert via `src/lib/database/sde.js`
- Cleanup after upsert

## ESI / HTTP (`src/lib/server/wrappers.js`)

- `fetchGET` / `fetchPOST` for all ESI calls
- User-Agent built in `src/lib/server/constants.js` (uses `ORIGIN`, `CONTACT_*`, `AGENT` env vars)

## Auth (`src/hooks.server.js` + Auth.js)

- EVE SSO OAuth via Auth.js (`@auth/sveltekit`)
- Drizzle adapter for session persistence (`@auth/drizzle-adapter`)
- Callback URL: `<ORIGIN>/auth/callback/eveonline`
- Trusts `X-Forwarded-*` headers by default (`AUTH_TRUST_HOST=true`)

## Observability

- Tracing: `src/instrumentation.server.js` (app), `workers/updater/src/instrumentation.js` (worker)
- Metrics: `src/lib/server/metrics.js` — used in scan flows, exposed via Prometheus
- See TRACING_GUIDE.md for local setup
