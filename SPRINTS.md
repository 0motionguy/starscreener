# Tech Debt Sprint Plan — STARSCREENER

Source: [TECH_DEBT_AUDIT.md](TECH_DEBT_AUDIT.md) (87 findings, 5-module audit, 2026-04-27).
Mode: solo founder + AI pair. "Sprint" = a focused work block (1h to 2 days), not a 2-week ceremony.

Order is severity-first, then logical clustering. Each sprint commits at end so nothing evaporates.

---

## Sprint 0 — Emergency Patches (today, ~1 hour)

The 5 highest-impact items. All single-line or single-file. P0 first.

| # | Finding | File | Time | Risk |
|---|---------|------|------|------|
| 1 | XS-01 Stripe stub fallback | `src/app/api/webhooks/stripe/route.ts:46-72` | 20 min | **Verify with test event before deploying** |
| 2 | XS-01 Stripe idempotency in-memory Set | `src/lib/stripe/events.ts:124,176` | 15 min | Move to Redis SETNX |
| 3 | WK-01 huggingface stub still ticking | `apps/trendingrepo-worker/src/registry.ts:78` | 5 min | Zero — delete one import |
| 4 | WK-02 ai-blogs not registered | same file | 5 min | Zero — add one import |
| 5 | SCR-01/02 Twitter collector defaults | `scripts/collect-twitter-signals.ts:130-131` | 5 min | Zero — flip two strings |
| 6 | SCR-05 CLI duplication | `bin/ss.mjs` (572 LOC dupe) | 5 min | Zero — replace with shim |

Commit message: `fix: emergency patches from tech-debt audit (XS-01, WK-01/02, SCR-01/02/05)`

---

## Sprint 1 — Quick Wins Sweep (today/tomorrow, ~3 hours)

20 small items from the audit's Quick Wins checklist. All Low effort × Medium+ severity. Pure janitorial.

Cluster A — error envelope + secrets cleanup:
- APP-03 (× 9 handlers): replace `err.message` echoes with generic 500
- APP-06: extract `SCAN_SOURCES` to shared module
- APP-11: add login rate-limit
- APP-15: reconcile FAQ scraper cadence

Cluster B — worker hygiene:
- WK-04: sync `apps/trendingrepo-worker/.env.example` from `env.ts`
- WK-14: drop unused `ctx.since` field
- WK-15: extract `emptyResult()` helper, replace 12 copies

Cluster C — UI dead code + tiny perf:
- UI-01: delete `src/components/detail/RepoChart.tsx` (366 LOC)
- UI-15: drop `'use client'` from `SidebarSkeleton.tsx`
- UI-17: delete commented `USER_ID = "local"`
- UI-12: hoist `topicFiltered` memo in `AllTrendingTabs.tsx`

Cluster D — script cleanup + MCP safety:
- SCR-04: add `writeDataStore` to `scrape-npm-daily.mjs`
- SCR-12: scheme check on MCP metering POST
- LIB-12: depth/cycle guard on `stableStringify`

Commit per cluster (4 commits total).

---

## Sprint 2 — API Boundary Hardening (1 day, ~6 hours)

**APP-02**: land Zod on top 10 mutating endpoints. Single shared `parseBody(schema)` helper unlocks the whole pile.

Day plan:
- Hour 1: write `src/lib/api/parse-body.ts` helper + 6 unit tests
- Hours 2-5: migrate routes one-by-one — `api/admin/{scan,revenue-queue,ideas-queue,drop-events}`, `api/reactions`, `api/keys`, `api/watchlist/private`, `api/ideas/[id]`, `api/repo-submissions`, `api/submissions/revenue`
- Hour 6: smoke-test admin login + scan + reactions; commit

Each route loses 10-30 LOC of typeof checks and gains compile-time contract.

Bonus if time: APP-09 (cache-header centralization) + APP-10 (error-envelope unification).

---

## Sprint 3 — Worker SQL + Test Hygiene (half day, ~4 hours)

