# AGN-1207 Release SRE heartbeat - last-7 workflow classification refresh (2026-05-05)

Timestamp (Asia/Makassar): 2026-05-05T05:09:01.6570365+08:00

## Mandatory opening + freshness gate

- Required files read in this heartbeat:
  - `CLAUDE.md`
  - `docs/ENGINE.md`
  - `docs/SITE-WIREMAP.md`
  - `docs/AUDIT-2026-05-04.md`
  - `docs/forensic/00-INDEX.md`
  - `tasks/CURRENT-SPRINT.md`
  - `tasks/BACKLOG.md`
- Freshness command:
  - `npm run freshness:check`
- Result:
  - `freshness-check: GET http://localhost:3023/api/health?soft=1 failed: HTTP 500 Internal Server Error`
- Verdict:
  - `localhost:3023` is reachable (not missing), but the product is stale/degraded due to health endpoint HTTP 500.

## AGN-1207 target action: refresh last-7 workflow classification from live runs

Attempted live evidence pull (all failed with auth error):
- `gh run list --workflow scrape-trending.yml --limit 7 --json databaseId,conclusion,status,workflowName,createdAt,url,headSha`
- `gh run list --workflow cron-freshness-check.yml --limit 7 --json databaseId,conclusion,status,workflowName,createdAt,url,headSha`
- `gh run list --workflow health-watch.yml --limit 7 --json databaseId,conclusion,status,workflowName,createdAt,url,headSha`
- `gh run list --workflow audit-freshness.yml --limit 7 --json databaseId,conclusion,status,workflowName,createdAt,url,headSha`
- `gh run list --workflow refresh-collection-rankings.yml --limit 7 --json databaseId,conclusion,status,workflowName,createdAt,url,headSha`

Observed output for each:
- `HTTP 401: Bad credentials ... Try authenticating with: gh auth login`

## Blocker and required unblock

- Blocked on: GitHub CLI token for this runner/session is invalid or expired (`gh` returns 401 for workflow run APIs).
- Needs: CTO/repo admin (or credential owner) to re-authenticate `gh` in this run context (`gh auth login` or refreshed `GH_TOKEN`) with read access to repo Actions.

## Next release-SRE step once unblocked

1. Re-run the five `gh run list --workflow ... --limit 7 --json ...` commands.
2. Pull failed-step signatures with `gh run view <run-id> --log-failed` for latest failing runs.
3. Update last-7 classification artifact and post refreshed release verification packet.