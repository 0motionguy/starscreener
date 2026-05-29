# HANDOVER — Build our OWN star-velocity refresher engine (2026-05-29)

## THE GOAL (operator's words, this is the north star)

> "USE the GitHub token pool and build our OWN refresher engine. Every 30m or 1h,
> a refreshed **24h / 7d / 30d velocity** — how many stars they gain **and in %**.
> Use OSSInsight / TrendShift / star-history only as **references** (take good
> tech components), but it should be OUR engine, OSS-Insight-INDEPENDENT."

Acceptance criterion (operator): **every visible repo on `/`, `/?rank=gainer`,
`/?rank=trend`, `/?cat=agents` shows real 24h, 7d AND 30d star velocity** (absolute
+ %), refreshed every 30–60 min, gathered by us via the GitHub token pool.

## WHY THIS BROKE (root cause, evidence-verified — do NOT re-litigate)

The entire trending + velocity pipeline depended on **OSSInsight
(`api.ossinsight.io`), which has returned HTTP 500 on every bucket for days.**
- `trending` slug is an empty husk (`past_24_hours:0, past_week:0, past_month:0`).
- 7d/30d came ONLY from OSSInsight's `past_week`/`past_month` buckets → gone.
- Homepage fell back to the stale registry → "old data".
- TOP ranking degenerated (a high-star/low-velocity LLM, QwenLM, floated to #1).

NOT the cause (ruled out with evidence): the GitHub token pool is **healthy**
(worker + app pools both 20 tokens, lead tokens return HTTP 200); `recent-repos`
+ `repo-registry` are fresh. Token expiry is a red herring here.

## WHAT'S ALREADY DONE + DEPLOYED THIS SESSION (live on prod)

Branch: **`bot/swarm-a6-producthunt-reader`** (prod deploys off this; GH Action
cron schedules only fire from `main`, so new recurring jobs must be a worker
fetcher or TOOLBOX cron.d — NOT a GH Action).

Commits (newest last): `a1bea4bf3` (star-activity-deltas fetcher + Delta Engine),
`fe2b8abd8` (star-dominant TOP composite + widened daily star coverage),
`f4414016c` (young-repo delta + pool-aware backfill), `930fd3d12` (src-gate the
young-repo fix). **`scripts/recent-velocity-points.mjs` is NOT committed yet — commit it.**

Deployed images: app `trendingrepo-app:vps-20260529072114-fe2b8abd8`, worker
`toolbox-trendingrepo-worker:vps-20260529080133-930fd3d12`.

1. **Ranking FIXED (verified live):** QwenLM #1 → ~#11. `src/lib/scoring/top-composite.ts`
   star weight 0.40→0.55, mention 0.30→0.20 (it's a star-velocity board).
2. **24h velocity WORKING:** ~170 repos real. GitHub-direct.
3. **`star-activity-deltas` worker fetcher** (`apps/trendingrepo-worker/src/fetchers/star-activity-deltas/index.ts`):
   computes 24h/7d/30d from each repo's `star-activity` daily points, keyed by
   lowercased fullName, written to the `star-activity-deltas` Redis slug.
4. **Delta Engine** (`src/lib/derived-repos/delta-engine.ts` `resolveDelta`): one
   precedence resolver used by both delta-join loops in `src/lib/derived-repos.ts`.
   7d/30d prefer star-activity; 24h keeps OSS-first. App reader:
   `src/lib/star-activity-deltas.ts`, hydrated in `src/app/page.tsx`.
5. **Widened daily `star-activity` fetcher** to the FULL registry (was 50-repo tail).
6. **`scripts/recent-velocity-points.mjs`** (the breakthrough — see below).

## THE KEY INSIGHT (this is what was missing for hours — internalize it)

7d/30d deltas diff `current_stars` against the star count **~7 / ~30 days ago**.
That requires a **star-history "anchor" point near that date.** Measured: only
**7 of 400 repos** had a ~7-day anchor. Why:
- The daily snapshot only started covering all repos today → no 7-day-ago point yet.
- The old backfill walks stargazers **OLDEST-first** → rarely reaches recent pages
  on big repos → no RECENT anchors.

**Fix = walk stargazers NEWEST-first** (`scripts/recent-velocity-points.mjs`):
DESC from the last page, bucket the last ~35 days by day, build cumulative points,
merge into `star-activity`. This creates dense RECENT anchors cheaply (only the
last few pages). **PROVEN:** after seeding, `backnotprop/plannotator` → 24h +9,
7d +173, 30d +937 (all `basis:exact`); `scrapegraphai/scrapegraph-ai` → 7d +642,
30d +3005. The `star-activity-deltas` fetcher then computes real deltas unchanged.

## REMAINING WORK — build the recurring engine (the actual ask)

1. **Promote the newest-first walk into a recurring WORKER FETCHER**
   (`apps/trendingrepo-worker/src/fetchers/velocity-refresh/`), schedule every
   30–60 min (e.g. `*/40 * * * *`). Port the logic from
   `scripts/recent-velocity-points.mjs`: for each registry repo, newest-first
   stargazer walk (last ~35d) → recent daily points → merge into the per-repo
   `star-activity` slug. MUST: rotate `GH_TOKEN_POOL` per repo (avoid 403
   secondary-limit), bounded concurrency (~6–8), zero-write guard, and STAGGER to
   stay under rate limits (e.g. hourly refresh the top ~300 by current velocity +
   a full sweep daily — don't walk all 1558 every 30 min).
   - Cheaper alternative worth considering: compute deltas DIRECTLY from the DESC
     walk (count stargazers in last 24h/7d/30d) and write them straight into the
     `star-activity-deltas` slug — skips the points-merge entirely. Pick whichever
     is cleaner; both are "our engine".
2. **Add % change.** Operator explicitly wants "in %". `delta_pct =
   delta / max(1, stars_now - delta) * 100`. Add `pct` to the SADeltaValue /
   payload and surface it. NOTE: the UI `PeriodCell` already renders a % line
   (`+102 / +0.7%`) from `starsDelta / stars` — verify it's correct for 7d/30d
   and uses the right base (stars N days ago, not current).
3. **Register the fetcher** in `apps/trendingrepo-worker/src/registry.ts` and add
   it to the keep-last-50 lint allow-list or use the merge guard.
4. **Phase 3 resilience:** make GitHub-direct the PRIMARY trending source; treat
   OSSInsight `trending` as corroborating only (it can stay dead with no effect).
   Consider a velocity-ranked "surfacing" pass so established repos suddenly
   gaining stars resurface (recent-repos only finds NEW repos).
5. **Commit `scripts/recent-velocity-points.mjs`** + deploy worker + app.
6. **Docs:** fold this into `docs/ENGINE.md` + `docs/SITE-WIREMAP.md` once stable.

## GOTCHAS / LEARNINGS (do not repeat these)

- **`coversFirstStar` flag is unreliable** — false even for fully-walked small
  repos (rowboatlabs/rowboat: covers=false but points[0] is s=1). Gate young-repo
  logic on `backfillSource === "stargazer-api"` (oldest-first walk ⇒ points[0] is
  genuine inception). Already done in star-activity-deltas.
- **Young repo (younger than the window):** windowed delta = full current count
  (it had 0 stars before it existed). This is REAL, not "—". Already handled.
- **GitHub stargazer pagination caps at 400 pages (~40k stars).** Repos >40k
  (e.g. warpdotdev/warp 60k) can't be fully walked; recent-velocity still gets
  their recent pages, but coverage is partial. Accept or dual-end.
- **Single GH token 403s (secondary rate limit) on rapid multi-page pagination.**
  ALWAYS rotate `GH_TOKEN_POOL` per repo. `scripts/recent-velocity-points.mjs`
  and the pool-aware `scripts/backfill-star-activity.mjs` already do.
- **App-side `scripts/_data-store-write.mjs` `readDataStore` does NOT decompress
  `gz1:` payloads** → reading the (gzipped) `repo-registry` from the app container
  returns null → "0 repos". Extract the registry list via the WORKER container
  (its `/app/dist/lib/redis.js` readDataStore decompresses) and pass `--repos`, OR
  fix the app-side reader to handle gz1.
- **Internal redis is reachable only inside TOOLBOX containers** — query via
  `docker exec toolbox-trendingrepo-worker-1 node /tmp/x.mjs` against
  `/app/dist/lib/redis.js`. `redis-cli` is absent.
- Node probe scripts that open ioredis never exit → pipe `| tail` hangs. Always
  `process.exit(0)` at the end.

## DEPLOY RECIPES (verified this session)

- **ssh alias:** `ssh toolbox` (193.53.40.118). App container `toolbox-trendingrepo-1`,
  worker `toolbox-trendingrepo-worker-1`. App git checkout at `/opt/trendingrepo`
  (branch `bot/swarm-a6-producthunt-reader`); worker compose at `/opt/toolbox-trendingrepo-worker`.
- **Worker deploy:** push branch → on box `cd /opt/trendingrepo && git fetch origin
  <branch> && git checkout <sha> -- apps/ && docker build -t toolbox-trendingrepo-worker:vps-$(date +%Y%m%d%H%M%S)-<sha> apps/trendingrepo-worker`
  → `sed -i 's|image: toolbox-trendingrepo-worker:.*|image: <TAG>|' /opt/toolbox-trendingrepo-worker/docker-compose.yml`
  → `cd /opt/toolbox-trendingrepo-worker && docker compose up -d`.
- **App deploy:** `git checkout <sha> -- src/ content/ public/ next.config.ts
  package.json package-lock.json perf/ scripts/ apps/` → `docker build -t
  trendingrepo-app:vps-<ts>-<sha> .` → `sed -i 's|image: trendingrepo-app:.*|image:
  <TAG>|' docker-compose.trendingrepo.yml` → `docker compose -f
  docker-compose.trendingrepo.yml up -d --force-recreate` → curl `:3023/api/healthz`.
- **Trigger a fetcher once:** `docker exec toolbox-trendingrepo-worker-1 node
  /app/dist/index.js <fetcher-name>`.
- **Run the recent-velocity sweep now:** the script is at
  `toolbox-trendingrepo-1:/app/scripts/recent-velocity-points.mjs` (+ helpers
  `_data-store-write.mjs`, `_load-env.mjs`). Extract the registry list via the
  worker (decompresses), pass `--repos`. Example in the session transcript.

## CURRENT STATE (honest)

- Ranking: FIXED + live. 24h velocity: WORKING (~170 real).
- 7d/30d: ~11/38 real as of handover; a corrected 700-repo recent-velocity sweep
  was running at handover (the earlier "full sweep" hit the gz1 registry-read bug
  → 0 repos). After it completes + `star-activity-deltas` re-runs, real7/real30
  should climb to the hundreds for actively-starred repos. Re-verify with the
  probe below.
- The RECURRING engine is NOT built yet — only the one-time manual script exists.

## VERIFICATION

- Slug coverage (worker container):
  ```
  docker exec toolbox-trendingrepo-worker-1 node -e 'import("/app/dist/lib/redis.js").then(async({readDataStore})=>{const p=await readDataStore("star-activity-deltas");const ids=Object.keys(p.repos||{});let r7=0,r30=0;for(const k of ids){const e=p.repos[k];if(e.delta_7d?.value!=null&&e.delta_7d.basis!=="cold-start")r7++;if(e.delta_30d?.value!=null&&e.delta_30d.basis!=="cold-start")r30++;}console.log("repos",ids.length,"real7",r7,"real30",r30);process.exit(0);})'
  ```
- Homepage: `curl -sI https://trendingrepo.com/` → 200, `Server: cloudflare`,
  `Cf-Cache-Status: DYNAMIC`. Visually confirm `/`, `/?rank=gainer`, `/?rank=trend`,
  `/?cat=agents` show 24h/7d/30d for the visible rows + Qwen not #1.

## HANDOVER PROMPT (paste into a fresh session)

> Read `docs/HANDOVER-VELOCITY-ENGINE-2026-05-29.md` fully, then read
> `apps/trendingrepo-worker/src/fetchers/star-activity-deltas/index.ts`,
> `scripts/recent-velocity-points.mjs`, `src/lib/derived-repos/delta-engine.ts`,
> and `apps/trendingrepo-worker/src/fetchers/star-activity/index.ts`.
> GOAL: build our OWN recurring star-velocity refresher engine — every 30–60 min,
> compute 24h/7d/30d velocity (stars gained + %) for the visible registry repos via
> the GitHub token pool, OSS-Insight-independent. The newest-first stargazer walk in
> `recent-velocity-points.mjs` is PROVEN; promote it into a scheduled, staggered,
> pool-rotating worker fetcher (+ % change). Commit the script. Deploy worker + app
> to TOOLBOX (recipes in the doc). Verify every visible repo on `/`, `/?rank=gainer`,
> `/?rank=trend`, `/?cat=agents` shows real 24h/7d/30d. Prod = TOOLBOX/Cloudflare,
> NOT Vercel. Don't re-diagnose: OSSInsight is dead, the token pool is healthy, and
> the missing piece was always RECENT anchor points.
