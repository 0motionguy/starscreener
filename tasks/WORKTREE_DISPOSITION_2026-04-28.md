# Worktree Disposition Report — 2026-04-28

## TL;DR Summary
- **HOLD-AND-COMMIT: 6 worktrees** (3 Phase 3.x features + builder + scorer + merge-wip)
- **HOLD-FOR-REVIEW: 6 worktrees** (various experimental/scratch work; heads already merged to main)
- **SAFE-TO-REMOVE: 1 worktree** (exciting-hertz-b22719; clean and merged)

**Total disk footprint:** ~3.7 GiB across all 13 worktrees. Potential recovery on safe+discretionary removals: ~2.7 GiB.

---

## Per-Worktree Disposition

### 1. agent-a0a3c94586579c919
- **Status:** HOLD-FOR-REVIEW
- **Branch:** `worktree-agent-a0a3c94586579c919`
- **HEAD in main:** YES (ab4546e)
- **Uncommitted:** 5 files
- **Recent work:** Data-API Redis support (ioredis) from 2026-04-26
- **Uncommitted content:** Mention aggregation refactor (`src/lib/pipeline/aggregation/`, `src/lib/pipeline/storage/mention-store.ts`, 3 test files)
- **Recommendation:** Review the mention-store work; likely exploratory. Safe to discard or stash if not critical.

---

### 2. agent-a11da8e0110929e99 ⚠ PHASE 3.4 FEATURE
- **Status:** HOLD-AND-COMMIT
- **Branch:** `worktree-agent-a11da8e0110929e99`
- **HEAD in main:** NO (38a7c43)
- **Unique commits:** 1 (feat(funding): Phase 3.4 — Crunchbase RSS + X funding hashtag sources)
- **Uncommitted:** 66 files in `apps/trendingrepo-worker/`
- **Scope:** Complete trendingrepo-worker microservice with 35+ fetchers (Crunchbase, X-funding, plus MCP sources: mcp-registry-official, mcp-servers-repo, mcp-so, pulsemcp, claude-skills, lobehub-skills, skills-sh, skillsmp, etc.)
- **Recent work:** Committed 2026-04-26 20:09:46+0800
- **Disk size:** 269 MiB
- **Recommendation:** This is a standalone Phase 3.4 feature. Create real branch and commit before deletion.

---

### 3. agent-a567d511998842ab3
- **Status:** HOLD-FOR-REVIEW
- **Branch:** `worktree-agent-a567d511998842ab3`
- **HEAD in main:** YES (dea857b)
- **Uncommitted:** 24 files (all modified, no new directories)
- **Recent work:** Cron throttling + data refresh from 2026-04-26
- **Uncommitted content:** Scripts + API routes for revenue/funding pipelines
- **Disk size:** 44 MiB
- **Recommendation:** Looks like incomplete feature experimentation. Review and decide if worth committing or discarding.

---

### 4. agent-a5b609bc139d02c8e ⚠ PHASE 3.3 FEATURE
- **Status:** HOLD-AND-COMMIT
- **Branch:** `worktree-agent-a5b609bc139d02c8e`
- **HEAD in main:** NO (67a5a7c)
- **Unique commits:** 1 (feat(events): Phase 3.3 — GitHub events firehose for top-50 watchlist)
- **Uncommitted:** 73 files (~66 in `apps/trendingrepo-worker/`, 4 modified API/config files)
- **Disk size:** 794 MiB (largest Phase 3.x worktree)
- **Scope:** Trendingrepo-worker with github-events fetcher + 35+ other fetchers, plus GitHub workflow file
- **Recent work:** Committed 2026-04-26 20:18:43+0800
- **Recommendation:** This is Phase 3.3 work on GitHub events. Needs proper commit/branch before cleanup.

---

### 5. agent-a657e2a37bdc94a07
- **Status:** HOLD-FOR-REVIEW
- **Branch:** `worktree-agent-a657e2a37bdc94a07`
- **HEAD in main:** YES (ab4546e)
- **Uncommitted:** 9 files
- **Recent work:** Data-API Redis support from 2026-04-26
- **Uncommitted content:** Source health tracker (`src/lib/source-health-tracker.ts`, test file, API route)
- **Disk size:** 43 MiB
- **Recommendation:** Exploratory work on monitoring. Review if incomplete or should be discarded.

