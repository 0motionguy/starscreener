# CURRENT SPRINT — Sprint 1: Pool Verification + Source Activation

Status: IN PROGRESS - Phase 1.5 blocked on Vercel Sentry DSN
Started: 2026-05-03
Target completion: 2026-05-10

## AGN-1293 [Sprint 1 audit] Parent-child dependency map synchronization check
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Freshness gate result at `2026-05-05`: `npm run freshness:check` reached localhost:3023 (not missing) but failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error` (product stale/degraded).
- Synchronization decision: keep parent-child dependency-map updates sprint/backlog synchronized with one owner, explicit `Blocked on`/`Needs`, and binary `Done when`; out-of-scope execution remains backlog-only unless CTO reprioritizes.
- Owner: PM triage.
- Blocked on: local freshness-state endpoint failure (`/api/cron/freshness/state` HTTP 500), which blocks closure-grade verification.
- Needs: platform engineer restores freshness-state endpoint to HTTP 200 and returns `npm run freshness:check` to exit 0; CTO/platform provides Vercel `SENTRY_DSN` canary evidence where Sprint 1 closure depends on it; CTO confirms any sprint-priority override before cross-sprint reassignment.
- Done when: parent-child dependency rows across sprint/backlog surfaces remain synchronized with one owner + explicit blocker/needs lines + binary done-state wording, and `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.

## AGN-1354 [Sprint 1 audit] Blocked issue owner-action completeness sweep
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Freshness gate result at `2026-05-05`: `npm run freshness:check` could not execute because `tsx` is missing in this runtime (`'tsx' is not recognized as an internal or external command`); direct probe `http://localhost:3023/api/health?soft=1` returned connection failure (`Unable to connect to the remote server`), so localhost:3023 is missing.
- Completeness decision: keep blocked-issue rows owner/action complete in sprint/backlog notes and keep all out-of-scope execution backlog-only unless CTO reprioritizes.
- Owner: PM triage.
- Blocked on: local runtime toolchain missing `tsx` for freshness script execution and local app endpoint unreachable on localhost:3023.
- Needs: platform engineer restores local app reachability on `localhost:3023` and toolchain support so `npm run freshness:check` executes; CTO/platform provides Vercel `SENTRY_DSN` canary evidence where Sprint 1 closure depends on it; CTO confirms any sprint-priority override before cross-sprint reassignment.
- Done when: blocked issue rows across sprint/backlog surfaces retain one owner + one unblock action + binary done-state wording, and local verification runs with `npm run freshness:check` exiting 0 while localhost is reachable (not missing).

## AGN-1355 [Sprint 1 audit] Sprint/backlog boundary integrity recheck
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Freshness gate result at `2026-05-05T06:20:11.3649944+08:00`: `npm run freshness:check` did not reach localhost health evaluation because the command failed immediately with `'tsx' is not recognized as an internal or external command`, so localhost:3023 missing/stale state is currently unverified from this run.
- Boundary integrity decision: keep Sprint 1 locked to Phase 1.5 + local freshness unblock; keep out-of-scope execution backlog-only with one owner and binary done-state wording.
- Owner: PM triage.
- Blocked on: local toolchain missing `tsx`, which blocks freshness preflight execution and prevents close-readiness verification.
- Needs: platform engineer restores repo toolchain so `npm run freshness:check` runs (e.g., install dependencies and ensure `tsx` is available), then reruns preflight to classify localhost freshness state; CTO/platform provides Vercel `SENTRY_DSN` evidence where Sprint 1 closure depends on it.
- Done when: sprint/backlog boundary rows remain synchronized with one owner + explicit blocker/needs + binary done-state wording, and `npm run freshness:check` executes successfully and returns a pass state with localhost reachable and no blocking non-green rows.

## Phase tracking
- [x] 1.1 GitHub pool runtime telemetry
- [x] 1.2 Reddit User-Agent pool
- [x] 1.3 Twitter Apify + Nitter fallback
- [x] 1.4 /admin/keys dashboard
- [ ] 1.5 Sentry verification + error class hierarchy

## Acceptance criteria (Sprint 1)
See individual phase prompts.

## Sprint-1 issue quality bar (AGN-173)
- Every Sprint 1 issue must declare exactly one owner.
- Every Sprint 1 issue must include a binary `Done when ...` statement.
- Every issue must list explicit dependencies/blockers (`Blocked on: ...`, `Needs: ...`).
- Anything outside Phase 1.5 + local freshness unblock is backlog-only.
- No issue may combine implementation + redesign scope in one ticket.

## AGN-189 scoped guardrail contract (Sprint 1 fix)
- Owner: platform engineer.
- Scope: add/extend lint guardrail so new backend bare `throw new Error(...)` is blocked only under `src/lib/**` and `src/app/api/**`, while tests and client UI code remain exempt.
- Done when: CI/lint fails on a newly introduced backend bare `throw new Error(...)` in scoped paths and passes for allowed test/client exceptions, with command evidence captured in AGN-189.
- Blocked on: none.
- Needs: implementation owner to attach one failing-sample proof and one passing-exemption proof in AGN-189 evidence comment.

## Epic linkage map (AGN-174 consistency check)
- Parent epic: `AGN-172` (Sprint 1 scope guardrail). Owner: PM triage.
  Done when Sprint 1 scope remains limited to Phase 1.5 + local freshness unblock and all out-of-scope discoveries are moved to backlog with one owner + binary done state.
- Child policy issue: `AGN-173` (Sprint 1 issue quality bar). Owner: PM triage.
  Depends on: `AGN-172` scope lock.
  Done when every Sprint 1 ticket has one owner, binary done-state text, and explicit blocker/dependency lines.
- Child consistency issue: `AGN-174` (parent-child linkage consistency). Owner: PM triage.
  Depends on: `AGN-172` scope lock and `AGN-173` quality bar.
  Done when parent/child relationships and dependency direction are explicitly documented in sprint/backlog notes with no orphan Sprint 1 tasks.

### Canonical owner and done-state for in-scope Sprint 1 work
- `Phase 1.5 Sentry verification + error class hierarchy` owner: platform engineer. Done when Vercel has `SENTRY_DSN`, canary evidence is captured, and Sprint notes include command/log proof.
- `Local freshness unblock (/api/health?soft=1 on localhost:3023)` owner: platform engineer. Done when `npm run freshness:check` exits 0 locally and records the timestamped green result.

## Scope lock (AGN-172 sprint guardrail)
- Sprint 1 only includes Phase 1.5 completion plus the blocking local freshness repair (`/api/health?soft=1` on localhost:3023 must return HTTP 200 via `npm run freshness:check`).
- No new source expansion, workflow redesign, or product-surface additions are allowed in Sprint 1.
- Any discovery outside Phase 1.5 + freshness unblock must be written to `tasks/BACKLOG.md` with an owner and binary done state.

## AGN-172 decision snapshot (current vs backlog)
- In Sprint 1 (keep active): Phase 1.5 Sentry verification and local freshness unblock only.
- Move to backlog (not Sprint 1 execution): `AGN-253`, `AGN-254`, `AGN-255`, `AGN-290`, `AGN-291`, `AGN-292`, plus workflow/source hardening tasks listed under `tasks/BACKLOG.md` AGN-172 section.
- Escalation rule: if CTO reprioritizes any backlog item into Sprint 1, add a dated note in this file with new owner, blocker, and binary `Done when` before execution starts.

## AGN-308 pointer-only enforcement (Sprint 1 vs Sprint 2)
- Effective immediately, Sprint 2 audit issues appear in this file as pointer-only references: `AGN-253`, `AGN-254`, `AGN-255`, `AGN-290`, `AGN-291`, `AGN-292`.
- Sprint 2 execution details, acceptance criteria, and dependency updates live in `tasks/BACKLOG.md` only unless CTO explicitly reprioritizes.
- Owner: PM triage.
- Done when: active Sprint 1 blocker/lint scopes in this file exclude Sprint 2 issue rows and keep only pointer context.

## AGN-1047 [Sprint 1 audit] Sprint/backlog boundary integrity pass
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Freshness gate result at `2026-05-05T02:37:30.7864875+08:00`: `npm run freshness:check` reached localhost:3023 (not missing) but failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error` (product stale/degraded).
- Boundary integrity decision: Sprint 1 remains limited to Phase 1.5 + local freshness unblock; out-of-scope work stays backlog-only with one owner and binary done-state wording.
- Owner: PM triage.
- Blocked on: local freshness endpoint remains degraded (`/api/health?soft=1` returns 500), preventing close-readiness verification.
- Needs: platform engineer restores local freshness endpoint behavior and clears blocking freshness failures; CTO/platform provides Vercel `SENTRY_DSN` verification evidence when applicable.
- Done when: Sprint 1 notes remain pointer-only for out-of-scope items, backlog carries execution details, and `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.

## AGN-1292 [Sprint 1 audit] Sprint/backlog boundary integrity refresh
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Freshness gate result at `2026-05-05T05:16:00+08:00`: `npm run freshness:check` reached localhost:3023 (not missing) but failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error` (product stale/degraded).
- Boundary integrity decision: keep Sprint 1 constrained to Phase 1.5 + local freshness unblock; keep all non-Sprint-1 execution backlog-only with one owner and binary done-state wording.
- Owner: PM triage.
- Blocked on: local freshness endpoint remains degraded (`/api/health?soft=1` HTTP 500), so closure-grade verification cannot pass.
- Needs: platform engineer restores `/api/health?soft=1` to HTTP 200 and reruns freshness check; CTO/platform provides Vercel `SENTRY_DSN` verification evidence when required for Sprint 1 closure.
- Done when: sprint/backlog boundary rows stay synchronized and pointer-only for out-of-scope execution, and `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.

