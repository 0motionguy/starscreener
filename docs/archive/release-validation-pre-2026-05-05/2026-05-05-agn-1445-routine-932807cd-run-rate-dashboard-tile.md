---
status: archive
audit-date: 2026-05-05
reason: dated release-validation heartbeat artifact
---

# AGN-1445 - Routine 932807cd run-rate dashboard tile (Release SRE heartbeat)

Date: 2026-05-05
Issue: `AGN-1445` (`[QUE-52][OPS] Routine 932807cd run-rate dashboard tile`)
Routine: `932807cd-a243-4174-95a3-a871358608f2`

## Live verification evidence

- Routine lookup:
  - `GET /api/routines/932807cd-a243-4174-95a3-a871358608f2` -> 200
  - Title: `[AUTO-COMPLETE SWEEP] Repo enrichment dispatch`
- Run history lookup:
  - `GET /api/routines/932807cd-a243-4174-95a3-a871358608f2/runs?limit=20` -> 200, body `[]`
- Result: no run samples currently available for this routine in the control plane API.

## Tile contract (ready once runs exist)

- `runs_per_hour`:
  - Count runs in trailing 60 minutes.
- `success_pct`:
  - `(completed_or_issue_created_runs / total_runs) * 100` in the selected lookback window.
- `error_pct`:
  - `(failed_runs / total_runs) * 100` in the selected lookback window.
- `last_run_delta`:
  - `now - max(triggeredAt)` as a duration string.

## Drill-down contract (last 20 runs)

Columns:
- `triggeredAt`
- `status`
- `duration_s` (`completedAt - createdAt`, nullable if still open)
- `linkedIssue.identifier` (if present)
- `failureReason` (if present)

## Operator query snippet

```powershell
$h=@{Authorization="Bearer $env:PAPERCLIP_API_KEY"}
$rid='932807cd-a243-4174-95a3-a871358608f2'
$runs=Invoke-RestMethod -Method Get -Uri "http://127.0.0.1:3100/api/routines/$rid/runs?limit=20" -Headers $h

$now=Get-Date
$total=@($runs).Count
$lastHour=@($runs | Where-Object { (Get-Date $_.triggeredAt) -ge $now.AddHours(-1) })
$ok=@($runs | Where-Object { $_.status -in @('completed','issue_created') }).Count
$fail=@($runs | Where-Object { $_.status -eq 'failed' }).Count
$last=@($runs | Sort-Object triggeredAt -Descending | Select-Object -First 1)

[pscustomobject]@{
  runs_per_hour = @($lastHour).Count
  success_pct = if($total -gt 0){ [math]::Round(($ok*100.0)/$total,2)} else { 0 }
  error_pct = if($total -gt 0){ [math]::Round(($fail*100.0)/$total,2)} else { 0 }
  last_run_delta_minutes = if($last){ [math]::Round(((Get-Date)- (Get-Date $last.triggeredAt)).TotalMinutes,2)} else { $null }
}

$runs | Sort-Object triggeredAt -Descending | Select-Object -First 20 triggeredAt,status,createdAt,completedAt,failureReason,@{n='linkedIssue';e={$_.linkedIssue.identifier}}
```

## Blocker and unblock owner

Blocker:
- Routine run list is empty (`[]`), so acceptance item "drill-down lists last 20 runs with status + duration" cannot be populated with live data yet.

Unblock owner/action:
- Owner: CTO / PM automation owner for routine scheduling.
- Action: activate or manually trigger routine `932807cd-a243-4174-95a3-a871358608f2` at least once, then re-run the run-rate extraction to populate the tile and drill-down.
