# DEPLOY — HOSTUP, not Vercel

## Production = HOSTUP Docker tenant + Cloudflare Tunnel. PERIOD.

From `CLAUDE.md:30`:

> Deploy: HOSTUP Docker tenant + Cloudflare Tunnel is production. Vercel `starscreener` must stay paused/disconnected unless Mirko explicitly approves a reversal.

Global rule from `~/.claude/CLAUDE.md`:

> AISO and STARSCREENER/trendingrepo production are on HOSTUP, not Vercel. Their Vercel projects (`aiso`, `starscreener`) stay paused and Git-disconnected. Never run `vercel deploy`, `vercel promote`, `vercel git connect`, or `vercel project unpause` for them without explicit approval.

Vercel project name (paused): **`starscreener`**.

## Canonical deploy doc

**`docs/DEPLOY-TOOLBOX.md`** is current (HOSTUP).

**`docs/DEPLOY.md`** is the **STALE Vercel/Railway-era snapshot** — do not follow it for prod. From `CLAUDE.md:75`:

> Deploy issues? **`docs/DEPLOY-TOOLBOX.md`** (prod = TOOLBOX + Cloudflare). `docs/DEPLOY.md` is the STALE Vercel/Railway-era snapshot — do not follow it for prod.

## Data plane

`apps/trendingrepo-worker/` is the production data plane (`CLAUDE.md:77`):

> `apps/trendingrepo-worker/` is the production data plane. It builds a local OCI image deployed to HOSTUP as a Docker tenant and reads/writes `ss:data:v1:<slug>` on HOSTUP-internal Redis. Do not reintroduce duplicate GitHub data producers for worker-owned sources.

Worker directory contents (verified `ls apps/trendingrepo-worker/`):
`Dockerfile`, `dist/`, `docs/`, `package.json`, `railway.json`, `src/`, `supabase/`,
`tests/`, `tsconfig.json`, `vitest.config.ts`. Source-of-truth fetcher registry:
`apps/trendingrepo-worker/src/registry.ts` — 44 active fetchers in `FETCHERS[]` per
`docs/ENGINE.md:15`.

Redis key namespace: `ss:data:v1:<slug>` on HOSTUP-internal Redis.

## Routing probes

Every probe must return `Server: cloudflare` (matching global policy in `~/.claude/CLAUDE.md`).

```
https://trendingrepo.com
```

If `X-Vercel-*` headers appear → production is misrouted. **Stop, investigate, do not "fix" by switching to Vercel.**

Cloudflare cache invalidation runbook (from `CLAUDE.md:93`):
> Edge/Next caches can preserve bad responses — verify through Cloudflare. A transient 5xx can survive behind cache layers even after a fix ships. Runbook: inspect `Server`, `Cf-Cache-Status`, and route status with `curl -sI https://trendingrepo.com/<route>`, call `/api/revalidate` with `CRON_SECRET` for affected paths, then re-curl prod.

## Standalone build

`next.config.ts:72` sets `output: "standalone"` — required for `node server.js` standalone runner inside the Docker image. Vercel ignores this flag.

## Build env required for prod

From `CLAUDE.md:42`:

> Required for prod: `GITHUB_TOKEN`, `CRON_SECRET`. Pick exactly ONE Redis pair: `REDIS_URL` (HOSTUP Redis) OR `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash) — never both. Without either, the data-store gracefully falls back to bundled JSON + memory.

Sentry source-map upload requires `SENTRY_AUTH_TOKEN` + `SENTRY_ORG` + `SENTRY_PROJECT` at CI build time (`next.config.ts:282-294`).

## CI

GitHub Actions runs `ci.yml` on `push` + `pull_request` + `workflow_dispatch`. Per
`docs/ENGINE.md:37` the CI workflow runs `npm run typecheck`, `lint:guards`,
`check-v3-token-budget`, `test:hooks`.

`post-deploy-smoke.yml` runs `push` + `workflow_dispatch` (curl smoke against
`/api/cron/freshness/state` per `docs/ENGINE.md:62`).

`cleanup-stale-previews.yml` runs Mon 02:23 (`23 2 * * 1`) — deletes stale Vercel
preview deployments. This is **cleanup of the paused project**, not deployment.

## Verify gate (Definition of Done) — per `CLAUDE.md`

Before declaring work done:

1. `npm run lint` / `npm run lint:guards` (the meta-lint catches Zod-on-mutating-routes, error envelopes, runtime drift) (`CLAUDE.md:56`).
2. `npm run typecheck` — "run before every commit per ICM Motion 'Verification Before Done'" (`CLAUDE.md:57`).
3. `npm test` (`CLAUDE.md:58`).
4. `npm run build` / `npm start` (`CLAUDE.md:59`).
5. `npm run freshness:check` at session open (`CLAUDE.md:7`) — repair before features if any source past freshness budget.
6. `npm run verify:data-store` to confirm Redis is reachable (`CLAUDE.md:63`).

## Workflow runtime audit

63 workflow YAMLs verified (`ls .github/workflows/`) — full inventory in
`docs/ENGINE.md:24-100`. Cron-driven scrapers + collectors fan out hourly /
sub-hourly / daily; `collect-twitter.yml` is **`workflow_dispatch`-only**
(verified in file head — `# Manual-only: HOSTUP worker/runtime owns production freshness`).

## Container / OCI

Worker `Dockerfile` at `apps/trendingrepo-worker/Dockerfile`. Built locally and pushed
to HOSTUP as a Docker tenant. Reads/writes `ss:data:v1:<slug>` on HOSTUP-internal Redis.

`railway.json` lives in the worker dir but is legacy — Railway is no longer the
deploy target.

## Anti-patterns burned (deploy / data-mode)

From `CLAUDE.md:80-93`:

- Don't switch Twitter collector back to API mode — it silently fails on ephemeral
  route filesystems. (See `.claude/rules/collector-direct-mode.md`.)
- Don't `readFileSync(process.cwd(), "data", ...)` for new data sources — use the
  data-store. Filesystem reads coupled data freshness to deploys → 17-34 deploys/day
  from data churn alone (commit `87e3f4e`, 2026-04-26).
- Don't add a new collector that only writes to a file — wire
  `writeDataStore("<slug>", payload)` from `scripts/_data-store-write.mjs`.
- Don't mock Redis in tests that exercise scoring logic (2026-Q1 incident).
- **Kimi For Coding endpoint requires `stream: true`** — non-stream calls hang silently
  (HTTP 000). Wrapper: `apps/trendingrepo-worker/src/fetchers/consensus-analyst/llm.ts`.

## Multi-agent swarm

`docs/SWARM-2x2.md` is the operating contract — read before doing anything in a swarm
worktree (`CLAUDE.md:99`). Worktrees `C:\dev\trendingrepo-wt\{tl,tr,bl,br}` on branches
`bot/swarm-{tl,tr}-claude` and `bot/swarm-{bl,br}-codex` (ports 3023-3026 per
`CLAUDE.md:97`). Swarm branches do not imply a production deploy — use local
build/start probes and HOSTUP/Cloudflare smoke checks for release proof.
