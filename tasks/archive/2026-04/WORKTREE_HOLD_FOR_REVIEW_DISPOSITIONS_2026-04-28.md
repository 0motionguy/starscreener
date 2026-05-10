# Worktree HOLD-FOR-REVIEW dispositions — 2026-04-28

Per-worktree triage of the 7 HOLD-FOR-REVIEW worktrees + the af54744 incomplete-merge. Companion to [tasks/WORKTREE_DISPOSITION_2026-04-28.md](WORKTREE_DISPOSITION_2026-04-28.md) and [tasks/AUDIT_TRENDINGREPO_2026-04-28.md](AUDIT_TRENDINGREPO_2026-04-28.md).

**STATUS: ALL 8 EXECUTED 2026-04-28.** See "Results" section at the bottom for SHAs, PR URLs, and origin branch refs.

**TL;DR — 8 dispositions:**

| Worktree | Disposition | One-liner |
|---|---|---|
| agent-a0a3c94586579c919 | **COMMIT-AND-PR** | Mention aggregation refactor — clean module + tests, drop-in to pipeline |
| agent-a657e2a37bdc94a07 | **COMMIT-AND-PR** | Per-source circuit breaker + health tracker — complete with tests |
| agent-a88347898ac55145e | **STASH** | Today-ideas UI collides with `quizzical-kilby` ideas rewrite; save for later |
| agent-a567d511998842ab3 | **DISCARD** | Refresh-hook refactor; equivalent already in main (dea857b) |
| agent-a6ed6582362ffd8cc | **DISCARD** | Same — collection/trending refresh hooks already in main |
| agent-aec603dd72e34dcc1 | **DISCARD** | Same — social/scraper refresh hooks already in main |
| agent-af54744349d120d16 | **DISCARD** | Merge commit's both parents are in main; uncommitted scaffold superseded by Phase 3.x worktrees |
| distracted-wescoff-d01755 | **STASH** | Terminal UI collides with active `feat/sidebar-trend-terminal`; save before reconciling |

**Plus a stale-file note:** `exciting-hertz-b22719` listed SAFE-TO-REMOVE in the disposition file is already gone from `.claude/worktrees/` — no action needed; mark the disposition file accordingly.

---

## Detailed dispositions

### 1. agent-a0a3c94586579c919 — COMMIT-AND-PR
- **Branch:** `worktree-agent-a0a3c94586579c919`. HEAD in main (ab4546e). 5 uncommitted files.
- **Reason:** Complete mention aggregation refactor — clean API exports, comprehensive test suite, integrates into `pipeline.ts` with mention-store dedup + buzz scoring.
- **Key files:** `src/lib/pipeline/aggregation/mention-aggregates.ts`, `src/lib/pipeline/storage/mention-store.ts`, `src/lib/pipeline/pipeline.ts`, `src/lib/pipeline/__tests__/mention-aggregates.test.ts`, `src/lib/pipeline/__tests__/mention-store.test.ts`
- **Conflict risk:** NONE
- **Suggested PR:** `feat(pipeline): mention aggregation + social buzz scoring (Phase 2 reader-side)`

### 2. agent-a657e2a37bdc94a07 — COMMIT-AND-PR
- **Branch:** `worktree-agent-a657e2a37bdc94a07`. HEAD in main (ab4546e). 9 uncommitted files.
- **Reason:** Per-source circuit breaker for source health monitoring — process-local in-memory tracker with clean public API, full test coverage, integrated into github-adapter.
- **Key files:** `src/lib/source-health-tracker.ts`, `src/lib/__tests__/source-health-tracker.test.ts`, `src/app/api/health/route.ts`, `src/lib/pipeline/adapters/github-adapter.ts`
- **Conflict risk:** LOW — augments existing `/api/health` route, doesn't replace it. Conceptually different from the worker `/api/worker/health` route in the Phase 3.x worktrees (one tracks per-source breaker state, the other probes worker fleet) — they coexist cleanly.
- **Suggested PR:** `feat(resilience): per-source circuit breaker + health tracker`

