# Sprint 6 Vultr Migration Scoping Plan

Date: 2026-05-04
Issue: AGN-374
Type: Planning only (no implementation)

## Precondition Gate (Hard Stop)

Required checks before planning:

| # | Check | Evidence | Result |
|---|---|---|---|
| 1 | `docs/forensic/07-VERIFICATION-AUDIT-SPRINT-1.md` exists | File exists in repo | PASS |
| 2 | Audit verdict is GREEN or YELLOW (not RED) | `docs/forensic/07-VERIFICATION-AUDIT-SPRINT-1.md` says `Overall verdict: RED` | FAIL |
| 3 | Sprint 1 phases 1.1-1.5 all complete | `tasks/CURRENT-SPRINT.md` shows `1.5` unchecked | FAIL |
| 4 | `npm run freshness:check` exit code is 0 or 1 (2 = stop) | Run at `2026-05-04T13:21:02.170Z` exited `1` | PASS |
| 5 | Production `/admin/keys` returns 200 | `https://trendingrepo.com/admin/keys` returned `200` | PASS |
| 6 | No CRITICAL items open in backlog | No CRITICAL marker found in `tasks/BACKLOG.md` | PASS |

Because preconditions #2 and #3 failed, this plan is intentionally halted per prompt policy.

## Part 1 - Inventory (Halted)
Not executed. Prompt requires stopping when hard preconditions fail.

## Part 2 - Decision Matrix MOVE/STAY/TBD (Halted)
Not executed. Prompt requires stopping when hard preconditions fail.

## Part 3 - Target Architecture (Halted)
Not executed. Prompt requires stopping when hard preconditions fail.

## Part 4 - Staged Migration Plan (Halted)
Not executed. Prompt requires stopping when hard preconditions fail.

## Part 5 - Cost + Effort Analysis (Halted)
Not executed. Prompt requires stopping when hard preconditions fail.

## Part 6 - Risks + Rollback (Halted)
Not executed. Prompt requires stopping when hard preconditions fail.

## Part 7 - Decision Gate
ABORT

Reason:
- The planning prompt explicitly says to stop if any hard precondition fails.
- Current verification baseline is RED and Sprint 1 is not complete (Phase 1.5 open).
- Producing a migration design on top of failed verification would violate the sprint gate and likely create wrong sequencing.

Re-entry criteria:
1. `docs/forensic/07-VERIFICATION-AUDIT-SPRINT-1.md` updated to overall GREEN or YELLOW.
2. `tasks/CURRENT-SPRINT.md` shows Sprint 1 phases 1.1-1.5 all complete.
3. Re-run this prompt unchanged after those two conditions are true.

## Queue-depth Duty Note (this heartbeat)
Direct-report open queue counts (todo + in_progress):
- Data Pipeline: 22
- Frontend: 3
- Backend: 3
- QA: 22
- Platform Security: 8
- Release/SRE: 33
- Sprint Triage: 5

No new tasks were seeded for the two low-queue agents because both are AISO-scoped (`projectId f84cdd3d-4abe-4457-ba64-fea5ca6a9832`, non-STARSCREENER workspace), and this heartbeat is constrained to STARSCREENER issue AGN-374.