## AGN-1139 [Sprint 1 audit] Sprint/backlog boundary integrity pass
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Freshness gate result at `2026-05-05T04:24:59.563Z`: `npm run freshness:check` reached localhost:3023 (not missing) with `health=stale sourceStatus=ok`; failed with `green=40`, `yellow=9`, `red=1`, `blocking_non_green=8`, `advisory_non_green=2`, `Sentry: MISSING` (`trending-repos` is RED).
- Boundary integrity decision: Sprint 1 remains limited to Phase 1.5 + local freshness unblock; out-of-scope discoveries remain backlog-only with one owner and binary done-state wording.
- Owner: PM triage.
- Blocked on: blocking freshness rows remain non-green (`trending-repos` RED; `awesome-skills`, `claude-rss`, `lobsters`, `npm`, `openai-rss`, `producthunt`, `twitter` YELLOW) and `Sentry: MISSING`.
- Needs: platform engineer restores blocking freshness rows to GREEN within budgets; CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence; CTO confirms any sprint-priority override before cross-sprint reassignment.
- Done when: Sprint 1 stays pointer-only for out-of-scope execution, backlog carries non-Sprint-1 detail, and `npm run freshness:check` exits 0 with localhost reachable and `blocking_non_green=0`.

## AGN-1157 [Sprint 1 audit] In-progress stagnation triage with handoff recommendations
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Freshness gate result at `2026-05-05T04:39:25.788Z`: `npm run freshness:check` reached localhost:3023 (not missing) with `health=ok sourceStatus=ok`; failed with `green=40`, `yellow=9`, `red=1`, `blocking_non_green=8`, `advisory_non_green=2`, `Sentry: MISSING` (`trending-repos` RED).
- Stagnation triage decision: keep Sprint 1 scope locked to Phase 1.5 + local freshness unblock and route all in-progress stagnation remediation to explicit owner/action handoffs, with out-of-scope execution backlog-only unless CTO reprioritizes.
- Owner: PM triage.
- Blocked on: blocking freshness rows remain non-green (`trending-repos` RED; `awesome-skills`, `claude-rss`, `lobsters`, `npm`, `openai-rss`, `producthunt`, `twitter` YELLOW) and `Sentry: MISSING`.
- Needs: platform engineer clears the 8 blocking non-green rows to GREEN within budget; CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence; CTO confirms any sprint-priority changes before moving backlog work into Sprint 1.
- Done when: each stagnated `in_progress` issue has one owner, one explicit next action, one explicit blocker owner/action path, and either terminal status (`done`/`blocked`) or a documented child split/handoff; Sprint 1 remains coherent and pointer-only for out-of-scope execution.

## AGN-756 pointer-only scope note (compliance gap triage)
- `AGN-756` (`[GAP-AUDIT-21] Privacy Policy + Terms of Service pages`) is backlog-scoped and out of Sprint 1 implementation scope.
- Execution details, owner assignment, dependencies, and binary done-state for AGN-756 are tracked in `tasks/BACKLOG.md` unless CTO explicitly reprioritizes into current sprint.

## AGN-757 pointer-only scope note (compliance gap triage)
- `AGN-757` (`[GAP-AUDIT-22] Cookie consent banner (PostHog)`) is backlog-scoped and out of Sprint 1 implementation scope.
- Execution details, owner assignment, dependencies, and binary done-state for AGN-757 are tracked in `tasks/BACKLOG.md` unless CTO explicitly reprioritizes into current sprint.

## AGN-758 pointer-only scope note (compliance gap triage)
- `AGN-758` (`[GAP-AUDIT-24] DMCA / repo-author takedown procedure`) is backlog-scoped and out of Sprint 1 implementation scope.
- Execution details, owner assignment, dependencies, and binary done-state for AGN-758 are tracked in `tasks/BACKLOG.md` unless CTO explicitly reprioritizes into current sprint.

## AGN-291 Sprint boundary leakage check (Sprint 1 vs Sprint 2)
- Evidence (2026-05-04 heartbeat): mandatory opening bundle re-verified and `npm run freshness:check` at `2026-05-04T10:58:05.245Z` reached localhost:3023 (not missing) but failed with `blocking_non_green=4`, `dead=5`, `advisory_non_green=1`, `Sentry: MISSING`.
- Leakage confirmed: Sprint 2 audit issues are present inside this Sprint 1 document (`AGN-253`, `AGN-254`, `AGN-255`, `AGN-290`), which creates cross-sprint reporting noise even when scope notes say backlog-only.
- Boundary rule enforced for PM triage: Sprint 1 reporting here remains limited to Phase 1.5 + local freshness unblock; Sprint 2 audit execution stays backlog-only unless CTO reprioritizes.
- Owner: PM triage.
- Done when: all Sprint 2 audit updates are recorded in `tasks/BACKLOG.md` first, and any Sprint 1 mention is reduced to a pointer line only (no Sprint 2 acceptance criteria tracked as Sprint 1 blockers).

## AGN-300 Sprint-vs-backlog boundary drift ledger refresh
- Evidence (2026-05-04 heartbeat): mandatory opening bundle re-verified and `npm run freshness:check` at `2026-05-04T11:03:28.332Z` reached localhost:3023 (not missing) but failed with `blocking_non_green=4`, `dead=5`, `advisory_non_green=1`, `Sentry: MISSING`.
- Drift ledger snapshot: Sprint 2 audit items (`AGN-253`, `AGN-254`, `AGN-255`, `AGN-290`, `AGN-291`, `AGN-292`) remain represented in Sprint 1 notes; this is allowed only as pointer context, not execution scope.
- Boundary decision for this heartbeat: keep Sprint 1 scope locked to Phase 1.5 + local freshness unblock, and keep Sprint 2 audit execution backlog-first unless CTO reprioritizes.
- Owner: PM triage.
- Blocked on: freshness blocking rows + missing Vercel `SENTRY_DSN` keep verification/closure work documentation-only.
- Needs: platform engineer clears blocking non-green rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`); CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override.
- Done when: Sprint 2 audit issues appear in `tasks/CURRENT-SPRINT.md` as pointer-only references, while detailed acceptance/dependency updates live in `tasks/BACKLOG.md`.

## AGN-302 Sprint 1 audit parent-child dependency map hygiene pass
- Evidence (2026-05-04 heartbeat): mandatory opening bundle re-verified and `npm run freshness:check` at `2026-05-04T11:07:27.683Z` reached localhost:3023 (not missing) but failed with `green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING`.
- Hygiene finding: dependency-map detail for Sprint 2 audit issues must stay backlog-first; Sprint 1 notes can reference them only as pointer context to avoid cross-sprint execution drift.
- Owner: PM triage.
- Blocked on: blocking freshness rows + missing Vercel `SENTRY_DSN` keep dependency-map closure documentation-only this heartbeat.
- Needs: platform engineer clears blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`); CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before moving Sprint 2 work into Sprint 1.
- Done when: every active Sprint/Backlog dependency row has one owner, explicit `Blocked on`/`Needs` lines, and binary `Done when` text; Sprint 2 audit execution remains backlog-first unless CTO reprioritizes.

## AGN-309 Sprint 1 audit blocked-owner/action completeness sweep
- Evidence (2026-05-04 heartbeat): mandatory opening bundle re-verified and `npm run freshness:check` at `2026-05-04T11:13:11.580Z` reached localhost:3023 (not missing) but failed with `green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING`.
- Completeness finding: active blocker rows keep one unblock owner, one unblock action, and binary done-state wording; closure remains blocked on freshness dead/blocking rows plus missing Vercel `SENTRY_DSN`.
- Owner: PM triage.
- Blocked on: `category-metrics` DEAD, `mcp-downloads` DEAD, `star-snapshots` DEAD, `trending-repos` DEAD, and `Sentry: MISSING`.
- Needs: platform engineer restores blocking DEAD rows to GREEN inside freshness budgets; CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence.
- Done when: `npm run freshness:check` exits 0 with `blocking_non_green=0` and no blocking DEAD rows, and blocker rows remain owner/action complete.
- Evidence refresh (2026-05-04 heartbeat): `npm run freshness:check` at `2026-05-04T13:04:03.046Z` reached localhost:3023 (not missing) and failed with `green=47`, `yellow=2`, `dead=1`, `blocking_non_green=2`, `advisory_non_green=1`, `Sentry: MISSING`.
- Live blocked issue enumeration (`GET /api/companies/{companyId}/issues?status=blocked`):
  - `AGN-464` owner present, latest comment includes explicit `Blocked on` and `Needs`.
  - `AGN-419` owner present, latest comment includes explicit `Blocked on` and `Needs`.
  - `AGN-343` owner present, latest comment includes explicit `Blocked on` and `Needs`.
  - `AGN-379` owner present, latest comment includes explicit `Blocked on` and `Needs`.
- Missing owner/action fields by issue id: none (`AGN-464`, `AGN-419`, `AGN-343`, `AGN-379` all complete).
- Remediation queue (highest impact first):
  1. `AGN-464`: merge workflow fix and lockfile sync on main, then rerun `collect-twitter`.
  2. `AGN-419`: deploy CSP changes to production and complete 24h violation monitoring with Sentry visibility.
  3. `AGN-379`: provide `ADMIN_TOKEN` or Redis/Upstash read credentials for UA distribution proof.
  4. `AGN-343`: close after upstream freshness/Sentry/credential blockers above are cleared.

## AGN-364 [Sprint 1 audit] Issue evidence quality and closure gate check
- Evidence (2026-05-04 heartbeat): mandatory opening bundle re-verified and `npm run freshness:check` at `2026-05-04T12:08:43.913Z` reached localhost:3023 (not missing) with `health=ok` and `sourceStatus=degraded`; result failed with `green=44`, `yellow=1`, `dead=5`, `blocking_non_green=5`, `advisory_non_green=1`, `Sentry: MISSING`.
- Closure-gate finding: issue evidence quality is acceptable only when every closure claim includes command-timestamped proof plus explicit blocker owner/action lines; Sprint 1 closure remains blocked while any blocking non-green source or missing Sentry DSN exists.
- Owner: PM triage.
- Blocked on: `category-metrics` DEAD, `mcp-downloads` DEAD, `star-snapshots` DEAD, `trending-repos` DEAD, `producthunt` YELLOW (blocking), and `Sentry: MISSING`.
- Needs: platform engineer restores blocking freshness rows to GREEN and keeps them within budgets; CTO/platform sets Vercel `SENTRY_DSN` with canary evidence.
- Done when: closure-gate rows in sprint/backlog include one owner + one unblock action + one binary done-state line, and `npm run freshness:check` exits 0 with `blocking_non_green=0` and no blocking DEAD/YELLOW rows.

