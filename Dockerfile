FROM node:24-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ENV DATABASE_URL=postgres://
RUN npm run build
RUN npm prune --production

FROM node:24-alpine
WORKDIR /app
COPY --from=builder /app/build build/
COPY package.json .
COPY drizzle drizzle/
COPY drizzle.config.js .
COPY startup.sh /app/startup.sh
RUN chmod +x /app/startup.sh
RUN npm i drizzle-kit pg
EXPOSE 3000
ENV NODE_ENV=production
ENV DATABASE_URL=postgres://
CMD ["/app/startup.sh"]
