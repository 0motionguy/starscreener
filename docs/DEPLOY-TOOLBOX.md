---
last-verified: 2026-06-01
verified-by: codex
status: living
---

# Deploying TrendingRepo to TOOLBOX

Production runs on **TOOLBOX (193.53.40.118)**, fronted by Cloudflare. This doc is the deploy + ops runbook. (The older `DEPLOY.md` still describes the Vercel + Railway era and is now `snapshot`; do not follow it for prod actions.)

> Verification: `https://trendingrepo.com` MUST return `Server: cloudflare` headers and no `X-Vercel-*`. If a Vercel header ever appears, something has been mis-routed — stop and reconcile DNS before proceeding.

## Topology

| Container | Compose file | Image | Role |
|---|---|---|---|
| `toolbox-trendingrepo-1` | `/opt/trendingrepo/docker-compose.trendingrepo.yml` | `trendingrepo-app:vps-<ts>-<sha>` | Next.js standalone app, port 3023 |
| `toolbox-trendingrepo-worker-1` | `/opt/toolbox-trendingrepo-worker/docker-compose.yml` | `toolbox-trendingrepo-worker:vps-<ts>-<sha>` | in-process croner fetchers; 50 active sources green on 2026-06-01 |
| `redis` (internal) | toolbox stack | — | `ss:data:v1:*` namespace, only durable plane |
| `cloudflared` | toolbox stack | — | tunnel → `toolbox-trendingrepo-1:3023` |

Both compose files reference the `toolbox_edge` external network (declared once in `/opt/toolbox/docker-compose.yml`).

## The build sequence (the established flow)

Always operate from a git checkout on the box, never from your laptop, because:
- The app `Dockerfile` COPYs `.env.production` (gitignored on the box) at build time for `NEXT_PUBLIC_*` baking. Building locally + shipping a tar would lose the Clerk live keys.
- The worker uses sops-decrypted env at runtime.

### 0. From your laptop: stage + commit + push

```bash
# Stage EXACT files (never -A / .)
git add path/to/file1 path/to/file2 ...
git commit -m "feat(area): summary

…

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>"
git push origin bot/swarm-a6-producthunt-reader
```

### 1. On the box: update the working tree (selective checkout)

```bash
ssh toolbox
cd /opt/trendingrepo
git fetch origin bot/swarm-a6-producthunt-reader
# Selective! Do NOT do a full `git checkout <sha>` — it resets the sed'd
# image tag on docker-compose.trendingrepo.yml back to :vps-v1 (which
# doesn't exist) and breaks subsequent `docker compose up`s.
git checkout <newCommitSha> -- apps/trendingrepo-worker/src/ src/
```

If only one of (worker, app) changed, you can scope the checkout further, e.g. `-- apps/trendingrepo-worker/src/fetchers/<name>/`.

### 2. Build the worker (≈90s)

```bash
WTAG=vps-$(date +%Y%m%d%H%M%S)-<shortSha>
echo "$WTAG" > /tmp/trworker-tag
cd /opt/trendingrepo/apps/trendingrepo-worker
docker build -t toolbox-trendingrepo-worker:$WTAG . > /tmp/trworker-build.log 2>&1
tail -2 /tmp/trworker-build.log   # expect "DONE …"
```

### 3. Build the app (≈5–8 min — run in background)

```bash
cd /opt/trendingrepo
ATAG=vps-$(date +%Y%m%d%H%M%S)-<shortSha>
echo "$ATAG" > /tmp/trapp-tag
nohup sh -c "docker build -t trendingrepo-app:$ATAG . > /tmp/trapp-build.log 2>&1 && echo DONE_OK >> /tmp/trapp-build.log || echo DONE_FAIL >> /tmp/trapp-build.log" >/dev/null 2>&1 &
# Poll with: tail -2 /tmp/trapp-build.log
```

