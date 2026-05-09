# Session Summary — 2026-04-26

**Goal at start:** "stop the every-20-min Vercel deploys" → expanded to "ultra reliable data terminal API to make money with"
**Time spent:** ~10 hours of focused work
**Compressed equivalent:** ~3 days of solo work via parallel-subagent pattern

## What shipped to main

| Commit | PR | What |
|---|---|---|
| `87e3f4e` | (direct push) | Phase 1B foundation — Redis-backed data-store + 30 sources migrated (77 files) |
| `cf859b2` | (direct push) | CLAUDE.md updated with new data-store architecture |
| `888e819` | (direct push) | Workflow strip rollout doc |
| `822b9e1` | (direct push) | Build fix — lazy `fs` + webpack fallback for client bundles |
| `8927386` | **#9 MERGED** | Railway Redis (ioredis) support alongside Upstash REST |
| `0962f1c` | **#11 MERGED** | Phase 2 reliability — token pool + persisted mentions + circuit breakers |
| `610f659` | (on strip branch) | Phase 3 + 4 plan docs |
| `7980692` + later | (on Phase 2 branch) | Dev.to + ProductHunt token pools (operator handed in 3 + 2 keys) |

## What's open (waiting on operator action)

### PR #10 — workflow strip (kills git-push from 11 cron workflows)
- **Branch:** `chore/data-api-workflow-strip`
- **Status:** OPEN, ready to merge
- **Blocker:** local Redis verification proved working (6 green checks); CI verification got stuck in GitHub Actions runner queue (5 attempts, all queued for hours — GH infra issue today, not our code)
- **Decision needed:** merge based on local verification confidence, or wait until GH runners clear and re-trigger

