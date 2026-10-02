# D-Scan Space!

The Ultimate EVE Online Local/Direction Scan Tool

[![Test & Build](https://github.com/zmiguel/d-scan.space/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/zmiguel/d-scan.space/actions/workflows/test.yml)
[![Docker build/publish](https://github.com/zmiguel/d-scan.space/actions/workflows/build-dev.yml/badge.svg?branch=main)](https://github.com/zmiguel/d-scan.space/actions/workflows/build-dev.yml)

## Index

- [Example scan](#example-scan)
- [Tech stack](#tech-stack)
- [Screenshots](#screenshots)
- [Quick start (Docker Compose)](#quick-start-docker-compose)
- [Configuration (environment variables)](#configuration-environment-variables)
- [Observability](#observability)

## Example scan

- Public example: <https://d-scan.space/scan/FUzT1g34/xRkrwQd5vogA> showing Jita Local + Directional data

## Tech stack

- SvelteKit (adapter-node) + Svelte 5
- Node.js 26 (required: `engines` + `engine-strict`; npm scripts load `.env` with `--env-file-if-exists`)
- Tailwind CSS v4 + Flowbite Svelte
- PostgreSQL + Drizzle ORM
- OpenTelemetry (traces + Prometheus exporter)
- Vitest (tests) + ESLint/Prettier

## Screenshots

<!-- markdownlint-disable MD033 -->
<p align="center">
  <img src="docs/screenshots/home.png" alt="Home" width="49%" />
  <img src="docs/screenshots/scan-overview.png" alt="Scan overview" width="49%" />
</p>

<p align="center">
  <img src="docs/screenshots/scan-list.png" alt="Scans list" width="49%" />
  <img src="docs/screenshots/stats.png" alt="Stats" width="49%" />
</p>
<!-- markdownlint-enable MD033 -->

## Quick start (Docker Compose)

Prereqs: Docker + Docker Compose.

1. Create your env file:

```bash
cp .env.example .env
```

2. (Mandatory) set at least:

- `ORIGIN` (public URL you’ll use)
- `CONTACT_EMAIL` / `CONTACT_EVE` / `CONTACT_DISCORD` (used for the ESI User-Agent)
- `AUTH_SECRET` / `AUTH_EVEONLINE_ID` / `AUTH_EVEONLINE_SECRET` (for EVE SSO login)

For EVE SSO app setup in CCP Developer Portal, use callback URL:

- `<ORIGIN>/auth/callback/eveonline`

> [!NOTE]
> For the first run: uncomment `STATIC_UPDATE_CRON` in the docker-compose file and set it to 1 or 2 minutes after the current time, this will populate the static data.
> Remember to comment it back or set it to the default value, and restart the updater container.

3. Start everything:

```bash
docker compose up -d
```

4. Open the app:

- App: <http://localhost:3000> (health: `/healthz`, 200 when the database answers)
- Adminer (DB UI, optional): `docker compose --profile debug up -d`, then <http://127.0.0.1:8080> (bound to localhost only)

Services started by Compose:

- `app`: SvelteKit (adapter-node), healthy once `/healthz` answers (migrations run before it listens)
- `updater`: cron worker (dynamic + static refresh), started after the app is healthy; healthy while a job run succeeded within `HEALTHCHECK_MAX_AGE_MS`
- `postgres-main`: PostgreSQL 18 (volume mounted at `/var/lib/postgresql`)
- `adminer`: database UI, only with the `debug` profile

> [!WARNING]
> Upgrading from a Compose setup whose database volume was created by PostgreSQL ≤ 17 (mounted at `/var/lib/postgresql/data`): do not just pull and restart. Dump the old database and restore it into the new volume; the exact commands are in the header of `docker-compose.yml`.

Both images run as the unprivileged `node` user and start `node` directly, so `docker stop` reaches the process and in-flight requests/jobs finish.

## Configuration (environment variables)

All runtime configuration is via environment variables. The canonical list (with defaults) is in `.env.example`.

### Core

| Name           | Default                                                            | Description                                                                      |
| -------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `DATABASE_URL` | `postgresql://dscanspace:dscanspace@postgres-main:5432/dscanspace` | Postgres connection string (used by app, updater worker, and Drizzle CLI).       |
| `DB_ENV`       | `dev`                                                              | Schema namespace for `scans` + `scan_groups` (see `src/lib/database/schema.js`). |

### App server (adapter-node)

| Name              | Default                 | Description                                                                                           |
| ----------------- | ----------------------- | ----------------------------------------------------------------------------------------------------- |
| `HOST`            | `0.0.0.0`               | Bind address for the HTTP server.                                                                     |
| `PORT`            | `3000`                  | Bind port for the HTTP server.                                                                        |
| `ORIGIN`          | `http://localhost:3000` | Public origin (also included in the ESI User-Agent).                                                  |
| `BODY_SIZE_LIMIT` | `16M`                   | Max request body size; the only size limit for d-scans. Set it: adapter-node's own default is `512K`. |

### Scans / ESI client

| Name                     | Default | Description                                                                 |
| ------------------------ | ------- | --------------------------------------------------------------------------- |
| `LOCAL_SCAN_MAX_LINES`   | `12000` | Maximum names per local scan (413 above). D-scans are not line-limited.     |
| `DSCAN_ON_GRID_MAX_KM`   | `50000` | D-scan objects up to this distance (km) count as on-grid; AU and `-` never. |
| `ESI_MAX_CONCURRENCY`    | `32`    | ESI requests in flight per process (app and worker separately).             |
| `ESI_REQUEST_TIMEOUT_MS` | `15000` | Per-attempt ESI timeout.                                                    |

### Auth.js / EVE SSO

| Name                    | Default | Description                                                                  |
| ----------------------- | ------- | ---------------------------------------------------------------------------- |
| `AUTH_SECRET`           | ``      | Secret used by Auth.js to sign/encrypt session data.                         |
| `AUTH_EVEONLINE_ID`     | ``      | EVE SSO OAuth client ID from CCP Developer Portal.                           |
| `AUTH_EVEONLINE_SECRET` | ``      | EVE SSO OAuth client secret from CCP Developer Portal.                       |
| `AUTH_TRUST_HOST`       | `true`  | Trust `X-Forwarded-*` host/proto headers (recommended behind proxy/ingress). |

EVE SSO callback URL must be set to `<ORIGIN>/auth/callback/eveonline`.

### Migrations / runtime flags

| Name              | Default | Description                                                                  |
| ----------------- | ------- | ---------------------------------------------------------------------------- |
| `SKIP_MIGRATIONS` | `false` | Skip auto-migrations on boot when `true` (see `src/lib/database/client.js`). |

### Logging / identity

| Name             | Default       | Description                                                       |
| ---------------- | ------------- | ----------------------------------------------------------------- |
| `NODE_ENV`       | `production`  | Node environment (`development` / `production`).                  |
| `DEPLOYMENT_ENV` | ``            | Optional deployment label used for OpenTelemetry resource naming. |
| `LOG_LEVEL`      | `info`        | Logging level for `pino`.                                         |
| `AGENT`          | `Self-Hosted` | Included in the ESI User-Agent string.                            |

### EVE Online ESI contact info (strongly recommended)

These are included in the ESI User-Agent string built in `src/lib/server/constants.js`.

| Name              | Default             | Description                                      |
| ----------------- | ------------------- | ------------------------------------------------ |
| `CONTACT_EMAIL`   | `you@example.com`   | Contact email for CCP/ESI User-Agent compliance. |
| `CONTACT_EVE`     | `YourCharacterName` | In-game name (optional but recommended).         |
| `CONTACT_DISCORD` | `YourDiscord`       | Discord handle (optional).                       |

### Updater worker (cron)

The worker runs scheduled jobs from `workers/updater/src/index.js` (start it with `npm run start` in `workers/updater/`, which loads OpenTelemetry via `node --import`). Each job runs at most once at a time, also across several worker replicas (Postgres advisory lock); a replica that finds the job running skips that tick.

> [!CAUTION]
> Do not change these unless you really understand what you are doing.
>
> Changing these might make you receive an email from CCP for putting too much load on ESI

| Name                     | Default                         | Description                                                                                                                    |
| ------------------------ | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DYNAMIC_UPDATE_CRON`    | `* * * * *`                     | Cron schedule for dynamic refresh jobs.                                                                                        |
| `STATIC_UPDATE_CRON`     | `30 11,12 * * *`                | Cron schedule for static (SDE) refresh jobs.                                                                                   |
| `SHUTDOWN_TIMEOUT_MS`    | `6000`                          | On SIGINT/SIGTERM, how long to wait for a running job (telemetry flush adds up to 3 s; keep below the container stop timeout). |
| `HEALTHCHECK_MAX_AGE_MS` | `900000`                        | Docker healthcheck: unhealthy when no job run succeeded for this long (raise it if `DYNAMIC_UPDATE_CRON` runs less often).     |
| `HEALTHCHECK_FILE`       | `/tmp/d-scan-updater.heartbeat` | Heartbeat file written by the worker and read by `src/healthcheck.js`.                                                         |

### OpenTelemetry (optional)

Telemetry is set up in `src/lib/server/telemetry.js`, started by `src/instrumentation.server.js` (app) and `workers/updater/src/instrumentation.js` (worker). See `TRACING_GUIDE.md`.

| Name                               | Default        | Description                                                                                                                                                         |
| ---------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`      | empty          | OTLP/HTTP collector. Base URL (`http://collector:4318`) or traces URL (`…/v1/traces`); traces and metrics go to `/v1/traces`/`/v1/metrics`. Empty = no OTLP export. |
| `OTEL_EXPORTER_OTLP_AUTHORIZATION` | empty          | Optional `Authorization` header value (e.g. `Basic ...`). Never logged.                                                                                             |
| `OTEL_METRIC_EXPORT_INTERVAL`      | `15000`        | OTLP metric export interval (ms). Span batching uses the standard `OTEL_BSP_*` variables.                                                                           |
| `OTEL_METRICS_EXPORTER`            | empty          | `prometheus` (or `none`) keeps metrics off OTLP, for collectors that accept traces only (their `/v1/metrics` answers 404).                                          |
| `OTEL_SERVICE_NAME`                | `d-scan.space` | Base service name; app/worker append environment suffixes.                                                                                                          |
| `PROMETHEUS_PORT`                  | `9464`         | Port for Prometheus exporter (`/metrics`), always on.                                                                                                               |

### Docker Compose-only variables

These are used by `docker-compose.yml` for convenience.

| Name                     | Default         | Description                                                |
| ------------------------ | --------------- | ---------------------------------------------------------- |
| `POSTGRES_USER`          | `dscanspace`    | Postgres username for the Compose database container.      |
| `POSTGRES_PASSWORD`      | `dscanspace`    | Postgres password for the Compose database container.      |
| `POSTGRES_DB`            | `dscanspace`    | Postgres database name for the Compose database container. |
| `POSTGRES_HOSTNAME`      | `postgres-db`   | Container hostname (rarely needed; mostly informational).  |
| `ADMINER_PORT`           | `8080`          | Port for Adminer on `127.0.0.1` (`debug` profile only).    |
| `ADMINER_DEFAULT_SERVER` | `postgres-main` | Default DB host shown by Adminer.                          |

If you change Postgres credentials, make sure `DATABASE_URL` matches.

## Observability

- Metrics: Prometheus exporter is enabled and exposes `/metrics` on `PROMETHEUS_PORT` for both the app and the updater.
- Traces: every request has a SERVER span `server.hooks.handle_request` (client address, user agent, route, status, duration) under SvelteKit's `sveltekit.handle.root`; `withSpan` adds the app's own spans below it. Exported only when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; `OTEL_METRICS_EXPORTER=prometheus` keeps metrics off OTLP for traces-only collectors.
- Health: `GET /healthz` (app, checks the database) and `workers/updater/src/healthcheck.js` (worker heartbeat) back the Docker healthchecks.
- In production (`NODE_ENV=production`) the app refuses to start without `DATABASE_URL` and `AUTH_SECRET`, the worker without `DATABASE_URL`; missing recommended variables are logged as a warning.
