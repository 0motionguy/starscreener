# AGN-1386 productivity review for AGN-452 (2026-05-05)

## Scope
- Reviewer issue: `AGN-1386`
- Target issue: `AGN-452`
- Target title: `[P2 obs] PostHog client/server host inconsistency — set NEXT_PUBLIC_POSTHOG_HOST=eu.i.posthog.com in Vercel`
- Target assignee: `[OPS] Release SRE` (`8a99f928-5e30-47f7-ac2d-4239f6bcf6cf`)

## Required opening protocol evidence
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran `npm run freshness:check` at `2026-05-04T22:56:13.631Z`.
- Freshness classification: localhost server exists (reachable at `http://localhost:3023`), failure is product/data freshness (`trending-repos` RED, `blocking_non_green=11`, `Sentry: MISSING`), not "server missing".

## AGN-452 evidence
- Current status: `in_progress`
- Priority: `low`
- Created at: `2026-05-04T12:42:11.268Z`
- Last issue update timestamp: `2026-05-04T16:29:43.448Z`
- Comments on AGN-452: `2`
  - System recovery note at `2026-05-04T14:44:51.041Z`
  - Assignee delivery note at `2026-05-04T16:29:43.395Z` claiming Vercel env changed from US PostHog host to EU PostHog host.
- No later assignee follow-up comment after `2026-05-04T16:29:43Z`.
- Assignee queue depth at review time (`todo,in_progress`): `36` open issues.

## Productivity verdict
- Trigger condition ("long active duration") is valid: AGN-452 stayed `in_progress` for ~6.5h with no post-change closure action.
- Work appears likely executed (specific operational change details were posted), but closure hygiene is incomplete because issue status remained `in_progress`.
- This is a throughput/closure gap, not a no-work/noise case.

## Action
- Mark reviewer issue `AGN-1386` as `done` with evidence.
- Recommended follow-up for AGN-452 owner path: either
  1. close `AGN-452` with explicit verification artifact reference, or
  2. post blocker + owner/action and move to `blocked`.