---

### 6. agent-a6ed6582362ffd8cc
- **Status:** HOLD-FOR-REVIEW
- **Branch:** `worktree-agent-a6ed6582362ffd8cc`
- **HEAD in main:** YES (dea857b)
- **Uncommitted:** 23 files (all modified scripts + API routes)
- **Recent work:** Cron throttling from 2026-04-26
- **Uncommitted content:** Collection/comparison/export API routes, scripts for trends/discovery/profiling
- **Disk size:** 44 MiB
- **Recommendation:** Various API endpoint refactors and data scripts. Determine if coherent feature or just cleanup.

---

### 7. agent-a88347898ac55145e
- **Status:** HOLD-FOR-REVIEW
- **Branch:** `worktree-agent-a88347898ac55145e`
- **HEAD in main:** YES (ab4546e)
- **Uncommitted:** 16 files (5 modified, 10 new)
- **Recent work:** Data-API Redis support from 2026-04-26
- **Uncommitted content:** GitHub token pool + today-ideas feature, MCP config, UI components for ideas discussion/visuals
- **Disk size:** 43 MiB
- **Recommendation:** Exploratory work on ideas feature. Check if ready to commit or should be abandoned.

---

### 8. agent-a8a7ee90307f940b2 ⚠ PHASE 3.1 FEATURE
- **Status:** HOLD-AND-COMMIT
- **Branch:** `worktree-agent-a8a7ee90307f940b2`
- **HEAD in main:** NO (89d7b7b)
- **Unique commits:** 1 (feat(scoring): Phase 3.1 — engagement composite scoring)
- **Uncommitted:** 67 files in `apps/trendingrepo-worker/`
- **Disk size:** 270 MiB
- **Scope:** Trendingrepo-worker with engagement-composite fetcher + 35+ other fetchers
- **Recent work:** Committed 2026-04-26 20:15:27+0800
- **Recommendation:** This is Phase 3.1 work on engagement scoring. Needs proper commit/branch before cleanup.

---

### 9. agent-aec603dd72e34dcc1
- **Status:** HOLD-FOR-REVIEW
- **Branch:** `worktree-agent-aec603dd72e34dcc1`
- **HEAD in main:** YES (dea857b)
- **Uncommitted:** 31 files (all modified; scrapers + UI pages)
- **Recent work:** Cron throttling from 2026-04-26
- **Uncommitted content:** Scrapers (Bluesky, Dev.to, HackerNews, Lobsters, ProductHunt, Reddit, etc.) + multiple trending/social pages
- **Disk size:** 45 MiB
- **Recommendation:** Looks like refactor of scrapers and page UI. Determine if coherent feature or just cleanup.

---

### 10. agent-af54744349d120d16
- **Status:** HOLD-AND-COMMIT (or DISCARD)
- **Branch:** `worktree-agent-af54744349d120d16`
- **HEAD in main:** NO (c9442f4 — merge commit)
- **Unique commits:** 1 (Merge commit into worktree branch)
- **Uncommitted:** 8 files (5 modified fetchers, 3 new directories)
- **Disk size:** 241 MiB
- **Recent work:** Merge and fix from 2026-04-26 18:19:37+0800
- **Recommendation:** Incomplete merge or partial feature branch. Either complete/commit or discard.

---

### 11. distracted-wescoff-d01755
- **Status:** HOLD-FOR-REVIEW
- **Branch:** `claude/distracted-wescoff-d01755`
- **HEAD in main:** YES (d28de5e)
- **Uncommitted:** 8 files (all modified; terminal/stats UI)
- **Recent work:** Session summary + Phase 3 consolidation plan from 2026-04-26
- **Uncommitted content:** Terminal UI updates (FilterBar, MetasBar, StatsBar, TerminalLayout), globals.css
- **Disk size:** 614 MiB
- **Recommendation:** Focused UI/layout work. Decide if should be committed as UI polish PR or discarded.

