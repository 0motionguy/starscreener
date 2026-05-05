# Runbook: Redis OOM / Writes Failing

- Owner: Release SRE
- Scope: STARSCREENER production data-store write path (Vercel + Railway worker + GitHub Actions)
- Last updated: 2026-05-04

## Incident definition

Treat this runbook as active when one or more of the following are true:

1. Redis write operations fail with `OOM command not allowed` or equivalent write-denied errors.
2. Worker or cron jobs report success on fetch but fail on persist.
3. Freshness turns stale/degraded while collectors are still running, indicating write-path failure rather than source-fetch failure.

## Fast impact assessment (5-10 minutes)

Run these checks in order and save output in the issue comment.

1. Local freshness gate:

```bash
npm run freshness:check
```

2. Worker health (includes Redis connectivity bit):

```bash
curl -sS https://trendingrepo-worker-production.up.railway.app/healthz
```

3. Production health envelope:

```bash
curl -sS "https://trendingrepo.com/api/health?soft=1"
```

4. Latest workflow states for writer lanes:

```bash
gh run list --limit 30 --json workflowName,status,conclusion,createdAt,url | jq -r '.[] | [.createdAt,.workflowName,.status,.conclusion,.url] | @tsv'
```

Focus workflows:
- `scrape-trending.yml`
- `collect-twitter.yml`
- `scrape-devto.yml`
- `refresh-collection-rankings.yml`
- `cron-freshness-check`

## Diagnose stale deploy vs write-path outage

Use this decision matrix:

1. Deploy stale (not Redis OOM):
- New code exists on `main`, but Vercel still serves older SHA.
- Writer workflows and worker health are green.
- Action: redeploy/promote correct commit, then re-check freshness.

2. Source fetch failure (not Redis OOM):
- Workflows fail before persist (network/API/auth errors).
- Redis health is green.
- Action: hand off to source owner; do not execute Redis OOM mitigations.

3. Redis write-path failure / OOM (this runbook):
- Worker logs or workflow logs show write errors (`OOM`, `MISCONF`, write timeout, evicted key anomalies).
- Freshness degrades across multiple Redis-backed slugs despite active collectors.
- Action: execute containment + recovery below.

## Immediate containment

1. Freeze non-critical writer pressure:
- Pause manual backfills and non-essential one-off writer jobs.
- Keep core health/freshness checks running.

2. Preserve evidence before changes:
- Capture failing log lines (workflow + Railway worker).
- Capture timestamped `freshness:check` output.
- Capture worker `/healthz` response.

3. Escalate immediately to CTO/platform if Redis plan/size change is required.

## Recovery procedure (Redis OOM confirmed)

1. Restore write capacity (platform action):
- Increase Redis memory tier OR adjust maxmemory policy to a safe policy for this workload.
- If needed, clear only disposable cache-like namespaces first; do not delete unknown key families.

2. Restart writer lane in controlled order:
- Railway worker service restart (if it was crash-looping).
- Trigger one core writer workflow (`scrape-trending.yml`) and confirm it persists.
- Trigger one secondary writer workflow (`collect-twitter.yml` or `scrape-devto.yml`).

3. Verify recovery:

```bash
npm run freshness:check
curl -sS https://trendingrepo-worker-production.up.railway.app/healthz
curl -sS "https://trendingrepo.com/api/health?soft=1"
```

Success criteria:
- No new write errors in worker/workflow logs.
- Freshness gate no longer reports blocking non-green rows caused by write failures.
- Worker `redis=true` and stable `lastRunAt` progression.

## Rollback readiness

If a release changed write behavior and preceded the outage:

1. Identify last known-good commit for writer scripts/data-store path.
2. Revert only the offending writer-path change in a focused PR.
3. Merge, redeploy, and rerun recovery verification checks.

If Redis capacity/policy was the root cause, code rollback is optional and should not replace capacity remediation.

## Guardrails

- Do not run destructive broad key deletion without explicit scope confirmation.
- Do not declare done using only one healthy endpoint; require workflow + worker + freshness evidence.
- Distinguish configuration/auth failures (`401`, missing secrets) from Redis write failures.

## Evidence template for issue comment

Use this exact structure:

```md
### Redis OOM runbook execution
- Timestamp (UTC): <timestamp>
- Trigger signal: <error line or symptom>
- Freshness check: <pass/fail + key counts>
- Worker healthz: <json snippet>
- Workflow evidence: <workflow + run url + conclusion>
- Decision: <stale deploy | source failure | redis write-path failure>
- Action taken: <containment/recovery steps>
- Result: <recovered | blocked>
- Blocker/Needs (if blocked): <owner + exact unblock action>
```

## Escalation matrix

- Escalate to CTO/platform immediately when:
  - Railway/Vercel auth blocks verification,
  - Redis plan/policy changes are required,
  - write-path failures persist after one controlled recovery pass.

- Mark issue `blocked` when:
  - required credentials/access are unavailable,
  - platform-level Redis action is required and not yet executed.