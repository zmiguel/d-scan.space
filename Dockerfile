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
COPY drizzle drizzle/
COPY src/instrumentation.mjs .
EXPOSE 3000
ENV NODE_ENV=production
ENV DATABASE_URL=postgres://
ENV AGENT="Docker"
CMD [ "node", "--import", "/app/instrumentation.mjs", "build" ]