---

### 12. exciting-hertz-b22719 ✅ SAFE-TO-REMOVE
- **Status:** SAFE-TO-REMOVE
- **Branch:** `claude/exciting-hertz-b22719`
- **HEAD in main:** YES (f76784b)
- **Uncommitted:** 0 files (clean working tree)
- **Recent work:** Vercel redirects + AI tagging + hardened API from 2026-04-17
- **Disk size:** 50 MiB
- **Recommendation:** Completely clean and HEAD is merged into main. Safe to delete immediately.

---

### 13. quizzical-kilby-9a529a
- **Status:** HOLD-AND-COMMIT
- **Branch:** `claude/quizzical-kilby-9a529a`
- **HEAD in main:** NO (280679e)
- **Unique commits:** 1 (feat(builder): ideas + reactions + predictions layer on Supabase)
- **Uncommitted:** 0 files (clean; all work committed)
- **Disk size:** 1018 MiB (largest worktree)
- **Recent work:** Committed 2026-04-24 10:27:21+0800
- **Recommendation:** Complete, committed feature (Supabase ideas/reactions/predictions). Ready for PR/review. Branch not merged into main yet.

---

## Phase 3.x Consolidation Analysis

The three Phase 3 worktrees (3.1 scoring, 3.3 events, 3.4 funding) contain near-identical scaffolds of `apps/trendingrepo-worker/` with the same core structure but divergent feature work:

| Aspect | Phase 3.1 (agent-a8a7ee90307f940b2) | Phase 3.3 (agent-a5b609bc139d02c8e) | Phase 3.4 (agent-a11da8e0110929e99) |
|--------|-------|-------|-------|
| Unique fetcher | engagement-composite/ | github-events/ | crunchbase/, x-funding/ |
| File count (uncommitted) | 67 | 73 | 66 |
| Disk size | 270 MiB | 794 MiB | 269 MiB |
| Status | Committed (89d7b7b) | Committed (67a5a7c) | Committed (38a7c43) |
| MCP sources present | YES (8 fetchers) | YES (8 fetchers) | YES (8 fetchers) |

### Consolidation Recommendation

**DO NOT consolidate yet.** These are three separate feature branches that all share the same monorepo migration pattern. Each is a distinct feature on top of a shared base (trendingrepo-worker microservice). Instead:

1. **Merge Phase 3.1 (scoring) first** → Main PR priority (simplest: just adds engagement-composite fetcher)
2. **Then Phase 3.3 (events)** → Adds github-events firehose
3. **Then Phase 3.4 (funding)** → Adds Crunchbase + X funding sources

After all three are merged into main, the monorepo structure becomes canonical and you can consolidate any remaining duplicate code if needed.

---

## Disk Recovery Estimate

| Category | Worktrees | Total Size | Safe? |
|----------|-----------|-----------|-------|
| Safe to remove | exciting-hertz-b22719 | 50 MiB | YES |
| Hold-and-commit (after push) | 6 worktrees | ~1.8 GiB | Keep until PR merged |
| Hold-for-review (likely discard) | 6 worktrees | ~0.9 GiB | Review first, then OK |

**Immediate recovery:** 50 MiB (exciting-hertz-b22719)
**After feature branch PRs merged:** +1.8 GiB (Phase 3.x + builder + af54744)
**After review/discard of scratch:** +0.9 GiB (various exploratory)

**Total potential recovery:** ~2.7 GiB out of 3.7 GiB

---

## Summary of Actions

**For HOLD-AND-COMMIT worktrees (6 total):**
- Create real branches and push to origin
- Create PRs for review/merge
- Once merged into main, remove worktrees

**For HOLD-FOR-REVIEW worktrees (6 total):**
- Review each one carefully
- Decide commit (create PR) or discard (remove worktree)
- Safe to remove once decision made

**For SAFE-TO-REMOVE (1 total):**
- Delete immediately: `git worktree remove ...`

