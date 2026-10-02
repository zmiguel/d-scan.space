FROM node:26-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV BUILD=true
RUN npm run build
RUN npm prune --omit=dev

FROM node:26-alpine
WORKDIR /app
# Everything is read-only at runtime; owned by node so the unprivileged user can read it.
COPY --from=builder --chown=node:node /app/build build/
COPY --from=builder --chown=node:node /app/node_modules node_modules/
COPY --chown=node:node package.json .
COPY --chown=node:node drizzle drizzle/
EXPOSE 3000
# BODY_SIZE_LIMIT: adapter-node defaults to 512K, too small for large d-scans.
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    BODY_SIZE_LIMIT=16M
USER node
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
    CMD wget -q -O /dev/null "http://127.0.0.1:${PORT:-3000}/healthz" || exit 1
# Run node directly (no npm wrapper) so SIGTERM reaches it and adapter-node drains.
CMD ["node", "build"]
