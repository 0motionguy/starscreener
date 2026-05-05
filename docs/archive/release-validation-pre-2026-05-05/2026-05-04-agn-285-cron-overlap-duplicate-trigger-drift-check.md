---
status: archive
audit-date: 2026-05-05
reason: dated release-validation heartbeat artifact
---

# AGN-285 - Cron overlap and duplicate-trigger drift check (Release SRE)

## Scope and mandatory preflight evidence

- Mandatory opening docs re-read in this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Freshness gate run: `npm run freshness:check` at `2026-05-04T11:03:21.268Z`.
- Localhost status: `http://localhost:3023` reachable (`health=ok`) - localhost is **not missing**.
- Product freshness state: stale/degraded (`blocking_non_green=4`, `dead=5`, `advisory_non_green=1`, `Sentry: MISSING`).

## Live workflow evidence (GitHub Actions)

Command used:
- `gh run list --limit 80 --json workflowName,status,conclusion,createdAt,updatedAt,databaseId,headSha`

High-signal overlap/failure window around `10:23-10:36Z`:
- `Cron - pipeline ingest` failed, run `25313791050`, started `2026-05-04T10:23:58Z`, completed `10:29:03Z`.
- `Refresh Bluesky signals` failed, run `25313878120`, started `2026-05-04T10:26:10Z`, completed `10:26:37Z`.
- `Uptime monitor (every 5 minutes)` succeeded, run `25313911620`, started `2026-05-04T10:27:01Z`, completed `10:27:16Z`.
- `Sync TrustMRR revenue overlays` failed, run `25313949841`, started `2026-05-04T10:28:01Z`, completed `10:28:30Z`.
- `Source health watch` failed, run `25313997370`, started `2026-05-04T10:29:16Z`, completed `10:29:36Z`.
- `Refresh Lobsters signals` failed, run `25314153676`, started `2026-05-04T10:33:04Z`, completed `10:33:34Z`.
- `Refresh repo profiles` failed, run `25314205414`, started `2026-05-04T10:34:23Z`, completed `10:34:44Z`.
- `Refresh fast discovery` failed, run `25314259155`, started `2026-05-04T10:35:41Z`, completed `10:36:03Z`.

Interpretation:
- There is a dense failure cluster inside adjacent cron windows, consistent with duplicate-trigger pressure/drift amplification rather than one isolated job fault.
- A successful canary workflow (`uptime-monitor`) inside the same window confirms scheduler activity itself was not globally down.

## Duplicate/overlap surfaces confirmed

Based on workflow files plus forensic map `docs/forensic/08-CRON-OVERLAP-DUPLICATE-MAP-2026-05-04.md`:

1. Split ownership of `scrape-trending.mjs` across workflows:
- `scrape-trending.yml` (`--skip-collection-rankings`)
- `refresh-collection-rankings.yml` (`--only-collection-rankings`)

2. Freshness-audit duplication:
- `cron-freshness-check.yml` (15m)
- `audit-freshness.yml` (hourly)

3. Shared surface with disjoint cron legs (`/mcp` family):
- `ping-mcp-liveness.yml`
- `refresh-mcp-smithery-rank.yml`
- `refresh-mcp-usage-snapshot.yml`
- `refresh-mcp-dependents.yml`

## Release risk call

Current state is **operationally degraded** and should be treated as cron/data drift until proven otherwise.
- Distinguish stale deploy vs code failure: because localhost app health is reachable but freshness keys are DEAD/stale while multiple cron jobs fail in a tight window, this is not only a deploy-boot failure pattern.

## Rollback readiness (workflow-level)

If overlap mitigation edits are applied and regress:
1. Revert only affected schedule/step lines in `.github/workflows/*.yml`.
2. Trigger targeted `workflow_dispatch` for touched workflows.
3. Re-run `npm run freshness:check` and confirm blocking rows return to pre-change baseline or improve.
4. If non-green worsens, rollback commit remains the immediate restore path.

## CTO escalation triggers (explicit)

Escalate to CTO if any of the following block implementation:
- Missing Vercel/Railway auth needed for live deploy-state proof.
- Need repo permission changes for failing workflow fixes.
- Production deploy approval required for cadence-consolidation changes.