The Dockerfile uses `npm install --legacy-peer-deps` (not `npm ci`) due to known lock-file drift; this is intentional, do not "fix" it without addressing the upstream drift first.

### 4. Deploy the worker

```bash
cd /opt/toolbox-trendingrepo-worker
WTAG=$(cat /tmp/trworker-tag)
cp docker-compose.yml docker-compose.yml.bak-$(date +%s)
sed -i "s#image: toolbox-trendingrepo-worker:.*#image: toolbox-trendingrepo-worker:$WTAG#" docker-compose.yml
docker compose up -d
sleep 6 && docker ps --filter name=trendingrepo-worker --format "{{.Image}} {{.Status}}"
# expect: toolbox-trendingrepo-worker:<WTAG>  Up X seconds (healthy)
```

### 5. Deploy the app

```bash
cd /opt/trendingrepo
ATAG=$(cat /tmp/trapp-tag)
sed -i "s#image: trendingrepo-app:.*#image: trendingrepo-app:$ATAG#" docker-compose.trendingrepo.yml
docker compose -f docker-compose.trendingrepo.yml up -d
sleep 55 && docker ps --filter name=toolbox-trendingrepo-1 --format "{{.Image}} {{.Status}}"
# expect: trendingrepo-app:<ATAG>  Up X seconds (healthy)
curl -s -m 10 http://localhost:3023/api/healthz   # → {"ok":true,...}
```

### 6. Worker one-shots (when warranted)

After a worker change, re-run the affected fetcher once to seed prod redis with the new behavior (don't wait for the next cron tick):

```bash
docker exec toolbox-trendingrepo-worker-1 node /app/dist/index.js <fetcher>
```

Common targets after recent changes: `sec-form-d`, `repo-community-profile`,
`velocity-refresh`, `star-activity`, `velocity-seed`, and `velocity-backfill`
when a new strict health marker has no Redis payload yet. Keep these bounded;
do not use one-shots to mask a recurring scheduled failure.

### 7. Install X autopilot host files (only when these files changed)

The app/worker image deploy does not update host cron files. Check out the
exact autopilot files, install them, then dry-run the first discovery slot:

```bash
cd /opt/trendingrepo
git checkout <newCommitSha> -- scripts/twitter-trending-run.mjs scripts/ops/
sudo scripts/ops/install-trendingrepo-x-autopilot.sh
sudo /usr/local/bin/trendingrepo-x-autopilot.sh --slot D --dry-run
grep '^TRENDING_POST_MAX_PER_DAY=5$' /opt/trendingrepo/.env.production
```

The installer backs up the production env, installs both cron definitions and
their host wrappers, and raises the explicit daily cap to five. It deliberately
does not arm `TWITTER_OUTBOUND_MODE=live`.

## Post-deploy verification

```bash
# Zero-tolerance live production gate
npm run health:prod

# Routing (must be Cloudflare, no X-Vercel)
curl -sI https://trendingrepo.com/ | grep -iE "^server:|^HTTP|x-vercel"

# Authoritative tracked count
ssh toolbox 'curl -s http://localhost:3023/api/pipeline/status | grep -oE "\"totalRepos\":[0-9]+"'

# Redis slug sizes
ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 node -e "
const {readDataStore}=require(\"/app/dist/lib/redis.js\");
(async()=>{
  for (const k of [\"repo-registry\",\"repo-metadata\",\"mentions-ledger\",\"repo-mentions-detail-rollup\",\"trending\",\"recent-repos\",\"consensus-verdicts\"]) {
    const d = await readDataStore(k).catch(()=>null);
    const n = d?.count ?? d?.items?.length ?? d?.entries?.length ?? (d?.repos?Object.keys(d.repos).length:0) ?? 0;
    console.log(k.padEnd(32), n);
  }
})();
"'

# A known-dropped repo's profile (smoke for the registry retention)
curl -sI https://trendingrepo.com/repo/brendanhogan/hermitclaw   # → 200
```

Expected 2026-06-01 health summary: `/api/worker/health` reports 50 active,
50 green, 0 amber, 0 red, 0 missing, 0 degraded payloads, and 0 empty payloads.
`/api/health/sources` should have all active breakers closed; `reddit` is
intentionally disabled.

## Compose-tag gotcha (operational hazard)

`/opt/trendingrepo/docker-compose.trendingrepo.yml` is **git-tracked at repo root** but its `image:` tag is sed'd at every deploy. A subsequent full `git checkout <commit>` resets the file to the committed value (`vps-v1`, a tag that doesn't exist on the box). The running container is unaffected at that moment, but the next `docker compose up -d` after the checkout fails ("image not found").

