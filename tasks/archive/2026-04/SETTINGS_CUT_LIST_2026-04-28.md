# Settings Cut List — STARSCREENER — 2026-04-28

Read-only audit of `.claude/settings.json` (91 lines, ~21 KB) and `.claude/settings.local.json` (126 lines, ~27.7 KB). The `code-review-graph` binary on the PostToolUse hook is verified at `/c/Users/mirko/.local/bin/code-review-graph` and executable, so the hook is healthy.

**Goal:** 217 → ~100 lines (~54% cut, ~42 KB saved). Zero behavioral regression. Apply manually after review.

## Section A — settings.json (project-shared, committed)

### Delete (45 entries)

**PowerShell port-3023 cleanup variants (delete 7, keep 1)**
- Lines 18, 20, 25, 32, 39, 46, 63 — duplicate kill-port logic
- KEEP line 15 (simple kill + verify)

**`.next` junction handlers (delete 12, keep 2)**
- Lines 17, 30, 41–43, 45, 52, 60–62, 65–68, 72 — iterative refinements over the OneDrive workaround
- KEEP line 16 (simple removal + junction creation)
- KEEP line 48 (robocopy fallback for stubborn locks)

**One-off debug snippets (delete 6)**
- Lines 26–28: `seo.ts` U+2028/U+2029 Unicode hex inspection — issue resolved long ago
- Lines 33, 35, 40: hardcoded PID queries (61628, 2636, 52620) — stale
- Line 51: kill hardcoded PIDs (9884, 27972, ...) — stale

**Misc duplicates (delete 3)**
- Line 21: `Bash(rm -rf .next/*)` — superseded by PowerShell handlers
- Line 73: `Read(//c/Users/mirko/.claude/**)` — superset of line 36, dedupe

**Consolidate (1 entry)**
- Lines 8–10: triple-nested RSSSTREAM read paths → single entry

### Keep
- Lines 13–14: context7 MCP integration
- Line 15: representative port kill
- Lines 16, 48: simple + robust `.next` junction handlers
- Lines 22–24, 31: generic Bash/PowerShell utilities
- Lines 36–37: project + temp-log Read permissions
- Lines 38, 50, 54: port detail report, node lister, dev server launch
- Lines 80–91: PostToolUse hook running `code-review-graph update` (verified working)

**Outcome A:** 91 → ~45 lines (–50%, ~18 KB saved).

## Section B — settings.local.json (user-local, gitignored)

### Move to settings.json (project-shared)

**WebFetch domains (move 7)**
- Lines 4–9, 28: `ossinsight.io`, `trendshift.io`, `github.com`, `star-history.com`, `gitlogs.com`, `raw.githubusercontent.com`, `trendingrepo.com`
- These are the project's data sources, not user-local preferences.

**Skill scheduling (move 2)**
- Lines 26–27: `Skill(schedule)`, `Skill(schedule:*)`

**Supabase MCP (conditional move, 5)**
- Lines 39–43: `mcp__claude_ai_Supabase__*`
- IF the `quizzical-kilby` ideas+Supabase work lands in main, MOVE to shared. Otherwise DELETE.

### Dedupe test commands (delete 2, keep 1)
- Line 49: `stripe-events.test.ts` alone
- Line 66: stripe-events + alerts
- KEEP line 96 — comprehensive (stripe-events + alerts + persistence-hydration)

### Delete

**Health-check `Invoke-WebRequest` variants (delete 60+, keep 3)**
- Lines 53, 65, 68, 79–83, 97, 112–114: simple status checks → KEEP line 107 (`/api/health?soft=1`)
- Lines 55, 59, 62, 69, 71–77, 86–87, 95, 99–103, 108, 110: multi-URL route validation → KEEP line 102 (12-route sweep)
- Lines 54, 56–58, 60–61, 64, 67, 82, 84, 90, 106: error-message regex extraction → KEEP line 70 (best fallback)

**HTML content-pattern matching (delete 7)**
- Lines 88–92, 104–105: brittle string-match against current UI ("SNAPSHOT", "FEATURED", "BgThemePicker") — coupled to today's surface, will rot.

