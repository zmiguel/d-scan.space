FROM node:26-alpine

WORKDIR /app

# Copy worker package.json
COPY workers/updater/package*.json ./
RUN npm ci --omit=dev

# Worker source, shared library (incl. database schema) and drizzle migrations
COPY workers/updater/src ./workers/updater/src
COPY workers/updater/package.json ./workers/updater/package.json
COPY src/lib ./src/lib
COPY drizzle ./drizzle

USER node

# Healthy while a job run (or startup) succeeded within HEALTHCHECK_MAX_AGE_MS.
HEALTHCHECK --interval=60s --timeout=10s --start-period=60s --retries=3 \
    CMD ["node", "workers/updater/src/healthcheck.js"]
# --import loads OpenTelemetry before the worker so pg is instrumented.
CMD ["node", "--import", "./workers/updater/src/instrumentation.js", "workers/updater/src/index.js"]
