---
status: snapshot
audit-date: 2026-05-05
reason: ticket-bound release SRE preflight evidence for AGN-1688 agnt-health freshness
verified-by: claude
---

# AGN-1688 Release SRE preflight evidence (2026-05-05)

## Mandatory opening verification
- Read: `CLAUDE.md`
- Read: `docs/ENGINE.md`
- Read: `docs/SITE-WIREMAP.md`
- Read: `docs/archive/AUDIT-2026-05-04.md` (canonical path; `docs/AUDIT-2026-05-04.md` missing)
- Read: `docs/archive/forensic-2026-05-pre/00-INDEX.md` (canonical path; `docs/forensic/00-INDEX.md` missing)
- Read: `tasks/CURRENT-SPRINT.md`
- Read: `tasks/BACKLOG.md`

## Freshness preflight (required)
Command: `npm run freshness:check`

Observed at: `2026-05-05T06:01:39.851Z`
- `target=http://localhost:3023`
- `health=ok` (localhost is reachable)
- `sourceStatus=degraded`
- `summary: green=31 yellow=13 red=4 dead=2 blocking_non_green=18 advisory_non_green=1`
- `Sentry: MISSING`
- Exit: failure (`FAIL freshness source past budget by more than 24h`)

Conclusion: localhost is NOT missing; product freshness is stale/degraded.

## Blocking stale/dead sources (from run)
- RED: `lobsters`, `producthunt`, `trending-repos`, `twitter`
- DEAD: `engagement-composite`, `trendshift-daily`
- High-impact YELLOW examples: `agent-commerce`, `arxiv`, `funding-news`, `huggingface*`, `npm`, `openai-rss`

## Live workflow/cron inspection status
Command: `gh run list --limit 20 --json ...`
- Result: `HTTP 401: Bad credentials`

Operational impact:
- Freshness failures are confirmed locally.
- Live GitHub Actions run-state verification is blocked by missing/invalid GitHub auth in this runtime.

Unblock owner: CTO/Platform
- Action: provide valid GitHub Actions read credentials for this runtime (or run verification from authenticated operator context).

## Rollback readiness reference
- Existing rollback runbook: `docs/runbooks/rollback.md`
- Freshness validation must pass after rollback: `npm run freshness:check` with no blocking non-green sources.

## Next release-SRE actions after auth unblock
1. Pull last failing run IDs for the 4 RED source workflows and attach step-level log evidence.
2. Distinguish stale deploy vs code failure by checking whether latest successful runs post-date latest prod deploy.
3. Execute/confirm rollback decision path per `docs/runbooks/rollback.md` if failures map to deployment regression.
