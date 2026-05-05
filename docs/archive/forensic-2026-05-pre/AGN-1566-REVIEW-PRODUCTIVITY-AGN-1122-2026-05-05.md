# AGN-1566 Productivity review for AGN-1122 (2026-05-05)

## Scope
- Review target: `AGN-1122` (`Twitter freshness budget drift audit`)
- Review method: re-run mandatory opening protocol, execute fresh `npm run freshness:check`, then verify AGN-1122 claims against repository code and files.

## Mandatory opening + freshness classification
- Opening protocol completed by reading:
  - `CLAUDE.md`
  - `docs/ENGINE.md`
  - `docs/SITE-WIREMAP.md`
  - `docs/AUDIT-2026-05-04.md`
  - `docs/forensic/00-INDEX.md`
  - `tasks/CURRENT-SPRINT.md`
  - `tasks/BACKLOG.md`
- Freshness gate run (`2026-05-05` heartbeat):
  - Command: `npm run freshness:check`
  - Result: localhost reachable (`target=http://localhost:3023`, `health=ok`, `sourceStatus=degraded`)
  - Classification: **product failure**, not localhost-missing
  - Summary: `green=16 yellow=12 red=4 dead=18 blocking_non_green=29 advisory_non_green=5`, `Sentry: MISSING`

## AGN-1122 evidence verification
All major AGN-1122 technical claims were re-verified as accurate:

1. Freshness route still points Twitter to legacy key.
   - Verified in `src/app/api/cron/freshness/state/route.ts`: `redisSlugs: ["twitter-trending"]`.
2. Active collector writes modern Twitter keys.
   - Verified in `scripts/collect-twitter-signals.ts`:
     - `writeDataStore("twitter-repo-signals", ...)`
     - `writeDataStore("twitter-scans", ...)`
     - `writeDataStore("twitter-ingestion-audit", ...)`
3. Workflow commit paths match modern write set.
   - Verified in `.github/workflows/collect-twitter.yml` paths:
     - `.data/twitter-repo-signals.jsonl`
     - `.data/twitter-scans.jsonl`
     - `.data/twitter-ingestion-audit.jsonl`
4. Workspace drift symptom holds.
   - `.data/twitter-*.jsonl` files exist and are recent.
   - `data/_meta/twitter.json` is missing in current workspace.

## Productivity assessment for AGN-1122
Verdict: **HIGH productivity (8.5/10)**.

Why:
- Identified a concrete root cause with direct code pointers (legacy slug vs current writer keys).
- Produced actionable remediation with specific target file and key changes.
- Correctly separated a data-path problem from generic “Twitter stale” noise.
- Included blocker escalation for GitHub CLI auth when live workflow validation was unavailable.

Deductions:
- Remediation was not applied in AGN-1122 (audit-only heartbeat), so incident time-to-fix remains open.
- `metaSource: "twitter"` correction was suggested but not validated end-to-end with a post-fix freshness run in that issue.

## Required follow-up
1. Patch `src/app/api/cron/freshness/state/route.ts` Twitter `SOURCE_SPECS` to current keys (`twitter-repo-signals`, `twitter-scans`, optional `twitter-ingestion-audit`) and include `metaSource: "twitter"`.
2. Re-run `npm run freshness:check` and confirm Twitter row is computed from the active collector path.
3. Re-verify `collect-twitter.yml` latest run with valid GitHub credentials.
