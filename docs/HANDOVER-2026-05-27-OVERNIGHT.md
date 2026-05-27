---
created: 2026-05-27 (late evening, Basil asleep)
agent: Claude Opus 4.7 1M (autonomous)
branch: `bot/swarm-overnight-2026-05-27`
base: `a45811988` (current `bot/swarm-a6-producthunt-reader` HEAD)
worktree: `C:/dev/trendingrepo-wt/overnight-2026-05-27`
status: 9 commits, branch local only (NOT pushed — per `feedback_no_push_without_approval`)
---

# Overnight wave handover

Greenlit by Basil after the Supabase egress incident was confirmed resolved.
Worked in an isolated worktree from the current `bot/swarm-a6-producthunt-reader`
HEAD so the parallel session committing on that branch was never blocked.

## What shipped

| # | Wave | Status | Verified |
|---|---|---|---|
| 1 | Kimi prompt emits `tagline` + `citations[]` | ✅ | worker typecheck + 17 unit tests |
| 2 | GitHub pool Redis hygiene sweeper + cron endpoint | ✅ | app typecheck + 19 unit tests |
| 3 | `consensus-analyst-tail` daily deep-coverage fetcher | ✅ | worker typecheck + registry test |
| 4 | Supabase posture probe | ✅ | 24h log scan, zero egress |
| 5 | Citation row component | ⏭️ Subsumed — renderer already supports both fields |

Net: 9 commits, ~1,200 LOC, all-additive except a 2-line registry edit
(zero conflict surface with the active session).

## Commit chain (oldest → newest)

```
6b3e43a7a docs(tasks): overnight wave plan
adbe171f6 feat(consensus-analyst): kimi prompt emits tagline + citations[]
3830225b7 test(consensus-analyst): 17 unit tests for citations + tagline
b3d265a06 feat(github-pool): redis hygiene sweeper module
dd611d2a4 test(github-pool): 19 tests for sweeper planner + shell
9a0ecd948 feat(api): /api/cron/github-pool-sweep cron endpoint
7e5e65f7d feat(consensus-analyst-tail): daily deep-coverage sweep
e635dcc20 chore(registry): register consensus-analyst-tail fetcher
e5c118bba docs(overnight): wave results + verification runbook
```

## Files changed

**Worker (4 files):**
- `apps/trendingrepo-worker/src/fetchers/consensus-analyst/prompt.ts` — extended (additive)
- `apps/trendingrepo-worker/src/fetchers/consensus-analyst/__tests__/prompt.test.ts` — new
- `apps/trendingrepo-worker/src/fetchers/consensus-analyst-tail/index.ts` — new
- `apps/trendingrepo-worker/src/registry.ts` — 2 lines added (import + array)

**App (3 files):**
- `src/lib/github-pool-sweeper.ts` — new
- `src/lib/__tests__/github-pool-sweeper.test.ts` — new
- `src/app/api/cron/github-pool-sweep/route.ts` — new

**Docs (2 files):**
- `tasks/OVERNIGHT-2026-05-27.md` — new
- `docs/HANDOVER-2026-05-27-OVERNIGHT.md` — this file

## To push + open PR (Basil-on-wake)

