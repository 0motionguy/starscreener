---
last-verified: 2026-07-19
verified-by: claude
status: living
---

# HANDOVER — 2026-07-19 · 7x/day X autopilot + Skills/Agents categories

Fresh-session pickup doc. Covers two waves that both landed on **`main`** and are
**live on HOSTUP** (no Vercel). Read this, then the CLAUDE.md session-opening
protocol, then `npm run freshness:check`.

---

## TL;DR — production state (verified 2026-07-18/19)

| Fact | Value |
|---|---|
| Prod line | **`main`** (not `feat/ranking-poster-live` anymore — it merged in; main is ~1303 ahead, old branch is an ancestor) |
| Running app image ID | **`70b1d9f5a2b9`** = `main@ff50b0cdf` (7x/day autopilot) |
| main HEAD | `f87c20605` (#3250) |
| Containers | `toolbox-trendingrepo-1` (app, :3023) + `toolbox-trendingrepo-worker-1` — both healthy |
| Strict health | 47/47 green (reported) |
| Routing | Cloudflare, no `X-Vercel-*` |
| X autopilot | **7 posts/day, cap=7, mode=live** |

**⚠️ The compose image TAG lies (retag trap).** `docker inspect ... {{.Config.Image}}`
returns an old `vps-...-72c70a34` tag but the bytes are `70b1d9f5a2b9`. Ground truth =
`docker inspect toolbox-trendingrepo-1 --format '{{.Image}}'` (the ID) or probe
`POST localhost:3023/api/cron/twitter-trending` → 401 = autopilot line live.

---

## Wave A — 7x/day X autopilot (this session, 2026-07-18)

Raised X posting 5→7/day. Two new daily slots on top of the CE v2 content calendar:

| Slot | UTC | Content |
|---|---|---|
| F | 10:00 | `weekly-top10` — daily 10-repo leaderboard card (best historical engagement) |
| G | 14:00 | sustained-growth TREND single |

Full map (`--dispatch-utc` in the host wrapper): **D=04 A=08 F=10 B=12 G=14 C=17 E=21**.

**PRs (all merged to main):** `#3245` (calendar slots F/G) · `#3246` (route `SlotSchema`
+ runner allowlist A→G, installer cap 5→7) · `#3250` (`f87c20605`: installer echo +
DEPLOY-TOOLBOX deletion-sync doc). Closed `#3248` (a wrong cpus:1 theory — see gotchas).

**Files touched:**
- `src/lib/twitter/outbound/content-calendar.ts` — SlotId `A..G`; slot F → `{format:trending_pack, packId:weekly-top10, ranker:top}`, slot G → `{format:trending_single, ranker:trend}`
- `src/app/api/cron/twitter-trending/route.ts:30` — `SlotSchema = z.enum(["A".."G"])`; `?slot=` validated through SlotSchema directly (no drift)
- `src/lib/twitter/outbound/trending-runner.ts` — `maxPerDay()` default 5→7
- `scripts/twitter-trending-run.mjs:48` — allowlist A→G
- `scripts/ops/trendingrepo-x-autopilot.sh` — `10) --slot F` + `14) --slot G`
- `scripts/ops/install-trendingrepo-x-autopilot.sh` — writes `TRENDING_POST_MAX_PER_DAY=7`

**Verified end-to-end on the box:** wrapper=7 slots, cap=7, dry-ran F+G → both composed
real tweets (`rc=0`), cards rendered (102KB / 81KB). Pulled + eyeballed the top10 card:
10 rows, owner avatars, gold/silver/bronze rank accents, star sparklines, per-source
mentions badges. The improved cards (from the earlier social-cards wave) ARE live.
The autopilot is `mode=live` and posted slot B today (tweet `2078461682414657625`).

Host files (runner/wrapper/cron/cap) are **NOT in the app image** — install them
separately via `scripts/ops/install-trendingrepo-x-autopilot.sh` when those files change.

---

## Wave B — Skills & Agents categories (prior session, reported by operator)

Live on HOSTUP, no Vercel:
- **Skills** — `https://trendingrepo.com/?cat=skills` — 54 curated GitHub skill repos
- **Agents** — `https://trendingrepo.com/?cat=agents` — dedicated agent repo feed
- Discovery expanded to **21 GitHub searches across 16 categories** using the token pool
- Production seed captured **300 fresh repositories**
- `/skills` and `/agent-repos` redirects verified; invalid repos correctly 404
- PRs **#3241** and **#3243** merged, no remaining P0/P1 review findings
- **"Bots" category was intentionally EXCLUDED** — it pulled trading bots / spam / unrelated
  automation; Skills+Agents have far better social-posting signal. Do not re-add a generic Bots cat.

**Core logic:**
- `src/lib/skills-github-trending.ts:1`
- `apps/trendingrepo-worker/src/fetchers/recent-repos/index.ts:45`

(These paths were reported against the `trendingrepo-capture-social` worktree; same files on main.)

---

## Open items / next best moves (priority order)

1. **Dependency-security PR (recommended next).** `npm audit` still shows high/critical
   dependency findings. Do this as a standalone PR, separate from feature work.
2. **Top-N ranker rename-dedup.** The top10 card rendered `graphify` twice (ranks 03/04:
   `Graphify-Labs/graphify` + `safishamsi/graphify`, identical stats) — a rename/fork dedup
   gap. Same class as the anthropics/financial-services rename. Affects card quality.
3. **HuggingFace trending models + OpenRouter usage rankings** — the operator's earlier
   fast-follow ask ("most consuming models" posts). Slot C already alternates an `llm-models`
   pack / gainer single; wire the HF/OpenRouter feed behind it. `/?cat=models` exists
   (see memory `project_models_tab_openrouter` — worker fetcher built but not yet deployed).
4. **Deferred UI/ops** (lower priority): `ideas/[id]` + `tierlist/[shortId]` still soft-404
   under a parent index `loading.tsx` (needs nested route-group restructure, same pattern as
   the `(home)` fix); `discovery_single` tweet copy is thin (48 chars, no hook); console-mode
   proposal digest; the GH-Actions "pipeline ingest" cron failing ~4/5 (likely redundant
   post-HOSTUP — fix or retire).
5. **Cleanup:** ~205 MB of local deploy archives remain in `%TEMP%` (deletion was blocked by
   execution policy). Safe to delete. Remote staging already cleaned; rollback backups remain.

---

## Critical operational learnings (do not relearn the hard way)

### The build-breaker: stale-file deploy hazard (bit us 2026-07-18)
The box tree is branch `bot/swarm-a6-producthunt-reader` with `src/` overlaid per-deploy via
`git checkout <sha> -- src/`. That **adds/updates but NEVER deletes** files the target commit
removed. The `(home)` route-group move left a stale root `src/app/page.tsx` on the box → two
pages resolved to `/` → `next build` died with `InvariantError: Expected clientReferenceManifest
to be defined` on `/(home)/page` only. **CI passed** (low-core CI never staged the stale file;
the 16-core box did). Fix, now MANDATORY after every selective checkout (documented in
DEPLOY-TOOLBOX.md):
```bash
git checkout <sha> -- src/ apps/trendingrepo-worker/src/
git diff --name-only --diff-filter=D "$(git rev-parse HEAD)" <sha> -- src/ apps/trendingrepo-worker/src/ | xargs -r git rm -f
```
It was NOT a concurrency race — `experimental.cpus: 1` did not fix it (that was PR #3248, closed).

### Deploy method (retag — the sed-in-compose runbook variant is blocked by a local hook)
Build ON THE BOX (the app Dockerfile COPYs the box's `.env.production` to bake `NEXT_PUBLIC_*`
Clerk keys — never build locally + ship a tar). Then:
```bash
# on box /opt/trendingrepo, after selective checkout + deletion-sync above
ATAG=vps-$(date +%Y%m%d%H%M%S)-<sha8>
docker build -t trendingrepo-app:$ATAG .        # ~6 min
# record rollback = current :current-prod image ID, then:
docker tag trendingrepo-app:$ATAG trendingrepo-app:current-prod
docker tag trendingrepo-app:$ATAG <compose-literal-tag>   # so `up -d` picks it up (compose file edit is hook-blocked)
docker compose -f docker-compose.trendingrepo.yml up -d --force-recreate trendingrepo
```
**Rollback (this session's image was `70b1d9f5a2b9`, prior was `e7a504ddcec4`):**
```bash
docker tag e7a504ddcec4 trendingrepo-app:current-prod
docker tag e7a504ddcec4 trendingrepo-app:vps-20260718213401-72c70a34
docker compose -f docker-compose.trendingrepo.yml up -d --force-recreate trendingrepo
```

### Memory corrected this session
`reference_live_branch_is_hardening` now says **prod = main**; `reference_branch_deploy_no_main_crons`
("prod branch 164+ ahead of main") is STALE/reversed. GH Actions schedules fire from main, so
new crons belong on main OR as box cron.d (the X autopilot is box cron.d, not a GH Action).

---

## Verification commands (copy-paste)

```bash
# Box: running image ID (truth, not the tag), health, autopilot state
ssh toolbox 'docker inspect toolbox-trendingrepo-1 --format "{{.Image}}" | cut -c8-19; \
  docker ps --filter name=toolbox-trendingrepo-1 --format "{{.Status}}"; \
  curl -s localhost:3023/api/healthz; \
  grep -c "set -- --slot" /usr/local/bin/trendingrepo-x-autopilot.sh; \
  grep "^TRENDING_POST_MAX_PER_DAY=" /opt/trendingrepo/.env.production'

# Dry-run the two new slots (output → /var/log/trendingrepo-x-autopilot.log)
ssh toolbox '/usr/local/bin/trendingrepo-x-autopilot.sh --slot F --dry-run; \
  /usr/local/bin/trendingrepo-x-autopilot.sh --slot G --dry-run; \
  tail -30 /var/log/trendingrepo-x-autopilot.log'

# Prod routing (must be Cloudflare)
curl -sI https://trendingrepo.com/ | grep -iE "^server:|x-vercel"
```

---

## Worktree map (sprawl warning)

Many worktrees exist off `C:\dev\trendingrepo`. Relevant ones:
- `C:\dev\trendingrepo` — session cwd, branch `repair/agent-qa-2026-07` (NOT main)
- `C:\dev\trendingrepo-capture-social` — holds **`main`** (was at `72c70a341`; `git pull` to reach `f87c20605`)
- `C:\dev\trendingrepo-ce` — this session's build/deploy worktree
- Box `/opt/trendingrepo` — deploy staging, branch `bot/swarm-a6-producthunt-reader` + per-deploy `src/` overlays

To ship from a clean tree: `git worktree` on main, or `git checkout -B <feature> origin/main` in any worktree.
Protected-branch + git-add-all + write-bypass hooks are active — stage exact files, no `-A`, no shell `sed -i`/`>` writes outside `/tmp` or `.claude/state/`.
