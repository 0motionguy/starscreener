# HANDOVER — Freshness / TOOLBOX anchor / Railway retirement (2026-05-26)

> Paste **§0 ROLE PROMPT** into a fresh session. Everything below is the evidence base.
> Branch: `bot/swarm-a6-producthunt-reader`. Supersedes parts of
> `docs/HANDOVER-2026-05-25-AISO-CONSENSUS.md` (read that too for the AISO/consensus detail).

---

## §0 ROLE PROMPT (paste this into the new session)

```
You are the CTO / senior full-stack engineer for TrendingRepo (C:\dev\trendingrepo).
Read docs/HANDOVER-2026-05-26-FRESHNESS-TOOLBOX.md FIRST (then the 2026-05-25 one it
references). Obey CLAUDE.md + CLAUDE.local.md: K1–K4, M1–M6, boil-the-ocean, surgical
changes, NO commit/push/deploy without explicit ask, mask secrets (first4...last4).

STATE OF THE WORLD (verified 2026-05-26):
- Branch bot/swarm-a6-producthunt-reader has a large body of WORK committed this session
  (7 commits, see §1): the 295-file repo-profile/tools/consensus/live-data rebuild, the
  new @ai AISO logo, a React #185 fix, and a freshness/token-pool fix. All gates green
  (typecheck, lint, lint:guards, build, full test, worker build+tests). Nothing pushed.
- PROD IS FRESH and already lives on TOOLBOX. trendingrepo.com → Cloudflare →
  toolbox-trendingrepo-1 (app) reads the INTERNAL docker redis:6379, fed by the always-on
  toolbox-trendingrepo-worker-1 (all repo fetchers run hourly; trending was <1h fresh).
- The operator DELETED the Railway redis (rediss://) — it was a redundant plane only
  written by GitHub Actions + read by local dev. Prod never used it. Safe. See §2.
- "8 days stale" was ONLY the local file-only preview (REDIS_URL="") reading this branch's
  2026-05-18 bundled data/*.json. Already refreshed → LIVE locally. See §3.

YOUR JOB (confirm before any prod/secret step):
  1. (b) Redeploy the worker to TOOLBOX from current code so the consensus read-then-merge
     fix lands (stops the hourly wipe of the 498-verdict backfill) + re-seed verdicts +
     restore Kimi billing or wire a fallback LLM. PROD DEPLOY — see §4.2 + the 2026-05-25
     handover §6. Needs explicit go.
  2. Cleanup: delete the dead `REDIS_URL` GitHub Actions secret (Railway is gone) so 33
     workflows stop attempting dead-host writes. One action; reversible. See §4.3.
  3. Decide commit/push/deploy of the whole branch (the 295-file work + logo + fixes).
  4. SECURITY (from 2026-05-25 handover §7): the .env.backfill.local keys were pasted in
     chat — rotate them before anything ships.

HARD RULES: verify with real tool output, not memory (M6). Local file-only previews show
BUNDLE age, not prod — check prod via trendingrepo.com or the TOOLBOX internal redis
(docker exec toolbox-trendingrepo-worker-1 node -e "...ioredis...").
```

---

## §1 What this session shipped (7 commits on `bot/swarm-a6-producthunt-reader`)

```
3d230cd7d chore(data): refresh repo snapshots via the token pool (2026-05-26)
37480ac09 fix(refresh): wire 10-key GitHub token pool into repo scans + decouple reddit guard
e86486f32 feat(brand): update AISO logo to the new @ai mark everywhere it's used
0ca9844e5 fix(repo): stop RepoCompareButton infinite render loop (React #185)
9001f5cdd chore: charting deps, design-system docs, eslint/gitignore, sprint data
3f3669e2b feat(app): repo-profile rebuild, AISO consensus rendering, tools/shell/live-data overhaul
c2c23b4a2 feat(worker): consensus read-then-merge + 498-verdict backfill + drop-intake-drain
```
- **Verify-and-repair sweep** of the 295 uncommitted files: typecheck (app+worker), lint, lint:guards, `next build`, full `npm test` (fixed 3 changeset test failures + 1 pre-existing cron stale entry), worker build→dist + vitest — ALL GREEN.
- **React #185 fix** (`0ca9844e5`): `RepoCompareButton` returned a fresh `[]`/`{}` from a Zustand selector pre-mount → `useSyncExternalStore` infinite loop → `/repo/*` showed the error boundary in the browser (curl saw 200; only a real browser tripped it). Fixed with stable empty refs; verified in a production build (boundary=0).
- **AISO logo** (`e86486f32`): `public/brand/sources/aiso.svg` now embeds the new `@ai` mark (icon-192); `RepoSignalSummary` consensus credit shows the real mark. Updates every `SourceLogo source="aiso"` pip at once. (Source assets: `C:\Users\mirko\Downloads\userflow aiso eco (1)\downloads`. The favicon/app-icon files there are AISO.tools' OWN site icons — NOT wired into TrendingRepo's favicon by design.)
- **Freshness/token-pool fix** (`37480ac09` + `3d230cd7d`): see §3–§4.

## §2 VERIFIED prod data-plane topology (the crux)

Two separate Redis planes — do not conflate (saved to memory `reference_prod_redis_topology`):

