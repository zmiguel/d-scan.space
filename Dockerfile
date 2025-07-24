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
COPY package.json .
COPY drizzle drizzle/
EXPOSE 3000
ENV NODE_ENV=production
ENV DATABASE_URL=postgres://
ENV AGENT="Docker"
CMD [ "node", "build" ]