## AGN-1049 [Sprint 1 audit] Parent-child dependency hygiene refresh
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Freshness preflight (2026-05-05 heartbeat): `npm run freshness:check` reached localhost (`http://localhost:3023`, not missing) but failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error` (product stale/degraded).
- Dependency-hygiene decision: keep Sprint 1 scoped to Phase 1.5 + local freshness unblock, keep parent-child linkage explicit per issue row (one owner + one blocker owner/action path), and keep out-of-scope execution backlog-only unless CTO reprioritizes.
- Owner: PM triage.
- Blocked on: local freshness-state endpoint failure (`/api/cron/freshness/state` HTTP 500) and missing Vercel `SENTRY_DSN` verification evidence.
- Needs: platform engineer restores `/api/cron/freshness/state` health to HTTP 200 and clears blocking freshness rows; CTO/platform sets `SENTRY_DSN` in Vercel Production and provides canary evidence; CTO confirms any sprint-priority override before cross-sprint reassignment.
- Done when: sprint/backlog parent-child rows remain owner-complete and dependency-explicit with binary done-state wording, and `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.

## AGN-1140 [Sprint 1 audit] Parent-child dependency hygiene refresh under AGN-58
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Freshness gate result (`2026-05-05T04:25:24.6604535+08:00`): `npm run freshness:check` reached localhost (`http://localhost:3023`, not missing) and reported `health=stale`, `blocking_non_green=27`, `dead=18`, `Sentry: MISSING` (product stale/degraded).
- Dependency-hygiene decision: keep AGN-58 child rows explicit with one owner, one blocker owner/action path, and pointer-only Sprint 2 references in Sprint 1 notes unless CTO reprioritizes.
- Owner: PM triage.
- Blocked on: stale freshness state (blocking_non_green=27, dead=18) and missing Vercel `SENTRY_DSN` verification evidence.
- Needs: platform engineer restores freshness blockers to budget-compliant state and reduces blocking/dead rows to zero; CTO/platform sets Vercel `SENTRY_DSN` with canary evidence; CTO confirms any sprint-priority override before cross-sprint dependency reassignment.
- Done when: AGN-58 parent-child rows across sprint/backlog remain synchronized with one owner + explicit `Blocked on`/`Needs` lines + binary `Done when` text, and `npm run freshness:check` exits 0 with localhost reachable and `blocking_non_green=0`.

## AGN-1156 [Sprint 1 audit] Parent-child linkage drift scan for active epics
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Freshness gate result (`2026-05-05T04:39:31.294Z`): `npm run freshness:check` reached localhost (`http://localhost:3023`, not missing) with `health=ok sourceStatus=ok`, but failed on staleness with `green=40`, `yellow=9`, `red=1`, `blocking_non_green=8`, `Sentry: MISSING` (product stale/degraded).
- Drift scan scope: active epic linkage rows under `AGN-58` and `AGN-172` in Sprint doc vs backlog continuity rows.
- Drift found and corrected in this heartbeat: `AGN-201` existed in Sprint active-epic graph but had no backlog continuity row; backlog row was added to restore parent-child continuity.
- Owner: PM triage.
- Blocked on: freshness remains non-passing (`blocking_non_green=8`, `trending-repos` RED) and missing Vercel `SENTRY_DSN` evidence.
- Needs: platform engineer restores blocking freshness rows to GREEN within budget (`trending-repos`, `awesome-skills`, `claude-rss`, `lobsters`, `npm`, `openai-rss`, `producthunt`, `twitter`); CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence.
- Done when: active epic child rows in `tasks/CURRENT-SPRINT.md` all have matching continuity rows in `tasks/BACKLOG.md`, each with one owner + explicit `Blocked on`/`Needs` + binary `Done when`, and preflight freshness exits 0.

