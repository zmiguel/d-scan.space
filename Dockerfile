FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV BUILD=true
RUN npm run build
RUN npm prune --production

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/build build/
COPY --from=builder /app/node_modules node_modules/
COPY package.json .
COPY src/lib/logger.js src/lib/logger.js
COPY drizzle drizzle/
EXPOSE 3000
ENV NODE_ENV=production \
    DATABASE_URL=postgres:// \
    AGENT="" \
    ORIGIN=undefined \
    CONTACT_EMAIL=undefined \
    CONTACT_EVE=undefined \
    CONTACT_DISCORD=undefined \
    HOST=0.0.0.0 \
    PORT=3000
CMD [ "npm", "run", "prod" ]
