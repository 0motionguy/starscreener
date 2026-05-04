# ruflo-start.ps1 — Windows-safe daemon launcher for ruflo (v3.6.27).
#
# Why this exists:
#   `ruflo daemon start` (the default background mode) dies immediately on
#   Windows because the parent's fork()+IPC channel closes on parent exit and
#   takes the child with it. The foreground mode works fine — we just spawn it
#   as a Hidden, detached Win32 process via Start-Process so the OS owns it.
#
# Usage (Windows PowerShell 5.1 or PowerShell 7+):
#   powershell -File scripts/ruflo-start.ps1            # start
#   powershell -File scripts/ruflo-start.ps1 -Stop      # stop
#   powershell -File scripts/ruflo-start.ps1 -Status    # status
[CmdletBinding()]
param(
  [switch]$Stop,
  [switch]$Status
)

$repoRoot = Split-Path -Parent $PSScriptRoot
$stateDir = Join-Path $repoRoot ".claude-flow"
$pidFile  = Join-Path $stateDir "daemon.pid"
$logPath  = Join-Path $stateDir "daemon.log"
$errPath  = Join-Path $stateDir "daemon.err.log"

function Get-DaemonPid {
  if (-not (Test-Path $pidFile)) { return $null }
  $raw = (Get-Content $pidFile -Raw).Trim()
  if ($raw -match '^\d+$') { return [int]$raw }
  return $null
}

function Test-DaemonAlive([int]$candidate) {
  if (-not $candidate) { return $false }
  $p = Get-Process -Id $candidate -ErrorAction SilentlyContinue
  return [bool]$p
}

if ($Status) {
  $existing = Get-DaemonPid
  if (Test-DaemonAlive $existing) {
    $p = Get-Process -Id $existing
    Write-Host "RUNNING - PID $existing ($($p.ProcessName)) mem=$([math]::Round($p.WorkingSet64/1MB,1))MB cpu=$($p.CPU)s"
    exit 0
  }
  Write-Host "STOPPED"
  exit 1
}

if ($Stop) {
  $existing = Get-DaemonPid
  if (Test-DaemonAlive $existing) {
    Stop-Process -Id $existing -Force
    Write-Host "Stopped PID $existing"
  } else {
    Write-Host "Not running"
  }
  if (Test-Path $pidFile) { Remove-Item $pidFile -Force }
  exit 0
}

# Start path.
$existing = Get-DaemonPid
if (Test-DaemonAlive $existing) {
  Write-Host "Already running - PID $existing. Use -Stop first to restart."
  exit 0
}

if (-not (Test-Path $stateDir)) { New-Item -ItemType Directory -Path $stateDir | Out-Null }

$rufloJs = Join-Path $env:APPDATA "npm\node_modules\ruflo\bin\ruflo.js"
if (-not (Test-Path $rufloJs)) {
  Write-Error "ruflo entry not found at $rufloJs - run: npm install -g ruflo@latest"
  exit 1
}
$nodeExe = (Get-Command node -ErrorAction Stop).Source

$proc = Start-Process `
  -FilePath $nodeExe `
  -ArgumentList "`"$rufloJs`"","daemon","start","--foreground" `
  -WindowStyle Hidden `
  -PassThru `
  -WorkingDirectory $repoRoot `
  -RedirectStandardOutput $logPath `
  -RedirectStandardError $errPath

Start-Sleep -Seconds 5
if (Test-DaemonAlive $proc.Id) {
  Set-Content -Path $pidFile -Value $proc.Id -Encoding ascii
  Write-Host "RUNNING - PID $($proc.Id), logs: $logPath"
  exit 0
}

Write-Error "Daemon died within 5s. exit=$($proc.ExitCode). Tail of stderr:"
if (Test-Path $errPath) { Get-Content $errPath -Tail 10 }
exit 1
