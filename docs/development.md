# Development

## Local Dev

Requires Node.js 26. Copy `.env.example` to `.env` and fill it in.

```bash
npm run dev          # dev server (loads .env)
npm run build        # production build
npm run prod         # run built app (node build, loads .env)
npm run preview      # preview build on :4173 (loads .env)
npm run check        # svelte-check
npm run check:watch  # watch mode
npm run lint         # prettier --check + eslint
npm run format       # prettier --write
npm test             # vitest run --coverage (does NOT load .env)
```

**How `.env` is loaded.** Vite only feeds `.env` into SvelteKit's `$env/dynamic/private`;
the database client, logger, ESI User-Agent and env validation read `process.env`. The npm
scripts therefore start Node with `--env-file-if-exists=.env` (`dev`, `preview`, `prod`,
`db:*`, and the worker's `start` with `../../.env`). This works the same on Windows,
macOS and Linux, needs no dotenv dependency, and does nothing when the file is missing
(CI, Docker). Variables already set in the environment (shell, Windows user/system
variables, CI) win over the file, so set `SKIP_MIGRATIONS=true` in the shell to override
it for one run. Tests never load `.env`, so they cannot hit a real database. Starting
`vite`/`node` directly instead of through npm skips the file. Leave `NODE_ENV` unset for
`npm run dev`.

## Database

Set `DATABASE_URL` in `.env` (or the shell), then:

```bash
npm run db:generate -- --name=<change>  # generate a migration from schema.js changes
npm run db:push      # push schema directly (dev)
npm run db:migrate   # apply migrations
npm run db:studio    # Drizzle Studio UI
```

Migration workflow (ORM-first): change `src/lib/database/schema.js`, run `db:generate`, review the
SQL. Hand edits are fine when needed (data backfills, objects that already exist, `USING` clauses)
but must be explained in a header comment of the migration file. Afterwards `db:generate` must
report "No schema changes". `drizzle-kit generate` works offline; any `DATABASE_URL` value is fine.
The app applies pending migrations on boot (see `docs/architecture.md`).

## Updater Worker

```bash
cd workers/updater
npm run start        # node --env-file-if-exists=../../.env --import ./src/instrumentation.js src/index.js
```

## Docker Compose

```bash
docker compose up -d                    # app, updater, postgres-main
docker compose --profile debug up -d    # + adminer on 127.0.0.1:8080
```

Services: `app` (SvelteKit :3000, healthcheck `GET /healthz`), `updater` (cron worker, heartbeat healthcheck), `postgres-main` (PostgreSQL 18, volume at `/var/lib/postgresql`; upgrade steps from ≤ 17 volumes are in the header of `docker-compose.yml`), `adminer` (`debug` profile only).

**First run:** temporarily enable `STATIC_UPDATE_CRON` in docker-compose.yml (set 1-2 min ahead) to populate SDE data, then restore default and restart updater.

**Images:** the root `Dockerfile` builds with `BUILD=true`, prunes devDependencies and runs `node build` as the `node` user. The worker image installs only `workers/updater` dependencies and runs as `node`; compose sets `SKIP_MIGRATIONS=true` for it and starts it after the app is healthy. Build context exclusions are in `.dockerignore`.

**Dependencies:** runtime packages go in `dependencies` (adapter-node keeps exactly those external; OpenTelemetry, `pg` and `import-in-the-middle` must stay there so instrumentation can patch them). Build, lint, test and type tooling goes in `devDependencies` (bundled or unused at runtime). The worker declares its own runtime dependencies in `workers/updater/package.json`, including everything the shared `src/lib` code it imports needs.

## CI

- `.github/workflows/test.yml` (pull requests, and called by `build-dev.yml`): lint, `svelte-check`, Vitest, build, drizzle drift check for `dev`/`preview`/`prod` plus migrations applied twice on PostgreSQL 18, npm audit, and Docker builds on PRs.
- `.github/workflows/build-dev.yml`: images are only built and published after `test.yml` passed. Workflows default to `contents: read`.
- Dependabot updates npm (root and worker), GitHub Actions and the Docker base images.

## Environment Variables

### Core

| Var            | Default                                                            | Notes                                        |
| -------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| `DATABASE_URL` | `postgresql://dscanspace:dscanspace@postgres-main:5432/dscanspace` | Used by app, worker, Drizzle CLI             |
| `DB_ENV`       | `dev`                                                              | Schema namespace for `scans` + `scan_groups` |

### App Server

| Var               | Default                 | Notes                                                                             |
| ----------------- | ----------------------- | --------------------------------------------------------------------------------- |
| `HOST`            | `0.0.0.0`               | Bind address                                                                      |
| `PORT`            | `3000`                  | Bind port                                                                         |
| `ORIGIN`          | `http://localhost:3000` | Public URL, included in ESI User-Agent                                            |
| `BODY_SIZE_LIMIT` | `16M`                   | Max request body (only d-scan size limit; adapter-node defaults to 512K if unset) |

Scan/ESI tuning (`LOCAL_SCAN_MAX_LINES`, `DSCAN_ON_GRID_MAX_KM`, `ESI_MAX_CONCURRENCY`,
`ESI_REQUEST_TIMEOUT_MS`) is documented in the README and `.env.example`.

### Auth / EVE SSO

| Var                     | Default | Notes                               |
| ----------------------- | ------- | ----------------------------------- |
| `AUTH_SECRET`           | ``      | Signs/encrypts sessions             |
| `AUTH_EVEONLINE_ID`     | ``      | OAuth client ID from CCP Dev Portal |
| `AUTH_EVEONLINE_SECRET` | ``      | OAuth client secret                 |
| `AUTH_TRUST_HOST`       | `true`  | Trust X-Forwarded-\* headers        |

### Logging / Identity

| Var              | Default       | Notes                         |
| ---------------- | ------------- | ----------------------------- |
| `NODE_ENV`       | `production`  | `development` or `production` |
| `DEPLOYMENT_ENV` | ``            | OpenTelemetry resource label  |
| `LOG_LEVEL`      | `info`        | Pino log level                |
| `AGENT`          | `Self-Hosted` | Included in ESI User-Agent    |

### ESI Contact (mandatory for compliance)

| Var               | Default             | Notes                       |
| ----------------- | ------------------- | --------------------------- |
| `CONTACT_EMAIL`   | `you@example.com`   | Required for ESI User-Agent |
| `CONTACT_EVE`     | `YourCharacterName` | In-game name                |
| `CONTACT_DISCORD` | `YourDiscord`       | Discord handle              |

### Updater Cron

| Var                   | Default          | Notes                    |
| --------------------- | ---------------- | ------------------------ |
| `DYNAMIC_UPDATE_CRON` | `* * * * *`      | Dynamic refresh schedule |
| `STATIC_UPDATE_CRON`  | `30 11,12 * * *` | SDE refresh schedule     |

> **Caution:** Do not tighten cron schedules — excessive ESI calls may trigger CCP contact.

### Migrations

| Var               | Default | Notes                                                   |
| ----------------- | ------- | ------------------------------------------------------- |
| `SKIP_MIGRATIONS` | `false` | Skip auto-migrations on boot when `true`/`1`/`yes`/`on` |

### OpenTelemetry

| Var                                | Default        | Notes                                                       |
| ---------------------------------- | -------------- | ----------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`      | empty          | Collector base URL or `…/v1/traces`; empty = no OTLP export |
| `OTEL_EXPORTER_OTLP_AUTHORIZATION` | empty          | Optional auth header (never logged)                         |
| `OTEL_METRIC_EXPORT_INTERVAL`      | `15000`        | OTLP metric export interval (ms)                            |
| `OTEL_METRICS_EXPORTER`            | empty          | `prometheus` = no OTLP metrics (traces-only collectors)     |
| `OTEL_SERVICE_NAME`                | `d-scan.space` | Base service name                                           |
| `PROMETHEUS_PORT`                  | `9464`         | Prometheus `/metrics` port                                  |

### Updater health / shutdown

| Var                      | Default                         | Notes                                       |
| ------------------------ | ------------------------------- | ------------------------------------------- |
| `SHUTDOWN_TIMEOUT_MS`    | `6000`                          | Wait for a running job on SIGINT/SIGTERM    |
| `HEALTHCHECK_MAX_AGE_MS` | `900000`                        | Max age of the last successful job run      |
| `HEALTHCHECK_FILE`       | `/tmp/d-scan-updater.heartbeat` | Heartbeat file (worker writes, check reads) |

### Docker Compose Only

| Var                      | Default         |
| ------------------------ | --------------- |
| `POSTGRES_USER`          | `dscanspace`    |
| `POSTGRES_PASSWORD`      | `dscanspace`    |
| `POSTGRES_DB`            | `dscanspace`    |
| `POSTGRES_HOSTNAME`      | `postgres-db`   |
| `ADMINER_PORT`           | `8080`          |
| `ADMINER_DEFAULT_SERVER` | `postgres-main` |

Production (`NODE_ENV=production`): the app requires `DATABASE_URL` and `AUTH_SECRET`, the worker `DATABASE_URL` (startup fails otherwise); recommended variables are listed in `src/lib/server/env-check.js` and warned about.
