# Handover — Audit Wave 1 complete, Wave 2+ outstanding

**Date:** 2026-05-16
**Session:** Audit + pre-mortem + WIP cleanup + Wave 1 bug fixes
**Branch:** all work landed on `audit/imp-wave-1`
**Operator constraint that held:** no pushes to `main` without explicit per-push approval

---

> ⚠️ **Doc-vapor notice (2026-05-16 triage):** the 6 audit/pre-mortem files referenced in this section below were **never written to disk** — neither on this branch nor on `audit/imp-wave-1`. They were planned but not committed. Until they're regenerated, treat the inline content of THIS handover doc (Wave 2 PR plan §"Outstanding work", false-positives §"NEVER", Wave 3 simplification table) and the master plan at `~/.claude/plans/vivid-moseying-treasure.md` as the authoritative substitutes. Do NOT search for the listed `.md` files — they don't exist.

## TL;DR — what to read first if you're picking up

1. This file (you're here).
2. ~~`docs/audits/DEAD-CODE-2026-05-16.md`~~ **(NOT WRITTEN)** — 33 files / ~9,150 LOC removable, PR plan included; scope inlined in §"Wave 2" below
3. ~~`docs/audits/SIMPLIFY-2026-05-16.md`~~ **(NOT WRITTEN)** — ~1,400 net LOC simplification opportunities; scope inlined in §"Wave 3" below
4. ~~`docs/audits/ENGINE-TOOLBOX-MIGRATION-2026-05-16.md`~~ **(NOT WRITTEN)** — 6-9 week migration map, blocked on the worker-home decision; see §"Wave 5"
5. ~~`docs/audits/TRACK-A-STATUS-2026-05-16.md`~~ **(NOT WRITTEN)** — A1-A11 ship status; see [2026-05-16-wave-1-handover.md](2026-05-16-wave-1-handover.md) Track A table
6. ~~`docs/PRE-MORTEM-2026-05-16.md`~~ **(NOT WRITTEN)** — wave 1 fragilities; themes summarized in §"Wave 6" below
7. ~~`docs/PRE-MORTEM-2026-05-16-wave-2.md`~~ **(NOT WRITTEN)** — wave 2 fragilities + 6 current bugs; only `crewAI` dup (§"Real current bug NOT yet fixed") is concretely identified

---

## What just shipped (15 commits on `audit/imp-wave-1`)

All commits surgical, descriptive, with cross-references back to audit/pre-mortem reports. Verified by `npm run typecheck && npm run lint:guards && npm run test:hooks` — all green.

### WIP cleanup (8 commits, ~5,200 LOC of prior-session work made reviewable)

| SHA | Subject |
|---|---|
| `bf1b24ba6` | `harden(worker)`: explicit 20s timeouts on 16 fetchers |
| `6226c1aa3` | `harden(api)`: withBodySizeLimit + Zod on 18 routes |
| `f3bf9da4e` | `feat(toolbox)`: dual-write HN + Reddit mentions |
| `3ab988fa6` | `feat(alerts)`: ownership-scoped updateAlertRule + hook |
| `fd737b8a2` | `feat(tier-list)`: hasTierListUrlState helper |
| `0dd44ff55` | *(parallel session)* `audit(wave-1)`: SEO + tier-list + search |
| `8639b70d5` | `fix(api-helpers)`: paired follow-up to harden(api) (compile-fix) |
| `a7d1bf70d` | `build(docker)`: Dockerfile + .dockerignore |
| `9063213c5` | `docs`: pre-mortems + 5 audits + handoffs (4,117 LOC of docs) |

### Bug fixes (6 commits)

| SHA | Severity | Subject |
|---|---|---|
| `0f072bf5f` | 🔴 Critical | `fix(pipeline)`: classify before scoring in recomputeAllInner — **category-weight overrides had been silently inactive on the batch path** |
| `9020fd55b` | 🟠 Medium | `fix(ingestion)`: unify snapshot.id format with ingest.ts (include source) |
| `df4e7145b` | 🟠 Low-Med | `fix(alerts)`: enforce validateRule at createRule boundary |
| `97b888ef6` | 🟡 Medium | `fix(alerts)`: treat undefined previousScore as "can't prove transition" |
| `574535e6d` | 🟡 High | `fix(alerts)`: UUID-based event id suffix (cross-process safe) |
| `62a370132` | 🟡 High | `fix(research)`: break-words + min-w-0 on arXiv title link (375px overflow) |

---

## Active branch state (READ BEFORE TOUCHING)

- **`audit/imp-wave-1`**: 15 commits ahead of main as of this writing. Verified green.
- **`feat/repolink-batch-3a`**: A parallel session is using this branch in the same working directory. They have uncommitted edits to `src/app/page.tsx`. Do NOT switch branches without stashing their WIP first (`git stash push -m "wip(parallel)" -- src/app/page.tsx`).
- **At least 2 other Claude/agent sessions running in parallel** — when their work converges, all three branches must be reconciled before opening the PR to main.

---

## Operator decisions that block downstream work

These are NOT code tasks. The operator (Mirko) has to make these calls before specific work streams can proceed.

### 1. `apps/trendingrepo-worker/` long-term home (blocks Engine→TOOLBOX Categories C/D/E)

Three forced choices (per `docs/audits/ENGINE-TOOLBOX-MIGRATION-2026-05-16.md`):
- **Keep on Railway** as permanent sister service (status-quo, low risk — agent's recommended baseline)
- **Migrate fully into TOOLBOX** (4-6 weeks mechanical port, one-way door)
- **Kill it entirely** (very high cost, requires Category E onboarding into TOOLBOX)

Until this is called, ~20 worker-only data slugs have no migration home and Phase 3 of the TOOLBOX migration cannot be planned.

### 2. TOOLBOX adapter PRs #1214 and #1216 merge

Phase A.2 of the TOOLBOX read-path migration is blocked on these. Until merged:
- HF×3 + ProductHunt + arxiv + claude-rss + lobsters-trending + npm-dependents stay on legacy collector path
- 7 of the ~50 slug migrations can't even start

### 3. Pre-migration data outages must be fixed before flag flips

If you flip TOOLBOX flags before fixing these, the 24h parity gate looks green while users see broken data:
- **B1**: Reddit collector writes zero engagement (3,768 posts all `score=0`). Fix path: `REDDIT_COLLECTOR_PROVIDER=apify` env var in production (operator must set — Reddit OAuth blocked from operator geo).
- **B6**: Twitter collector stale on 386/402 repos (>72h old). Fix path: verify `APIFY_API_TOKEN` valid + trigger `collect-twitter.yml` manually.

### 4. Clerk webhook configuration

Per `~/.claude/projects/c--dev-trendingrepo/memory/project_clerk_webhook_unconfigured.md`: Clerk → trendingrepo webhook NOT set in Clerk Dashboard. Backend-API signup doesn't populate `tr.profiles`. Operator-only fix in Clerk dashboard, then verify with a test signup.

### 5. Clerk Best-Practices ceiling

Three options:
- Lazy-load Clerk
- CNAME to first-party
- Accept 73-77 BP score

Decision blocks Lighthouse perf baseline restoration (D4).

### 6. searchParams URL strategy per route (D1)

9 routes force-dynamic from server-side searchParams reads. Operator picks strategy per route: path-based / client-side / feature-drop. Then ship one canary per strategy.

### 7. OG card editorial direction

Bloomberg/Blockworks tear-sheet design direction needs operator call before OG work continues.

### 8. /repo/* visual hero reorganization

Demote raw signal table to a tab? Preview-review-gated.

---

## Outstanding work, prioritized

### Wave 2 — Dead code drops (~10,300 LOC, low risk, this week)

**Source:** ~~`docs/audits/DEAD-CODE-2026-05-16.md`~~ (NOT WRITTEN; scope inlined below)

Four independently revertable PRs per the report's PR plan:

| PR | Path | LOC | Risk | Notes |
|---|---|---:|---|---|
| PR-A | `src/components/reddit-trending/*` (7 files) + `src/lib/treemap.ts` + `src/lib/reddit-topics.ts` | ~3,224 | Low | Closed graph with no consumer. Page imports `AllTrendingTabs` which only dynamic-loads `PostListPanel` + `SubredditGroupPanel`. |
| PR-B | `src/components/news/NewsTopHeaderV3.tsx` | 1,143 | Low | Single file, zero importers. Only string-match is a Playwright test description. |
| PR-C | `src/components/watchlist/{AlertConfig,WatchlistManager}.tsx` | 1,088 | Low | `/watchlist/page.tsx` was rewritten inline; remaining "imports" are doc/comment ghosts. |
| PR-D | `src/components/agent-commerce/agent-commerce.css` | 995 | Low | Legacy styles only referenced by a CSS comment. |

**False positives to NEVER delete** (originally per the dead-code report; reproduced here since report wasn't written):
- `src/lib/empty-module.js` (next.config.ts Turbopack alias)
- `mcp/src/*` (published npm package entry points)
- `apps/trendingrepo-worker/**` (sister Railway service)
- All `*.stories.tsx`, `__test`, `_resetXForTests`, Next.js route exports

### Wave 3 — Simplification slam dunks (~1,400 net LOC, this week)

**Source:** ~~`docs/audits/SIMPLIFY-2026-05-16.md`~~ (NOT WRITTEN; scope inlined below)

Top opportunities:

| Action | Files | LOC delta |
|---|---|---|
| Delete `pipeline.evaluateAlerts` + `evaluateAlertsNow` | `src/lib/pipeline/pipeline.ts:709-736` | -70 LOC (kills dead code AND wave-2 pre-mortem #2 fragility in one cut) |
| Drop `TwitterSignalBuilder` namespace object | `src/lib/twitter/builder.ts:46` + `index.ts:3` | -74 LOC |
| Kill `ensureSeeded` + `withSeed` HOF | `src/lib/pipeline/pipeline.ts` | -50 LOC (comment literally says it's a no-op, 14 wrapper call sites) |
| De-dupe `buildTwitterInventoryStats` / `buildRedditInventoryStats` | `src/components/ui/InventoryBand.tsx` vs `inventory-stats.ts` | -~80 LOC |
| De-dupe `VerdictRibbon` | `src/components/consensus/DailyVerdictPanel.tsx:78` vs `src/components/ui/VerdictRibbon.tsx` | -~50 LOC |

### Wave 4 — Track A finish-line (~4h, next session)

**Source:** ~~`docs/audits/TRACK-A-STATUS-2026-05-16.md`~~ (NOT WRITTEN; see `docs/handoffs/2026-05-16-wave-1-handover.md` Track A table)

Remaining pending items (4 shipped, 3 partial, 5 pending). Quick wins first:
- **A1.1** — Remove Collections nav row from `src/components/layout/SidebarContent.tsx` (1-line)
- **A2** — Remove SCORE column from `src/app/twitter/page.tsx` (~10 LOC)
- **A9** — Verify freshness hiding is fully landed (check `NEXT_PUBLIC_HIDE_FRESHNESS_BADGES` flag handling)
- **A11** — `docs/IMAGE-SYSTEM-2026-05-15.md` + monogram-fallback `src/app/api/logo/[seed]/route.tsx`

Bigger:
- **A5** — RepoHoverCard rollout across ~20 call sites (~120 min)
- **A7** — DropRepoPage upgrade per mockup (DropRepoCategoryPicker, DropRepoTagChips, DropRepoSubmissionFunnel, DropRepoQueueWidget)
- **A8** — Agent Commerce workover (impeccable + design-pass pass)

### Wave 5 — Engine→TOOLBOX migration (6-9 weeks, gated)

**Source:** ~~`docs/audits/ENGINE-TOOLBOX-MIGRATION-2026-05-16.md`~~ (NOT WRITTEN; phases summarized below)

Phases (each gated on the prior):
- **Phase 0** (1 week elapsed, 0.5 engineer-weeks): merge PRs #1214 + #1216
- **Phase 1** (2-3 weeks): flag-on rollout of A+B categories (13 slugs total)
- **Phase 2** (2-3 weeks): schema extend TOOLBOX for Category D (3 slugs)
- **Phase 3** (4-7 weeks): Category E worker-only fetchers — DEPENDS ON OPERATOR DECISION ON WORKER HOME
- **Phase 4** (1 week): eliminate file mirror for hot data — kill `data/*.json` commits

### Wave 6 — Pre-mortem hardening (multi-PR, time-permitting)

**Sources:** ~~`docs/PRE-MORTEM-2026-05-16.md`~~ and ~~`docs/PRE-MORTEM-2026-05-16-wave-2.md`~~ (both NOT WRITTEN; themes summarized below)

These are FUTURE regressions — not current bugs. Address as each module is touched for other reasons. High-value patterns to fix proactively:

- **Theme A (wave 1)**: Convert comment-encoded contracts into typecheck-enforced brands, runtime assertions, or regression tests. Five post-mortems collapse to this single fix.
- **Theme C (wave 1)**: Uniform `safelyDispatch(fn, scope)` helper for fire-and-forget. Fixes pre-mortem #7 directly, makes #6 and #12 auditable.
- **Theme D (wave 2)**: Derive runtime constant lists from type-level unions (`COMPONENT_KEYS = Object.keys(DEFAULT_WEIGHTS)`, etc.). Fixes pre-mortems #1, #9, current bug A.
- **Theme E (wave 2)**: Per-key locking for `evaluateAllRules`, `processOneRuleEvent`, ingest mutex priority lane.
- **Theme F (wave 2)**: Extract magic thresholds to named constants in the module that owns the meaning, not the consumer.

### Wave 7 — Bug B (deferred from wave 1)

**Source:** ~~`docs/PRE-MORTEM-2026-05-16-wave-2.md`~~ current bug B (doc NOT WRITTEN; bug scope below is canonical)

`mergePreserving`'s `categoryId !== "other"` shortcut can't distinguish "never classified" from "classified-as-other." Proper fix: consult `categoryStore` OR add a `classifiedAt` field on `Repo` so the merge can detect "classification ran and concluded other" vs "no classifier verdict yet." Worth its own PR with tests.

### Wave 8 — Track B recovered backlog (operator-blocked)

See `docs/handoffs/HANDOVER-...vivid-moseying-treasure.md` plan, Track B. Most items are env-var/webhook/workflow-trigger operator work, not code.

### Wave 9 — Track C-G operator decisions

See plan Track C (TOOLBOX read-path), Track D (perf+mobile), Track E (hardening), Track F (AISO cross-product), Track G (decision-required).

---

## Constraints (HARD)

### NEVER

- NEVER push to `main` without explicit per-push approval. Memory: `feedback_no_push_without_approval.md`.
- NEVER `git add .` or `git add -A`. Stage exact files only (xargs from `/tmp/<list>.txt` is fine).
- NEVER touch: `audit/imp-wave-1` outside this session's scope, `chore/vps-docker-deploy`, PRs #1214/#1216, any GHA `scrape-*.yml` before its TOOLBOX read-path is parity-verified live.
- NEVER mock Redis/database in scoring-logic tests.
- NEVER `git reset --hard`, `git push --force`, `git checkout --` without explicit user approval.
- NEVER skip git hooks (`--no-verify`).
- NEVER edit `apps/trendingrepo-worker/**` files outside narrow hardening work (sister Railway service).
- NEVER delete files in the "false positives" list inlined in §"Wave 2" below (originally was to live in `docs/audits/DEAD-CODE-2026-05-16.md`, which was never written).

### ALWAYS

- ALWAYS read this file first.
- ALWAYS check `git status --short | wc -l` at session start — if >5 modifications, sample what's modified before any new edit (other sessions may have uncommitted WIP).
- ALWAYS check `git branch --show-current` after long operations — parallel sessions may switch the branch out from under you.
- ALWAYS run `npm run typecheck && npm run lint:guards && npm run test:hooks` before claiming a fix is shipped.
- ALWAYS group related changes into thematic commits (one concept per commit). Surgical changes per K3.
- ALWAYS cross-reference the relevant audit/pre-mortem doc in commit messages so future sessions can trace the rationale.

---

## Real current bug NOT yet fixed (flag from wave 1 read)

**`src/lib/tier-list/templates.ts`** lines 28 and 35 both reference crewAI:
- Line 28: `"crewAIInc/crewAI"`
- Line 35: `"joaomdmoura/crewAI"` (the old org name before crewAI moved)

Same project, two ids. The editor's `addToPool` dedupes by exact `fullName` match only, so a user picking the "AI Agent Frameworks" template gets the same project twice in their pool. Low severity but a real correctness issue. Drop one of them (recommend keeping `crewAIInc/crewAI` — current org).

---

## Files claimed by this session (avoid duplicate edits if a parallel session is also in here)

These already have my fixes — adjacent edits should not revert them:

- `src/lib/pipeline/pipeline.ts:427-432` (Bug A phase-order swap)
- `src/lib/pipeline/ingestion/snapshotter.ts:36-42` (Bug E snapshot.id)
- `src/lib/pipeline/alerts/rule-management.ts:53-78` (Bug F validateRule wiring)
- `src/lib/pipeline/alerts/triggers.ts:166-181` (Bug C undefined-previousScore)
- `src/lib/pipeline/alerts/engine.ts:70-96` (Bug D UUID event id suffix)
- `src/app/research/page.tsx:164-165` (A4 break-words)

---

## How the merge to main should work (when all 3 sessions converge)

1. Each session keeps their commits clean and focused (this session already complies).
2. Branch protection on `main` stays.
3. Rebase smaller-diff sessions onto `audit/imp-wave-1` first, larger last.
4. Resolve any `pipeline.ts` / `alerts/*` conflicts manually — the WIP separation done this session makes diffs trivial to follow.
5. Once `audit/imp-wave-1` is green (`npm run typecheck && npm run lint:guards && npm run test:hooks` ALL pass), open ONE PR to main with the consolidated changeset.
6. Operator reviews + approves push to prod.
7. Vercel auto-deploys on main per usual.

---

# HANDOVER PROMPT (paste this into the next session)

````
I'm resuming work on trendingrepo at c:\dev\trendingrepo. The prior session
finished Wave 1 of a multi-wave audit + fix program and left me a handover
doc. Read these in order before any other action:

1. docs/handoffs/HANDOVER-2026-05-16-wave-1-complete.md (this is the master)
2. docs/audits/DEAD-CODE-2026-05-16.md
3. docs/audits/SIMPLIFY-2026-05-16.md
4. docs/audits/ENGINE-TOOLBOX-MIGRATION-2026-05-16.md
5. docs/audits/TRACK-A-STATUS-2026-05-16.md
6. docs/PRE-MORTEM-2026-05-16.md (wave 1)
7. docs/PRE-MORTEM-2026-05-16-wave-2.md (wave 2 + 6 current bugs)

Hard constraints that DO NOT change:
- No push to main without per-push approval.
- No `git add .` or `-A`. Stage exact files only.
- No touching audit/imp-wave-1 outside its session's scope, chore/vps-docker-deploy,
  PRs #1214/#1216, or GHA scrape-*.yml workflows before parity-verified.
- No mocking Redis/database in scoring tests.
- No editing apps/trendingrepo-worker/** outside narrow hardening.
- No deleting files in the dead-code report's "false positives" list.

Before starting any work:
- git branch --show-current (parallel sessions may have switched the branch)
- git status --short | wc -l (>5 modifications = sample WIP first)

Wave 1 already shipped 15 commits on audit/imp-wave-1, verified green
(typecheck + lint:guards + test:hooks all pass). 16th commit if you count
the parallel session's audit(wave-1) merge.

Tell me which wave you want to start on:

  Wave 2: dead-code drops      (~10,300 LOC, 4 PRs, low risk)
  Wave 3: simplification       (~1,400 net LOC, 5 quick wins)
  Wave 4: Track A finish-line  (~4h, mostly UI)
  Wave 5: Engine→TOOLBOX       (6-9 weeks, BLOCKED on worker-home decision)
  Wave 6: pre-mortem hardening (proactive, multi-PR)
  Wave 7: Bug B deferred fix   (mergePreserving categoryId)
  Wave 8: Track B operator-blocked items
  Wave 9: Track C-G operator-decision items
  Or:    flag a specific operator decision (see handover §Operator decisions)

When you start a wave, propose a phased commit plan (per CLAUDE.md K1: think
before coding, K3: surgical changes), wait for "GO", then ship. Verify after
each wave with npm run typecheck && npm run lint:guards && npm run test:hooks.
````
