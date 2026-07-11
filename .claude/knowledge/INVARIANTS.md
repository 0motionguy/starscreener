# INVARIANTS — Rules that must never be broken

Each rule: 1-line statement + 1-line citation.

## I1 — Session-opening protocol is MANDATORY
Before any other action: (1) read `CLAUDE.md`, (2) `docs/ENGINE.md` + `docs/SITE-WIREMAP.md`, (3) `docs/AUDIT-2026-05-04.md` + `docs/forensic/00-INDEX.md`, (4) `tasks/CURRENT-SPRINT.md`, (5) `tasks/BACKLOG.md`, (6) `npm run freshness:check`, (7) repair stale sources before features.
— `CLAUDE.md:1-17`.

## I2 — Data reads MUST go through the data-store
Server components / route handlers call the per-source `refreshXxxFromStore()` (async) once at the top, then sync getters in the rest of the file. Each refresh hook has internal 30s rate-limit + in-flight dedupe. Pattern: `src/lib/trending.ts::refreshTrendingFromStore`.
— `CLAUDE.md:46`; `src/lib/data-store.ts`.

## I3 — Collectors dual-write file + Redis
Use `writeDataStore("<slug>", payload)` from `scripts/_data-store-write.mjs`. When Upstash creds missing the Redis write is skipped silently and the file write stays — graceful degradation by design.
— `CLAUDE.md:47`; `CLAUDE.md:84`.

## I4 — Collectors run in `direct` mode, NOT `api`
Serverless route filesystems are ephemeral — API-mode writes vanish. GitHub Actions writes locally to `.data/*.jsonl` and `git push` from the workflow. Reference: committed fix `edf99d2`.
— `CLAUDE.md:48`, `CLAUDE.md:80`.

## I5 — Twitter via Apify `apidojo~tweet-scraper` only
Cookie-based providers are dead post-2026 anti-bot. Direct GraphQL returns HTTP 200 + empty body. Apify actor runs 4 query templates per tracked repo per scan.
— `CLAUDE.md:49`, `CLAUDE.md:82`; `scripts/_apify-twitter-provider.ts:25`.

## I6 — Append-only JSONL — never replace
Each scan adds new lines; aggregator dedupes downstream.
— `CLAUDE.md:50`.

## I7 — Home `/` is ISR-cached at 30 min (`revalidate=1800`)
Bundled JSON seeds the cold start; client refresh hooks repopulate the in-memory cache on navigation. Don't expect fresh data on first paint.
— `CLAUDE.md:51`.

## I8 — Two precedents in the ecosystem: AISO + toolbox
Lift, don't rewrite. Both are HOSTUP-not-Vercel, both ship the same data-store + Redis + collector-fanout shape. Cross-reference: `D:\dev\aiso.to` and `C:\dev\toolbox`.
— `~/.claude/CLAUDE.md` "Workspaces" + "Cross-Project Policy".

## I9 — Production = HOSTUP Docker tenant + Cloudflare Tunnel
Vercel `starscreener` stays paused / git-disconnected. Never `vercel deploy` / `promote` / `git connect` / `project unpause` for this repo without explicit founder approval.
— `CLAUDE.md:30`; `~/.claude/CLAUDE.md` "Cross-Project Policy".

## I10 — Windows + OneDrive: `.next` junction workaround is required
`next.config.ts:14-27` documents the workaround (see `.claude/rules/windows-onedrive.md`). CSS edits can be silently reverted by OneDrive sync — verify after edit. Repo NOW lives at `C:\dev\trendingrepo` (off OneDrive) per the 2026-05-06 cutover, but the workaround stays because swarm worktrees can still land in synced paths.
— `CLAUDE.md:43`, `CLAUDE.md:96`; MEMORY `project_onedrive_dev_server_block`.

## I11 — Collectors must keep last-50 — never empty the cache (2026-05-08 rule)
Read existing → union with new batch → dedupe → keep top 50. Never write fewer than `min(50, existing.length)`. Surfaces always show last-50 cached and degrade gracefully to slightly-stale rather than empty.
— `CLAUDE.md:89`; `docs/INGESTION.md#rule-keep-last-50-cache-2026-05-08`; lint guard `npm run lint:keep-last-50` (`package.json:53`).

## I12 — Pick exactly ONE Redis pair
`REDIS_URL` (HOSTUP Redis via `ioredis`) OR `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN` (Upstash REST) — never both. Without either, data-store gracefully falls back to bundled JSON + memory.
— `CLAUDE.md:26`, `CLAUDE.md:42`; `next.config.ts:104-112`.

## I13 — Drizzle-using pages must `export const dynamic = "force-dynamic"`
Drizzle db client throws on first property access without `DATABASE_URL`. ISR doesn't help — it still prerenders at build.
— `CLAUDE.md:92`.

## I14 — Next 15 forbids non-handler exports from `route.ts`
Allowed: `GET/POST/PUT/PATCH/DELETE/HEAD/OPTIONS`, `runtime`, `dynamic`, `revalidate`, `maxDuration`, `dynamicParams`, `fetchCache`, `preferredRegion`, `config`, `generateStaticParams`. Move helpers (e.g. `deriveHealth`) to sibling lib files.
— `CLAUDE.md:91`.

## I15 — Parallel-session merges silently steal staged work
Always `git add <SPECIFIC-FILE>` (NEVER `git add -A` or `git add .`); `git commit -m "wip(...)"` IMMEDIATELY after each Write so the commit boundary is durable. Staging is shared mutable state.
— `CLAUDE.md:87`.

## I16 — `git stash -u` creates orphan untracked-files commits
Visible only via `git fsck --no-reflogs --lost-found`. If you need to switch context, prefer `git checkout -b wip/<topic>` + commit instead of `git stash -u`.
— `CLAUDE.md:90`.

## I17 — Audit premises must be verified before believing
Grep `main` for the markers BEFORE planning a cherry-pick. Memory is suspect — recalled facts are hypotheses until verified.
— `CLAUDE.md:88`.

## I18 — Don't sequential-loop the consensus-analyst sweep
K2.6 is ~80s per call; sequential 14 = 18 min, blows the hourly slot. Use bounded-concurrency queue (concurrency 4 → ~5 min wall).
— `CLAUDE.md:86`; `apps/trendingrepo-worker/src/fetchers/consensus-analyst/index.ts`.

## I19 — Kimi For Coding endpoint requires `stream: true`
Non-stream calls hang silently (HTTP 000). Also enforces UA allowlist (`claude-cli`, `RooCode`, `Kilo-Code`).
— `CLAUDE.md:85`; `apps/trendingrepo-worker/src/fetchers/consensus-analyst/llm.ts`.

## I20 — Edge/Next caches can preserve bad responses — verify through Cloudflare
Inspect `Server`, `Cf-Cache-Status`, route status via `curl -sI https://trendingrepo.com/<route>`. Call `/api/revalidate` with `CRON_SECRET` for affected paths.
— `CLAUDE.md:93`.

## I21 — Production source freshness is owned by HOSTUP worker fleet
Not GitHub duplicate scrapers. Don't reintroduce duplicate GitHub data producers for worker-owned sources.
— `CLAUDE.md:26`, `CLAUDE.md:77`.