## Blockers
- 2026-05-05 AGN-1048 [Sprint 1 audit] Blocked issue unblock-owner completeness scan: mandatory opening bundle re-verified; `npm run freshness:check` failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error` while localhost:3023 was reachable (not missing), so product is stale/degraded in this heartbeat. Completeness scan decision: keep blocked-issue rows owner/action explicit and keep execution blocked until freshness state endpoint is restored. Unblock owners: platform engineer for `/api/cron/freshness/state` HTTP 200 recovery; CTO/platform for Vercel `SENTRY_DSN` + canary evidence.
- 2026-05-04 AGN-552 [Recovery follow-up] Resolve cross-agent checkout locks on stale `in_progress` cohort: mandatory opening bundle re-verified; `npm run freshness:check` at `2026-05-04T13:13:36.826Z` reached localhost:3023 (not missing) but failed with `blocking_non_green=2` (`npm` YELLOW, `producthunt` YELLOW) and `Sentry: MISSING`. Sprint boundary decision: keep stale `in_progress` recovery documentation-only in PM lane; do not pull implementation work into Sprint 1 scope. Unblock owners: PM triage for stale-cohort owner/status normalization, platform engineer for freshness budget recovery on `npm` + `producthunt`, CTO/platform for Vercel `SENTRY_DSN`.
- 2026-05-04 AGN-364 [Sprint 1 audit] Issue evidence quality and closure gate check: mandatory opening bundle re-verified; `npm run freshness:check` at `2026-05-04T12:08:43.913Z` reached localhost:3023 (not missing) but failed with `blocking_non_green=5`, `dead=5`, `yellow=1`, and `Sentry: MISSING`, so Sprint 1 remains blocked on blocking freshness recovery + Sentry DSN evidence. Unblock owners: platform engineer for blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, `producthunt` budget recovery), CTO/platform for Vercel `SENTRY_DSN`.
- 2026-05-04 AGN-362 [Sprint 1 audit] Sprint-vs-backlog boundary compliance pass: mandatory opening bundle re-verified; `npm run freshness:check` on this heartbeat reached localhost:3023 (not missing) but failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error`, so Sprint 1 remains blocked on local freshness endpoint recovery + Sentry DSN evidence. Boundary compliance result: Sprint 1 continues to track only Phase 1.5 + local freshness unblock, and Sprint 2 audit execution remains backlog-first/pointer-only unless CTO reprioritizes. Unblock owners: platform engineer for localhost freshness endpoint recovery (`/api/health?soft=1` and `/api/cron/freshness/state`), CTO/platform for Vercel `SENTRY_DSN`, CTO for any sprint-priority override.
- 2026-05-05 AGN-343 PM Blocker Triage: board bumped-concurrency retry executed. Mandatory opening bundle re-verified; `npm run freshness:check` now reports `local server not reachable` (`ECONNREFUSED`), so localhost:3023 is missing in this heartbeat. Blocked-issue inventory query now returns `blocked_count=16` with latest-comment classifications/unblock paths: `external-fix` -> `AGN-343`, `AGN-671`, `AGN-584`, `AGN-768`, `AGN-662`, `AGN-740`, `AGN-71`, `AGN-772`, `AGN-403`, `AGN-822`, `AGN-329`, `AGN-765`, `AGN-72`; `creds` -> `AGN-819`, `AGN-210`; `decision` -> `AGN-50`. Key unblock paths: restore localhost service/freshness endpoint, restore GitHub auth, resolve board approval for AGN-50, and clear baseline typecheck/test gates for closure-dependent issues.
- 2026-05-04 AGN-318 [Sprint 1 audit] Acceptance criteria lint delta pass: mandatory opening bundle re-verified; `npm run freshness:check` at `2026-05-04T19:21:57.6874876+08:00` reached localhost:3023 (not missing) but failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error`, so Sprint 1 remains blocked on local freshness endpoint recovery + Sentry DSN evidence. Delta-lint result: new delta scope entries (`AGN-316`, `AGN-317`) retain one owner, binary done-state wording, and explicit dependency/blocker lines across sprint/backlog notes.
- 2026-05-04 AGN-317 [Sprint 1 audit] Sprint/backlog boundary consistency scan: mandatory opening bundle re-verified; `npm run freshness:check` at `2026-05-04T19:20:20.9948245+08:00` reached localhost:3023 (not missing) but failed with `GET /api/health?soft=1 -> HTTP 500`, so Sprint 1 remains blocked on local freshness endpoint recovery + Sentry DSN evidence. Boundary consistency result: Sprint 1 scope remains Phase 1.5 + local freshness unblock; out-of-scope discoveries remain backlog-only with owner + binary done-state wording.
- 2026-05-04 AGN-316 [Sprint 1 audit] blocked issue ownership drift check: mandatory opening bundle re-verified; `npm run freshness:check` at `2026-05-04T11:17:49.186Z` reached localhost:3023 (not missing) but failed with `green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, and `Sentry: MISSING`, so Sprint 1 remains blocked on freshness recovery + Sentry DSN evidence. Ownership drift check result: blocker rows continue to declare explicit unblock owners (platform engineer for blocking freshness DEAD rows `category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`; CTO/platform for Vercel `SENTRY_DSN`).
- 2026-05-04 AGN-309 [Sprint 1 audit] blocked-owner/action completeness sweep: mandatory opening bundle re-verified; `npm run freshness:check` at `2026-05-04T11:13:11.580Z` reached localhost:3023 (not missing) but failed with `green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, and `Sentry: MISSING`, so Sprint 1 remains blocked on freshness recovery + Sentry DSN evidence. Unblock owners: platform engineer for blocking freshness DEAD rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`), CTO/platform for Vercel `SENTRY_DSN`.
- 2026-05-04 AGN-282 PM Blocker Triage: mandatory opening bundle re-verified; `npm run freshness:check` at `2026-05-04T10:53:36.658Z` reached localhost:3023 (not missing) but failed with `blocking_non_green=5`, `dead=5`, `yellow=1`, and `Sentry: MISSING`, so Sprint 1 remains blocked on freshness recovery + Sentry DSN evidence. Unblock owners: platform engineer for blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, `reddit` stale budget), CTO/platform for Vercel `SENTRY_DSN`.
- 2026-05-04 AGN-276 [Sprint 1 audit] blocked issue unblock-owner completeness sweep: mandatory opening bundle re-verified; `npm run freshness:check` at `2026-05-04T10:50:00.291Z` reached localhost:3023 (not missing) but failed with `blocking_non_green=5`, `dead=5`, `yellow=1`, and `Sentry: MISSING`, so Sprint 1 remains blocked on freshness recovery + Sentry DSN evidence. Unblock owners: platform engineer for blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, `reddit` stale budget), CTO/platform for Vercel `SENTRY_DSN`.
- 2026-05-04 AGN-275 [Sprint 1 audit] sprint scope lock compliance pass: mandatory opening bundle re-verified; `npm run freshness:check` at `2026-05-04T10:48:16.389Z` reached localhost:3023 (not missing) but failed with `blocking_non_green=5`, `dead=5`, `yellow=1`, and `Sentry: MISSING`, so Sprint 1 remains blocked on freshness recovery + Sentry DSN evidence. Unblock owners: platform engineer for blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, `reddit` stale budget), CTO/platform for Vercel `SENTRY_DSN`.
- 2026-05-04 AGN-275 continuation: reran `npm run freshness:check` at `2026-05-04T13:07:38.596Z`; localhost:3023 remained reachable (not missing), prior blocking DEAD rows recovered, but check still failed with `blocking_non_green=2` (`npm`, `producthunt` both YELLOW) and `Sentry: MISSING`. Sprint 1 scope lock remains documentation-only until freshness returns to blocking-green and Vercel Sentry DSN evidence is complete. Unblock owners: platform engineer for `npm` and `producthunt` freshness budget recovery, CTO/platform for Vercel `SENTRY_DSN`.
- 2026-05-04 AGN-275 continuation: live board check via `GET /api/companies/{companyId}/issues?status=in_progress&limit=200` plus `npm run freshness:check` at `2026-05-04T13:29:59.883Z` confirms Sprint 1 scope-lock risk remains active. Freshness still fails (`blocking_non_green=2`: `npm`, `producthunt`; `Sentry: MISSING`) and cross-sprint queue is heavily mixed (examples: `AGN-544`, `AGN-545`, `AGN-514`, `AGN-517`, `AGN-520`, `AGN-531` all `in_progress` outside Sprint 1 scope). Escalation owner: CTO to confirm mixed-priority execution intent or enforce lane split.
- 2026-05-04 AGN-275 continuation: local preflight regressed again; `npm run freshness:check` failed at `2026-05-04T13:33:45+08:00` because `GET /api/health?soft=1` on localhost:3023 returned `HTTP 500 Internal Server Error`. Scope lock remains blocked on local freshness endpoint recovery and Vercel Sentry DSN evidence. Cross-sprint queue remains mixed (`GET /api/companies/{companyId}/issues?status=in_progress&limit=200`), including non-Sprint-1 critical items still active (`AGN-514`, `AGN-517`, `AGN-520`, `AGN-544`, `AGN-545`). Escalation owners: platform engineer for localhost health endpoint and freshness recovery; CTO/platform for Sentry DSN; CTO for lane-split decision.
- 2026-05-04 AGN-254 pointer-only reference: Sprint 2 blocked-issue execution details remain backlog-first in `tasks/BACKLOG.md`; keep Sprint 1 mention as pointer context only unless CTO reprioritizes.
- 2026-05-04 AGN-232 acceptance-criteria lint for new Sprint tasks: mandatory opening bundle re-verified; `npm run freshness:check` failed at `2026-05-04T17:35:26.1985645+08:00` with `ECONNREFUSED` on `http://localhost:3023` (localhost missing). Unblock owner remains platform engineer to restore local preflight endpoints before Sprint 1 close.
- 2026-05-04 AGN-231 blocked-issue unblock owner/action completeness pass: mandatory opening bundle re-verified; `npm run freshness:check` failed at `2026-05-04T17:57:46+08:00` with `ECONNREFUSED` on `http://localhost:3023` (localhost missing). Unblock owner remains platform engineer to restore local preflight endpoints before Sprint 1 close.
- 2026-05-04 AGN-230 sprint doc to issue-board consistency pass: mandatory opening bundle re-verified; `npm run freshness:check` failed at `2026-05-04T17:31:52+08:00` with `ECONNREFUSED` on `http://localhost:3023` (localhost missing). Unblock owner remains platform engineer to restore local preflight endpoints before Sprint 1 close.
- 2026-05-04 AGN-226 sprint boundary guardrail enforcement spot-check: mandatory opening bundle re-verified; `npm run freshness:check` failed at `2026-05-04T17:41:00+08:00` with `ECONNREFUSED` on `http://localhost:3023` (localhost missing). Unblock owner remains platform engineer to restore local preflight endpoints before Sprint 1 close.
- 2026-05-04 AGN-225 metadata consistency pass: mandatory opening bundle re-verified; `npm run freshness:check` failed at `2026-05-04T17:27:03.1483329+08:00` with `ECONNREFUSED` on `http://localhost:3023` (localhost missing). Unblock owner remains platform engineer to restore local preflight endpoints before Sprint 1 close.
- 2026-05-04 AGN-224 stalled in-progress recovery board sweep: mandatory opening bundle re-verified; `npm run freshness:check` at `2026-05-04T17:25:00+08:00` failed with `ECONNREFUSED` on `http://localhost:3023` (localhost missing). Unblock owner remains platform engineer to restore local preflight endpoints before Sprint 1 close.
- 2026-05-04 AGN-201 freshness gate root-cause packet: reran mandatory preflight at `2026-05-04T16:43:25.278Z` and confirmed local endpoints recovered (`/api/health?soft=1` and `/api/cron/freshness/state` both reachable; summary `green=50 yellow=0 red=0 dead=0 blocking_non_green=0`), so the earlier localhost `ECONNREFUSED` and freshness-state `HTTP 500` are no longer reproducible in this heartbeat; remaining blocker is still `Sentry: MISSING` pending Vercel `SENTRY_DSN`.
- 2026-05-04 AGN-204 sprint-boundary enforcement check: mandatory preflight now fails because localhost is missing (`npm run freshness:check` at `2026-05-04T16:42:19.1328114+08:00` returned `ECONNREFUSED` for `http://localhost:3023`); unblock owner is platform engineer to start local app and restore `/api/health?soft=1` and `/api/cron/freshness/state` reachability before Sprint 1 close.
- 2026-05-04 AGN-203 child-scope hygiene pass: local preflight regressed (`npm run freshness:check` failed at `2026-05-04T16:39:35.6975136+08:00` with `GET /api/cron/freshness/state -> HTTP 500`), localhost:3023 is reachable but freshness state is degraded; unblock owner is platform engineer to restore `/api/cron/freshness/state` to HTTP 200 before Sprint 1 close.
- 2026-05-04 AGN-184 scope audit heartbeat: local preflight is now green (`npm run freshness:check` at `2026-05-04T08:13:05.686Z` returned `green=50 yellow=0 red=0 dead=0`, `blocking_non_green=0`), and `http://localhost:3023` is reachable.
- 2026-05-04 AGN-184 scope audit heartbeat: remaining Sprint 1 blocker is Phase 1.5 verification evidence because freshness reports `health=stale sourceStatus=degraded` with `Sentry: MISSING`; Sprint 1 completion remains blocked on Vercel Sentry DSN + canary proof.
- 2026-05-04 AGN-184 scope audit heartbeat: open `in_progress` queue is cross-sprint mixed (14 total across Sprint 0/1/2), so Sprint 1 coherence depends on explicit backlog boundaries and no pull-in of non-Sprint-1 work without CTO reprioritization.
- 2026-05-03: `/api/cron/freshness/state` inventory was expanded beyond the
  original scanner-only set. Direct route probe returned green=40, yellow=1,
  dead=9. Non-green rows: agent-commerce, category-metrics, consensus,
  engagement-composite, hotness-snapshots, mcp-dependents, mcp-smithery-rank,
  model-usage, skill-install-snapshots, trendshift-daily.
- 2026-05-03 repair pass: worker root redeployed to Railway deployment
  `d73c4e73-b5ea-4dd6-be32-294febd38d44` from commit `30bd20bb`; production
  `/api/worker/health` returned HTTP 200 with green=34, amber=2, red=0,
  missing=0, blockingRed=0, blockingMissing=0. Authenticated production
  `npm run freshness:check -- --prod --timeout-ms 30000` returned 18 green.
  Local expanded `npm run freshness:check -- --timeout-ms 30000` improved to
  green=45, yellow=0, red=0, dead=5. Remaining dead rows:
  hotness-snapshots (trending-skill snapshot published 0 items),
  mcp-dependents (LIBRARIES_IO_API_KEY missing), mcp-smithery-rank
  (SMITHERY_API_KEY missing), model-usage (cron succeeds but no events touched),
  skill-install-snapshots (no install data found). Superseded by the advisory
  deferral below.
- 2026-05-03 Mirko deferred the five advisory rows. Expanded freshness now
  reports advisory rows with `blocking=false`; local
  `npm run freshness:check -- --timeout-ms 30000` returned green=50, yellow=0,
  red=0, dead=0, blocking_non_green=0, advisory_non_green=0. Phase 1.2 may
  proceed.

## Notes for next session
- 2026-05-03 Phase 1.1 done: wired GitHub pool cold-start hydration (`hydrate: true`) into the singleton, exposed hydration status on `/admin/pool`, and added regression tests for hydrate off/on behavior.
- 2026-05-03 Phase 1.1 worker bypass migration done: `skill-derivatives` and `recent-repos` now use the worker GitHub token pool instead of direct `GITHUB_TOKEN` / `GH_PAT` reads; targeted worker regression test passed.
- Build verification found missing Sentry Next 15 hooks; patched only the required `onRouterTransitionStart` and `onRequestError` exports so `next build` can compile. Phase 1.5 Sentry delivery verification is still open.
- Verification: `npm run freshness:check` passed with 18 green / 0 yellow / 0 red / 0 dead; `npx tsx --test src/lib/__tests__/github-token-pool.test.ts` passed 23/23; `npm run typecheck` passed; `npm run lint:guards` passed; `$env:NODE_PATH=(Join-Path (Get-Location) 'node_modules'); cmd /c npm run build` passed. Plain `cmd /c npm run build` still fails in this local checkout because `.next` is a junction to `%TEMP%\trendingrepo-next-dev`, causing `_document.js` to miss repo `node_modules` during page-data collection.
- 2026-05-03 preflight correction: the prior freshness pass only covered the
  old 18-row inventory; the expanded rows have now been repaired or explicitly
  deferred.