**Always use selective checkouts**: `git checkout <commit> -- apps/trendingrepo-worker/src/ src/`. The app compose file now points at a stable production tag pattern, but a full checkout can still clobber the host's currently pinned image line.

## Current hardening state (post-2026-06-01)

The original 2026-05-27 checklist below is historical; do not execute those P0
items without re-verifying because most were closed by the 2026-06-01
root-cause hardening wave. Current production evidence lives in
[HANDOVER-2026-06-01-PRODUCTION-HARDENING.md](HANDOVER-2026-06-01-PRODUCTION-HARDENING.md).

Closed / verified:

- App and worker containers are healthy on HOSTUP.
- `recent-repos`, `repo-community-profile`, `star-activity`, and velocity
  worker markers have Redis payloads and are covered by strict health.
- `/api/health` includes worker status.
- `npm run health:prod` is the zero-tolerance production gate.
- Process-local source breakers no longer create false degraded production
  health after app restarts.
- Reddit is paused/off instead of flapping.
- Direct OSSInsight dependence is opt-in; GitHub-backed star activity is the
  durable delta path.
- The noisy Collect Funding Signals workflow is disabled because GitHub-hosted
  runners cannot reach the HOSTUP-internal Redis plane.

Still open:

- P0 operator action: rotate leaked Clerk `sk_live_*` and Cloudflare `cfat_*`
  tokens, then update HOSTUP/local env files.
- P1 observation: let scheduled worker runs proceed naturally overnight and
  rerun `npm run health:prod`; do not count manual one-shot bootstrap as the
  long-term proof.
- P2 hygiene: migrate deprecated `STARSCREENER_*` env names to
  `TRENDINGREPO_*` where still present.
- P2 branch hygiene: decide the deferred cleanup branch fate separately; do not
  mix it with production health fixes.

### Historical 2026-05-27 checklist

P0 = visible breakage / consistency. P1 = enrichment gap for registry-only
repos. P2 = ops + cost. P3 = polish.

### P0 — Visible bugs / consistency

- **P0-A. `recent-repos` slug = 0 in prod (pre-existing fetcher break).** File: `apps/trendingrepo-worker/src/fetchers/recent-repos/index.ts`. Run one-shot, inspect warn logs, likely GH token / query issue. Verify: `readDataStore('recent-repos').items.length > 50`.
- **P0-B. Star history chart placeholder for ~335 dropped repos.** Choose:
  1. Reframe `RepoStarChart.tsx:716-731` message to honest "First indexed {age} — chart populates after next snapshot" (5 min).
  2. Port `star-activity` to a worker fetcher (~200 LOC), iterate registry top-N by `lastSeenAt` desc, append daily stargazer point.
