# START HERE — STARSCREENER / trendingrepo routing map

> **Read this first, every session.** Pointer-style index — it routes you to the
> real docs, it does not replace them. `CLAUDE.md`'s SESSION OPENING PROTOCOL
> (read ENGINE.md + SITE-WIREMAP.md + AUDIT + forensic/00-INDEX, then
> `npm run freshness:check` + `npm run health:prod`, repair stale sources BEFORE
> features) is still mandatory. Full doc trust map: [docs/INDEX.md](INDEX.md).

Repo name is **`starscreener`** (`0motionguy/starscreener`); product/domain is
**trendingrepo.com**; folder is `C:\dev\trendingrepo`. Don't conflate the three.

---

## What STARSCREENER is

Real-time **trend-discovery scanner**. Aggregates GitHub stars + HN / Bluesky /
ProductHunt / DevTo / Lobsters / Twitter signals, computes momentum scoring +
classification, surfaces breakout repos before they go mainstream. Also ships a
zero-dep CLI (`ss`) and an MCP package so agents/terminals see the same feed.

Home tabs are query-param categories on `/`:
`/?cat=repos` (default) · **`/?cat=skills`** (54 curated) · **`/?cat=agents`** ·
`/?cat=models` (OpenRouter) · `/?cat=llms`. Adapters: `src/lib/category-adapters.ts`
(`getSkillsAsRepos` / `getAgentsAsRepos`); rendered by `src/app/(home)/page.tsx`.

---

## WHERE EVERYTHING LIVES

| Thing | Where | Notes |
|---|---|---|
| **Deploy (web + worker)** | **HOSTUP / TOOLBOX VPS** Docker tenants behind Cloudflare Tunnel | Canonical doc: [docs/DEPLOY-TOOLBOX.md](DEPLOY-TOOLBOX.md). `docs/DEPLOY.md` is STALE Vercel-era — do NOT follow. Verify: `curl -I https://trendingrepo.com` → `Server: cloudflare`, no `X-Vercel-*`. Vercel project stays **paused/disconnected**. |
| **Deploy mechanic** | box-side selective-checkout → docker build (ts tag) → retag → `up -d --force-recreate` | **Retag trap**: compose tag lies — verify by behavior / image-ID, not tag. **Stale-file hazard**: `git checkout <sha> -- src/` never deletes → breaks `next build`; deletion-sync is mandatory. |
| **Durable DB (users/billing)** | **Supabase Postgres** (SHARED `agnt-prod`, trendingrepo writes only `tr.*`) via Drizzle / postgres-js | `src/lib/db/`; pooler needs `ssl:'require'`. Rotation = joint op with aiso. See [WHERE-THINGS-RUN.md](../WHERE-THINGS-RUN.md). |
| **Runtime data-store (scan payloads)** | **Redis** HOSTUP-internal (`ss:data:v1:<slug>`), Upstash REST only where configured | `src/lib/data-store.ts` — three-tier read (Redis → bundled file → in-memory LKG). Worker publishes `gz1:`-prefixed gzip; decompress before `JSON.parse`. Redis is truth for worker-owned payloads; **don't conflate with the Supabase plane above.** |
| **Signal pipeline — collectors** | `scripts/scrape-*.mjs`, `scripts/collect-twitter-signals.ts`, `bin/` `cli/` | Append-only JSONL to `.data/` + dual-write Redis via `scripts/_data-store-write.mjs`. `direct` mode, never `api` mode. keep-last-50 / never-empty-cache rule. |
| **Signal pipeline — worker (prod data plane)** | `apps/trendingrepo-worker/src/registry.ts` FETCHERS (~50 active) — **on main**, in-process croner | Reads/writes `ss:data:v1:*`. Hardening: [docs/WORKER-HARDENING-2026-05-27.md](WORKER-HARDENING-2026-05-27.md). Shared helpers: `apps/trendingrepo-worker/src/lib/util/{cache-merge,registry-candidates}.ts`. |
| **Signals → toolbox** | `scripts/_toolbox-ingest.mjs` → toolbox `POST /v1/signals/ingest` (HMAC) | Cross-product dual-write with aiso.to. Wired for HN/Reddit/Bluesky/DevTo; **Twitter gap** (`social.x.mentions`=0, collect-twitter never wired it). "Toolbox" is also the VPS host — two senses. |
| **Scoring / classification** | `src/lib/` (`getDerivedRepos` spam-gate, TREND `(d30−d24)/29`, momentum) | Home tabs read the worker-aggregated daily slug. |
| **API routes** | `src/app/api/**` — **158 `route.ts`** (measured 2026-07-22) | Incl. `admin/*`, `cron/*`, `agent-commerce`, `checkout/stripe`, `webhooks/clerk`. Surface: [docs/API.md](API.md) · openapi.json. |
| **Env registry (names only)** | `.env.example` (full list) | Prod-critical: `GITHUB_TOKEN`, `GH_TOKEN_POOL`, `CRON_SECRET`; pick ONE Redis pair `REDIS_URL` **or** `UPSTASH_REDIS_REST_URL`+`UPSTASH_REDIS_REST_TOKEN`; `DATABASE_URL`/`DIRECT_URL`; `CLERK_*`+`NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`; `STRIPE_*`; `SENTRY_*`; `POSTHOG_*`; `SESSION_SECRET`; `ADMIN_TOKEN`; `WEBHOOK_SECRET_KEK`. Never print values. |
| **Worker/box secrets** | TOOLBOX `/opt/toolbox-trendingrepo-worker/.env`; app `/opt/trendingrepo/.env.production` | `GH_TOKEN_POOL` is a **separate pool per surface** (app ≠ worker). sops age key decrypts on VPS. |
| **Verify / gate** | `npm run typecheck` + `npm run lint:guards` (20 meta-lints) + `npm test` (serial suites) + `npm run build` | No single `npm run verify`. Prod truth = `npm run health:prod`. UI = screenshot probe. |
| **Design system** | [docs/DESIGN-SYSTEM.md](DESIGN-SYSTEM.md); source of truth `public/shell.css` | No inline hex, no `@import` Google Fonts (`next/font`), no new CSS files outside shell.css. |

