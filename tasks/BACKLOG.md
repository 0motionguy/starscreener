# BACKLOG — Items deferred from current sprint

## From audit (2026-05-04) — not in Sprint 1
- [ ] Profile completeness scanner (owner: data quality engineer). Done when a scanner report is generated and each profile field has pass/fail coverage output. Target sprint: Sprint 3.
- [ ] Image coverage backfill (owner: frontend/data engineer). Done when missing image slots are enumerated and backfill pipeline raises coverage above agreed threshold. Target sprint: Sprint 3.
- [ ] Cross-mention completeness (owner: data pipeline engineer). Done when a canonical per-repo cross-mention object is produced and verified against all source mention feeds. Target sprint: Sprint 3.
- [ ] News + funding RSS sources (owner: data pipeline engineer). Done when planned RSS sources are ingested with freshness metadata and appear in the target surfaces. Target sprint: Sprint 2.
- [ ] AI vendor blog RSS (owner: data pipeline engineer). Done when vendor RSS feeds are ingested, deduped, and visible in model/news surfaces with timestamps. Target sprint: Sprint 2.
- [ ] Workflow consolidation (owner: platform engineer). Done when overlapping workflows are merged, schedules documented, and all consolidated workflows pass two consecutive runs. Target sprint: Sprint 5.
- [ ] VPS migration (owner: CTO). Done when migration decision is documented as ship/no-ship with risk, cost, and rollback criteria. Target sprint: Sprint 6 (optional).