### Operator follow-ups
1. **Rotate ALL credentials shared in chat** (after PR #10 lands and stays green for 24h):
   - Railway Redis password — Railway → Redis service → Settings → Reset password
   - 10 GitHub PATs — github.com/settings/tokens → revoke + regenerate
   - 3 Dev.to keys — dev.to/settings/extensions → regenerate
   - 2 PH client secrets — producthunt.com/v2/oauth/applications → regenerate
2. **Get 3 Reddit OAuth apps** when account blocker clears (operator said "next days") — same pool pattern as Dev.to/PH
3. **Decide on worker consolidation** — see [tasks/phase-3-worker-consolidation.md](phase-3-worker-consolidation.md)

## Architecture state after this session

### Live infrastructure
| Layer | Backend | Status |
|---|---|---|
| Web app | Vercel | Auto-deploys on push to main |
| Data store (30 cron-driven JSON payloads) | Railway Redis (ioredis) | ✅ live, end-to-end verified |
| Append-only logs (Twitter scans) | `.data/*.jsonl` git-committed | unchanged (Phase 2 scope) |
| Rate limiting | Upstash REST (legacy) | unchanged — Phase 4 will migrate to Postgres |
| Cron collectors | GitHub Actions × 12 workflows | unchanged — Phase 3 may consolidate to Railway worker |
| Payments | Stripe (configured, not billed) | unchanged — Phase 4 will wire metering |
| Sessions | HMAC-signed cookie | unchanged |

### Token pools wired (round-robin, per-token rate-limit accounting)
| Pool | Count | Quota | Env var |
|---|---|---|---|
| GitHub PATs | 10 | 50,000 req/hr | `GH_TOKEN_POOL` (CI) + `GITHUB_TOKEN_POOL` (alias) |
| Dev.to API keys | 3 | 90 req/min | `DEVTO_API_KEYS` |
| ProductHunt OAuth | 2 | 12,500 req/15min | `PRODUCTHUNT_TOKENS` |
| Reddit OAuth | 0 (pending) | - | (TBD: `REDDIT_OAUTH_APPS`) |

### Reliability contract (Phase 2 additions)
- **Per-source circuit breakers** — `CLOSED → OPEN → HALF_OPEN` state machine, 5 consecutive failures → OPEN, 60s cooldown → HALF_OPEN, single probe success → CLOSED
- **Per-source health endpoint** — `/api/health/sources` returns per-source breakdown, HTTP 207 when any breaker is OPEN
- **Persisted mentions** — HN/Reddit/Bluesky/DEV mentions now indexed during ingestion (was per-detail-page-only); `socialBuzzScore` is no longer hard-coded to 0

## Cost summary

| Service | Monthly cost | Notes |
|---|---|---|
| Vercel | $0 (hobby) | Pro tier needed eventually for higher build minutes |
| Railway Redis | ~$5/mo | Hobby plan, free credit covers initial usage |
| Upstash REST | $0 | Free tier (rate-limit only, low usage) |
| GitHub Actions | $0 | Within public-repo free tier |
| ProductHunt API | $0 | Free tier (6,250 req/15min per token, 2 tokens = 12,500) |
| Dev.to API | $0 | Free tier (30 req/min per key, 3 keys = 90) |
| 10 GitHub PATs | $0 | All `public_repo` scope |
| **TOTAL infra cost** | **~$5/mo** | Stripe takes 2.9% + 30¢ per transaction (no fixed fee) |

## Key files for future Claude sessions

- [CLAUDE.md](../CLAUDE.md) — codebase conventions (kept current)
- [tasks/data-api.md](data-api.md) — Phase 1B + Railway provisioning + Upstash story
- [tasks/workflow-strip-rollout.md](workflow-strip-rollout.md) — Phase 1B activation steps
- [tasks/phase-3-source-coverage.md](phase-3-source-coverage.md) — Phase 3 plan (pre-consolidation)
- [tasks/phase-3-worker-consolidation.md](phase-3-worker-consolidation.md) — RECOMMENDED Phase 3 path (worker)
- [tasks/phase-4-monetization.md](phase-4-monetization.md) — Phase 4 plan
- [starscreener-inspection/MOAT.md](../starscreener-inspection/MOAT.md) — competitive moat (verified 2026-04-18)
- [starscreener-inspection/SOURCES.md](../starscreener-inspection/SOURCES.md) — full source matrix
- [src/lib/data-store.ts](../src/lib/data-store.ts) — three-tier read pattern reference
- [src/lib/github-token-pool.ts](../src/lib/github-token-pool.ts) — token pool pattern reference
- [src/lib/source-health-tracker.ts](../src/lib/source-health-tracker.ts) — circuit breaker pattern reference

## Lessons learned this session

1. **Audit subagents tend toward false positives on "dead file" claims** — verified 4 of them were wrong (auth on /api/pipeline/ingest IS present, reddit-all-posts IS used, 4 "dead" trending JSONs ARE rendered, revenue-manual-matches IS read). Always grep before deleting.
2. **Local Windows + GitHub Actions Linux behave differently on TCP Redis** — caught the `enableOfflineQueue: false` bug only after the live test, never on local mocked tests.
3. **GitHub Actions reserves the `GITHUB_*` secret prefix** — had to rename `GITHUB_TOKEN_POOL` → `GH_TOKEN_POOL` for CI.
4. **GH Actions `workflow_dispatch` queue can hang for hours during peak load** — scheduled crons run fine but manual triggers got stuck across 5 attempts. This is the strongest argument for moving collectors to a Railway worker (Phase 3 consolidation path).
5. **`unstable_cache` + Next.js Edge runtime + `fs` imports = client-bundle build break** — webpack `resolve.fallback = { fs: false, ... }` is the documented fix.
6. **Subagent worktree integration pattern works:** copy non-overlap files in bulk, manually merge overlap files, single squash commit. Saved hours vs sequential work.

## Phase roadmap (current state)

| Phase | What | Status |
|---|---|---|
| 1B | Decouple data from deploys via Redis | ✅ DONE |
| 2 | Reliability (token pool, persisted mentions, circuit breakers) | ✅ DONE |
| 2.5 | Workflow strip (pending merge of PR #10) | 🟡 ready, awaits merge |
| 3 | Source coverage — recommended via [worker consolidation](phase-3-worker-consolidation.md) | 📋 planned, fresh session |
| 3.2 | ClickHouse historical depth | 📋 planned, separate workstream |
| 4 | Monetization (API keys, Stripe metering, status page, docs site) | 📋 planned, fresh session |