### 3. agent-a88347898ac55145e — STASH
- **Branch:** `worktree-agent-a88347898ac55145e`. HEAD in main (ab4546e). 16 uncommitted files (5 modified, 10 new).
- **Reason:** Token pool work is complete + tested, but today-ideas UI components depend on the `/ideas` data layer that `claude/quizzical-kilby-9a529a` fully replaces with Supabase. Land this only after the ideas rewrite ships.
- **Key files:** `src/lib/today-ideas.ts`, `src/components/ideas/IdeaDiscussion.tsx`, `src/components/ideas/IdeaVisuals.tsx`, `src/components/today/*` (6 new), `src/lib/github-token-pool.ts`
- **Conflict risk:** **HIGH** with `quizzical-kilby-9a529a` (ideas surface rewrite).
- **Suggested stash branch:** `stash/today-ideas-ui-2026-04-28`
- **Notes for later:** the token-pool diff (if it's purely additive over the live `src/lib/github-token-pool.ts`) could be cherry-picked separately as a fast PR — worth a closer look at unstash time.

### 4. agent-a567d511998842ab3 — DISCARD
- **Branch:** `worktree-agent-a567d511998842ab3`. HEAD in main (dea857b). 24 modified files.
- **Reason:** All edits are stylistic refactor of revenue/funding refresh hooks that already shipped to main with equivalent functionality. No behavioral delta.
- **Key files:** `src/lib/revenue-{benchmarks,overlays,startups}.ts`, `src/lib/funding-news.ts`, `scripts/compute-revenue-benchmarks.mjs`
- **Evidence:** Main HEAD already has `refreshRevenueBenchmarksFromStore()`, `refreshRevenueStartupsFromStore()`, `refreshFundingNewsFromStore()` wired into pages/api; worktree's `normalizeFile`/`diskSignature` helpers are stylistic.

### 5. agent-a6ed6582362ffd8cc — DISCARD
- **Branch:** `worktree-agent-a6ed6582362ffd8cc`. HEAD in main (dea857b). 23 modified files.
- **Reason:** Same pattern as #4 — refresh hooks for collection/trending/recent-repos/hot-collections already in main.
- **Key files:** `src/lib/{trending,collection-rankings,recent-repos,hot-collections}.ts`, `scripts/scrape-trending.mjs`

### 6. agent-aec603dd72e34dcc1 — DISCARD
- **Branch:** `worktree-agent-aec603dd72e34dcc1`. HEAD in main (dea857b). 31 modified files.
- **Reason:** Same pattern — social/scraper refresh hooks (Bluesky, Reddit, DevTo, HN, Lobsters, ProductHunt) already in main as `refreshBlueskyMentionsFromStore()`, `refreshRedditMentionsFromStore()`, etc.
- **Key files:** `src/lib/{bluesky,reddit-data,devto,hackernews,lobsters,producthunt}.ts`, `scripts/scrape-{bluesky,reddit}.mjs`

### 7. agent-af54744349d120d16 — DISCARD
- **Branch:** `worktree-agent-af54744349d120d16`. HEAD `c9442f4` (merge commit), parents `c3270ba` + `5974763`. 8 uncommitted files.
- **Reason:** **Verified** — both merge parents are ancestors of main; the merge commit produces no new content vs main. The 8 uncommitted edits are earlier-iteration tweaks to the same `apps/trendingrepo-worker/` fetchers (bluesky, devto, hackernews, producthunt, reddit) that the Phase 3.x worktrees already supersede with their committed versions.
- **Verification commands run:**
  ```
  git -C STARSCREENER merge-base --is-ancestor 5974763 main  → exit 0 (yes)
  git -C STARSCREENER merge-base --is-ancestor c3270ba main  → exit 0 (yes)
  git -C STARSCREENER merge-base --is-ancestor c9442f4 main  → exit 1 (merge bookkeeping only)
  ```
- **Conflict risk:** NONE (content already in main; worker-scaffold edits superseded by Phase 3.x).

### 8. distracted-wescoff-d01755 — STASH
- **Branch:** `claude/distracted-wescoff-d01755`. HEAD in main (d28de5e). 8 uncommitted files.
- **Reason:** Terminal UI refactor (FilterBar, MetasBar, StatsBar, globals.css, page.tsx) directly overlaps the **current active branch** `feat/sidebar-trend-terminal`. Same 8 files, different diffs — must reconcile before either lands. Saving the diff lets you compare approaches when finalizing the active branch.
- **Key files:** `src/components/terminal/{FilterBar,MetasBar,StatsBarClient}.tsx`, `src/app/globals.css`, `src/app/page.tsx`
- **Conflict risk:** **HIGH** with `feat/sidebar-trend-terminal` (active branch).
- **Suggested stash branch:** `backup/distracted-wescoff-ui-refactor-2026-04-28`

---

## Aggregate effect

If you approve as-recommended:

| Action | Count | Disk freed (approx) |
|---|---:|---|
| Open PRs | 2 | — |
| Stash + remove worktrees | 2 | ~657 MiB (614 + 43) |
| Discard + remove worktrees | 4 | ~373 MiB (44 + 44 + 45 + 241) |
| Already gone | 1 (exciting-hertz) | already recovered |
| **Total worktrees resolved** | **8** | **~1.0 GiB recovered** |

After this, the only worktrees remaining will be the 4 named-feature ones from the audit (a8a7ee9 / a5b609b / a11da8e / quizzical-kilby), which the audit's §6 merge order tells you how to ship.

---

## Suggested execution order (when you approve)

1. **Stashes first** (cheap, reversible): `git -C <wt> stash push -m "stash/<name>-2026-04-28"` → push the stash refs to origin, then `git worktree remove`. Do this for a88347898 and distracted-wescoff before anyone touches `feat/sidebar-trend-terminal` or the queued ideas merge.
2. **Discards next**: `git worktree remove <path>` then `git branch -D <branch>` for the 4 DISCARDs (a567, a6ed, aec, af54744).
3. **Open the 2 PRs last** (a0a3 mention-aggregation + a657 source-health-tracker) — they're additive and won't collide with the named-feature merges.
4. Then start the audit's §6 merge sequence (worktree-2 → 1 → 3 → 4) for the queued features.

---

## Results — executed 2026-04-28

### Stashes (preserved on origin, worktrees removed)
| Worktree | Origin branch | Commit | Files |
|---|---|---|---|
| agent-a88347898ac55145e | `stash/today-ideas-ui-2026-04-28` | `1d5feee` | 21 (today-ideas + token-pool + tests + .mcp.json) |
| distracted-wescoff-d01755 | `backup/terminal-ui-refactor-2026-04-28` | `de64c3b` | 8 (terminal UI overlap with feat/sidebar-trend-terminal) |

### Discards (worktrees + branches removed; no origin push)
- agent-a567d511998842ab3 — branch `worktree-agent-a567d511998842ab3` deleted, dir removed
- agent-a6ed6582362ffd8cc — branch `worktree-agent-a6ed6582362ffd8cc` deleted, dir removed
- agent-aec603dd72e34dcc1 — branch `worktree-agent-aec603dd72e34dcc1` deleted, dir removed
- agent-af54744349d120d16 — branch `worktree-agent-af54744349d120d16` deleted, dir removed via long-path PowerShell (Windows path-length issue on git's rmdir)

### PRs opened (worktrees retained for iteration)
| Worktree | Branch | Commit | PR |
|---|---|---|---|
| agent-a0a3c94586579c919 | `feat/mention-aggregation` | `8c37f06` | https://github.com/0motionguy/starscreener/pull/17 |
| agent-a657e2a37bdc94a07 | `feat/source-health-tracker` | `7fb3df4` | https://github.com/0motionguy/starscreener/pull/18 |

### exciting-hertz-b22719
Already removed before this session — disposition file row was stale.

### Remaining worktrees on disk
The 4 named-feature worktrees + 2 newly-PR'd:
- agent-a0a3c94586579c919 (PR #17) — remove after merge
- agent-a657e2a37bdc94a07 (PR #18) — remove after merge
- agent-a11da8e0110929e99 (Phase 3.4 funding — audit §6)
- agent-a5b609bc139d02c8e (Phase 3.3 events — audit §6)
- agent-a8a7ee90307f940b2 (Phase 3.1 scoring — audit §6)
- quizzical-kilby-9a529a (Supabase ideas — already PR #7)

### Restoration commands (if you ever want a stash back)
```
git fetch origin stash/today-ideas-ui-2026-04-28
git worktree add .claude/worktrees/today-ideas-ui origin/stash/today-ideas-ui-2026-04-28

git fetch origin backup/terminal-ui-refactor-2026-04-28
git worktree add .claude/worktrees/terminal-ui-backup origin/backup/terminal-ui-refactor-2026-04-28
```
