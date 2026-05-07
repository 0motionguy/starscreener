# Windows Performance Tuning — Deferred Sprint

Owner: Basil. Single 30-min admin PowerShell session. Queued from the 2026-05-06 "move repo off OneDrive + 2x2 swarm" plan; perf hardening was deferred so the swarm could start sooner.

Run every step in an **elevated PowerShell** (Run as Administrator). Do not skip the verify line — if it doesn't print the expected output, stop and diagnose before moving on.

---

## 1. Windows Defender exclusions

WHY: `Antimalware Service Executable` pegs CPU during long Claude Code sessions, `npm install`, `tsc`, and `next build` because Defender scans every one of the ~50,000 file events a Node toolchain emits. Path + process exclusions remove that scan cost without weakening Defender for the rest of the system.

```powershell
# Paths
Add-MpPreference -ExclusionPath "C:\dev"
Add-MpPreference -ExclusionPath "$env:USERPROFILE\.claude"
Add-MpPreference -ExclusionPath "$env:APPDATA\npm"
Add-MpPreference -ExclusionPath "$env:APPDATA\npm-cache"
Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\npm-cache"
Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\pnpm"
Add-MpPreference -ExclusionPath "$env:LOCALAPPDATA\Yarn"
Add-MpPreference -ExclusionPath "$env:USERPROFILE\AppData\Roaming\Anthropic"

# Processes
Add-MpPreference -ExclusionProcess "node.exe"
Add-MpPreference -ExclusionProcess "npm.exe"
Add-MpPreference -ExclusionProcess "pnpm.exe"
Add-MpPreference -ExclusionProcess "yarn.exe"
Add-MpPreference -ExclusionProcess "git.exe"
Add-MpPreference -ExclusionProcess "claude.exe"
Add-MpPreference -ExclusionProcess "Code.exe"
Add-MpPreference -ExclusionProcess "WindowsTerminal.exe"
Add-MpPreference -ExclusionProcess "powershell.exe"
Add-MpPreference -ExclusionProcess "pwsh.exe"
```

Verify:
```powershell
Get-MpPreference | Select-Object -ExpandProperty ExclusionPath
Get-MpPreference | Select-Object -ExpandProperty ExclusionProcess
```

Caveat: do NOT disable Defender entirely. Exclusions only.

---

## 2. Ultimate Performance power plan

WHY: Default Balanced throttles CPU during sustained loads (long builds, swarm runs). Ultimate Performance removes the throttle.

```powershell
powercfg -duplicatescheme e9a42b02-d5df-448d-aa00-03f14749eb61
powercfg -setactive e9a42b02-d5df-448d-aa00-03f14749eb61
powercfg -getactivescheme
```

Verify: `getactivescheme` prints the Ultimate Performance GUID (`e9a42b02-d5df-448d-aa00-03f14749eb61`).

---

## 3. Long path support

WHY: Required for deep `node_modules` trees. Without it, paths over 260 chars fail and break installs/builds non-deterministically.

```powershell
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
git config --global core.longpaths true
```

Verify:
```powershell
(Get-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem").LongPathsEnabled  # -> 1
git config --global core.longpaths                                                              # -> true
```

---

## 4. Git performance config

WHY: fscache + preloadindex + manyFiles cut `git status` from seconds to milliseconds on large trees. `gc.auto 256` keeps repacks cheap.

```powershell
git config --global core.fscache true
git config --global core.preloadindex true
git config --global gc.auto 256
git config --global core.autocrlf input
git config --global feature.manyFiles true
```

NOTE: `core.autocrlf input` (NOT `true`). `true` rewrites LF->CRLF on checkout and breaks Linux line endings on Vercel.

Verify:
```powershell
git config --global --get-regexp '^(core|gc|feature)\.'
```

---

## 5. Node memory ceiling

WHY: Large Next.js builds OOM at the default 1.5–4 GB Node heap.

Add to `$PROFILE`:
```powershell
$env:NODE_OPTIONS = "--max-old-space-size=8192"
```

Bump to `12288` if the machine has 32+ GB RAM.

Verify: open a new shell, then:
```powershell
$env:NODE_OPTIONS   # -> --max-old-space-size=8192
```

---

## 6. Disable Windows Search indexing for C:\dev

WHY: Search indexer re-reads every file change in `C:\dev`, doubling disk IO during builds. There is no clean PowerShell equivalent for the per-folder index attribute on Windows 11 — this is a manual GUI step.

Steps:
1. File Explorer -> right-click `C:\dev` -> **Properties**
2. **Advanced…** -> uncheck **"Allow files in this folder to have contents indexed in addition to file properties"**
3. OK -> **Apply changes to this folder, subfolders and files**
4. If prompted on access-denied items: **Ignore All**

Verify: re-open Properties -> Advanced -> checkbox is unchecked.

---

## 7. Claude Code effort defaults

WHY: `xhigh` is the right daily default for senior-engineer-grade work. `max` is prone to overthinking per Anthropic's own guidance — reach for it via `/effort max` per-task only on architecture or hard debugging.

```powershell
[Environment]::SetEnvironmentVariable("CLAUDE_CODE_EFFORT_LEVEL", "xhigh", "User")
[Environment]::SetEnvironmentVariable("ANTHROPIC_MODEL", "claude-opus-4-7", "User")
[Environment]::SetEnvironmentVariable("NODE_OPTIONS", "--max-old-space-size=8192", "User")
```

