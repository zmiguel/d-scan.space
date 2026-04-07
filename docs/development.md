# Development

## Local Dev

```bash
npm run dev          # dev server
npm run build        # production build
npm run prod         # run built app (node build)
npm run preview      # preview build on :4173
npm run check        # svelte-check
npm run check:watch  # watch mode
npm run lint         # prettier --check + eslint
npm run format       # prettier --write
npm test             # vitest run --coverage
```

## Database

Set `DATABASE_URL` first, then:

```bash
npm run db:generate  # generate migration files
npm run db:push      # push schema directly (dev)
npm run db:migrate   # apply migrations
npm run db:studio    # Drizzle Studio UI
```

## Updater Worker

```bash
cd workers/updater
npm run start        # entry: src/index.js
```

## Docker Compose

```bash
docker compose up -d
```

Services: `app` (SvelteKit :3000), `updater` (cron worker), `postgres-main`, `adminer` (:8080)

**First run:** temporarily enable `STATIC_UPDATE_CRON` in docker-compose.yml (set 1-2 min ahead) to populate SDE data, then restore default and restart updater.

**Build:** root `Dockerfile` builds with `BUILD=true`; worker sets `SKIP_MIGRATIONS=true`.

## Environment Variables

### Core

| Var            | Default                                                            | Notes                                        |
| -------------- | ------------------------------------------------------------------ | -------------------------------------------- |
| `DATABASE_URL` | `postgresql://dscanspace:dscanspace@postgres-main:5432/dscanspace` | Used by app, worker, Drizzle CLI             |
| `DB_ENV`       | `dev`                                                              | Schema namespace for `scans` + `scan_groups` |

### App Server

| Var               | Default                 | Notes                                  |
| ----------------- | ----------------------- | -------------------------------------- |
| `HOST`            | `0.0.0.0`               | Bind address                           |
| `PORT`            | `3000`                  | Bind port                              |
| `ORIGIN`          | `http://localhost:3000` | Public URL, included in ESI User-Agent |
| `BODY_SIZE_LIMIT` | `256M`                  | Max request body                       |

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

| Var               | Default | Notes                        |
| ----------------- | ------- | ---------------------------- |
| `SKIP_MIGRATIONS` | `false` | Skip auto-migrations on boot |

### OpenTelemetry

| Var                                | Default                           | Notes                      |
| ---------------------------------- | --------------------------------- | -------------------------- |
| `OTEL_EXPORTER_OTLP_ENDPOINT`      | `http://localhost:4318/v1/traces` | OTLP traces endpoint       |
| `OTEL_EXPORTER_OTLP_AUTHORIZATION` | ``                                | Optional auth header       |
| `OTEL_SERVICE_NAME`                | `d-scan.space`                    | Base service name          |
| `PROMETHEUS_PORT`                  | `9464`                            | Prometheus `/metrics` port |

### Docker Compose Only

| Var                      | Default         |
| ------------------------ | --------------- |
| `POSTGRES_USER`          | `dscanspace`    |
| `POSTGRES_PASSWORD`      | `dscanspace`    |
| `POSTGRES_DB`            | `dscanspace`    |
| `POSTGRES_PORT`          | `5432`          |
| `ADMINER_PORT`           | `8080`          |
| `ADMINER_DEFAULT_SERVER` | `postgres-main` |
