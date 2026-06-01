---
last-verified: 2026-06-01
verified-by: codex
status: living
---

# Production Hardening Handover - 2026-06-01

This is the current operational handoff for trendingrepo.com after the root-cause
worker/source-health hardening session. Use this before older sprint ledgers,
archive handovers, or Vercel-era deploy notes.

## Current Verified State

Verified on 2026-06-01T13:40:54Z:

- Public routing: `https://trendingrepo.com/` returns HTTP 200 with
  `Server: cloudflare` and no `X-Vercel-*` headers.
- App container: `toolbox-trendingrepo-1` running
  `trendingrepo-app:vps-20260601101104-7e4af7b83`, healthy on HOSTUP.
- Worker container: `toolbox-trendingrepo-worker-1` running
  `toolbox-trendingrepo-worker:vps-20260601091052-decd793c5`, healthy on HOSTUP.
- `npm run health:prod` returns PASS.
- `/api/health` returns `status=ok`, `sourceStatus=ok`, `workerStatus=ok`.
- `/api/worker/health` returns 50 active sources, 50 green, 0 amber, 0 red,
  0 missing, 0 degraded payloads, 0 empty payloads.
- `/api/worker/pulse` reads from Redis, is fresh, and has 30 stories.
- `/api/health/sources` returns closed breakers only; disabled sources are
  `github-search`, `nitter`, and `reddit`.
- `/api/admin/overview` unauthenticated guard returns 401.

Primary verification command:

```bash
npm run health:prod
```

Use direct probes when debugging:

```bash
curl -sI https://trendingrepo.com/
curl -s https://trendingrepo.com/api/health?soft=1
curl -s https://trendingrepo.com/api/worker/health
curl -s https://trendingrepo.com/api/worker/pulse
curl -s https://trendingrepo.com/api/health/sources
```

## What Shipped

- PR #3151 merged the main hardening wave into `bot/swarm-a6-producthunt-reader`.
- PR #3153 fixed the source-health endpoint so process-local cold breakers are
  visible but do not falsely degrade production after an app restart.
- PR #3154 fixed `scripts/check-live-production-health.mjs` to match that
  source-health contract.
- Production app was rebuilt and deployed from merge commit `7e4af7b83`.
- Production worker was rebuilt and deployed from merge commit `decd793c5`.

## Root Causes Closed

1. New strict worker-health slugs were introduced before Redis contained their
   first successful payloads. The fix was not to weaken health checks; it was to
   run the real fetchers once and let the strict gate stay strict.
2. `funding-news-sec` initially published a degraded payload because one SEC
   request returned a transient 500. A clean retry published an OK payload.
3. `/api/health/sources` was treating process-local never-attempted breakers as
   production degradation after every app restart. The endpoint now reports
   those as cold/unknown while still failing on open or half-open breakers.
4. `/agent-commerce` returning 429 to default curl/crawler user agents was
   expected middleware behavior, not route breakage. Browser-like smoke probes
   return 200.

## Source Decisions

- Reddit is intentionally paused/off. Do not re-enable Reddit without an
  approved credentialed, non-empty producer and a keep-last-good cache path.
- Direct OSSInsight dependence is opt-in only. The durable path is
  GitHub-backed star activity and worker-owned Redis payloads.
- GitHub Actions schedules that remain enabled should be health probes or
  explicit app-cron callers, not duplicate producers for worker-owned sources.
- The noisy Collect Funding Signals workflow was disabled because it could not
  reach the internal Redis plane from GitHub-hosted runners.

## Operator Actions Still Open

- Rotate leaked Clerk `sk_live_*` and Cloudflare `cfat_*` tokens.
- After rotation, update HOSTUP runtime env files and local env files as needed.
- Re-run:

```bash
npm run health:prod
ssh toolbox "docker ps --format '{{.Names}}|{{.Image}}|{{.Status}}' | grep trendingrepo"
```

## Overnight / Next-Day Check

The only remaining runtime question is durability across natural schedules. Let
the worker run without manual one-shots, then verify:

```bash
npm run health:prod
ssh toolbox "docker logs --since 12h toolbox-trendingrepo-worker-1 | tail -200"
```

Expected result: `50/50` active worker sources green, no recurring empty or
degraded payloads, and fresh Redis pulse.

## Known Documentation Boundaries

- Older files may still mention Vercel, Railway, Apify, or Reddit as active
  paths. Treat those as historical unless this handoff, `CLAUDE.md`,
  `AGENTS.md`, `WHERE-THINGS-RUN.md`, or `docs/DEPLOY-TOOLBOX.md` says the same
  thing.
- `docs/ENGINE.md` and `docs/SITE-WIREMAP.md` contain useful inventories but
  still have pre-v6/pre-HOSTUP sections. Verify against code and live health
  before using them for operational decisions.