- 2026-05-03 advisory preflight deferral done: `hotness-snapshots`,
  `mcp-dependents`, `mcp-smithery-rank`, `model-usage`, and
  `skill-install-snapshots` no longer block `freshness:check`.
- 2026-05-03 advisory side-channel repair done: empty/disabled worker payloads
  now refresh `hotness-snapshots`, `mcp-dependents`, `mcp-smithery-rank`, and
  `skill-install-snapshots`; the LLM aggregate cron now writes
  `llm-aggregate-heartbeat` so `model-usage` reflects cron liveness even when
  no events are processed.
- 2026-05-03 Phase 1.2 done: root Reddit scrapers and the Railway worker now
  support comma/newline-separated `REDDIT_USER_AGENTS` round-robin rotation
  when `REDDIT_USER_AGENT` is absent; the single-UA override remains stable.
  GitHub Actions pass the new secret through on Reddit jobs, admin scan child
  env allow-list includes it, and deploy docs describe it. Verification:
  `node --test scripts/__tests__/reddit-shared.test.mjs` passed 8/8;
  `npm run test:scraper-shared` passed 46/46; `npm run test:reddit` passed
  54/54; `npx vitest run tests/reddit-source.test.ts` passed 2/2;
  root `npm run typecheck` passed; worker `npm run typecheck` passed;
  `npm run lint:guards` passed.
- 2026-05-03 landing/signals production wiring repair shipped (no file removals):
  landing skills board now shows only live skill rows (no repo fallback),
  landing consensus list expanded to 8 rows, live table stars now render
  strong white starred values, and `/signals` source chips now show
  per-source counts with brand-tinted dark active states instead of white
  pills. Consensus radar rows now render project logos (`EntityLogo`) plus
  source marks. Verification: `npx vitest run
  src/lib/__vitest__/home-page-honesty.test.ts
  src/components/home/__tests__/LiveTopTable.test.tsx
  src/components/signals-terminal/__tests__/SourceFilterBar.test.tsx` passed
  5/5; `npm run typecheck` passed; `npm run build` passed; production deploy
  completed at
  `https://starscreener-r8xdgyr4r-kermits-projects-6330acd4.vercel.app`;
  `https://trendingrepo.com/signals` now contains `signals-chip-count` and
  `--chip-color` markers, and `https://trendingrepo.com/` renders 8
  `cons-row` entries.
- 2026-05-03 Phase 1.2 hardening pass: added `config/reddit-user-agents.json`,
  new Redis telemetry/quarantine primitives in `src/lib/pool/reddit-*.ts`,
  extended `EngineError` with Reddit classes, and wired app + shared Reddit
  fetch paths to use pool selection with quarantine signaling on 429/403/5xx.
- 2026-05-03 Phase 1.3 done: added Nitter instance pool config
  (`config/nitter-instances.json`), Twitter fallback telemetry and runtime
  adapters (`src/lib/pool/twitter-*.ts`), nightly Nitter health workflow
  (`.github/workflows/check-nitter.yml`), and migrated the main Twitter
  collector to route Apify calls through the new Apify->Nitter fallback path.
- 2026-05-04 Phase 1.4 done: added authenticated `/api/admin/pool-state` and
  `/admin/keys` runtime dashboard for GitHub, Reddit, Twitter/Nitter, pool
  anomalies, and singleton source health. Verification: `npm run
  freshness:check -- --timeout-ms 30000` passed with blocking_non_green=0;
  `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`
  passed. Local auth probe returned API/page HTTP 200 with pool rows populated.
- 2026-05-04 Phase 1.5 partial: `EngineError` hierarchy expanded to the
  38-class target, active root `instrumentation.ts` plus
  `src/instrumentation.ts` log `SENTRY_DSN` startup status,
  `/api/_internal/sentry-canary` exists behind `CRON_SECRET` and
  `SENTRY_CANARY_ENABLED=1` via physical App Router folder
  `src/app/api/%5Finternal/sentry-canary`, and `scripts/check-freshness.mts` reports a
  Sentry readiness row. Verification is blocked because Vercel production is
  missing `SENTRY_DSN`, and the local shell is missing `SENTRY_AUTH_TOKEN` /
  Sentry org/project values for dashboard API proof. Railway production worker
  does have `SENTRY_DSN` configured.

## Blocked issue unblock-owner matrix (AGN-185, 2026-05-04)

| Issue | Owner | Blocked on | Needs (unblock action) | Done when |
|---|---|---|---|---|
| AGN-224 Stalled in-progress recovery board sweep | PM triage | Local preflight failed this heartbeat (`npm run freshness:check` -> `ECONNREFUSED` on localhost:3023), so Sprint 1 close-readiness cannot be verified | Platform engineer restores localhost stack and freshness endpoints; PM reruns mandatory preflight and refreshes sprint/backlog boundary notes in same heartbeat | `npm run freshness:check` exits 0 with localhost reachable and Sprint 1 boundary notes updated with timestamped evidence |
| AGN-172 Sprint 1 scope guardrail | PM triage | Cross-sprint `in_progress` mix creates scope bleed risk | CTO confirms whether mixed execution is intentional; PM then keeps non-Sprint-1 items out of Sprint 1 lane | Sprint 1 reporting lists only Phase 1.5 + local freshness unblock scope, and out-of-scope work stays backlog-only |
| AGN-184 Sprint 1 scope audit | Platform engineer | Phase 1.5 cannot verify while Vercel Sentry DSN is missing | CTO/platform sets `SENTRY_DSN` on Vercel and reruns canary evidence path | `npm run freshness:check` no longer reports `Sentry: MISSING` and canary evidence is logged in sprint notes |
| AGN-185 Blocked issue unblock-owner matrix | PM triage | No explicit unblock owner/action map across active blockers | PM maintains this matrix in `tasks/CURRENT-SPRINT.md` each heartbeat with verified freshness evidence | Each active blocker has one owner, one unblock action, and one binary done-state line |
| AGN-231 Blocked-issue unblock owner/action completeness | PM triage | Mandatory preflight currently fails (`npm run freshness:check` -> `ECONNREFUSED` on `http://localhost:3023`) so unblock-owner verification cannot close | Platform engineer restores localhost preflight endpoints; PM reruns mandatory opening + updates sprint/backlog issue metadata in the same heartbeat | Freshness check exits 0 with localhost reachable, and AGN-231-linked blocker rows each include one owner, one unblock action, and one binary done-state line |
| AGN-276 [Sprint 1 audit] blocked issue unblock-owner completeness sweep | PM triage | Mandatory preflight is reachable but degraded (`npm run freshness:check` at `2026-05-04T10:50:00.291Z`: `blocking_non_green=5`, `dead=5`, `yellow=1`, `Sentry: MISSING`), so blocker closure remains open | Platform engineer clears blocking non-green freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, `reddit` stale budget); CTO/platform sets Vercel `SENTRY_DSN`; PM reruns mandatory opening checks and revalidates blocker-owner lines in sprint/backlog docs | Freshness check exits 0 with `blocking_non_green=0` and no blocking DEAD rows, Sentry readiness is no longer `MISSING`, and all active blocker rows retain one owner, one unblock action, and one binary done-state line |
| AGN-282 PM Blocker Triage | PM triage | Mandatory preflight is reachable but degraded (`npm run freshness:check` at `2026-05-04T10:53:36.658Z`: `blocking_non_green=5`, `dead=5`, `yellow=1`, `Sentry: MISSING`), so blocker closure remains open | Platform engineer clears blocking non-green freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, `reddit` stale budget); CTO/platform sets Vercel `SENTRY_DSN`; PM reruns mandatory opening checks and revalidates blocker-owner lines in sprint/backlog docs | Freshness check exits 0 with `blocking_non_green=0` and no blocking DEAD rows, Sentry readiness is no longer `MISSING`, and all active blocker rows retain one owner, one unblock action, and one binary done-state line |
| AGN-301 [Sprint 1 audit] Blocked-issue metadata completeness sweep | PM triage | Mandatory opening preflight is reachable but stale/degraded (`npm run freshness:check` at `2026-05-04T11:05:38.114Z`: localhost:3023 reachable, `blocking_non_green=4`, `dead=5`, `advisory_non_green=1`, `Sentry: MISSING`), so blocked-issue metadata closure remains documentation-only this heartbeat | Platform engineer clears blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`); CTO/platform sets Vercel `SENTRY_DSN`; PM reruns mandatory opening checks and revalidates blocker metadata lines in sprint/backlog docs | All active blocked-issue rows in sprint/backlog retain one owner, one unblock action, and one binary done-state line aligned to the latest verified preflight evidence, and freshness check exits 0 with no blocking non-green rows |
| AGN-343 PM Blocker Triage | PM triage | Mandatory preflight now fails with localhost unreachable (`ECONNREFUSED` at `http://localhost:3023`); blocked inventory currently returns 16 blocked issues | Unblock owners by class: platform engineer restores localhost service/freshness endpoint; CTO/platform restores GitHub auth for creds blockers (`AGN-819`,`AGN-210`); board/user resolves AGN-50 decision; platform/frontend/backend owners clear external-fix blockers and baseline gates (`AGN-343`,`AGN-671`,`AGN-584`,`AGN-768`,`AGN-662`,`AGN-740`,`AGN-71`,`AGN-772`,`AGN-403`,`AGN-822`,`AGN-329`,`AGN-765`,`AGN-72`) | Each blocked issue has a current classification + explicit unblock owner/action in AGN-343 evidence, any resolved blocker is moved off blocked, and freshness preflight reaches green with localhost reachable and `blocking_non_green=0` |

## AGN-58 child dependency graph (hygiene pass, AGN-203)