- **P0-C. Org/community card "—" for dropped repos.** File: `RepoOwnerRepoSnapshot.tsx:113-171`. The `repo-community-profile` slug is on-demand only — needs a worker fetcher (mirror `repo-metadata`'s pattern, batch the registry top-N hourly).
- **P0-D. App compose-tag stability.** Replace tracked `vps-v1` with a `:latest` alias + tag every build as `:latest` + `:vps-<ts>-<sha>`. Compose stays stable through full git checkouts.

### P1 — Profile completeness (registry-only repos)

- **P1-A.** `consensus-analyst` TOP_N=14 → bump to 30. File: `apps/trendingrepo-worker/src/fetchers/consensus-analyst/index.ts:23`. Cost: +16 Kimi/NanoGPT calls/hour. Confirm with operator before further bumps.
- **P1-B.** `repo-profiles` PROFILE_ENRICH_LIMIT=20 → bump to 100; add registry as candidate. File: `apps/trendingrepo-worker/src/fetchers/repo-profiles/index.ts:16-19`.
- **P1-C.** `cross-source-sweep` TOP_N=150 → bump to 250 OR `0 6,18 * * *` (twice daily). File: `apps/trendingrepo-worker/src/fetchers/cross-source-sweep/index.ts:29`. Latency safe (250×0.5s / 4 conc ≈ 30s).
- **P1-D.** `mentions-ledger` snapshot growth — probe `entries.length` over a week; should climb. If stagnant, debug `mergeLedgerSnapshot`.
- **P1-E.** Hide `RelatedReposCard` when `items.length === 0` AND `mentions.total < 5` (registry-only signal). 10-line conditional.
- **P1-F.** `RepoPulsePanel` is fixed (lifetime-aware) but unmounted — either re-mount with visual proof OR delete the file as dead code.

### P2 — Operational + cost

- **P2-A. Key rotations (operator)**: `APIFY_API_TOKEN`, `TAVILY_API_KEY`, Reddit OAuth. Auto-activate on drop-in.
- **P2-B. sources.json contracts** for `repo-registry`, `mentions-ledger` (snapshot), and any new fetchers. Silences "no SOURCE_CONTRACTS entry" warning. File: `apps/trendingrepo-worker/src/platform/sources.json`.
- **P2-C. Twitter dual-write gap** — see memory `project_twitter_dual_write_gap.md`. Out of scope unless explicitly greenlit.
- **P2-D. Pipeline-jsonl loader** — dead in prod. Optional: gate the loader on `NODE_ENV !== 'production'` to silence the empty-array log.

### P3 — Polish

- **P3-A.** Add `refreshRepoRegistryFromStore()` to `src/app/layout.tsx` so non-home pages also have a registry-warm cache.
- **P3-B.** `/api/diagnostics/render-snapshot` for the app-side equivalent of the worker's channel-status WARN.
- **P3-C.** `npm run freshness:check` on every session open (CLAUDE.md mandates it).

Costs are summarized in the handover plan at `~/.claude/plans/handover-2026-05-27-trendingrepo-hardening.md`.

## Anti-patterns (already burned)

- `readFileSync` for new data sources — use the data-store.
- Live Reddit public JSON / dev.to `feed_content` from the worker — dead from the VPS IP. Source-first snapshots + ledger cover it.
- `getTrackedRepoCount()` for user-facing counts — cold trending-only seed (was 732 vs canonical 866).
- `git checkout <commit>` (full) on the box — resets the sed'd compose tag.
- `git add -A` / `.` — corrupts parallel-agent staging.
- Bump `oss-trending` languages for raw count — dilutes "everything AI" focus.
- Cookie-based Twitter scrapers are dead. Nitter/manual collection is the
  current low-cost path; Apify is historical/manual-only and must not be
  re-enabled without operator cost approval.
- Sequential `consensus-analyst` sweep — blows the hourly slot. Bounded concurrency (current).

## See also

- [REGISTRY-AND-LIFETIME-MENTIONS.md](./REGISTRY-AND-LIFETIME-MENTIONS.md) — what the persistence + completeness layer does
- [INGESTION.md](./INGESTION.md) — collector cadence + dual-write
- [ENGINE.md](./ENGINE.md) — full workflow + cron inventory
- Plan file (running TODO): `~/.claude/plans/handover-2026-05-27-trendingrepo-hardening.md`
- Memory pointers: `~/.claude/projects/c--dev-trendingrepo/memory/MEMORY.md`
