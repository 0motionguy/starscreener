# syntax=docker/dockerfile:1.6
# Trendingrepo Next.js production container for self-hosted VPS deployment.
# Mirrors Vercel's build pipeline: npm ci -> next build (standalone) -> node server.js
# Uses bookworm-slim (glibc) rather than alpine — sharp + native deps behave better.

FROM node:22-bookworm-slim AS base
ENV NEXT_TELEMETRY_DISABLED=1
RUN apt-get update && apt-get install -y --no-install-recommends \
      ca-certificates curl python3 build-essential \
  && rm -rf /var/lib/apt/lists/*

# ---- deps: install full dependency tree (cached layer) ---------------------
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
# Using `npm install` not `npm ci` because main's lock file has drift
# (e.g. @swc/helpers 0.5.15 vs 0.5.21) that Vercel's cached-layer build
# masks. Tradeoff: less deterministic than ci, but builds reliably.
# Switch back to npm ci after a lock-file refresh PR lands on main.
RUN --mount=type=cache,target=/root/.npm \
    npm install --no-audit --no-fund --prefer-offline --no-save --legacy-peer-deps

# ---- builder: compile Next.js with standalone output -----------------------
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .

ENV NODE_ENV=production
# Give Next.js room — bookworm-slim allows up to host memory; cap heap to 4G
# so we don't OOM other toolbox containers when building on the shared VPS.
ENV NODE_OPTIONS=--max-old-space-size=4096
# Sentry source-map upload is gated on SENTRY_AUTH_TOKEN. Plumbed as a build
# ARG so VPS deploys can pass the token from /opt/trendingrepo/.env.production
# at `docker build` time. Defaults to empty so a forgotten arg silently skips
# upload (matches the pre-2026-05-15 behavior) rather than failing the build.
# Recipe: docker build --build-arg SENTRY_AUTH_TOKEN="$TOKEN" ...
# Set SENTRY_ORG + SENTRY_PROJECT alongside (already in env.production).
ARG SENTRY_AUTH_TOKEN=""
ENV SENTRY_AUTH_TOKEN=$SENTRY_AUTH_TOKEN
ARG SENTRY_ORG=""
ENV SENTRY_ORG=$SENTRY_ORG
ARG SENTRY_PROJECT=""
ENV SENTRY_PROJECT=$SENTRY_PROJECT

RUN npm run build

# ---- runner: minimal runtime image ----------------------------------------
FROM node:22-bookworm-slim AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3023
ENV HOSTNAME=0.0.0.0

# Non-root user mirrors the worker container's pattern.
RUN groupadd --system --gid 1001 nodejs \
  && useradd --system --uid 1001 --gid nodejs --shell /usr/sbin/nologin nextjs

# Next.js standalone server includes a slim node_modules + server.js entrypoint.
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
# Runtime data referenced via outputFileTracingIncludes in next.config.ts.
# Copied conditionally — missing directories fail-soft (the SSR fallback
# branches handle empty/missing files as cold-state per existing code).
COPY --from=builder --chown=nextjs:nodejs /app/docs/openapi.json ./docs/openapi.json

USER nextjs
EXPOSE 3023

# Standalone server entrypoint emitted by next build.
CMD ["node", "server.js"]