- WK-09: extract `trending_score()` body to `sql/trending_score.sql` so future migrations `\i` it instead of copying
- WK-12: extend `composite()` in `src/lib/score.ts` to apply lab/cross-source boosts (parity with SQL)
- WK-07: real test for `publishLeaderboard` (replace `describe.skip`)
- WK-10: pin zod 3 via npm-overrides for skills-sh Firecrawl path (kills the `as unknown as any`)
- WK-13: rename `apps/trendingrepo-worker/src/lib/util/github-token-pool.ts` → `worker-github-token-pool.ts`

---

## Sprint 4 — Cold-Path Decomp (1-2 days)

**LIB-01**: split `src/lib/derived-repos.ts` (754 LOC god module on cold-Lambda critical path).

```
src/lib/derived-repos.ts → src/lib/derived-repos/
  loaders/
    trending.ts
    recent.ts
    manual.ts
    pipeline-jsonl.ts
  decorators/
    twitter.ts
    producthunt.ts
    cross-signal.ts
  assembly.ts
  index.ts        # orchestrator, ≤150 LOC
```

Replace 4 `statSync` cache-key inputs with one mtime tracker (5s floor).

This is the most painful refactor in the audit. Tests for each new module before merging the split.

---

## Sprint 5 — Pipeline Perf Cluster (1-2 days)

All `src/lib/pipeline/storage/` and `src/lib/twitter/storage/` perf fixes together.

- LIB-04: per-repo Map index for `pruneScansForRepo` (O(1) on insert, drops O(N log N))
- LIB-05: guard `withoutDupe` filter in `InMemorySnapshotStore.append`
- LIB-10: sorted index for `InMemoryMentionStore` (TODO at line 547 acknowledged)
- LIB-11: suspend persist hook around `recomputeAll`'s upsert loop
- LIB-13: extract `createDebouncedPersist({flush, debounceMs})` helper, dedupe two implementations

---

## Sprint 6 — UI Cleanup + Boundaries (1 day)

- UI-02: replace `RepoReactions` with `<ObjectReactions objectType="repo" .../>` (delete 250 LOC)
- UI-03: fix self-defeating `useMemo` in `SubredditMindshareCanvas` — drive hover via `setAttribute` on `groupRefs`
- UI-04: extract `usePhysicsBubbles` hook from 3-way fork (TopicMindshareCanvas/SubredditMindshareCanvas/BubbleMapCanvas)
- UI-05: watchlist refetch diff on `repoId.sort().join(",")`
- UI-06: consolidate `CompareClient` ↔ `CompareProfileGrid` data fetching
- UI-07: wrap canvas mounts + RepoDetailChart in `ErrorBoundary` (currently zero in `src/components`)
- UI-08: replace `window.location.href` in BubbleMap with `useRouter().push`

---

## Sprint 7 — Test Coverage Backfill (ongoing, do half-day batches)

- LIB-06: 3 negative tests for Stripe sig verification (expired ts, replay, missing header)
- WK-08: per-fetcher fixture-driven normalizer tests for producthunt/reddit/bluesky/hackernews/devto
- SCR-07: at least one MCP test that mocks fetch + asserts metering doesn't throw on 500
- SCR-11: smoke test for `_data-store-write.mjs` + funding extractor

---

## Backlog (touch when adjacent code is touched, NOT proactively)

The remaining 30-ish findings — documentation drift, low-priority a11y polish, dead `src/lib/db/schema.ts` (LIB-07), nitter adapter cleanup (LIB-03), etc. These go on the backlog and stay there until an adjacent change makes them cheap to do in passing.

---

## Execution rules

1. **Commit at end of every sprint.** No uncommitted work overnight.
2. **One sprint, one branch, one PR.** No cross-contamination.
3. **Run `npm run typecheck` + relevant vitest before commit.** Non-negotiable.
4. **If something's harder than its sprint allows, stop.** Re-plan into a follow-up.
5. **No proactive backlog grooming.** Backlog stays cold until needed.

Status: Sprint 0 starting now.