| Plane | Written by | Read by | Status |
|---|---|---|---|
| **TOOLBOX internal `redis://…@redis:6379`** (docker-compose Redis on the VPS) | the **always-on worker** `toolbox-trendingrepo-worker-1` (fetchers: oss-trending, recent-repos, repo-metadata, deltas, github, consensus-trending, trendshift-daily, repo-profiles, …) | **prod app** `toolbox-trendingrepo-1` → Cloudflare → trendingrepo.com | **FRESH** (trending 05:22, recent 05:25, deltas 05:40 — all <1h on 2026-05-26) |
| **Railway `rediss://`** — DELETED 2026-05-26 | GitHub Actions (`secrets.REDIS_URL`) | local dev (`.env.local`) | gone; prod never used it |

Internal redis is **not externally reachable** — query it via `docker exec toolbox-trendingrepo-worker-1 node -e "const R=require('ioredis');const r=new R(process.env.REDIS_URL);(async()=>{console.log(await r.get('ss:meta:v1:trending'));r.disconnect()})()"`. SSH: `ssh toolbox` (193.53.40.118, AndyAikey.pem).

## §3 Root cause of "8 days stale" (resolved)

- The operator saw "STALE · scanned 8d" on the **local file-only preview** (`REDIS_URL="" npx next dev`), which reads the bundled `data/trending.json` — frozen at `2026-05-18` on this branch. NOT a prod signal.
- Prod was fresh the whole time (worker → internal redis). The Railway plane (local dev's Redis) WAS 4h+ stale because GitHub Actions runs fail (see below), but prod doesn't read Railway.
- **Fixes shipped:** (1) the two repo-scan scripts (`discover-recent-repos.mjs`, `fetch-repo-metadata.mjs`) hardcoded a single `GITHUB_TOKEN` → now rotate the 10-key `GH_TOKEN_POOL` via `scripts/_github-token-pool-mini.mjs` (proven "github token pool: 11 key(s)"). (2) `scrape-trending.yml`'s Reddit zero-data guard hard-`exit(2)` reddened every run on the known reddit outage → now `continue-on-error` (logs loudly, doesn't fail the repo refresh). (3) Re-ran the refresh locally with the pool → branch bundle now LIVE (`fetchedAt 2026-05-26`).

## §4 OPEN work (the new session's job)

**§4.1 — DONE this session (no action):** all of §1. Branch is green + committed, NOT pushed.

**§4.2 — (b) Worker redeploy + consensus (PROD, needs go):** The deployed worker is image `toolbox-trendingrepo-worker:vps-20260524064721-acef67b1c` (2026-05-24) — PREDATES the consensus read-then-merge fix (`c2c23b4a2`). So the live worker still **destructive-replaces** `consensus-verdicts` hourly, wiping the 498-verdict backfill with blank template data, AND `consensus-analyst` is hitting **Kimi 403 quota** ("usage limit for this billing cycle") so it can't regenerate. To fix: rebuild the worker OCI image from current `main`/branch code → redeploy to TOOLBOX → re-seed `ss:data:v1:consensus-verdicts` from `data/consensus-verdicts.json` → restore Kimi billing OR wire a fallback LLM in `apps/trendingrepo-worker/src/fetchers/consensus-analyst/llm.ts` (currently Kimi-only). Follow the 2026-05-25 handover §6 deploy sequence.

**§4.3 — Cleanup the dead Railway secret:** 33 workflows pass `secrets.REDIS_URL` (now a dead Railway URL). They skip gracefully (`_data-store-write.mjs`), so nothing is broken, but each wastes a connect-timeout. Clean fix = **delete the GitHub secret** (`gh secret delete REDIS_URL`) — one action, reversible, prod-safe (prod uses the internal redis). Do NOT edit 33 workflow files. Local dev: unset `REDIS_URL` in `.env.local` so it runs file-only (`npm run verify:data-store` will fail against the dead Railway — expected).

**§4.4 — From the 2026-05-25 handover (still open):** commit/push/deploy decision for the whole branch; rotate the burned `.env.backfill.local` keys (§7 there); optional content wins #2–#5.

## §5 Key gotchas (don't relearn the hard way)

- **File-only previews show bundle age, not prod.** `REDIS_URL=""` → reads `data/*.json`. To judge prod, curl trendingrepo.com or query the TOOLBOX internal redis.
- **`next dev` clobbers the production `.next`.** After `npm run build`, running `next dev` overwrites `.next` with a dev build → `next start` then says "no production build." Rebuild before `next start`. (See `reference_prod_redis_topology`, `reference_crawler_cost_guard_429`, `reference_worker_on_main`, `reference_toolbox_ssh` in memory.)
- **`next dev` `clientReferenceManifest` race** intermittently 500s `/repo/*` on cold compile — a known Next.js dev bug, NOT app code. Production build is clean.
- **Crawler cost-guard returns 429** to curl/bot UAs on `/agent-commerce` + `/market-signals` by design — smoke with a browser UA.
- **Kimi endpoint** requires `stream:true` + UA allowlist (`claude-cli`); it's the consensus LLM and it's out of quota (403).
- Screenshot/debug scripts from this session live in the gitignored `.verify-auth/` (untracked).
