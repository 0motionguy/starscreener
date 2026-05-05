# AGN-728 — GitHub Actions Live Run Visibility Restoration (SRE)

Date: 2026-05-04 (updated 2026-05-05)
Issue: AGN-728
Owner: Release SRE

## Problem verified

From local runner at `C:\Users\mirko\OneDrive\Desktop\STARSCREENER`:

- `gh run list --limit 5 --json databaseId,workflowName,status,conclusion,createdAt`
- Result: `HTTP 401 Bad credentials`

This blocked SRE forensic heartbeats from attaching current GitHub Actions run evidence.

## Root cause confirmed (2026-05-05 follow-up)

`gh auth status` showed two auth paths in conflict:

- `GITHUB_TOKEN` env var path was active but invalid.
- Keyring account `0motionguy` had a valid token but was ignored while env token was set.

The environment token also included a literal trailing `\\n` sequence, so direct use failed until sanitized.

## Runtime repair that restored live visibility

PowerShell session fix used in this heartbeat:

```powershell
$t = $env:GITHUB_TOKEN
$clean = $t -replace "\\n","" -replace "`n","" -replace "`r",""
$env:GITHUB_TOKEN = $clean
$env:GH_TOKEN = $clean
gh run list --limit 20 --json databaseId,workflowName,status,conclusion,createdAt,updatedAt
```

Result: command succeeded and returned 20 live runs with statuses/conclusions.

## Live evidence that GitHub run data is still reachable

Public Actions API call succeeded in same heartbeat:

- `curl https://api.github.com/repos/0motionguy/starscreener/actions/runs?per_page=5`
- Result: HTTP 200 with live runs (example IDs observed: `25326281724`, `25326239978`, `25325959930`).

Conclusion: visibility failure was an auth-path failure, not an Actions data outage.

## Change shipped

Added workflow: `.github/workflows/sre-actions-visibility.yml`

Behavior:
- Runs every 15 minutes and on manual dispatch.
- Pulls latest 50 workflow runs via GitHub API.
- Uses `${{ github.token }}` first (`requestMode=token`).
- Falls back to unauthenticated public API if token call fails (`requestMode=public_fallback`).
- Publishes top-20 runs in job summary and uploads JSON artifact `actions-visibility-snapshot` (14-day retention).

This decouples SRE evidence from local `gh` credential state.

## Verification checklist after merge

1. Trigger `SRE - Actions Visibility Snapshot` with `workflow_dispatch`.
2. Confirm job summary contains run table with links.
3. Confirm artifact `actions-visibility-snapshot` exists and contains `requestMode` plus `runs[]` entries.
4. Confirm next scheduled run occurs within 15 minutes.

## Rollback path

If this workflow causes noise or rate-limit concerns:

1. Disable workflow in GitHub Actions UI, or
2. Revert `.github/workflows/sre-actions-visibility.yml` in a dedicated PR.

Rollback impact: only SRE audit visibility automation is removed; product runtime and collectors are unaffected.
