# D-Scan Space!

The Ultimate EVE Online Local/Direction Scan Tool

[![Test & Build](https://github.com/zmiguel/d-scan.space/actions/workflows/test.yml/badge.svg?branch=main)](https://github.com/zmiguel/d-scan.space/actions/workflows/test.yml)
[![Docker build/publish](https://github.com/zmiguel/d-scan.space/actions/workflows/build-dev.yml/badge.svg?branch=main)](https://github.com/zmiguel/d-scan.space/actions/workflows/build-dev.yml)

## Index

- [Example scan](#example-scan-urls)
- [Tech stack](#tech-stack)
- [Screenshots](#screenshots)
- [Quick start (Docker Compose)](#quick-start-docker-compose)
- [Configuration (environment variables)](#configuration-environment-variables)
- [Observability](#observability)
- [Troubleshooting](#troubleshooting)

## Example scan

- Public example: <https://d-scan.space/scan/FUzT1g34/xRkrwQd5vogA> showing Jita Local + Directional data

## Tech stack

- SvelteKit (adapter-node) + Svelte 5
- Node.js 24
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

1. (Mandatory) set at least:

- `ORIGIN` (public URL you’ll use)
- `CONTACT_EMAIL` / `CONTACT_EVE` / `CONTACT_DISCORD` (used for the ESI User-Agent)

> [!NOTE]
> For the first run: uncomment `STATIC_UPDATE_CRON` on the docker-compose file and set it to 1 or 2 minutes after the current time, this will populate the static data.
> Remember to comment it back or set it to the default value, and restart the updater container.

2. Start everything:

```bash
docker compose up -d --build
```

3. Open the app:

- App: <http://localhost:3000>
- Adminer (DB UI): <http://localhost:8080>

Services started by Compose:

- `app`: SvelteKit (adapter-node)
- `updater`: cron worker (dynamic + static refresh)
- `postgres-main`: PostgreSQL
- `adminer`: database UI

## Configuration (environment variables)

All runtime configuration is via environment variables. The canonical list (with defaults) is in `.env.example`.

### Core

| Name           | Default                                                            | Description                                                                      |
| -------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `DATABASE_URL` | `postgresql://dscanspace:dscanspace@postgres-main:5432/dscanspace` | Postgres connection string (used by app, updater worker, and Drizzle CLI).       |
| `DB_ENV`       | `dev`                                                              | Schema namespace for `scans` + `scan_groups` (see `src/lib/database/schema.js`). |

### App server (adapter-node)

| Name              | Default                 | Description                                                         |
| ----------------- | ----------------------- | ------------------------------------------------------------------- |
| `HOST`            | `0.0.0.0`               | Bind address for the HTTP server.                                   |
| `PORT`            | `3000`                  | Bind port for the HTTP server.                                      |
| `ORIGIN`          | `http://localhost:3000` | Public origin (also included in the ESI User-Agent).                |
| `BODY_SIZE_LIMIT` | `256M`                  | Max request body size (supports values like `512K`, `10M`, `256M`). |

### Migrations / runtime flags

| Name              | Default | Description                                                          |
| ----------------- | ------- | -------------------------------------------------------------------- |
| `SKIP_MIGRATIONS` | `false` | Skip auto-migrations on app boot (see `src/lib/database/client.js`). |

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

The worker runs scheduled jobs from `workers/updater/src/index.js`.

> [!CAUTION]
> Do not change these unless you really understand what you are doing.
>
> Changing these might make you receive an email from CCP for putting too much load on ESI

| Name                  | Default          | Description                                  |
| --------------------- | ---------------- | -------------------------------------------- |
| `DYNAMIC_UPDATE_CRON` | `* * * * *`      | Cron schedule for dynamic refresh jobs.      |
| `STATIC_UPDATE_CRON`  | `30 11,12 * * *` | Cron schedule for static (SDE) refresh jobs. |

### OpenTelemetry (optional)

Tracing is configured in `src/instrumentation.server.js` (app) and `workers/updater/src/instrumentation.js` (worker). For local setup, see `TRACING_GUIDE.md`.

| Name                               | Default                           | Description                                                      |
| ---------------------------------- | --------------------------------- | ---------------------------------------------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`      | `http://localhost:4318/v1/traces` | OTLP endpoint for traces (metrics auto-switch to `/v1/metrics`). |
| `OTEL_EXPORTER_OTLP_AUTHORIZATION` | ``                                | Optional `Authorization` header value (e.g. `Basic ...`).        |
| `OTEL_SERVICE_NAME`                | `d-scan.space`                    | Base service name; app/worker append environment suffixes.       |
| `PROMETHEUS_PORT`                  | `9464`                            | Port for Prometheus exporter (`/metrics`).                       |

### Docker Compose-only variables

These are used by `docker-compose.yml` for convenience.

| Name                     | Default         | Description                                                |
| ------------------------ | --------------- | ---------------------------------------------------------- |
| `POSTGRES_USER`          | `dscanspace`    | Postgres username for the Compose database container.      |
| `POSTGRES_PASSWORD`      | `dscanspace`    | Postgres password for the Compose database container.      |
| `POSTGRES_DB`            | `dscanspace`    | Postgres database name for the Compose database container. |
| `POSTGRES_PORT`          | `5432`          | Host port mapped to Postgres.                              |
| `POSTGRES_HOSTNAME`      | `postgres-db`   | Container hostname (rarely needed; mostly informational).  |
| `ADMINER_PORT`           | `8080`          | Host port mapped to Adminer.                               |
| `ADMINER_DEFAULT_SERVER` | `postgres-main` | Default DB host shown by Adminer.                          |

If you change Postgres credentials, make sure `DATABASE_URL` matches.

## Observability

- Metrics: Prometheus exporter is enabled and exposes `/metrics` on `PROMETHEUS_PORT` for both the app and the updater.

## Troubleshooting

- Database migrations run automatically on app boot unless `SKIP_MIGRATIONS=true`.
