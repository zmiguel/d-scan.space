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
COPY instrumentation.mjs .
COPY drizzle drizzle/
EXPOSE 4173
ENV NODE_ENV=production
ENV DATABASE_URL=postgres://
ENV AGENT="Docker"
ENV __VITE_ADDITIONAL_SERVER_ALLOWED_HOSTS="dev.d-scan.space,d-scan.space,localhost"
CMD [ "npm", "run", "preview" ]