| Issue | Parent | Owner | Blocked on | Needs | Done when |
|---|---|---|---|---|---|
| AGN-172 Sprint 1 scope guardrail | AGN-58 | PM triage | Cross-sprint `in_progress` mix can pull non-Sprint-1 work into Sprint 1 reporting | CTO confirms mixed-priority intent or directs strict lane split | Sprint 1 board/report stays scoped to Phase 1.5 + freshness unblock only |
| AGN-173 Sprint 1 issue quality bar | AGN-172 | PM triage | Ticket hygiene drifts when new work is added without owner/done/dependency lines | PM enforces one owner + binary done + dependency lines on every Sprint 1 issue | Every Sprint 1 issue has complete ownership/acceptance/dependency metadata |
| AGN-174 Parent-child linkage consistency | AGN-172 | PM triage | Child links can drift across sprint/backlog notes | PM updates sprint/backlog notes whenever child links or dependency directions change | No orphan Sprint 1 child issues and dependency direction is explicit |
| AGN-185 Blocked issue unblock-owner matrix | AGN-58 | PM triage | Blocked issues can sit without explicit unblock owner/action | PM maintains unblock-owner matrix with timestamped verification evidence each heartbeat | Every active blocker has one unblock owner, one action, and one binary outcome line |
| AGN-186 AGN-58 child issue hygiene + dependency pass | AGN-58 | PM triage | Prior AGN-58 child graph was distributed across notes and not centralized | PM adds/maintains canonical AGN-58 child graph table in sprint docs and backlog cross-reference | AGN-58 child set has explicit parent, owner, blocker, need, and done-state fields |
| AGN-203 AGN-58 child scope hygiene and ownership consistency pass | AGN-58 | PM triage | Ownership/done-state lines can drift from current preflight status when freshness regresses | PM re-verifies mandatory preflight and updates Sprint/Backlog AGN-58 child references in the same heartbeat | All AGN-58 children listed in sprint/backlog have one owner, explicit blocker/needs lines, and binary done-state wording aligned to latest verification evidence |
| AGN-225 AGN-58 child metadata consistency pass | AGN-58 | PM triage | AGN-58 child lists across sprint/backlog can drift and omit active children | PM re-runs mandatory opening checks, reconciles AGN-58 child entries in sprint/backlog, and records freshness evidence in the same heartbeat | AGN-58 child metadata in `tasks/CURRENT-SPRINT.md` and `tasks/BACKLOG.md` is synchronized with AGN-225 present, one owner per issue, and explicit blocker/needs lines |
| AGN-230 Sprint doc to issue-board consistency pass | AGN-58 | PM triage | Sprint doc and issue-board metadata can drift when heartbeat evidence changes | PM re-runs mandatory opening checks, reconciles sprint/backlog issue rows against board scope, and records freshness evidence in the same heartbeat | Sprint/backlog issue metadata is synchronized with board scope for AGN-230, with one owner per issue, explicit blocker/needs lines, and binary done-state wording |
| AGN-231 Blocked-issue unblock owner/action completeness | AGN-58 | PM triage | Blocked rows can drift and lose explicit unblock owner/action fields when freshness status changes | PM re-runs mandatory opening checks, verifies blocker status, and enforces owner/action/done-state completeness across blocker rows in sprint/backlog notes | All AGN-231-linked blocker rows retain one owner, one unblock action, and one binary done-state line aligned to latest verification evidence |
| AGN-232 Acceptance-criteria quality lint for new Sprint tasks | AGN-58 | PM triage | Newly created sprint triage tickets can drift from owner/done/dependency standards | PM runs a focused lint pass over newly created sprint tasks and patches sprint/backlog wording in the same heartbeat when gaps are found | Every newly created sprint triage issue has one owner, one binary done-state line, and explicit dependency/blocker text |
| AGN-363 [Sprint 1 audit] AGN dependency graph hygiene refresh | AGN-58 | PM triage | Dependency graph rows can drift from current freshness evidence and lose explicit blocker/action ownership | PM reruns mandatory opening + `npm run freshness:check`, then refreshes AGN-58 graph rows with one owner, explicit Blocked on/Needs lines, and binary done-state wording | AGN-58 dependency graph entries stay synchronized across sprint/backlog docs with one owner per issue, explicit blockers/actions, and binary done-state text aligned to the latest verified heartbeat evidence |
| AGN-1140 [Sprint 1 audit] Parent-child dependency hygiene refresh under AGN-58 | AGN-58 | PM triage | AGN-58 child linkage can drift when stale preflight evidence or sprint/backlog updates are applied asymmetrically | PM reruns mandatory opening + `npm run freshness:check`, then patches sprint/backlog AGN-58 rows in the same heartbeat with explicit owner/blocker/needs fields | AGN-58 parent-child rows remain synchronized across sprint/backlog docs with one owner, explicit blocker/action lines, and binary done-state wording tied to the latest verified evidence |
| AGN-1353 [Sprint 1 audit] Parent-child linkage integrity pass for AGN-58 tree | AGN-58 | PM triage | Mandatory freshness script cannot execute in current shell because `tsx` is missing and direct localhost probes to `http://localhost:3023/api/health?soft=1` and `/api/cron/freshness/state` fail with connection errors | Platform engineer restores local toolchain (`tsx` available for `npm run freshness:check`) and brings localhost:3023 back; PM reruns mandatory opening and updates Sprint/Backlog AGN-58 rows in the same heartbeat | AGN-58 parent-child linkage rows across sprint/backlog stay synchronized with one owner, explicit `Blocked on`/`Needs` wording, and binary done-state text, with fresh verification evidence |
| AGN-253 Sprint 2 parent-child linkage integrity | AGN-58 | PM triage | Pointer-only in Sprint 1; execution updates are backlog-first | See `tasks/BACKLOG.md` AGN-253 follow-through entry | Sprint 1 keeps pointer-only context unless CTO reprioritizes |
| AGN-290 [Sprint 2 audit] Parent-child dependency drift sweep under AGN-58 | AGN-58 | PM triage | Pointer-only in Sprint 1; execution updates are backlog-first | See `tasks/BACKLOG.md` AGN-290 follow-through entry | Sprint 1 keeps pointer-only context unless CTO reprioritizes |
| AGN-277 Sprint 1 audit parent-child linkage integrity under AGN-58 | AGN-58 | PM triage | Mandatory opening preflight is reachable but degraded (`npm run freshness:check` at `2026-05-04T10:51:44.773Z`: localhost:3023 reachable, `blocking_non_green=5`, `dead=5`, `yellow=1`, `Sentry: MISSING`), so closure remains documentation-only | PM keeps AGN-58 parent-child links synchronized across sprint/backlog notes; platform engineer clears blocking freshness rows; CTO/platform sets Vercel `SENTRY_DSN`; rerun opening checks in same heartbeat | AGN-277 linkage references remain explicit under AGN-58 with one owner, explicit blocker/needs text, and binary done-state wording aligned to latest verified preflight evidence |
| AGN-204 Sprint 1 vs backlog boundary enforcement check | AGN-172 | PM triage | Boundary hygiene can drift when preflight state changes and out-of-scope failures are pulled into sprint lanes | PM re-runs mandatory opening checks, records freshness evidence, and updates sprint/backlog boundary notes in the same heartbeat | Sprint scope remains Phase 1.5 + local freshness unblock only, with all non-Sprint-1 discoveries captured backlog-only with owner and binary done-state text |

## AGN-205 acceptance-criteria quality audit (2026-05-04 heartbeat)

Audit scope (newly created Sprint 1 triage tasks): `AGN-185`, `AGN-186`, `AGN-201`, `AGN-203`, `AGN-204`.

| Issue | Owner | Binary done-state present | Dependencies/blockers explicit | Result |
|---|---|---|---|---|
| AGN-185 | PM triage | Yes (`Done when` in unblock-owner matrix) | Yes | PASS |
| AGN-186 | PM triage | Yes (`Done when` in backlog + AGN-58 graph) | Yes | PASS |
| AGN-201 | Platform engineer | No canonical done-state line existed in graph | Partial (blocker noted, dependency not normalized) | FAIL |
| AGN-203 | PM triage + platform dependency | Yes (`Done when` in AGN-58 graph + backlog) | Yes | PASS |
| AGN-204 | PM triage + platform dependency | Yes (`Done when` in AGN-58 graph + backlog) | Yes | PASS |

Remediation applied in this heartbeat:
- Added AGN-201 as a first-class row in blocked issue matrix below with explicit owner, blocker, dependency action, and binary done-state.

## AGN-201 normalization row (added by AGN-205)

| Issue | Owner | Blocked on | Needs (unblock action) | Done when |
|---|---|---|---|---|
| AGN-201 freshness gate root-cause packet | Platform engineer | Local preflight is currently hard-failed (`npm run freshness:check` -> `ECONNREFUSED` on `http://localhost:3023` in AGN-224 heartbeat), so freshness-state health cannot be evaluated | Platform engineer restores localhost service and freshness endpoints, then reruns freshness check with timestamped output attached | `npm run freshness:check` exits 0 with localhost reachable and `blocking_non_green=0` |

## AGN-232 acceptance-criteria lint (2026-05-04 heartbeat)

Lint scope (new Sprint triage tasks created in this wave): `AGN-224`, `AGN-225`, `AGN-226`, `AGN-230`, `AGN-231`.

| Issue | One owner | Binary done-state present | Dependencies/blockers explicit | Result |
|---|---|---|---|---|
| AGN-224 | Yes (PM triage) | Yes (`Done when` line in backlog follow-through row) | Yes (`Dependencies` line names CTO + platform actions) | PASS |
| AGN-225 | Yes (PM triage) | Yes (`Done when` line in backlog follow-through row) | Yes (`Dependencies` line names platform action) | PASS |
| AGN-226 | Yes (PM triage) | Yes (`Done when` line in backlog follow-through row) | Yes (`Dependencies` line names CTO + platform actions) | PASS |
| AGN-230 | Yes (PM triage) | Yes (`Done when` line in backlog follow-through row) | Yes (`Dependencies` line names CTO + platform actions) | PASS |
| AGN-231 | Yes (PM triage) | Yes (`Done when` line in backlog follow-through row) | Yes (`Dependencies` line names CTO + platform actions) | PASS |

Remediation in this heartbeat:
- Added AGN-232 to the AGN-58 child dependency graph with owner, blocker, needs, and binary done-state text to keep the lint requirement durable in Sprint docs.

## AGN-282 blocked-issue triage matrix (2026-05-04 heartbeat)

Blocked issue inventory was re-queried from Paperclip (`/api/companies/{companyId}/issues?status=blocked`, count=3). No blocked issue was moved to `todo` because credential/deploy prerequisites are still unresolved in reality.