## Discovered during current work
- 2026-05-04 AGN-318 [Sprint 1 audit] Acceptance-criteria lint delta pass (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T19:21:57.6874876+08:00` reached localhost (`http://localhost:3023`) but failed with `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error` (localhost not missing; product stale/degraded), so this heartbeat remained triage/documentation-only.
  - Delta lint scope result recorded in `tasks/CURRENT-SPRINT.md`: `AGN-316`, `AGN-317` both PASS for one-owner, binary done-state, and explicit blocker/dependency fields.
  - [ ] AGN-318 lint delta continuity follow-through (owner: PM triage). Done when new sprint/backlog delta rows continue to preserve one owner, one binary done-state line, and explicit blocker/dependency wording across heartbeat updates.
    Dependencies: platform engineer restores `/api/cron/freshness/state` and clears blocking freshness regressions; CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-317 [Sprint 1 audit] Sprint/backlog boundary consistency scan (documentation scope this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T19:20:20.9948245+08:00` reached localhost (`http://localhost:3023`) but failed with `GET /api/health?soft=1 -> HTTP 500 Internal Server Error` (localhost not missing; product stale/degraded).
  - Boundary consistency result: Sprint 1 remains locked to Phase 1.5 + local freshness unblock, and out-of-scope discoveries remain backlog-only with one owner + binary done-state wording.
  - [ ] AGN-317 boundary consistency continuity follow-through (owner: PM triage). Done when sprint/backlog boundary notes remain synchronized each heartbeat with one owner, explicit blocker/needs wording, and binary done-state text while Sprint 2 execution stays backlog-first unless CTO reprioritizes.
    Dependencies: platform engineer restores local freshness endpoint health (`/api/health?soft=1`); CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-316 [Sprint 1 audit] blocked issue ownership drift check (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:17:49.186Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - Ownership drift result: active blocker rows remain owner-explicit (platform engineer owns blocking freshness DEAD rows `category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`; CTO/platform owns Vercel `SENTRY_DSN` unblock).
  - [ ] AGN-316 ownership-drift continuity follow-through (owner: PM triage). Done when blocker ownership lines remain stable and explicit across sprint/backlog notes on each heartbeat until freshness blockers and `SENTRY_DSN` unblock are cleared.
    Dependencies: platform engineer clears blocking freshness DEAD rows; CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-310 [Sprint 1 audit] PM acceptance-criteria lint for new audit tasks (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:15:00.077Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - Lint scope result recorded in `tasks/CURRENT-SPRINT.md`: `AGN-300`, `AGN-301`, `AGN-302`, `AGN-308`, `AGN-309` all PASS for one-owner, binary done-state, and explicit blocker/dependency fields.
  - [ ] AGN-310 lint continuity follow-through (owner: PM triage). Done when newly seeded audit tasks continue to preserve one owner, one binary done-state line, and explicit blocker/dependency wording across sprint/backlog notes on each heartbeat.
    Dependencies: platform engineer clears blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`); CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before Sprint 2 scope reassignment.
- 2026-05-04 AGN-309 [Sprint 1 audit] blocked-owner/action completeness sweep (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:13:11.580Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - [ ] AGN-309 blocked-owner/action completeness continuity follow-through (owner: PM triage). Done when all active blocker rows in sprint/backlog notes keep one owner, one unblock action, and one binary done-state line aligned to latest verified preflight evidence.
    Dependencies: platform engineer restores blocking DEAD rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`) to GREEN; CTO/platform sets Vercel `SENTRY_DSN` and canary evidence.
- 2026-05-04 AGN-308 [Sprint 1 audit] PM sprint-boundary pointer-only enforcement:
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:10:54.348Z` reached localhost (`http://localhost:3023`) and is stale/degraded (not missing): `green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING`.
  - Sprint boundary action in this heartbeat: active Sprint 1 blocker/lint scopes in `tasks/CURRENT-SPRINT.md` now exclude Sprint 2 issue rows; Sprint 2 audit issue details remain backlog-first (`AGN-253`, `AGN-254`, `AGN-255`, `AGN-290`, `AGN-291`, `AGN-292`) unless CTO reprioritizes.
  - [ ] Pointer-only enforcement continuity follow-through (owner: PM triage). Done when Sprint 1 notes retain Sprint 2 references as pointer-only context and all Sprint 2 execution/dependency updates continue to land in backlog entries first.
    Dependencies: CTO confirms any sprint-priority override before Sprint 2 issues re-enter active Sprint 1 execution scope; platform engineer/CTO-platform clear current freshness + Sentry blockers for close-readiness evidence.
- 2026-05-04 AGN-302 [Sprint 1 audit] Parent-child dependency map hygiene pass (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:07:27.683Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`green=45`, `dead=5`, `blocking_non_green=4`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - Dependency-map hygiene result: Sprint 2 audit dependency execution remains backlog-first (`AGN-253`, `AGN-254`, `AGN-255`, `AGN-290`, `AGN-291`, `AGN-292`), while Sprint 1 notes keep pointer-only context unless CTO reprioritizes.
  - [ ] Parent-child dependency map hygiene continuity follow-through (owner: PM triage). Done when sprint/backlog dependency rows remain synchronized with one owner, explicit blocker/needs wording, and binary done-state text per issue, while Sprint 2 audit execution stays backlog-first.
    Dependencies: platform engineer clears blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`); CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-301 [Sprint 1 audit] Blocked-issue metadata completeness sweep (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:05:38.114Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`blocking_non_green=4`, `dead=5`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - [ ] Blocked-issue metadata completeness continuity follow-through (owner: PM triage). Done when all active blocked-issue rows across sprint/backlog notes keep one owner, one unblock action, and one binary done-state line aligned to the latest verified preflight evidence.
    Dependencies: platform engineer clears blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`); CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-300 [Sprint 1 audit] Sprint-vs-backlog boundary drift ledger refresh:
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T11:03:28.332Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`blocking_non_green=4`, `dead=5`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - Drift ledger refresh result: Sprint 2 audit set (`AGN-253`, `AGN-254`, `AGN-255`, `AGN-290`, `AGN-291`, `AGN-292`) remains backlog-first; Sprint doc now carries boundary pointer context only for this set unless CTO reprioritizes.
  - [ ] Boundary drift ledger continuity follow-through (owner: PM triage). Done when Sprint 2 audit execution updates remain in backlog entries and Sprint 1 notes keep only pointer references for those issues.
    Dependencies: platform engineer clears blocking non-green freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`); CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-292 [Sprint 2 audit] acceptance-criteria lint for newly seeded audit tasks (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:59:47.986Z` reached localhost (`http://localhost:3023`) but failed with degraded/stale status (`blocking_non_green=4`, `dead=5`, `advisory_non_green=1`, `Sentry: MISSING`), so this heartbeat remained triage/documentation-only.
  - Lint scope result recorded in `tasks/CURRENT-SPRINT.md`: `AGN-275`, `AGN-276`, `AGN-277`, `AGN-282`, `AGN-290`, `AGN-291` all PASS for one-owner, binary done-state, and explicit dependency/blocker fields.
  - [ ] Acceptance-criteria lint continuity follow-through (owner: PM triage). Done when newly seeded audit tasks continue to maintain one owner, one binary done-state line, and explicit blocker/dependency wording across sprint/backlog notes on each heartbeat.
    Dependencies: platform engineer resolves blocking freshness rows; CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint-priority override before scope reassignment.
- 2026-05-04 AGN-291 [Sprint 2 audit] Sprint boundary leakage check (Sprint 1 vs Sprint 2):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:58:05.245Z` reached localhost (`http://localhost:3023`) but failed with `blocking_non_green=4`, `dead=5`, `advisory_non_green=1`, and `Sentry: MISSING` (product stale/degraded, localhost not missing).
  - Leakage finding: Sprint 2 audit issues (`AGN-253`, `AGN-254`, `AGN-255`, `AGN-290`) are still represented in Sprint 1 tracking, so boundary clarity depends on backlog-first handling for Sprint 2 updates.
  - [ ] Sprint boundary leakage follow-through (owner: PM triage). Done when Sprint 2 audit issue updates are maintained backlog-first and Sprint 1 notes only retain pointer references unless CTO explicitly changes sprint priority.
    Dependencies: CTO confirms any sprint-priority override; platform engineer resolves freshness blockers; CTO/platform sets Vercel `SENTRY_DSN`.
- 2026-05-04 AGN-282 PM Blocker Triage (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:53:36.658Z` reached localhost (`http://localhost:3023`) but failed with degraded freshness (`blocking_non_green=5`, `dead=5`, `yellow=1`) and `Sentry: MISSING`, so this heartbeat remains triage/documentation-only.
  - [ ] PM blocker triage continuity follow-through (owner: PM triage). Done when all active blocker rows in sprint/backlog docs preserve one owner, one unblock action, and one binary done-state line aligned to the latest verified preflight evidence.
    Dependencies: platform engineer resolves blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, `reddit` stale budget); CTO/platform sets Vercel `SENTRY_DSN`; PM reruns mandatory opening checks in the same heartbeat before closing AGN-282.
- 2026-05-04 AGN-276 [Sprint 1 audit] blocked issue unblock-owner completeness sweep (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:50:00.291Z` reached localhost (`http://localhost:3023`) but failed with degraded freshness (`blocking_non_green=5`, `dead=5`, `yellow=1`) and `Sentry: MISSING`, so this heartbeat remains triage/documentation-only.
  - [ ] Blocked issue unblock-owner completeness sweep follow-through (owner: PM triage). Done when all active blocker rows in sprint/backlog docs preserve one owner, one unblock action, and one binary done-state line aligned to the latest verified preflight evidence.
    Dependencies: platform engineer resolves blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, `reddit` stale budget); CTO/platform sets Vercel `SENTRY_DSN`; PM reruns mandatory opening checks in the same heartbeat before closing AGN-276.
- 2026-05-04 AGN-275 [Sprint 1 audit] Sprint scope lock compliance pass (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:48:16.389Z` reached localhost (`http://localhost:3023`) but failed with `blocking_non_green=5`, `dead=5`, `yellow=1`, and `Sentry: MISSING`, so scope-lock closure remains triage/documentation-only.
  - [ ] Sprint scope lock compliance continuity follow-through (owner: PM triage). Done when Sprint 1 remains limited to Phase 1.5 + local freshness unblock and out-of-scope discoveries remain backlog-only with one owner, explicit dependencies, and binary done-state wording.
    Dependencies: platform engineer resolves blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, and reddit freshness budget); CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any sprint priority changes before scope reassignment.
- 2026-05-04 AGN-254 [Sprint 2 audit] blocked issue unblock-owner completeness (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:26:13.386Z` reached localhost (`http://localhost:3023`) but failed with degraded freshness (`blocking_non_green=5`, `dead=5`) and `Sentry: MISSING`, so this remains triage/documentation-only.
  - [ ] Blocked issue unblock-owner completeness follow-through (owner: PM triage). Done when all active blocker rows in sprint/backlog docs preserve one owner, one unblock action, and one binary done-state line aligned to the latest verified preflight evidence.
    Dependencies: platform engineer resolves blocking freshness rows; CTO/platform sets Vercel `SENTRY_DSN`; PM reruns mandatory opening checks in the same heartbeat before closing AGN-254.
- 2026-05-04 AGN-253 [Sprint 2 audit] parent-child linkage integrity (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:22:58.377Z` reached localhost (`http://localhost:3023`) but returned stale/degraded status (`blocking_non_green=5`, `dead=5`, `yellow=1`, `Sentry: MISSING`), so linkage work remains triage/documentation-only.
  - [ ] Parent-child linkage integrity continuity follow-through (owner: PM triage). Done when sprint/backlog parent-child references for AGN-253 scope stay synchronized with one owner per issue, explicit blocker/needs lines, and binary done-state wording.
    Dependencies: platform engineer remediates blocking freshness sources; CTO confirms any intentional Sprint 2 priority overrides before scope reassignment.
- 2026-05-04 AGN-255 [Sprint 2 audit] sprint boundary drift watch (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:27:49.846Z` reached localhost (`http://localhost:3023`) but returned degraded/stale status (`blocking_non_green=5`, `dead=5`, `yellow=1`, `Sentry: MISSING`), so this heartbeat remains triage/documentation-only.
  - [ ] Sprint boundary drift watch continuity follow-through (owner: PM triage). Done when Sprint 1 remains explicitly scoped to Phase 1.5 + local freshness unblock, and all out-of-scope discoveries are backlog-only with one owner, explicit dependencies, and binary done-state wording.
    Dependencies: platform engineer resolves blocking freshness rows; CTO/platform sets Vercel `SENTRY_DSN`; CTO confirms any Sprint priority changes before scope reassignment.
- 2026-05-04 AGN-232 acceptance-criteria quality lint for new Sprint tasks (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed at `2026-05-04T17:35:26.1985645+08:00` with `ECONNREFUSED` for `http://localhost:3023` (localhost missing), so Sprint 1 remains blocked on local preflight restore.
  - [ ] Acceptance-criteria lint continuity follow-through (owner: PM triage). Done when each newly created sprint triage issue keeps one owner, one binary done-state line, and explicit dependency/blocker wording synchronized across sprint/backlog notes.
    Dependencies: platform engineer restores localhost preflight endpoints; CTO confirms any intentional cross-sprint priority exceptions.
- 2026-05-04 AGN-230 sprint doc to issue-board consistency pass (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed at `2026-05-04T17:31:52+08:00` with `ECONNREFUSED` for `http://localhost:3023` (localhost missing), so Sprint 1 remains blocked on local preflight restore.
  - [ ] Sprint doc and issue-board consistency follow-through (owner: PM triage). Done when sprint/backlog issue metadata stays synchronized with board scope using one owner, explicit blocker/needs lines, and binary done-state wording for AGN-230-linked updates.
    Dependencies: platform engineer restores localhost preflight endpoints; CTO confirms any intentional cross-sprint priority exceptions.
- 2026-05-04 AGN-231 blocked-issue unblock owner/action completeness pass (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed at `2026-05-04T17:57:46+08:00` with `ECONNREFUSED` for `http://localhost:3023` (localhost missing), so Sprint 1 remains blocked on local preflight restore.
  - [ ] Blocked-issue owner/action completeness continuity follow-through (owner: PM triage). Done when AGN-231-linked blocker rows in sprint/backlog keep one owner, one unblock action, and one binary done-state line synchronized to latest preflight evidence.
    Dependencies: platform engineer restores localhost preflight endpoints; CTO confirms any cross-sprint priority exceptions if blocker ownership changes.
- 2026-05-04 AGN-226 sprint boundary guardrail enforcement spot-check (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed at `2026-05-04T17:41:00+08:00` with `ECONNREFUSED` for `http://localhost:3023` (localhost missing), so Sprint 1 remains blocked on local preflight restore.
  - [ ] Sprint boundary guardrail continuity follow-through (owner: PM triage). Done when Sprint 1 notes stay scoped to Phase 1.5 + localhost freshness unblock and all out-of-scope discoveries are backlog-only with one owner and binary done-state wording.
    Dependencies: platform engineer restores localhost preflight endpoints; CTO confirms any intentional cross-sprint priority exceptions.
- 2026-05-04 AGN-224 stalled in-progress recovery board sweep (out of Sprint 1 implementation scope):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed at `2026-05-04T17:25:00+08:00` with `ECONNREFUSED` for `http://localhost:3023` (localhost missing), so this remains a Sprint 1 blocker and not backlog implementation work.
  - [ ] In-progress recovery lane split confirmation (owner: PM triage). Done when all non-Sprint-1 active issues are either explicitly assigned to non-Sprint-1 lanes or paused, and Sprint 1 notes keep scope limited to Phase 1.5 + localhost freshness unblock.
    Dependencies: CTO confirms whether mixed in-progress execution is intentional; platform engineer restores localhost preflight to unblock close-readiness verification.
- 2026-05-04 AGN-204 sprint-boundary enforcement heartbeat (out of Sprint 1 implementation scope):
  - Verified mandatory opening bundle was re-read (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` failed because localhost is missing (`http://localhost:3023` -> `ECONNREFUSED`), so this remains a Sprint 1 blocker and not a backlog implementation task.
  - [ ] Local localhost preflight restore follow-through (owner: platform engineer). Done when `npm run freshness:check` exits 0 with localhost reachable and no blocking non-green rows.
    Dependencies: platform engineer starts local app stack and restores `/api/health?soft=1` plus `/api/cron/freshness/state` HTTP 200 behavior.
- 2026-05-04 sprint triage update (AGN-184): local freshness gate is restored (`npm run freshness:check` at `2026-05-04T08:13:05.686Z` passed with `green=50`, `blocking_non_green=0`); unblock note retained for audit traceability.
- 2026-05-04 sprint triage follow-up (AGN-184): `freshness-check` still reports `health=stale sourceStatus=degraded` with `Sentry: MISSING`. Keep Sprint 1 focus on Sentry DSN + canary verification; do not reopen local `/api/health?soft=1` repair unless regressions reappear.
- 2026-05-04 AGN-186 child-hygiene heartbeat (out of Sprint 1 implementation scope):
  - Parent linkage: this issue performs documentation hygiene for `AGN-58` children only; it does not add product/platform implementation scope.
  - [ ] AGN-58 child issue graph maintenance (owner: PM triage). Done when `tasks/CURRENT-SPRINT.md` contains a canonical AGN-58 child dependency table with parent, owner, blocker, needs, and binary done fields for `AGN-172`, `AGN-173`, `AGN-174`, `AGN-185`, `AGN-186`, `AGN-203`, and `AGN-225`.
    Dependencies: freshness evidence must be re-checked in the same heartbeat before graph updates; if `localhost:3023` is down, mark blocked and hand off to platform owner.
- 2026-05-04 AGN-225 AGN-58 child metadata consistency pass (out of Sprint 1 implementation scope):
  - [ ] AGN-58 child metadata parity lock (owner: PM triage). Done when AGN-58 child references in `tasks/CURRENT-SPRINT.md` and `tasks/BACKLOG.md` include AGN-225 with one owner, explicit blocker/needs lines, and binary done-state wording.
    Dependencies: platform engineer restores localhost preflight (`npm run freshness:check` currently `ECONNREFUSED` on `http://localhost:3023`) so same-heartbeat verification can remain current.
- 2026-05-04 AGN-203 ownership consistency heartbeat (out of Sprint 1 implementation scope):
  - [ ] Freshness regression handoff tracking (owner: platform engineer). Done when `npm run freshness:check` exits 0 locally and `GET /api/cron/freshness/state` returns HTTP 200 after the 2026-05-04 regression (`HTTP 500` at `2026-05-04T16:39:35.6975136+08:00`).
    Dependencies: PM triage keeps AGN-58 child table + blocker lines synchronized; platform engineer provides fix evidence.
- 2026-05-04 AGN-277 [Sprint 1 audit] Parent-child linkage integrity under AGN-58 (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:51:44.773Z` reached localhost (`http://localhost:3023`) but failed with degraded freshness (`blocking_non_green=5`, `dead=5`, `yellow=1`) and `Sentry: MISSING`, so this heartbeat remains triage/documentation-only.
  - [ ] AGN-277 parent-child linkage continuity follow-through (owner: PM triage). Done when AGN-58 parent-child references across sprint/backlog docs include AGN-277 with one owner, explicit blocker/needs lines, and binary done-state wording synchronized to latest verified preflight evidence.
    Dependencies: platform engineer clears blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`, `reddit` stale budget); CTO/platform sets Vercel `SENTRY_DSN`; PM reruns mandatory opening checks in same heartbeat before closure.
- 2026-05-04 AGN-290 [Sprint 2 audit] Parent-child dependency drift sweep under AGN-58 (documentation scope only this heartbeat):
  - Mandatory opening re-run completed (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
  - Verified `npm run freshness:check` at `2026-05-04T10:56:23.428Z` reached localhost (`http://localhost:3023`) but failed with degraded freshness (`blocking_non_green=4`, `dead=5`) and `Sentry: MISSING`, so this heartbeat remains triage/documentation-only.
  - [ ] AGN-290 parent-child dependency drift continuity follow-through (owner: PM triage). Done when AGN-58 parent-child dependency references across sprint/backlog docs include AGN-290 with one owner, explicit blocker/needs lines, and binary done-state wording synchronized to latest verified preflight evidence.
    Dependencies: platform engineer clears blocking freshness rows (`category-metrics`, `mcp-downloads`, `star-snapshots`, `trending-repos`); CTO/platform sets Vercel `SENTRY_DSN`; PM reruns mandatory opening checks in same heartbeat before closure.
- 2026-05-04 AGN-172 scope guardrail audit (out of Sprint 1; owner PM triage unless reassigned):
  - Parent linkage: all items below are children of `AGN-172` scope guardrail and must not be pulled into Sprint 1 unless CTO reprioritizes.
  - [ ] Workflow failure triage packet (owner: PM triage). Done when each currently failing workflow has one assigned implementation issue with binary acceptance criteria (`Cron - freshness check`, `Audit - source freshness`, `Source health watch`, `Refresh fast discovery`, `Refresh collection rankings`).
    Dependencies: local freshness gate no longer blocks (`2026-05-04T08:13:05.686Z` pass). Depends on PM assignment capacity and Sprint 1 scope lock to avoid parallel scope expansion.
  - [ ] Twitter persistence path consistency task (owner: data pipeline engineer). Done when `/twitter` reads from the canonical store path and freshness evidence shows data newer than 24h without dual-writer ambiguity.
    Dependencies: waits on workflow failure triage packet owner assignment and source-of-truth writer decision.
  - [ ] MCP freshness provenance task (owner: data pipeline engineer). Done when `trending-mcp`, `mcp-dependents`, and `mcp-smithery-rank` publish non-null freshness metadata and pass freshness checks.
    Dependencies: waits on workflow failure triage packet owner assignment.
  - [ ] Snapshot workflow reliability task (owner: platform engineer). Done when `/top10`, `/top10 sparklines`, and `/consensus` snapshot workflows complete successfully for 2 consecutive scheduled runs.
    Dependencies: waits on workflow failure triage packet owner assignment.
  - [ ] Source-of-truth writer decision issue (owner: CTO/PM). Done when each shared key has one declared primary writer (worker vs GHA) and the decision is documented in `docs/ENGINE.md`.
    Dependencies: none. This is the decision parent for dual-writer children above.
- 2026-05-04 AGN-184 in-progress scope audit:
  - [ ] Cross-sprint in-progress queue normalization (owner: PM triage). Done when all non-Sprint-1 active issues (`AGN-73`, `AGN-88`, `AGN-93`, `AGN-96`) are either moved under explicit non-Sprint-1 execution lanes or paused so Sprint 1 reporting stays coherent.
    Dependencies: CTO confirmation if priorities are intentionally mixed.
- 2026-05-03 wire/UI inspection:
  - [ ] Sidebar route drift reconciliation (owner: frontend engineer). Done when `SidebarContent.tsx`, production routes, and `docs/SITE-WIREMAP.md` all match (`/` vs `/githubrepo`, `/top` visibility) with verification links.
  - [ ] `/githubrepo` release decision (owner: frontend engineer). Done when route is either deployed and reachable in production or removed/reverted with docs updated.
  - [ ] Mobile topbar overflow fix (owner: frontend engineer). Done when 390px viewport screenshots show no clipping for `/`, `/skills`, `/mcp`, `/signals`, `/compare`, and `/top10`.
  - [ ] Mobile `/twitter` table overflow fix (owner: frontend engineer). Done when no horizontal page overflow occurs at 390px and table remains usable.
  - [ ] `/watchlist` unauth behavior decision (owner: product/PM). Done when expected unauth responses are documented and 503s are either removed or explicitly accepted.
  - [ ] External avatar/icon fallback hardening (owner: frontend engineer). Done when failed external image loads degrade gracefully without broken UI markers.
  - [ ] Windows OneDrive `.next` workaround codified (owner: platform engineer). Done when local setup docs or script enforce the workaround and local dev/typecheck no longer race on generated files.
- Document or script the Windows OneDrive `.next` dev/build workaround. On 2026-05-03 the local `.next` directory was a junction at `%TEMP%\trendingrepo-next-dev`; `next dev` and `next build` both need `NODE_PATH=C:\Users\mirko\OneDrive\Desktop\STARSCREENER\node_modules` so chunks emitted under `%TEMP%` can resolve externals like `react/jsx-runtime` and Next's app-route runtime.
- Decide expanded freshness semantics for advisory side channels: `mcp-dependents` needs `LIBRARIES_IO_API_KEY`, `mcp-smithery-rank` needs `SMITHERY_API_KEY`, `skill-install-snapshots` currently has no install data, `model-usage` can have successful zero-event cron runs, and `hotness-snapshots` can publish only populated domains. Either provision the missing keys/data or mark these rows non-blocking in `/api/cron/freshness/state`.
- Normalize Vercel project targeting across local shells: repo link file `.vercel/project.json` points to `projectId=prj_ycY0bM38UMyAl9jPcAgrmQGUc4tQ` / `orgId=team_NrVhqhXUDEYB9YOWaqkBIQ4w`, while ambient env may inject a different `VERCEL_PROJECT_ID` without `VERCEL_ORG_ID`, causing wrong-target deploy/list behavior and stale-build confusion.

## EngineError completeness gaps (from AGN-148, 2026-05-04)
- [ ] Migrate backend/platform untyped throws in `src/lib/data-store.ts` and `src/lib/pipeline/ingestion/**` to `EngineError` categories (`recoverable|quarantine|fatal`) with source tags. Owner: Backend (AGN-187).
- [ ] Migrate security/admin/auth-adjacent untyped throws in `src/app/api/admin/**` and session verification paths to typed `EngineError` mapping with explicit quarantine/fatal behavior. Owner: Platform Security (AGN-188).
- [ ] AGN-189 scoped backend bare-Error guardrail (owner: platform engineer). Done when lint/guard checks reject a newly introduced bare `throw new Error(...)` in `src/lib/**` and `src/app/api/**` while still allowing tests/client exceptions, and issue evidence includes one fail-proof plus one pass-proof run. Dependencies: none.