---

## Ops traps (from CLAUDE.md + memory — read before touching related code)

- **Planned Clerk / Stripe / UUID-ownership migration** (12-step, sequenced; ownership keyed on Clerk identity is the root fix). Shape: **one writer (Opus), many read-only specialists.** Guardrails: no live secret rotation, no Clerk/Stripe config changes, no live cards, no Vercel commands. Mobile-app workflow runs in parallel; its master-prompt/handover live on the **founder's Desktop, not the repo**.
- **Vercel is paused** — never `vercel deploy/promote/git connect/unpause` without Mirko's explicit approval. Cloudflare routing only.
- **Reddit is intentionally disabled in prod.** `health:prod` expects it in disabled entries. Don't re-enable.
- **GH token-pool expiry = leading worker-failure indicator.** Empty fetchers → check token health (`401` on `/user`) BEFORE debugging code; check BOTH app and worker pools.
- **Kimi endpoint (`moonshotai/kimi-k2.6`)**: `stream:true` required (non-stream hangs), `temperature` must be `1` (else HTTP 400), UA allowlist (`claude-cli`/`RooCode`/`Kilo-Code`).
- **keep-last-50 / never overwrite cache with empty** — collectors (`lint:keep-last-50`) and worker fetchers (`lint:worker-keep-last-50`).
- **Parallel sessions**: `git add <specific-file>` only, never `-A`/`.` — staging is shared mutable state; commit immediately after each Write.
- Repo is now **off OneDrive** (safe); `.next` junction workaround still in `next.config.ts`.
- In-flight work: `tasks/CURRENT-SPRINT.md` + `tasks/BACKLOG.md`. Operator TL;DR: [docs/OPERATOR.md](OPERATOR.md).

---

## Knowledge systems

- **claude-mem (project scope)**: `~/.claude/projects/c--dev-trendingrepo/memory/MEMORY.md` (~55 entries — deploy mechanics, token-pool, DB/Redis topology, incident post-mortems). Pre-move notes under historical key `c--Users-mirko-OneDrive-Desktop-STARSCREENER`.
- **Brain vault node**: `C:\Users\mirko\.agnt\brain\entities\projects\trendingrepo.md` (+ `INDEX.md` line) — cross-project facts, ecosystem catalog, compile blocks. Cite it; update via `loops` branch (commit-only).
- **In-repo canon**: `CLAUDE.md` (contract) · `docs/INDEX.md` (doc trust map) · `docs/ENGINE.md` (workflows/keys/crons) · `docs/SITE-WIREMAP.md` (route → data → collector → API) · `WHERE-THINGS-RUN.md` (topology).

---

## Commands (copy-paste)

```bash
npm run dev                 # Turbopack, :3023
npm run freshness:check     # local/source freshness — run BEFORE features
npm run health:prod         # live Cloudflare → HOSTUP truth (worker/redis/breakers)
npm run typecheck && npm run lint:guards && npm test && npm run build   # gate
npm run verify:data-store   # Redis data-store integrity (needs a Redis pair)
npm run scrape:hn           # single-source collectors: :bsky :ph :devto :lobsters :npm
npm run collect:twitter     # Nitter/manual backfill (NOT scrape:twitter)
npm run cli:dev             # the `ss` CLI
ssh toolbox 'docker ps --format "{{.Names}}|{{.Image}}|{{.Status}}" | grep trendingrepo'
```
