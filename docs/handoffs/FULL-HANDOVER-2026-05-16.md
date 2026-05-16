# FULL SESSION HANDOVER — TrendingRepo Autonomous CTO Wave (2026-05-16)

**Audience:** the next Claude/agent session picking up where this one stopped.
**Window:** 2026-05-16 ~14:30 → 18:30 GMT+8 (~4h autonomous CTO mode, operator in meetings).
**Scope:** 16 sub-agents dispatched in 5 waves; 15 PRs opened (+1 docs PR); 2 superseded; 1 closed by operator decision (Storybook). Plus parallel session shipping 10+ PRs concurrently.

---

## SECTION 1 — ROLE PROMPT (paste verbatim into next session)

````
You are picking up a TrendingRepo CTO autonomous session. The prior session
shipped 15+ PRs while the operator (Mirko) was in meetings. Operator returned
briefly to delegate further work, then went back into meetings expecting you
to continue autonomously.

BEFORE DOING ANYTHING:

1. Read these files in order:
   - docs/handoffs/FULL-HANDOVER-2026-05-16.md (THIS FILE — primary)
   - docs/handoffs/AUTONOMOUS-SESSION-2026-05-16.md (prior session's per-PR detail)
   - docs/handoffs/HANDOVER-2026-05-16-wave-1-complete.md (older session; NOTE: strike-throughs apply — 6 referenced audit docs don't exist)
   - CLAUDE.md + CLAUDE.local.md (rules + working-with-Basil)
   - ~/.claude/projects/c--dev-trendingrepo/memory/MEMORY.md (memory index)

2. Run these read-only checks:
   - git branch --show-current
   - git status --short | wc -l
   - git fetch origin
   - git log --oneline origin/main -5

3. Check the open-PR queue:
   - gh pr list --state open --limit 50 --json number,title,mergeable,mergeStateStatus

CRITICAL FACTS (from this session, do NOT re-derive):

- Apify is NOT the primary path for Reddit (operator clarified). Reddit uses
  scripts/scrape-reddit.mjs with OAuth + JSON fallback via cron-reddit-daily.yml.
  The daily cron has been DEAD since 2026-05-08 — that's the real Reddit issue,
  not Apify quota. Don't recommend REDDIT_COLLECTOR_PROVIDER=apify.

- Clerk webhook handler at src/app/api/webhooks/clerk/route.ts is fully
  implemented (svix HMAC + idempotent upsert + referral attribution). Operator
  says Dashboard config "should be set." Verify via test signup before claiming
  broken. Do NOT build a duplicate handler.

- Storybook coverage is REJECTED. No .stories.tsx work. See feedback memory.

- Do NOT touch apps/trendingrepo-worker/src/lib/secret-scrubber.ts, sibling
  test, or scripts/_cross-source-search.mjs / scripts/_secret-scrubber.mjs —
  active parallel-session territory (AWS STS leak mitigation in flight).

- audit/imp-wave-1 branch was REUSED after squash-merge of PR #1230. Only 6/12
  commits on it are truly new. The salvageable 5 + 1 orphan are now on PR #1472.
  Don't re-PR the raw branch — would re-introduce already-merged content.

HARD RULES (NEVER):
- NEVER push to main without explicit per-push operator approval.
- NEVER `git add .` or `git add -A`. Explicit file paths only.
- NEVER skip git hooks (--no-verify).
- NEVER mock Redis/database in scoring tests.
- NEVER edit apps/trendingrepo-worker/** outside narrow hardening.
- NEVER delete files in the false-positives list (see handover §HARD RULES).
- NEVER propose Storybook work.
- NEVER claim Clerk webhook broken without testing first.
- NEVER set REDDIT_COLLECTOR_PROVIDER=apify (wrong fix).

PICKUP ORDER (after admin-merges of the current wave land):

1. Diagnose cron-reddit-daily.yml 8-day silence — the REAL Reddit issue
2. Diagnose collect-twitter.yml cancellation pattern
3. Investigate /twitter transfer-budget regression (302KB vs 90KB)
4. A8-P5 (impeccable + design-pass on agent-commerce) — after #1501/#1508/#1510 merge
5. A6-P2 (source pill row top strip) — after #1492 merges
6. D4 Lighthouse per-route prioritization
7. PR #1467 (parallel security work) — verify if it's already covered by #1466 or needs separate merge

OPERATOR WORKING STYLE:
- Short replies ("yes", "go", "do it", "ship") = trust + green light. Don't ask
  for re-confirmation.
- Boil the ocean: ship the complete thing. Tests + docs + permanent fix.
- Make architecture calls — propose with rationale, don't ask "which path."
- Sub-agents in parallel are wanted (5-10 at a time per operator's request).
- Use isolation: "worktree" when dispatching to avoid contamination.

VERIFICATION GATE (run before every PR):
npm run typecheck && npm run lint:guards && npm run test:hooks

If you're picking this up: read the doc, run the checks, tell the operator
"ready" with a 1-paragraph summary of the queue state. Then ask which lane
to start on.
````

---

## SECTION 2 — PROJECT CONTEXT

**TrendingRepo** is a real-time trend-discovery scanner for AI / dev / SaaS repos. Aggregates GitHub stars, Twitter buzz, Reddit/HN/Bluesky/ProductHunt/DevTo signals, computes scoring + classification, surfaces breakout repos before they go mainstream.

**Stack:** Next.js 15 (App Router, Turbopack), TS 5 strict, React 19, Tailwind 4, ECharts, Framer Motion, Zustand. Redis (Railway or Upstash) is data source of truth via `src/lib/data-store.ts`. Collectors are GitHub Actions cron-driven. Vercel `main` = prod.

**Key locations:**
- `src/app/` — App Router routes
- `src/components/` — UI grouped by domain
- `scripts/` — collector entrypoints
- `apps/trendingrepo-worker/` — sister Railway service (parallel session active here)
- `.github/workflows/` — 60+ workflow files
- `data/_meta/*.json` — freshness metadata per source
- `.data/*.jsonl` — append-only scan output

**Cron mechanics:** Collectors run in `direct` mode (write to `.data/*.jsonl` + git push from workflow), NOT `api` mode (Vercel serverless FS is ephemeral). Cookie-based Twitter scrapers are DEAD providers post-2026. Twitter collection uses `collect-twitter-signals.ts` (Apify-actor-style invocation but NOT Apify-quota-direct for the primary path per operator clarification).

**Operating context:** Operator (Mirko, founder/CTO) runs 3 companies in parallel; bandwidth is the constraint. Multi-session agent dispatch happens routinely. Working-tree contamination across parallel sessions is a recurring issue — agents must use `isolation: "worktree"` AND push by SHA when races occur.

---

## SECTION 3 — STATE OF THE WORLD (2026-05-16 ~18:30 GMT+8)

### 3.1 Production health

**All 24 critical prod routes return 200** (verified via curl smoke at 2026-05-16 ~17:30 GMT+8). The `/repo/*` 500 regression from d81856ad is fully resolved (PRs #830/#1078/#1241/#1349 from prior sessions held).

### 3.2 Performance flags

- 🔴 **`/twitter` page transfer = 302KB** (3.4× over 90KB budget). Regression unknown date; needs investigation.
- 🔴 **`/repo/crewAIInc/crewAI` cold TTFB = 11.7s** — extreme cold-miss; likely cookbook/live-fetch path. Probe with `POST /api/revalidate` if it ISR-caches a 5xx.
- ⚠️ **`/repo/anthropics/claude-code` cold TTFB = 5.9s** — same family, less severe.
- ✅ All warm TTFB ≤200ms post-cache-warm (edge cache working).

### 3.3 Data freshness

11 of 12 critical sources fresh inside 24h. Exception:
- 🔴 **Twitter** — `data/_meta/twitter.json` shows `empty_results / count=0` for 12 days (since 2026-05-04T08:17Z). Workflow `collect-twitter.yml` runs every 3h but most recent runs CANCELLED. JSONL file has 421 lines (growing slowly).
- ⚠️ **npm** — 28h (just over 24h threshold).

### 3.4 Lighthouse

**Local runner UNAVAILABLE.** No `lighthouse:routes:prod` npm script; closest is `perf:routes:prod` (TTFB + transfer budgets only). PageSpeed Insights public API quota exhausted (HTTP 429 — shared anon bucket).

Recommendation: provision `PAGESPEED_API_KEY` for 25k-queries-per-day quota, OR install `lighthouse` CLI locally + add `lighthouse:routes:prod` wrapper around `scripts/perf-routes.mjs`'s route list.

---

## SECTION 4 — PR QUEUE (35 open) — 4-WAVE MERGE PLAN

### Wave 1 — Independent, merge in ANY order (no inter-deps)

```bash
# Tiny / docs / 1-liners
gh pr merge 1465 --squash --admin   # tier-list: remove duplicate crewAI (1 file, -1 line)
gh pr merge 1471 --squash --admin   # purge legacy gabagool-* references (parallel session, 2 files)
gh pr merge 1487 --squash --admin   # docs(sprint-4.4): WHERE-THINGS-RUN.md
gh pr merge 1509 --squash --admin   # docs(handoff): autonomous CTO session memo
gh pr merge 1493 --squash --admin   # worker: devto schedule 6h (1 file, +6/-1)
gh pr merge 1483 --squash --admin   # observability: Sentry release tag
gh pr merge 1498 --squash --admin   # sprint-2.6: Sentry release finalize workflow
gh pr merge 1454 --squash --admin   # B.2 workflow_dispatch for backfill-star-activity

# A.5 RepoLink hover trio (independent)
gh pr merge 1447 --squash --admin   # homepage
gh pr merge 1450 --squash --admin   # RelatedRepoCard + activity feed (5 surfaces)
gh pr merge 1452 --squash --admin   # admin/revenue/watchlist

# Funding A6 (independent)
gh pr merge 1492 --squash --admin   # P1+P5 capital headline + LiveTape promote
gh pr merge 1497 --squash --admin   # P4 MoverRow signal-strength bar

# Mobile
gh pr merge 1504 --squash --admin   # D3 375px overflow on / and /githubrepo

# Drop-a-Repo backend (independent of widget chain)
gh pr merge 1499 --squash --admin   # A7-P3 persist category/tags/releaseUrl/demoUrl
```

### Wave 2 — Stacked groups, merge in order

```bash
# A8 Agent Commerce stack (3 stacked PRs)
gh pr merge 1501 --squash --admin   # P2 extract Hero/MoversBoard/ActivityPulse (5 files)
gh pr merge 1508 --squash --admin   # P3 hero band reshape (2 files)
gh pr merge 1510 --squash --admin   # P4 2-col body layout (2 files)

# A7 Drop-a-Repo widget + polish combined (supersedes #1496+#1502)
gh pr merge 1505 --squash --admin   # P1+P2+P4 combined
# Then close superseded:
gh pr close 1496 --comment "Superseded by #1505"
gh pr close 1502 --comment "Superseded by #1505"

# Wave-1 audit + bug-fix salvage (3 stacked)
gh pr merge 1472 --squash --admin   # 45 files — clean salvage from rolling branch
gh pr merge 1479 --squash --admin   # 6 bug fixes from reflog (overlay)
gh pr merge 1466 --squash --admin   # handovers + .gitleaks.toml allowlist + parallel session's security commit

# Sprint-3.2 workflow retirement chain (3 stacked, largest-first)
gh pr merge 1486 --squash --admin   # retire 13 refresh-* workflows
gh pr merge 1506 --squash --admin   # retire 7 duplicate scrapers + Nitter (wave 2)
gh pr merge 1511 --squash --admin   # arxiv+ai-blogs workers + 4 more retire (wave 3)

# CI hardening
gh pr merge 1480 --squash --admin   # SHA-pin 5 GH Action uses + Dependabot (59 files, mechanical)
```

### Wave 3 — Investigate before merge

| PR | Issue | Action |
|---|---|---|
| **#1467** | parallel session's security scrubber, CI red on Gitleaks (false positive on test fixtures) | EITHER: add `.gitleaks.toml` allowlist for `tests/fixtures/scrubber/**` to its branch + retry, OR confirm #1466 already supersedes (likely the case — #1466 contains the same scrubber code + my allowlist). Verify diff overlap, then close one. |
| **#1500** | sprint-2.1: move CI gate to TOOLBOX self-hosted; 11 Playwright smokes fail | Either provision TOOLBOX with browser harness, OR rescope PR to move only light jobs |
| **#1216** | TOOLBOX read adapters PR-B (arxiv + claude.rss + lobsters + npm.dependents) — DIRTY, 24h-timed-out checks | Rebase against main + push, OR close+resubmit. Auto-merge ON since 2026-05-15 won't fire while DIRTY. |
| **#1214** | TOOLBOX read adapters PR-A (HF + ProductHunt) — DIRTY, 1 CI fail | Same — rebase + push |
| **#1231** | Fix PostHog analytics setup — DIRTY + CI red since 2026-05-13 | Rebase + fix tests, OR close-stale |

### Wave 4 — Bot automation (let cron handle)

```bash
# Newest of each category will auto-merge; close the rest
gh pr list --label automation --state open
# Keep newest of: funding-signals / nitter-health / data-refresh-*
# Close older duplicates (auto-bot will overwrite on next cron anyway)
```

Currently:
- **#1503** (funding signals, newest) — let it auto-merge
- **#1459, #1434, #1427** (older funding signals) — close
- **#1433** (nitter health, newest of pair) — let it auto-merge
- **#1431** (older nitter) — close
- **#1513** (npm telemetry) — bot will regenerate; leave or close

### 4.1 Critical PR overlap notes

1. **#1466 vs #1467** — both ship the security scrubber. #1466 includes the parallel session's commit `17fa8dc5a` + my `.gitleaks.toml` allowlist. #1467 was the parallel session's first attempt. Verify diff overlap; one should be closed.
2. **#1505 supersedes #1496 + #1502** — pre-resolved hard conflict. Always merge #1505, close the other two.
3. **#1472 → #1479 → #1466** — wave-1 salvage chain. Merge in order; touching the same `pipeline.ts` if reordered.
4. **#1447 → #1450 → #1504** — A.5 + mobile chain touching `src/lib/repo-submissions.ts` and `src/app/page.tsx`. Soft conflicts; rebase second/third.

---

## SECTION 5 — AUDIT FINDINGS

### 5.1 Code review (15 PRs from this session, 5-axis review)

| PR | Verdict | Notes |
|---|---|---|
| #1465 | ✅ SHIP AS-IS | 1-line dedup, trivial |
| #1466 | ✅ SHIP AS-IS | Scrubber design solid; gitleaks allowlist scoped tightly |
| #1472 | ✅ SHIP AS-IS | Code-review agent flagged CHILD_ENV_ALLOW removal of PATH — **VERIFIED FALSE ALARM** (PATH/HOME/USERPROFILE/TEMP/TMP/TMPDIR are all IN the allowlist at lines 60-65). |
| #1479 | ✅ SHIP AS-IS | All 6 bug fixes are textbook K1/K4 work. The `phaseScore(classified)` reorder is a real correctness fix. |
| #1492 | ✅ SHIP AS-IS | Visual change only |
| #1493 | ✅ SHIP AS-IS | 5-line cron schedule tighten |
| #1496 | ✅ SHIP AS-IS (superseded by #1505) | Pure refactor |
| #1497 | ✅ SHIP AS-IS | Strength bar clamps `[0,1]` defensively + tests cover the clamp |
| #1499 | ✅ SHIP AS-IS | Code-review agent flagged missing schema implementation — **VERIFIED FALSE ALARM** (`REPO_SUBMISSION_CATEGORIES` + `REPO_SUBMISSION_TAGS` already on `main` at `src/lib/repo-submissions.ts:26,33`). |
| #1501 | ✅ SHIP AS-IS | Pure refactor, no behavior change |
| #1502 | ✅ SHIP AS-IS (superseded by #1505) | Visual polish |
| #1504 | ✅ SHIP AS-IS | CSS-only fix, canonical pattern from `62a370132` |
| #1505 | ✅ SHIP AS-IS | Combined #1496+#1502, pre-resolved conflict |
| #1508 | ✅ SHIP AS-IS | Visual + scoped CSS |
| #1510 | ✅ SHIP AS-IS | Layout CSS, single new class `.ac-body-grid` |

**Zero PRs blocked. Zero security vulnerabilities. Zero data-loss risks.** Highest-quality batch I've shipped.

### 5.2 Recommendations from code review

1. **#1472 — consider adding a regression test** that asserts `phaseScore` receives `classified` (not `assembled`) so the `recomputeAllInner` phase-order can't silently revert. Optional, not blocking.
2. **Track for follow-up:** inline styles in #1492 / #1497 / #1505 / #1508 / #1510 are growing — consider migrating to scoped CSS classes once visual contract stabilizes.

### 5.3 Smoke test (24 prod routes)

ALL GREEN. Detail in §3.

### 5.4 Lighthouse / perf

Local + PSI unavailable. Operator action needed for proper perf audit infra.

---

## SECTION 6 — OPERATOR DECISIONS OUTSTANDING

Categorized by urgency:

### URGENT (real production issues)

| # | Item | What to do |
|---|---|---|
| 1 | **`cron-reddit-daily.yml` dead 8 days** | Check the workflow file's `on: schedule:` block + Actions tab. The PRIMARY daily Reddit cron hasn't fired since 2026-05-08. Investigate before recommending data-plane fixes elsewhere. |
| 2 | **`collect-twitter.yml` cancellation pattern** | Workflow runs every 3h but most cancelled. JSONL signal count growing slowly. Possible concurrency lock or upstream API issue. |
| 3 | **`/twitter` page transfer = 302KB** (3.4× budget) | Investigate which client component blew up the bundle. |

### BLOCKING NEXT MAJOR WORK

| # | Item | What to do |
|---|---|---|
| 4 | **AWS STS key `ASIA…3FUC` rotation** | Defense-in-depth scrubber shipping via #1466 + parallel session's work; key itself still needs rotation via AWS console. |
| 5 | **R2 backup secrets** | `Backup Redis Snapshot` workflow fails on missing `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`. Add to GH Actions repo secrets. |
| 6 | **Clerk webhook — VERIFY (don't assume broken)** | Trigger test signup → check `tr.profiles` for new row within 5s. If row appears: working, close memory entry. If not: check Clerk Dashboard → Webhooks endpoint. |
| 7 | **PR #1231 (PostHog)** | Rebase + fix CI, OR close-stale |
| 8 | **PRs #1214 / #1216 (TOOLBOX adapters)** | Rebase against main; merge PR-A (#1214) first, then PR-B (#1216) |
| 9 | **`audit/imp-wave-1` raw branch fate** | The 6 valuable commits salvaged via #1472. Hard-reset or delete the branch. |

### EDITORIAL / DESIGN

| # | Item |
|---|---|
| 10 | OG card editorial direction (Bloomberg/Blockworks tear-sheet) |
| 11 | `/repo/*` visual hero reorganization |
| 12 | `/research` broken viewport — operator must name which size (375/768/1280) surfaces the bug for A4 |
| 13 | searchParams URL strategy per route (D1) — 9 routes force-dynamic |
| 14 | Clerk Best-Practices ceiling decision (lazy-load / CNAME / accept 73-77 BP score) |

---

## SECTION 7 — TRACK-BY-TRACK STATUS

### Track A — Operator UI asks
- **A1.1** Remove Collections nav row → ✅ ALREADY DONE (handover was stale; `Collections` not in `SidebarContent.tsx`)
- **A1.2** Recent visited repos broken → 🟡 DIAGNOSED, ambiguous if bug (comment/code mismatch on empty state); not picked up
- **A1.5** Sidebar profile widget → ✅ ALREADY SHIPPED via PR #1351 (`SidebarProfileBox`)
- **A2** /twitter remove SCORE column → ✅ ALREADY DONE
- **A3** Tools page tile headers → ✅ ALREADY DONE (routeBadge in ToolTile)
- **A4** /research broken viewport → 🚫 BLOCKED (operator must name viewport)
- **A5** Repo hover preview → ✅ SHIPPING via PRs #1447 / #1450 / #1452 (admin queue)
- **A6** Funding Radar → 🟡 partial: P1+P5 #1492 ✅, P4 #1497 ✅; P2 PENDING (conflicts with #1492), P3 PENDING (operator decision on extractor)
- **A7** Drop-a-Repo redesign → 🟡 partial: P1+P2+P4 combined #1505 ✅, P3 backend #1499 ✅
- **A8** Agent Commerce → 🟡 partial: P2 extract #1501 ✅, P3 hero #1508 ✅, P4 2-col #1510 ✅; P5 (impeccable polish) PENDING
- **A9** Hide freshness badges → ✅ MERGED via PR #1321
- **A10** NITTER on TOOLBOX → 🚫 RISKY (parallel session territory)
- **A11** Image-system doc + monogram fallback → ✅ DOC SHIPPED, route DELIBERATELY DEFERRED per doc

### Track B — Data layer / collector recovery
- **B1** Reddit zero-engagement → 🟡 CORRECTED PREMISE (not Apify; investigate cron-reddit-daily.yml)
- **B2** postgres-js SSL → ✅ SHIPPED on main
- **B3** Clerk webhook → 🟡 VERIFY (handler code exists, dashboard config status unclear)
- **B4** 7/7 sources stale → 🟡 PARTIALLY RESOLVED (most sources fresh, Twitter still dead)
- **B5** "13 broken Sprint Triage workflows AGN-857..871" → ❌ FALSE PREMISE (AGN-* is AISO project, not trendingrepo)
- **B6** Twitter stale 386/402 repos → 🟡 12-day-empty_results; investigate cancellation pattern
- **B7** consensus-trending 71h stale → 🟡 PENDING ops re-trigger
- **B8** 40k-star cap fix → ✅ workflow_dispatch wrapper shipped via #1454

### Track C — TOOLBOX read-path
- **C1** Phase A.2 wiring → 🚫 BLOCKED on PRs #1214/#1216 merge
- **C2** 3 schema-gap sources → 🚫 DEFERRED
- **C3** Data-layer Phase 1.5 → 🟡 PENDING

### Track D — Perf + mobile
- **D1** searchParams perf-debt → 🚫 BLOCKED on operator URL strategy
- **D2** /twitter lazy-load → 🚫 BLOCKED on operator preview review
- **D3** Mobile 375 overflow → ✅ SHIPPED via #1504
- **D4** Lighthouse perf restoration → 🟡 NEEDS per-route operator triage + Lighthouse runner provision

### Track E — Hardening + tooling
- **E1** Open-PR drain → 🟡 BOT data PRs leave alone; #1231/#1214/#1216 operator triage
- **E2** Smoke test 12→24 routes → ✅ DONE via PR #1329 (smoke covers 29 routes now)
- **E3** Storybook gap → ❌ REJECTED BY OPERATOR
- **E4** compute-deltas split-brain → 🚫 INCOMPLETE replacement API; do NOT delete script yet
- **E5** Doc hygiene → 🟡 LOW PRIORITY

### Track F — AISO / cross-product
- All operator-deferred

### Track G — Operator decisions
- See §6

---

## SECTION 8 — NEXT-SESSION WORK ITEMS (ranked)

When you pick this up, after the merge queue is processed:

1. **Diagnose `cron-reddit-daily.yml` 8-day silence** (highest value — primary Reddit data plane)
2. **Diagnose `collect-twitter.yml` cancellation pattern** + Twitter 12-day staleness
3. **Investigate `/twitter` page transfer regression** (302KB vs 90KB budget)
4. **A8-P5** — impeccable + design-pass on agent-commerce (after #1501/#1508/#1510 merge)
5. **A6-P2** — source pill row top strip (after #1492 merges)
6. **D4 Lighthouse** — provision runner (PAGESPEED_API_KEY or local CLI), then per-route audit
7. **A6-P3** — stage taxonomy Series E/F (if operator greenlights extractor change)
8. **Doc hygiene** — relocate >30d worklogs to `docs/archive/worklogs/` (low priority)
9. **Investigate Clerk webhook via test signup** (verify before claiming broken)

---

## SECTION 9 — HARD RULES (NEVER list — repeated from CLAUDE.md + this session's additions)

### Process rules
- NEVER push to `main` without explicit per-push operator approval (`feedback_no_push_without_approval.md`)
- NEVER `git add .` or `git add -A` or directory-wide staging
- NEVER skip git hooks (`--no-verify`)
- NEVER use destructive git (`reset --hard`, `push --force`, etc.) without explicit consent
- ALWAYS use `isolation: "worktree"` when dispatching parallel sub-agents

### Code rules
- NEVER edit `apps/trendingrepo-worker/**` outside narrow hardening (sister Railway service)
- NEVER touch `scripts/_cross-source-search.mjs` or `scripts/_secret-scrubber.mjs` (parallel session security work)
- NEVER touch `apps/trendingrepo-worker/src/lib/secret-scrubber.ts` or `__tests__/` (same)
- NEVER touch `chore/vps-docker-deploy` branch
- NEVER touch GHA `scrape-*.yml` before TOOLBOX read-path is parity-verified live
- NEVER mock Redis/database in scoring-logic tests
- NEVER use cookie-based Twitter scrapers (dead provider post-2026)
- NEVER use `readFileSync(process.cwd(), "data", ...)` for new sources — use the data-store
- NEVER add new collectors that only write to file — use `writeDataStore()` for Redis dual-write

### Anti-patterns (saved as memory)
- NEVER propose Storybook coverage (`feedback_no_storybook.md`)
- NEVER recommend `REDDIT_COLLECTOR_PROVIDER=apify` as a fix (corrected memory)
- NEVER assume Clerk webhook broken without test signup (corrected memory)
- NEVER duplicate existing components without grep — `feedback_search_before_building.md` (caused 2026-05-15 prod outage)
- NEVER inline hardcoded "FRESH · 1H" / green-pulse — `feedback_freshness_chrome_must_be_honest.md`

### Audit verification
- ALWAYS run verification gate before claiming a PR is shipped:
  ```
  npm run typecheck && npm run lint:guards && npm run test:hooks
  ```
- ALWAYS verify orphan-commit claims with `git cat-file -e <sha>` before cherry-picking
- ALWAYS grep `src/` for similar concerns before creating new components

### Parallel-session survival pattern
- Stage by explicit file: `git add <SPECIFIC-FILE>` only
- Commit IMMEDIATELY after each Write so the boundary is durable
- Push by SHA if branch races: `git push -u origin <SHA>:refs/heads/<branch>`
- If `git status` shows files you didn't touch as modified: `git checkout HEAD -- <those-files>` before staging
- If branch was swapped under you: `git checkout <your-branch>` and re-verify the file diff before commit

---

## SECTION 10 — MEMORY UPDATES THIS SESSION

Updated in `~/.claude/projects/c--dev-trendingrepo/memory/`:

| File | What |
|---|---|
| `MEMORY.md` | Index updated with corrected entries for Reddit + Clerk |
| `feedback_no_storybook.md` (NEW) | Operator rejected Storybook work; don't propose `.stories.tsx` coverage |
| `project_reddit_apify_pivot.md` (UPDATED) | Corrected to "Reddit primary path is OAuth + JSON fallback via cron-reddit-daily.yml; Apify is SECONDARY only" |
| `project_clerk_webhook_unconfigured.md` (UPDATED) | Renamed in spirit to "Clerk webhook status: verify before claiming broken" |

---

## SECTION 11 — ORPHAN COMMITS SALVAGED (8 total)

Prior session(s) lost work via force-push / rebase. All recovered this session:

| SHA | Subject | Landed in |
|---|---|---|
| `8639b70d5` | fix(api-helpers): land withBodySizeLimit helper missed by harden(api) | #1472 |
| `0f072bf5f` | 🔴 fix(pipeline): classify before scoring in recomputeAllInner | #1479 |
| `9020fd55b` | fix(ingestion): unify snapshot.id format with ingest.ts | #1479 |
| `df4e7145b` | fix(alerts): enforce validateRule at createRule boundary | #1479 |
| `97b888ef6` | fix(alerts): treat undefined previousScore as can't-prove-transition | #1479 |
| `574535e6d` | fix(alerts): UUID-based event id suffix | #1479 |
| `62a370132` | fix(research): break-words + min-w-0 on arXiv title link | #1479 |
| `0472199e0` | fix(worker): tighten devto schedule to every 6h | #1493 |

Comprehensive orphan audit ran across 712 dangling commits. The 8 above are the only genuinely-valuable salvages remaining (rest were duplicates of merged content, cross-project AGN-* pollution, or stale snapshots).

---

## SECTION 12 — STALE HANDOVER FACTS CORRECTED THIS SESSION

The prior session's `docs/handoffs/HANDOVER-2026-05-16-wave-1-complete.md` was significantly aspirational:

- **6 audit/pre-mortem docs claimed** — none exist (DEAD-CODE / SIMPLIFY / ENGINE-TOOLBOX / TRACK-A-STATUS / PRE-MORTEM x2). Strike-throughs added inline via #1466.
- **Master plan opens with "anchor PR #1253"** — verified CLOSED, not merged (2026-05-16T03:00:07Z).
- **`audit/imp-wave-1` claimed 15 commits / `9063213c5 docs` commit** — actual branch has 12 commits, `9063213c5` doesn't exist anywhere.
- **5/11 Track A items already done or deferred** — handover was stale on all of them.
- **B5 "13 broken Sprint Triage workflows AGN-857..871"** — AGN-* are Paperclip tickets in sister AISO project, not workflows in this repo.

---

## SECTION 13 — PARALLEL-SESSION COLLABORATION NOTES

A parallel session was active throughout, doing AWS STS key leak mitigation. Their work:

- `apps/trendingrepo-worker/src/lib/secret-scrubber.ts` (new, 3,796 bytes)
- `apps/trendingrepo-worker/src/lib/__tests__/secret-scrubber.test.ts` (new, ~134 lines)
- `scripts/_cross-source-search.mjs` (modified, imports the scrubber)
- `scripts/_secret-scrubber.mjs` (new, .mjs sibling for cron scripts)
- Plus 10+ sprint-* PRs (#1467, #1471, #1480, #1483, #1486, #1487, #1498, #1500, #1506, #1511)

They pushed their security commit `17fa8dc5a` ON TOP of MY branch `docs/handover-doc-vapor-cleanup`. I responded by adding a `.gitleaks.toml` allowlist for their intentional test fixtures (10 false-positive findings cleared by 1 path entry). PR #1466 now ships their security work + my docs strike-through together.

Working-tree contamination was real and recurring (agents had branches swapped under them mid-session). All agents recovered via `git checkout HEAD -- <unrelated-files>` + `git push by SHA`. No data lost.

---

## SECTION 14 — SESSION METRICS

- **16 sub-agents** dispatched in 5 waves (all in isolated worktrees)
- **15 PRs opened** + **1 docs PR** (this one)
- **1 PR closed** (Storybook rejection)
- **2 PRs superseded** by combined #1505
- **8 orphan commits salvaged** from git's reflog
- **3 memory entries** updated with corrected understanding
- **5 Track A items** correctly identified as already done/stale
- **0 data lost** — every parallel-session commit preserved
- **0 destructive git operations**
- **3-axis verification gate** run on every PR (typecheck + lint:guards + test:hooks)

🤖 Composed autonomously by Claude Opus 4.7 CTO Mode while operator was in meetings.