Verify: open a new terminal, run `claude`, confirm the status bar shows `xhigh · /effort` and `opus 4.7`.

---

## 8. Proactivity Protocol — addition to CLAUDE.md

WHY: The repo's CLAUDE.md sets behavioral defaults for every session. The current rules cover *what* to investigate (M1–M6) but not the *cadence* of acting vs asking. Add the Proactivity Protocol as a new section at the bottom of `CLAUDE.md` (root of repo).

Append verbatim:

```markdown
## Proactivity Protocol

You are the [LEAD] CTO operating a live production system. Default to action,
not deference. Specifically:

- Investigate before asking. If a question can be answered by reading 3 or
  fewer files or running one command, do it instead of asking.
- Verify, don't assume. Memory is a hint, not proof. Check with grep, Glob,
  Bash, browser, logs, or API responses. Cite the evidence.
- Surface findings, don't bury them. When you discover something the user
  didn't ask about but should know — broken cron, drifting Redis schema,
  missing auth header — flag it explicitly with "HEADS UP:" before
  continuing the original task.
- Propose next steps. End substantive responses with "Next, I recommend X
  because Y" or "Open questions: ...". Never end with passive "Let me know
  what you'd like."
- Plan, then execute. For changes touching >2 files: enter plan mode,
  produce a numbered plan, wait for approval, execute. For <=2 files: edit
  directly and report what you did.
- Escalate when blocked. After 2 failed approaches, stop and write a short
  diagnostic ("here's what I tried, here's what I saw, here are 3 options")
  rather than thrashing on a third.
- Use subagents proactively. For tasks touching >=10 files or >=3 independent
  domains, spawn parallel research subagents and synthesize. Do not ask
  permission first.
- Run validators automatically. After any code edit: npm run typecheck and
  the relevant npm test <file>. Report pass/fail without being asked.
- Don't perform false modesty. If you're confident, say so. If uncertain,
  say what would resolve the uncertainty.

When in doubt about whether to act or ask: ACT. The user can always tell
you to back off. The user cannot recover wasted turns.
```

Verify: `git diff CLAUDE.md` shows the new section appended; commit with message `docs(claude): add Proactivity Protocol`.

---

## 9. Optional but high-impact: Windows Terminal + PowerShell 7

WHY: PowerShell 7 (`pwsh.exe`) starts ~3x faster than Windows PowerShell 5.1 and has materially better JSON handling (`ConvertFrom-Json -AsHashtable`, `??`, `?.`, ternary).

Install if missing:
```powershell
winget install --id Microsoft.PowerShell -e
```

Then in **Windows Terminal -> Settings -> Startup -> Default profile** select **PowerShell** (the 7.x entry, not "Windows PowerShell").

Verify: open a new tab, run `$PSVersionTable.PSVersion` -> major version 7+.

---

## 10. NOT recommended this sprint

- **WSL2 migration.** Real wins available but a 2–4 hour project on its own. Native Windows + the above recovers most of the lost performance.
- **Disabling Defender entirely.** Exclusions only.
- **`bypassPermissions` mode in Claude Code on production code.** Stay in default permissions on this repo.

---

## Verification harness

Run end-to-end after all steps. Paste the output into the next session so the next agent can confirm the box is hardened.

```powershell
Write-Host "=== Defender exclusions ===" -ForegroundColor Cyan
Get-MpPreference | Select-Object -ExpandProperty ExclusionPath
Write-Host ""
Get-MpPreference | Select-Object -ExpandProperty ExclusionProcess

Write-Host "`n=== Power plan ===" -ForegroundColor Cyan
powercfg -getactivescheme

Write-Host "`n=== Long paths ===" -ForegroundColor Cyan
"LongPathsEnabled = $((Get-ItemProperty -Path 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem').LongPathsEnabled)"
"git core.longpaths = $(git config --global core.longpaths)"

Write-Host "`n=== Git config ===" -ForegroundColor Cyan
git config --global --get-regexp '^(core|gc|feature)\.'

Write-Host "`n=== Node + Claude env ===" -ForegroundColor Cyan
"NODE_OPTIONS = $([Environment]::GetEnvironmentVariable('NODE_OPTIONS','User'))"
"CLAUDE_CODE_EFFORT_LEVEL = $([Environment]::GetEnvironmentVariable('CLAUDE_CODE_EFFORT_LEVEL','User'))"
"ANTHROPIC_MODEL = $([Environment]::GetEnvironmentVariable('ANTHROPIC_MODEL','User'))"

Write-Host "`n=== PowerShell version ===" -ForegroundColor Cyan
$PSVersionTable.PSVersion
```

Expected: every section non-empty, GUID matches Ultimate Performance, `LongPathsEnabled = 1`, env vars set, PSVersion 7+.

---

## Reboot

Final step. Env vars and Defender prefs need a fresh process tree — without reboot, half the changes don't take effect.

```powershell
Restart-Computer
```

After reboot, re-run the verification harness once more and confirm the Claude Code status bar shows `xhigh · /effort` and `opus 4.7`. Then this sprint is closed.
