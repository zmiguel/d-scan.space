# D-Scan Space – Copilot Instructions
## Architecture
- SvelteKit app; UI lives in `src/routes` with Svelte 5 runes and Flowbite components under `src/lib/components`.
- Server logic is colocated in `src/routes/**/+page.server.js` and shared helpers under `src/lib/server` (wrappers, tracer, metrics) and `src/lib/database` (Drizzle queries).
- PostgreSQL via Drizzle ORM; `src/lib/database/client.js` wires the pool and auto-migrates on boot unless `env.BUILD` is set.
- Background maintenance sits in `src/lib/cron/{dynamic,static}.js`, triggered from `src/hooks.server.js` using Cron schedules.
- OpenTelemetry is first-class: `src/instrumentation.server.js` starts OTLP + Prometheus exporters and the custom tracer in `src/lib/server/tracer.js` wraps most async work.
## Data Flows
- Local scan uploads hit `src/routes/scan/+page.server.js`, which calls `createNewLocalScan` in `src/lib/server/local.js`.
- `local.js` de-duplicates pilot names, queries cached data, refreshes stale records with ESI (`fetchGET`/`fetchPOST` wrappers), updates `last_seen`, then returns alliance→corporation→character hierarchy.
- Scan persistence goes through Drizzle helpers in `src/lib/database/scans.js`; new groups use a transaction, updates append immutable rows.
- Dynamic cron (`updateDynamicData`) fetches Tranquility status, batches character/corp/alliance refresh by last seen/updated timestamps, and records metrics via `metrics.js`.
- Static cron (`updateStaticData`) compares SDE versions, downloads specific JSONL slices, decompresses through `src/lib/workers/extract-worker.js`, and bulk upserts systems/categories/groups/types via `sde.js` helpers.
## Workflows
- Install deps with `npm ci`; start dev server using `npm run dev` (or `npm run dev-win` on Windows).
- Build output lives in `build/`; production entry is `npm run prod` which executes the built server (`node build`).
- Type and lint checks: `npm run check`, `npm run lint`, `npm run format`; tests run with `npm test` (Vitest configured in `vite.config.js`).
- Drizzle CLI commands (`npm run db:generate`, `db:push`, `db:migrate`, `db:studio`) require `DATABASE_URL`; migrations also auto-run on startup, so set `BUILD=true` where you need to skip that.
- Cron jobs execute automatically in dev; override cadence with `DYNAMIC_UPDATE_CRON` / `STATIC_UPDATE_CRON` to avoid hammering ESI during local testing.
## Conventions
- Always wrap long-running or I/O-heavy server work with `withSpan` and add high-value attributes/events for observability.
- Use `fetchGET`/`fetchPOST` from `src/lib/server/wrappers.js` for ESI calls to inherit retries, headers, metrics, and deletion handling.
- Bulk database writes rely on `.onConflictDoUpdate` with explicit column lists; mirror existing patterns in `characters.js`, `corporations.js`, `sde.js`, etc.
- Maintain batching strategy constants from `src/lib/server/constants.js` when tuning performance-sensitive loops.
- Frontend uses Tailwind classes and Flowbite widgets; follow the layout split in `ScanTabs.svelte`, `TopBar.svelte`, and friends for new UI work.
## Integrations & Env
- USER_AGENT is assembled from env metadata (`AGENT`, `ORIGIN`, contact fields) in `constants.js`; populate these before hitting ESI in prod.
- Metrics are exported to Prometheus on `PROMETHEUS_PORT` and optionally OTLP (`OTEL_EXPORTER_OTLP_*`); align new meters with the patterns in `metrics.js` and registered views in `instrumentation.server.js`.
- Database schema definitions live in `src/lib/database/schema.js`; migrations in `drizzle/` are generated from there.
- Temporary SDE artifacts land in `./temp`; `updateStaticData` cleans them—avoid persisting data there across runs.
- The repository ships a two-stage `Dockerfile` that builds with `BUILD=true`, prunes dev deps, then copies `build/`, `node_modules/`, and `drizzle/` into the runtime image.
