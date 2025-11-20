FROM node:24-alpine

WORKDIR /app

# Copy worker package.json
COPY workers/dynamic/package*.json ./
RUN npm ci --omit=dev

# Copy worker source code
COPY workers/dynamic/src ./workers/dynamic/src

# Copy shared schema from root
COPY src/lib/database/schema.js ./src/lib/database/schema.js

# Copy shared library
COPY src/lib ./src/lib

# Copy drizzle migrations
COPY drizzle ./drizzle

CMD ["node", "workers/dynamic/src/index.js"]