```bash
cd C:/dev/trendingrepo-wt/overnight-2026-05-27
git push -u origin bot/swarm-overnight-2026-05-27
gh pr create --base main --title "feat: overnight wave — kimi citations + pool hygiene + tail analyst" --body "$(cat <<'EOF'
## Summary
Greenlit overnight wave shipped autonomously from an isolated worktree on top of `bot/swarm-a6-producthunt-reader` HEAD. Five waves, four shipped, one subsumed (renderer already in place).

- **Wave 1** — Kimi/NanoGPT analyst now emits `tagline` (1-line expert framing) + `citations[]` (2-5 https URLs picked from a pre-built per-source candidate list). ItemReportSchema treats both as optional for rolling-deploy compat with the 505 backfilled items. Strict https-only URL validation closes a hallucinated-URL attack surface.
- **Wave 2** — New `src/lib/github-pool-sweeper.ts` (pure planner + lazy-ioredis shell) and `/api/cron/github-pool-sweep` endpoint. Sweeps `pool:github:tokens:*` keys that are stale-quarantined or exhausted-with-elapsed-reset. Addresses the 22-ghost-row state observed on TOOLBOX Redis. Cron entry NOT wired — operator decision (suggested daily 04:33 UTC).
- **Wave 3** — New `consensus-analyst-tail` fetcher, daily 05:00 UTC, analyzes consensus-trending ranks 31-200 minus already-verdicted. Reuses primary's prompt + schema. CONSENSUS_TAIL_LIMIT env override defaults to 60 per run. Covers the full 200-item pool within ~3 days.
- **Wave 4** — TOOLBOX posture verified. Zero Supabase egress in last 24h. Noted: 1/min log noise from `overrides.ts` (`source overrides db load failed`) — harmless, deferred fix.
- **Wave 5** — Phantom. `RepoSignalSummary.tsx` and `repo-jsonld.ts` already render `tagline` + `citations[]`. Wave 1 alone unlocks both surfaces.

## Test plan
- [ ] Worker typecheck green (`cd apps/trendingrepo-worker && npm run typecheck`)
- [ ] App typecheck green (`npx tsc --noEmit -p tsconfig.json`)
- [ ] Worker analyst tests: 17/17 green (`cd apps/trendingrepo-worker && npm test -- src/fetchers/consensus-analyst`)
- [ ] Sweeper tests: 19/19 green (`npx tsx --test --require ./tests/setup-server-only-stub.cjs src/lib/__tests__/github-pool-sweeper.test.ts`)
- [ ] Worker full suite: 354/354 green (1 skipped, 2 todo)
- [ ] Post-deploy: probe `consensus-verdicts` → expect `tagline` + `citations` on fresh items
- [ ] Post-deploy: `curl trendingrepo.com/repo/<top-30-repo>` → expect `pf-summary-tagline` + `pf-summary-sources` in HTML
- [ ] Wire sweep cron (operator-paced; suggested `33 4 * * *` UTC)
- [ ] One-shot sweep dry-run: `curl -X POST -H "Authorization: Bearer $CRON_SECRET" "https://trendingrepo.com/api/cron/github-pool-sweep?dry=1"`

Full wave plan + result narrative + verification runbook: `tasks/OVERNIGHT-2026-05-27.md` (in this PR).

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Deploy runbook (after PR merge)

```bash
# 1. Build worker image locally with the new prompt + tail fetcher
docker build --platform linux/amd64 --provenance=false \
  -t toolbox-trendingrepo-worker:vps-$(date +%Y%m%d%H%M%S)-$(git rev-parse --short HEAD) \
  apps/trendingrepo-worker

# 2. Ship to TOOLBOX
TAG=$(docker images --format "{{.Repository}}:{{.Tag}}" | grep toolbox-trendingrepo-worker:vps | head -1)
docker save $TAG | gzip | ssh toolbox 'gunzip | docker load'

# 3. Bump compose tag + restart
ssh toolbox "sed -i 's|image: toolbox-trendingrepo-worker:.*|image: $TAG|' /opt/toolbox-trendingrepo-worker/docker-compose.yml && docker compose -f /opt/toolbox-trendingrepo-worker/docker-compose.yml up -d"

# 4. Smoke
ssh toolbox 'docker exec toolbox-trendingrepo-worker-1 wget -qO- http://127.0.0.1:8080/healthz'
# expect: {"ok":true,"db":true,"redis":true,...}
```

## Why this branch is local-only

Per memory `feedback_no_push_without_approval`: explicit per-push consent
is required, inferred greenlight does not exist. Basil's "lets go!" was a
general greenlight for the overnight wave, not an authorization to push.
The branch is fully committed in the worktree and ready for him to push
when he reviews on wake.

If he prefers a different push pattern (e.g. force-push to a different
branch name, or include in his next merge), the commits cherry-pick
cleanly because they're additive + per-file.

## Known follow-ups (not shipped, recorded for future agents)

1. **`overrides.ts` env precheck** — silence the 1/min "source overrides db load failed" warning by short-circuiting `loadOverrides()` when SUPABASE_URL is blank. ~5 lines. Skipped tonight to keep additive-only posture vs the active session.

2. **`repo-metadata` GraphQL errors** — log scan revealed 1-5 errors per batch out of 40. Could be secondary rate-limits (cost-points), 404s on archived repos, or a quarantine cascade through the GH pool. Worth a focused debug session.

3. **Sweep cron entry** — endpoint exists, cron-trigger does not. Add via `.github/workflows/*` or `vercel.ts` once Basil decides cadence.

4. **Kimi billing restoration** — when Kimi-direct comes back from billing-exhaustion, primary auto-resumes and NanoGPT becomes the dormant fallback. No code change needed. Rotate the chat-burned NanoGPT key per memory `project_consensus_nanogpt_fallback`.

## Worktree hygiene

The worktree is at `C:/dev/trendingrepo-wt/overnight-2026-05-27`. Once the
branch is merged or abandoned:

```bash
cd c:/dev/trendingrepo
git worktree remove C:/dev/trendingrepo-wt/overnight-2026-05-27 --force
```