| Issue | Latest blocker summary | Type | Unblocking path | Escalate to |
|---|---|---|---|---|
| AGN-419 | Waiting for production deploy verification and 24h CSP violation monitoring visibility | external-fix | CTO/platform deploys CSP changes to prod and provides Sentry CSP monitoring visibility for 24h zero-violation proof | CTO |
| AGN-343 | Freshness still non-green (`npm`, `producthunt`) and missing telemetry creds (`SENTRY_DSN`, `ADMIN_TOKEN`, Redis/Upstash) | creds + external-fix | Platform clears freshness blockers; CTO/platform provisions missing telemetry credentials | CTO + platform |
| AGN-379 | QA proof blocked by missing `ADMIN_TOKEN` and missing Redis/Upstash credentials | creds | CTO/platform provides admin auth or Redis read creds so 6-sample/30m UA distribution proof can run | CTO/platform |

## AGN-268 acceptance-criteria lint (2026-05-04 heartbeat)

Mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).

Freshness preflight evidence for this lint pass:
- `npm run freshness:check` at `2026-05-04T10:55:06.354Z` reached `http://localhost:3023` (not missing) and failed with `blocking_non_green=5`, `dead=5`, `yellow=1`, `Sentry: MISSING`.

Lint scope (active Sprint issue rows in `tasks/CURRENT-SPRINT.md` blocker matrix): `AGN-172`, `AGN-184`, `AGN-185`, `AGN-224`, `AGN-231`, `AGN-276`, `AGN-282`.

| Issue | One owner | Binary done-state present | Blocked on + Needs explicit | Result |
|---|---|---|---|---|
| AGN-172 | Yes (PM triage) | Yes (`Done when` in blocker matrix + AGN-58 graph) | Yes | PASS |
| AGN-184 | Yes (Platform engineer) | Yes (`Done when` in blocker matrix) | Yes | PASS |
| AGN-185 | Yes (PM triage) | Yes (`Done when` in blocker matrix + AGN-58 graph) | Yes | PASS |
| AGN-224 | Yes (PM triage) | Yes (`Done when` in blocker matrix) | Yes | PASS |
| AGN-231 | Yes (PM triage) | Yes (`Done when` in blocker matrix + AGN-58 graph) | Yes | PASS |
| AGN-276 | Yes (PM triage) | Yes (`Done when` in blocker matrix) | Yes | PASS |
| AGN-282 | Yes (PM triage) | Yes (`Done when` in blocker matrix) | Yes | PASS |

Result: acceptance-criteria lint for active Sprint issue rows is PASS (7/7). Sprint remains blocked for release readiness by freshness non-green rows and missing Vercel `SENTRY_DSN`, which is outside AGN-268 lint scope.

## AGN-292 acceptance-criteria lint for newly seeded audit tasks (2026-05-04 heartbeat)

Mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).

Freshness preflight evidence for this lint pass:
- `npm run freshness:check` at `2026-05-04T10:59:47.986Z` reached `http://localhost:3023` (localhost not missing) and failed with `blocking_non_green=4`, `dead=5`, `advisory_non_green=1`, `Sentry: MISSING` (product stale/degraded).

Lint scope (newly seeded audit tasks tracked in Sprint/Backlog notes): `AGN-275`, `AGN-276`, `AGN-277`, `AGN-282`, `AGN-290`, `AGN-291`.

| Issue | One owner | Binary done-state present | Dependencies/blockers explicit | Result |
|---|---|---|---|---|
| AGN-275 | Yes (PM triage) | Yes (`Done when` under backlog follow-through) | Yes (`Dependencies` names platform + CTO actions) | PASS |
| AGN-276 | Yes (PM triage) | Yes (`Done when` under backlog follow-through + blocker matrix row) | Yes (explicit platform + CTO unblock actions) | PASS |
| AGN-277 | Yes (PM triage) | Yes (`Done when` under backlog follow-through + AGN-58 graph row) | Yes (explicit platform + CTO unblock actions) | PASS |
| AGN-282 | Yes (PM triage) | Yes (`Done when` under backlog follow-through + blocker matrix row) | Yes (explicit platform + CTO unblock actions) | PASS |
| AGN-290 | Yes (PM triage) | Yes (`Done when` under backlog follow-through + AGN-58 graph row) | Yes (explicit platform + CTO unblock actions) | PASS |
| AGN-291 | Yes (PM triage) | Yes (`Done when` under backlog follow-through + Sprint boundary section) | Yes (explicit CTO/platform dependencies) | PASS |

Result: acceptance-criteria lint for newly seeded audit tasks is PASS (6/6). Sprint close-readiness remains blocked by freshness non-green rows and missing Vercel `SENTRY_DSN`, which are outside AGN-292 lint scope.

## AGN-295 acceptance-criteria drift check for active Sprint 1 issues (2026-05-04 heartbeat)

Mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).

Freshness preflight evidence for this drift check:
- `npm run freshness:check` at `2026-05-04T11:06:33.768Z` reached `http://localhost:3023` (localhost not missing) and failed with `green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING`.

Drift scope: active Sprint rows currently maintained in the blocker matrix (`AGN-172`, `AGN-184`, `AGN-185`, `AGN-224`, `AGN-231`, `AGN-276`, `AGN-282`, `AGN-301`).

| Check | Expected | Observed | Result |
|---|---|---|---|
| Owner declared per active issue | 11/11 | 11/11 | PASS |
| Binary done-state declared per active issue | 11/11 | 11/11 | PASS |
| Explicit blocker + needs lines per active issue | 11/11 | 11/11 | PASS |
| Sprint-boundary compliance for active Sprint 1 rows | 0 Sprint 2 issues in Sprint 1 active matrix | 0 Sprint 2 issues in active Sprint 1 blocker matrix | PASS |

Residual risk (release QA): Sprint 1 acceptance text quality is green and active matrix scope is now pointer-only clean; release readiness remains blocked by freshness non-green rows and missing Vercel `SENTRY_DSN`.

## AGN-310 acceptance-criteria lint for new audit tasks (2026-05-04 heartbeat)

Mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).

Freshness preflight evidence for this lint pass:
- `npm run freshness:check` at `2026-05-04T11:15:00.077Z` reached `http://localhost:3023` (localhost not missing) and failed with `green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING` (product stale/degraded).

Lint scope (new audit tasks seeded after AGN-292): `AGN-300`, `AGN-301`, `AGN-302`, `AGN-308`, `AGN-309`.

| Issue | One owner | Binary done-state present | Dependencies/blockers explicit | Result |
|---|---|---|---|---|
| AGN-300 | Yes (PM triage) | Yes (`Done when` in Sprint + backlog continuity row) | Yes (platform + CTO unblock actions listed) | PASS |
| AGN-301 | Yes (PM triage) | Yes (`Done when` in blocker matrix + backlog continuity row) | Yes (platform + CTO unblock actions listed) | PASS |
| AGN-302 | Yes (PM triage) | Yes (`Done when` in Sprint + backlog continuity row) | Yes (platform + CTO unblock actions listed) | PASS |
| AGN-308 | Yes (PM triage) | Yes (`Done when` in Sprint + backlog continuity row) | Yes (CTO override + freshness/Sentry dependencies listed) | PASS |
| AGN-309 | Yes (PM triage) | Yes (`Done when` in Sprint + backlog continuity row) | Yes (platform + CTO unblock actions listed) | PASS |

Result: acceptance-criteria lint for new audit tasks is PASS (5/5). Sprint close-readiness remains blocked by freshness non-green rows and missing Vercel `SENTRY_DSN`, which are outside AGN-310 lint scope.

## AGN-318 acceptance-criteria lint delta pass (2026-05-04 heartbeat)

Mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).

Freshness preflight evidence for this delta pass:
- `npm run freshness:check` at `2026-05-04T19:21:57.6874876+08:00` reached `http://localhost:3023` (localhost not missing) and failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error` (product stale/degraded).

Delta lint scope (newly added triage rows since AGN-310 pass): `AGN-316`, `AGN-317`.

| Issue | One owner | Binary done-state present | Dependencies/blockers explicit | Result |
|---|---|---|---|---|
| AGN-316 | Yes (PM triage) | Yes (`Done when` under backlog continuity row) | Yes (platform + CTO unblock actions listed) | PASS |
| AGN-317 | Yes (PM triage) | Yes (`Done when` under backlog continuity row) | Yes (platform + CTO unblock actions listed) | PASS |

Result: acceptance-criteria lint delta pass is PASS (2/2). Sprint close-readiness remains blocked by local freshness endpoint HTTP 500 and missing Vercel `SENTRY_DSN`, which are outside AGN-318 lint scope.

## AGN-605 [Sprint 1 audit] Sprint/backlog boundary hygiene audit
- Evidence (2026-05-04 heartbeat): mandatory opening bundle re-verified and `npm run freshness:check` at `2026-05-04` reached localhost:3023 (not missing) but failed with `GET /api/cron/freshness/state -> HTTP 401 unauthorized`.
- Evidence refresh (2026-05-04 heartbeat): mandatory opening bundle re-verified and `npm run freshness:check` reached localhost:3023 (not missing) but failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error`.
- Boundary-hygiene decision for this heartbeat: keep Sprint 1 limited to Phase 1.5 + local freshness unblock, and keep all non-Sprint-1 execution updates backlog-first unless CTO reprioritizes.
- Owner: PM triage.
- Blocker classification: AGN-605 itself is executable (documentation/triage lane), not a hard blocker.
- Operator action packet (explicit):
  1. Env var: set `SENTRY_DSN` in Vercel Production for project `trendingrepo.com`.
  2. Dashboard URL: `https://vercel.com/dashboard` -> project `trendingrepo.com` -> Settings -> Environment Variables.
  3. Command: rerun `npm run freshness:check` locally after freshness auth fix to verify `GET /api/cron/freshness/state` returns 200.
  4. Decision owner: CTO confirms whether any non-Sprint-1 `in_progress` issue is intentionally allowed to stay in Sprint 1 lane.
- Done when: every active Sprint row keeps one owner + explicit blocker/action + binary `Done when`, and Sprint 2+ execution remains backlog-first unless CTO reprioritizes.