**One-off debug (delete 7)**
- Lines 16–17: `node -e` polling of task output logs
- Lines 19–22: hardcoded PID queries (61832, 75998, 75939, 49348, 91650)
- Lines 45, 51–52: directory listing, tsx encoding inspection

**Setup artifacts (delete 3)**
- Line 29: `cp settings.json.pre-context-mode.bak`
- Line 31: `rm mcp.json`
- Line 32: `rtk ls *`

**Bash noise (delete 3)**
- Line 118: `rm -rf .next/*` (dup of PowerShell)
- Line 119: `rtk proxy *` (dup of settings.json line 22)
- Line 120: `disown` (POSIX-only, doesn't work on Windows)

### Keep
- Lines 10–12, 23: simple curl, netstat
- Lines 13–14, 50: Vercel MCP integration
- Lines 44, 46–48: project-specific tsx entrypoints (ai-blogs, arxiv, trendingrepo-worker)
- Line 70: representative error-message extractor
- Line 96: full-pipeline test command
- Line 102: comprehensive 12-route validation
- Line 107: simple `/api/health` check

**Outcome B:** 126 → ~55 lines (–56%, ~23.7 KB saved).

## Section C — Cross-file duplicates

| Pattern | settings.json | settings.local.json | Resolution |
|---|---|---|---|
| `.next` cleanup logic | Lines 16–72 (40+ variants) | Lines 115–122 | Keep 2 in shared, DELETE all from local |
| Port 3023 health checks | Lines 15, 18, 20, 25, ... | Lines 53–123 (80 variants) | Keep 3 patterns in local (user monitoring), DELETE all from shared |
| `Bash(rm -rf .next/*)` | Line 21 | Line 118 | DELETE both, PowerShell handlers superior |
| `rtk proxy *` | (in shared) | Line 119 | DELETE from local |

## Section D — Combined outcome

| File | Before | After | Saved |
|---|---|---|---|
| `settings.json` | 91 lines / ~21 KB | ~45 lines / ~3 KB | 46 lines / 18 KB |
| `settings.local.json` | 126 lines / ~27.7 KB | ~55 lines / ~4 KB | 71 lines / 23.7 KB |
| **Total** | **217 / 49 KB** | **100 / 7 KB** | **117 / 42 KB** |

## Section E — Risks & verification

**Behavioral risk: VERY LOW.**

Preserved capabilities:
- `.next` junction logic (simple + robust)
- Port cleanup (representative)
- Test execution (comprehensive line 96)
- Dev server launch (line 54)
- All MCP integrations (Vercel, context7, scheduling)
- Read/Write permissions (with WebFetch moved to shared)

Removed capabilities (safe):
- Stale hardcoded PIDs (will never match running process IDs again)
- One-off debug commands from resolved incidents
- Brittle UI string-match probes
- Outdated `node -e` polling patterns

**Hook health:** `code-review-graph` binary verified present + executable at `/c/Users/mirko/.local/bin/code-review-graph`. PostToolUse matcher covers Edit, Write, Bash. 30s timeout reasonable.

**Post-cut verification checklist:**
- [ ] `code-review-graph update --skip-flows` runs cleanly (hook smoke test)
- [ ] `npx next dev --turbopack -p 3024` launches (settings.json:54 still present)
- [ ] Pipeline test: `npx tsx --test src/lib/pipeline/__tests__/...` (line 96 still present)
- [ ] Port cleanup: kill 3023 PowerShell still in shared
- [ ] `.next` junction creation: lines 16, 48 still in shared
- [ ] Vercel MCP tools still accessible
- [ ] No new permission prompts on routine workflows

## Recommendation

Apply Section A + B in two passes:
1. **Pass 1 (settings.json):** consolidate + delete 45 lines. Run `code-review-graph update --skip-flows` once after to confirm hook still fires.
2. **Pass 2 (settings.local.json):** delete 60+ duplicate health checks, dedupe test commands, move WebFetch + Skill(schedule*) to shared. Run a real dev session with the cleaned config; if any common workflow re-prompts for permission, add the specific entry back.

The Supabase MCP move (Section B item 3) is conditional — defer until the `quizzical-kilby` ideas/Supabase worktree is decided on.
