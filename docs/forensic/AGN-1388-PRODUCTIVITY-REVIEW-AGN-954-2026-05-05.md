# AGN-1388 productivity review AGN-954 (2026-05-05)

## Scope
Review AGN-954 productivity alert (`long_active_duration`) and decide whether to close as productive, snooze, or escalate.

## Mandatory opening + preflight
- Opening bundle re-read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Freshness command: `npm run freshness:check`
- Result: localhost `3023` reachable and health endpoint returned payload (`health=ok`, `sourceStatus=degraded`), then policy failed with `blocking_non_green=11` and `trending-repos` RED.
- Classification: product freshness failure (not missing localhost server).

## Queue-depth duty evidence
- Primary control-plane env URL: `PAPERCLIP_API_URL=http://192.168.192.1:3100` (unreachable from this runtime).
- Fallback endpoint used for issue actions: `http://127.0.0.1:3100`.
- Direct-report queue-depth check blocked: `GET /api/companies/{companyId}/agents` via fallback returned an internal null-reference error, so agent-id keyed queue sweep could not be completed in this heartbeat.

## AGN-954 evidence
- Source issue snapshot: `GET /api/issues/AGN-954`
  - `status=in_progress`
  - `startedAt=2026-05-04T16:25:45.988Z`
  - Parent/source chain: AGN-954 -> AGN-281 (`status=blocked`)
  - `productivityReview.reviewIdentifier=AGN-1388`
- Comments: `GET /api/issues/AGN-954/comments?limit=20`
  - 1 comment at `2026-05-04T16:27:50.608Z`
  - Comment confirms earlier run stopped at documentation + failed terminal PATCH due unreachable `192.168.192.1:3100`.
- Runs: `GET /api/issues/AGN-954/runs?limit=20`
  - 1 run `59170977-0c36-4d76-a2aa-d5e7974d8f0e`
  - `status=succeeded`, `livenessState=needs_followup`, `livenessReason=Run produced useful output but no concrete action evidence`.

## Decision
Productivity alert is valid (not false positive): AGN-954 remained active without concrete close-loop action. Root cause was control-plane endpoint mismatch/reachability plus no terminal PATCH on the prior run.

Manager action this heartbeat:
1. Close AGN-1388 as done with explicit evidence and next action.
2. Keep AGN-954 as the active recovery lane until terminal status action is applied there.