## AGN-606 [Sprint 1 audit] Blocked issue unblock-owner completeness audit
- Evidence (2026-05-04 heartbeat): mandatory opening bundle re-verified and `npm run freshness:check` at `2026-05-04T22:03:49.5441998+08:00` reached localhost:3023 (not missing) but failed with `GET /api/cron/freshness/state -> HTTP 401 unauthorized`.
- Completeness decision for this heartbeat: keep blocked-issue tracking in triage lane with explicit unblock owner/action per row; do not move blocked implementation work into Sprint 1 until freshness auth and Sentry readiness are unblocked.
- Owner: PM triage.
- Blocked on: local freshness authorization failure (`/api/cron/freshness/state` 401 unauthorized) and missing Vercel `SENTRY_DSN` readiness evidence.
- Needs: platform engineer restores local freshness auth behavior so `npm run freshness:check` can read freshness state; CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence; CTO confirms any Sprint priority override.
- Done when: active blocked-issue rows keep one owner + one unblock action + one binary done-state line, and `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.

## AGN-607 [Sprint 1 audit] Child-issue acceptance criteria lint audit
- Evidence (2026-05-04 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`) and `npm run freshness:check` failed at `2026-05-04` with `GET /api/cron/freshness/state -> HTTP 401 unauthorized` while localhost:3023 remained reachable (not missing).
- Lint scope (new child triage audit issues in this wave): `AGN-605`, `AGN-606`, `AGN-607`.
- Lint result: `AGN-605` PASS, `AGN-606` PASS, `AGN-607` PASS for one owner, binary done-state text, and explicit blocker/dependency wording across sprint/backlog notes.
- Owner: PM triage.
- Blocked on: local freshness authorization failure (`/api/cron/freshness/state` 401 unauthorized) and missing Vercel `SENTRY_DSN` readiness evidence.
- Needs: platform engineer restores local freshness auth path so preflight can return a valid freshness payload; CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence; CTO confirms any sprint-priority override before scope changes.
- Done when: every newly added child triage issue row keeps one owner + one binary `Done when` line + explicit `Blocked on`/`Needs` wording, and `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.

## AGN-1048 [Sprint 1 audit] Blocked issue unblock-owner completeness scan
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`) and `npm run freshness:check` failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error` while localhost:3023 remained reachable (not missing), so product is stale/degraded.
- Completeness scan decision for this heartbeat: blocked-issue rows remain owner/action complete in triage docs; implementation closure stays blocked until freshness-state endpoint recovery and Sentry readiness evidence are restored.
- Owner: PM triage.
- Blocked on: local freshness-state endpoint failure (`/api/cron/freshness/state` HTTP 500) and missing Vercel `SENTRY_DSN` readiness evidence.
- Needs: platform engineer restores `/api/cron/freshness/state` to HTTP 200 for `npm run freshness:check`; CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence; CTO confirms any sprint-priority override before scope reassignment.
- Done when: blocked issue rows keep one owner + one unblock action + one binary done-state line, and `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.

## AGN-1138 [Sprint 1 audit] Blocked-issue unblock owner/action completeness pass
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`) and `npm run freshness:check` at `2026-05-05T04:25:16+08:00` reached localhost:3023 (not missing) but failed with `health=stale`, `blocking_non_green=27`, `dead=18`, and `Sentry: MISSING`, so product is stale/degraded.
- Completeness pass decision: blocked-issue triage rows remain owner/action explicit; no blocked issue is advanced without freshness recovery and Sentry readiness evidence.
- Owner: PM triage.
- Blocked on: freshness gate remains non-passing (`blocking_non_green=27`, including blocking DEAD/RED rows such as `category-metrics`, `trending-repos`, `star-snapshots`, `mcp-downloads`) and Vercel `SENTRY_DSN` remains missing.
- Needs: platform engineer restores blocking freshness sources to budget-compliant GREEN and returns `npm run freshness:check` to exit 0; CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence; CTO confirms any sprint-priority override before scope reassignment.
- Done when: every blocked issue row keeps one owner + one unblock action + one binary done-state line, and `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.

## AGN-1155 [Sprint 1 audit] Blocked issue unblock-owner/action completeness sweep
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`) and `npm run freshness:check` at `2026-05-05T04:39:30.743Z` reached localhost:3023 (not missing) with `health=ok` and `sourceStatus=ok` but failed on freshness policy with `green=40`, `yellow=9`, `red=1`, `blocking_non_green=8`, `advisory_non_green=2`, `Sentry: MISSING` (`trending-repos` RED).
- Completeness sweep decision: blocker rows remain in triage lane with explicit unblock owner/action wording; no blocked implementation issue is advanced while blocking freshness and Sentry readiness gaps remain.
- Owner: PM triage.
- Blocked on: blocking freshness remains non-passing (`trending-repos` RED; blocking YELLOW includes `awesome-skills`, `claude-rss`, `lobsters`, `npm`, `openai-rss`, `producthunt`, `twitter`) and Vercel `SENTRY_DSN` is missing.
- Needs: platform engineer restores blocking non-green sources to GREEN within budget and reruns freshness gate; CTO/platform sets Vercel `SENTRY_DSN` with canary evidence; CTO confirms any sprint-priority override before cross-sprint reassignment.
- Done when: blocked issue rows keep one owner + one unblock action + one binary done-state line, and `npm run freshness:check` exits 0 with localhost reachable and `blocking_non_green=0`.

## AGN-1212 [Sprint 1 audit] Sprint Triage parent-child dependency hygiene scan (AGN-58 tree)
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`) and `npm run freshness:check` failed with `GET http://localhost:3023/api/health?soft=1 -> HTTP 500 Internal Server Error` (localhost reachable, product stale/degraded).
- Dependency hygiene decision: AGN-58 child rows remain triage-only in Sprint 1 with one owner + explicit `Blocked on`/`Needs` lines + binary `Done when` wording; out-of-scope execution remains backlog-first unless CTO reprioritizes.
- Owner: PM triage.
- Blocked on: local freshness preflight is non-passing (`/api/health?soft=1` HTTP 500), preventing closure-grade verification.
- Needs: platform engineer restores `/api/health?soft=1` to HTTP 200 and returns `npm run freshness:check` to exit 0; CTO/platform provides Vercel `SENTRY_DSN` canary evidence if Sprint closure depends on it; CTO confirms any priority change that would pull backlog execution into Sprint 1.
- Done when: AGN-58 parent-child rows stay synchronized across sprint/backlog notes with one owner and explicit blocker/action text per row, and `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.

## AGN-1211 [Sprint 1 audit] Sprint Triage sprint/backlog boundary integrity check
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- Freshness gate result at `2026-05-05T05:08:34.2075113+08:00`: `npm run freshness:check` reached localhost:3023 (not missing) but failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error` (product stale/degraded).
- Boundary integrity decision: Sprint 1 scope remains limited to Phase 1.5 + local freshness unblock; out-of-scope execution remains backlog-only with one owner and binary done-state wording.
- Owner: PM triage.
- Blocked on: local freshness endpoint remains degraded (`/api/health?soft=1` returns HTTP 500), preventing close-readiness verification.
- Needs: platform engineer restores local freshness endpoint behavior and reruns freshness gate; CTO/platform provides Vercel `SENTRY_DSN` verification evidence when required for Sprint 1 closure.
- Done when: sprint/backlog boundary rows remain synchronized with one owner + explicit blocker/needs + binary done-state wording, and `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.

## AGN-1210 [Sprint 1 audit] Sprint Triage blocked-issue unblock-owner completeness pass
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`) and `npm run freshness:check` failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error` while localhost `http://localhost:3023` remained reachable (not missing), so product is stale/degraded.
- Completeness pass decision: blocked-issue rows stay in triage lane with one unblock owner and one unblock action per row; do not advance blocked implementation work while freshness gate and Sentry readiness remain unresolved.
- Owner: PM triage.
- Blocked on: local freshness endpoint failure (`/api/health?soft=1` HTTP 500) and missing Vercel `SENTRY_DSN` readiness evidence.
- Needs: platform engineer restores local freshness endpoint behavior so `npm run freshness:check` can pass; CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence; CTO confirms any sprint-priority override before cross-sprint reassignment.
- Done when: blocked issue rows keep one owner + one unblock action + one binary done-state line, and `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.

## AGN-1294 [Sprint 1 audit] Blocked issue unblock-owner/action completeness pass
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`) and `npm run freshness:check` failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error` while localhost `http://localhost:3023` remained reachable (not missing), so product is stale/degraded.
- Completeness pass decision: blocked-issue rows remain in triage lane with one unblock owner and one unblock action per row; blocked implementation work does not advance while freshness and Sentry readiness gaps remain.
- Owner: PM triage.
- Blocked on: local freshness endpoint failure (`/api/health?soft=1` HTTP 500) and missing Vercel `SENTRY_DSN` readiness evidence.
- Needs: platform engineer restores `/api/health?soft=1` to HTTP 200 and returns `npm run freshness:check` to exit 0; CTO/platform sets Vercel `SENTRY_DSN` and provides canary evidence; CTO confirms any sprint-priority override before cross-sprint reassignment.
- Done when: blocked issue rows keep one owner + one unblock action + one binary done-state line, and `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.

## AGN-1353 [Sprint 1 audit] Parent-child linkage integrity pass for AGN-58 tree
- Evidence (2026-05-05 heartbeat): mandatory opening bundle re-verified (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`); `npm run freshness:check` could not complete because `tsx` is missing (`'tsx' is not recognized as an internal or external command`), and direct localhost probes to `http://localhost:3023/api/health?soft=1` plus `http://localhost:3023/api/cron/freshness/state` both returned connection failures (`Unable to connect to the remote server`), so localhost:3023 is currently missing.
- Linkage-integrity decision: keep AGN-58 child rows synchronized across sprint/backlog notes with one owner + explicit `Blocked on`/`Needs` lines + binary done-state wording; keep out-of-scope execution backlog-only unless CTO reprioritizes.
- Owner: PM triage.
- Blocked on: local freshness toolchain/runtime is non-passing (`tsx` missing for freshness script and localhost:3023 unreachable), preventing closure-grade verification.
- Needs: platform engineer restores local dependencies so `npm run freshness:check` runs and restores localhost:3023 endpoints; CTO/platform provides Vercel `SENTRY_DSN` canary evidence when Sprint closure depends on it; CTO confirms any sprint-priority override before cross-sprint reassignment.
- Done when: AGN-58 parent-child linkage rows remain synchronized across sprint/backlog with one owner + explicit blocker/action text + binary done-state wording, and `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.
