# Build context = MONOREPO ROOT (Railway uploads the whole repo because
# .git is at the root). All COPY paths are relative to that root.

FROM node:22-alpine AS deps
WORKDIR /app
COPY apps/trendingrepo-worker/package.json apps/trendingrepo-worker/package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY apps/trendingrepo-worker/package.json apps/trendingrepo-worker/package-lock.json ./
COPY apps/trendingrepo-worker/tsconfig.json ./
COPY apps/trendingrepo-worker/src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S worker && adduser -S worker -G worker
COPY --from=deps --chown=worker:worker /app/node_modules ./node_modules
COPY --from=build --chown=worker:worker /app/dist ./dist
COPY --chown=worker:worker apps/trendingrepo-worker/package.json ./
USER worker
ENV NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1
CMD ["node","--enable-source-maps","--max-old-space-size=512","dist/index.js","--cron"]
