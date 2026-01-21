FROM node:24-alpine

WORKDIR /app

# Copy worker package.json
COPY workers/updater/package*.json ./
RUN npm ci --omit=dev

# Copy worker source code
COPY workers/updater/src ./workers/updater/src

# Copy shared schema from root
COPY src/lib/database/schema.js ./src/lib/database/schema.js

# Copy shared library
COPY src/lib ./src/lib

# Copy drizzle migrations
COPY drizzle ./drizzle

CMD ["node", "workers/updater/src/index.js"]
