# Self-contained build - this package manages its own deps.
# No npm workspaces dependency on the monorepo root.

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
RUN addgroup -S worker && adduser -S worker -G worker
COPY --from=deps --chown=worker:worker /app/node_modules ./node_modules
COPY --from=build --chown=worker:worker /app/dist ./dist
COPY --chown=worker:worker package.json ./
USER worker
ENV NODE_ENV=production
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1
CMD ["node","--enable-source-maps","--max-old-space-size=512","dist/index.js","--cron"]
