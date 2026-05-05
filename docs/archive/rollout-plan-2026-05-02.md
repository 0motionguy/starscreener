# STARSCREENER Ultra Rollout Plan — 2026-05-02

This is the kickoff doc for the next session. Reads in 5 minutes; executes in ~6-8 hours of agent + foreground time. Outcome: every P0 from the ultra audit is closed and the highest-leverage P1s ship.

## What's already done (don't redo)

Committed at `15454ee1` on `main`:
- `CONTEXT.md` — 58-term canonical glossary
- `docs/ultra-audit-2026-05-01.md` — full 6-domain audit + Top 5 ship-this-week
- `scripts/snapshot-consensus.ts` — age guard
- `scripts/fetch-repo-metadata.mjs` — failure-rate threshold
- `src/app/api/pipeline/deltas/route.ts` — immediate-mode deltas route (consumer ready, producer pending)

Plus prior session: 12 Pocock skills installed, pre-commit hook augmented, git-guardrails PreToolUse hook live.

## First commands when you start the session

```bash
# 1) Sanity check — confirm we're on main + audit committed
git branch --show-current        # expect: main
git log --oneline -3             # expect 15454ee1 ultra-audit at top
cat docs/ultra-audit-2026-05-01.md | head -40   # warm context cache

# 2) Snapshot any stray uncommitted parallel-session work BEFORE I touch anything
git status --short
git stash push -u -m "session-start-snapshot-2026-05-02"   # safety net; can recover if a phase hits a snag
git stash pop   # immediately re-apply; this just creates a recovery point

# 3) Print CONTEXT.md term count + audit Top 5
grep -c '^\*\*[A-Z]' CONTEXT.md
sed -n '/## Top 5 ship-this-week/,/^## /p' docs/ultra-audit-2026-05-01.md | head -25
```

## Branch hygiene rule (NON-NEGOTIABLE)

The biggest pain in the prior session was parallel-session merges moving the working tree out from under in-flight work. Rules for the next session:

1. **Stay on `main`.** Don't checkout other branches mid-task.
2. **`git stash` before any unsanctioned branch op.** The user (or a cron, or another terminal) might force a checkout — stash protects.
3. **Survival pattern for every file change**: `Write` (tool) → `git add <file>` → **`git commit -m "wip(scope): brief"` IMMEDIATELY** (every 5-10 min, batch later). Commits are durable across merges; staging is not.
4. **One agent per non-overlapping file set.** Use the file allowlist in each agent's prompt.
5. **End-of-phase synthesis commit** locks the wave's gains.

## The 6-phase plan (parallel within phase, gated between phases)

### Phase 0 — Stabilize (~15 min, foreground only, no agents)

Goal: clean baseline before Wave dispatches.

- `git status --short` — list stray uncommitted files
- For each, decide: commit, revert, or stash
- `git fetch origin && git pull --ff-only origin main` — sync with parallel sessions
- `git branch -a | head` — note other active feature branches

**Gate to Phase 1**: working tree clean OR a single named WIP commit.

---

### Phase 1 — Consolidate `feat/v4-alert-rules` → `main` (~30-45 min)

Goal: close 3 P0s that already have shipped agent work on a feature branch but never merged. **Highest single-action ROI.**

What's on `feat/v4-alert-rules` (per audit Section 4):
- A: Twitter as 6th cross-signal channel (`src/lib/pipeline/cross-signal.ts` + tests + `CrossSignalBreakdown.tsx`)
- I: Twitter+PH mention synthesizer (`src/lib/api/repo-profile.ts` + `MentionMeta.ts`)
- H: ThemeToggle rip (`Header.tsx` + `SidebarFooter.tsx` + `ThemeToggle.tsx` + `Top10Page.tsx` + e2e skip)
- B: V4 mobile breakpoint (`v4.css`)
- ~10 files, +268/-190 LOC

**Approach**: foreground (no agents). One PR or direct cherry-pick.

```bash
# Inspect first
git log feat/v4-alert-rules --not main --oneline
git diff main..feat/v4-alert-rules --stat

# Either cherry-pick the commit set
git cherry-pick <commit-range>

# OR open a PR consolidating
gh pr create --base main --head feat/v4-alert-rules --title "consolidate: Twitter 6th channel + mention synth + ThemeToggle rip" --body "Closes 3 P0s from docs/ultra-audit-2026-05-01.md"
```

**Verify after merge**:
- `grep twitterComponent src/lib/pipeline/cross-signal.ts` → must be ≥1
- `grep "twitter-" src/lib/api/repo-profile.ts` → must be ≥1
- `grep ThemeToggle src/components/layout/Header.tsx` → must be 0
- `npx tsc --noEmit | head` → green

**Gate to Phase 2**: 3 P0s closed.

---

### Phase 2 — Highest-ROI feature: deltas producer (~half-day, 1 agent)

Goal: cut home-page staleness from 4h → 30 min by wiring the producer for the immediate-mode deltas route that already shipped.

**Agent W2-PROD** (Pocock skill aligned: `tdd`)
- File allowlist: `apps/trendingrepo-worker/src/fetchers/star-snapshot.ts` (NEW) OR extend `scripts/collect-twitter-signals.ts`
- Task: write `star-snapshot:24h`, `star-snapshot:7d`, `star-snapshot:30d` Redis keys after each scrape-trending tick
- Use `getDataStore().write(key, snapshot, { ttlSeconds: 25*3600 })` (or appropriate TTL)
- Red-green-refactor: write a test first that hits `/api/pipeline/deltas` and asserts `current` and `prior` are populated; confirm it FAILS today; then make it pass
- Output: 1 PR, ~80-150 LOC

**Verify**:
- `curl -X POST http://localhost:3023/api/pipeline/deltas -H "Authorization: Bearer $CRON_SECRET" -d '{"repo":"vercel/next.js","window":"24h"}'` → returns `{ ok: true, current, prior, delta, fresh: true }`
- Run the cron's snapshot writer once; verify `delta_24h` no longer lags 4h behind on home

**Gate to Phase 3**: producer + consumer round-trip working in dev.

---

### Phase 3 — Parallel Polish Wave (8 agents in parallel, ~30-45 min wall clock)

Goal: knock out P1s with non-overlapping file scopes. All agents use the survival pattern (Write + git add + commit every 5 min).

| # | Agent | Skill | Files (allowlist) | Effort |
|---|---|---|---|---|
| 1 | **W3-MCP** — wire LeaderboardTemplate to `/mcp` (mirrors `/skills` `51e8799e` pattern) | `improve-codebase-architecture` | `src/app/mcp/page.tsx` | half-day |
| 2 | **W3-AGENTREPOS** — same pattern → `/agent-repos` | same | `src/app/agent-repos/page.tsx` | half-day |
| 3 | **W3-CATEGORIES** — same → `/categories` | same | `src/app/categories/page.tsx` | half-day |
| 4 | **W3-MODELUSAGE** — same → `/model-usage` | same | `src/app/model-usage/page.tsx` | half-day |
| 5 | **W3-AGREEMAT** — AgreementMatrix.tsx hex → V4 tokens (5 BAND_COLOR + 3 SVG consumption sites via `style={{ fill: d.color }}`) | (mechanical) | `src/components/consensus/AgreementMatrix.tsx` | 30 min |
| 6 | **W3-FUNDCARD** — FundingCard.tsx LOGO_TONES → `--v4-fund-*` tokens via `color-mix(in srgb, ${token} N%, transparent)` | (mechanical) | `src/components/funding/FundingCard.tsx` | 1h |
| 7 | **W3-MENTAGG** — extend `repo-profile.ts` mention synthesizer to also pull from Lobsters, NPM, HF, ArXiv (mirror Twitter/PH pattern from Phase 1) | (extension) | `src/lib/api/repo-profile.ts`, `src/components/repo-detail/MentionMeta.ts`, `src/components/repo-detail/RecentMentionsFeed.tsx` | half-day |
| 8 | **W3-DEVTO** — change DevTo cron `30 8 * * *` → `0 */6 * * *` | (trivial — foreground, not an agent) | `.github/workflows/scrape-devto.yml` | 5 min |

**Conflict avoidance**:
- W3-MCP/AGENTREPOS/CATEGORIES/MODELUSAGE each touch ONLY their own page file. No overlap.
- W3-AGREEMAT and W3-FUNDCARD each touch ONLY their own component file. No overlap with each other or routes.
- W3-MENTAGG touches `repo-profile.ts` — but Phase 1's I agent should have ALREADY landed Twitter+PH there. W3-MENTAGG extends the existing pattern.

**Verify per agent**:
- File staged AND committed (`git log --oneline -1 -- <file>`)
- typecheck green for the file
- For UI changes: specific-marker grep proves the change

**Gate to Phase 4**: all 8 agents return; final `npx tsc --noEmit` green; commit summary commit.

---

### Phase 4 — Synthesis & Architecture (3 agents in parallel, ~30 min wall clock)

| # | Agent | Skill | Files | Effort |
|---|---|---|---|---|
| 1 | **W4-CONSFAC** — extract `createPayloadReader<T>(key, normalize)` factory in `src/lib/data-store-reader.ts`; migrate `consensus-trending.ts` + `consensus-verdicts.ts` + `signals/consensus.ts` to use it. Audit A1. | `improve-codebase-architecture` | `src/lib/data-store-reader.ts` (NEW), 3 consensus readers | half-day |
| 2 | **W4-FRESHBADGE** — add `<FreshnessBadge>` component (5-line wrapper around `classifyFreshness()`), wire to top 5 routes (`/`, `/breakouts`, `/repo/[owner]/[name]`, `/skills`, `/funding`) | (UI extension) | `src/components/shared/FreshnessBadge.tsx` (NEW), 5 page files | 2-3h |
| 3 | **W4-LINTGUARDS** — upgrade `.husky/pre-commit` from `lint:zod-routes` → `lint:guards` (the full 7-check suite). Time the slowdown; if >8s, drop the slowest one. | (config tweak — foreground, not agent) | `.husky/pre-commit` | 30 min |

**Verify**: full typecheck green; commit hooks fire on a no-op commit; 5 routes show a freshness badge in dev.

**Gate to Phase 5**: P1 list from audit reduced by ~70%.

---

### Phase 5 — New Tracking-Window Features (3 agents in parallel, ~1 day wall clock)

Per `docs/audit-tracking-windows-2026-05-01.md` (referenced in audit). The user explicitly asked for "skills + MCP + categories + 24h/7d/30d stats."

| # | Agent | Files | Effort |
|---|---|---|---|
| 1 | **W5-SKILLS24H** — Skills 24h+30d snapshots. Worker fetcher `apps/trendingrepo-worker/src/fetchers/skill-install-snapshot.ts` (NEW) + extend `src/lib/ecosystem-leaderboards.ts` (`loadSkillInstallsPrev1d` + `loadSkillInstallsPrev30d`) + `src/lib/pipeline/scoring/domain/skill.ts` (new components) + `/skills` page UI tabs | ~310 LOC, 3-4 days |
| 2 | **W5-CATWINDOW** — Category 24h+30d rollups. Worker fetcher `category-metrics-snapshot.ts` + ecosystem-leaderboards extension + `/categories/[slug]` UI | ~200 LOC, 1 day |
| 3 | **W5-MENTWINDOW** — Mention windowed counts (24h/7d/30d) per source. Modify 9 scrapers to emit count windows from rolling JSONL | ~270 LOC, 3 days |

**These three agents have NO file overlap with each other or with Phases 1-4.** Safe parallelism.

**Gate to Phase 6**: launch when willing to spend ~1 week of session time on net-new features.

---

### Phase 6 — Cleanup + Hygiene (foreground, ~1 hour)

Tail-end items, no agents needed:

- **A5**: `git rm src/lib/scoring.ts` (orphaned dead code — confirmed zero callers)
- **A6**: add `## trendingrepo-worker overlap` section to `docs/ARCHITECTURE.md` documenting the 5 sources (arxiv, bluesky, devto, hackernews, funding) where main wins
- **CLAUDE.md anti-pattern update**: add the "parallel-session-merge interference" learning + "Write → git add → git commit immediately" survival pattern
- **CONTEXT.md grill follow-up**: add Ideas cluster + ICM Motion cluster (open clusters from prior grill)
- **Verify lake**: `node scripts/promote-unknown-mentions.mjs` should now produce non-zero output (per Lake investigation it just needed timing)

**Gate**: nothing left in audit's P0/P1 unaddressed.

---

## Total agent count

- Phase 1: 0 (foreground)
- Phase 2: 1 agent
- Phase 3: 7 agents (1 trivial in foreground)
- Phase 4: 2 agents (1 in foreground)
- Phase 5: 3 agents
- Phase 6: 0 (foreground)

**Total: 13 sub-agents**, each scoped to non-overlapping file sets, each committed-immediately-after-Write so parallel-session merges can't eat the work.

## Special skills usage

- **`/grill-with-docs`** — only if CONTEXT.md needs Ideas + ICM Motion clusters in Phase 6
- **`/improve-codebase-architecture`** — Phase 4 W4-CONSFAC (the marquee deepening opportunity)
- **`/tdd`** — Phase 2 W2-PROD (red-green-refactor for the deltas producer)
- **`/diagnose`** — only if a phase fails verification; surface and fix before continuing
- **`/zoom-out`** — if any agent reports unfamiliar code; gives broader context
- **`/caveman`** — if user asks for ultra-compressed comm
- **`/to-issues`** — at end of session, convert remaining P2s to GitHub issues

## Survival pattern for EVERY agent prompt

Paste this verbatim in each agent dispatch:

```
ONEPATTERN — durability across parallel-session merges:
1. Use Write tool only (NOT Edit) for every file change
2. After every Write: `git add <file>` immediately
3. After every 1-2 file changes: `git commit -m "wip(<scope>): <one-line>"` to lock in history
4. Verify with grep AND `git log --oneline -1 -- <file>` BEFORE reporting done
5. If a verify fails (file gone, content reverted): repeat steps 1-4
6. Stay on `main` branch — do NOT switch branches under any circumstance
7. Use canonical vocab from CONTEXT.md (read it FIRST)
```

## Verification end-to-end

When all phases complete:

- [ ] `git log --oneline 15454ee1..HEAD` — at least 6 phase-summary commits
- [ ] `grep -c '^\*\*[A-Z]' CONTEXT.md` — ≥58 (or higher if Phase 6 grill ran)
- [ ] `npm run typecheck` — green
- [ ] `npm run lint:guards` — green (full suite, not just zod-routes)
- [ ] `npm test` — green
- [ ] Top 5 from ultra-audit: all 5 closed (commit refs in audit doc)
- [ ] No P0 from audit remains unaddressed
- [ ] Home page renders fresh deltas (immediate-mode producer wired); freshness badge visible

## If a phase hits a real blocker

1. **Diagnose** with `/diagnose` skill — re-read the failing file, reproduce, state what's wrong
2. **Surface** to user briefly — 1-2 sentence diagnosis + 2 options
3. **Don't dispatch new agents** until the blocker is named and reproduced
4. **Move on** to the next non-blocked phase if possible (phases are independent within their wave)

## Out of scope for next session

- Branch consolidation across `feat/v4-home-polish` + `feat/agent-commerce-handoff` + others (separate sweep)
- Recovering work from the 41-deep stash list (separate cleanup ticket)
- Recharts → SSR-SVG port (logged deviation; multi-day, not urgent)
- W1 layout shell upgrade (logged deviation)
- Light mode reactivation (V4 declared dark-only)

## Time estimate

- Optimistic: 4-5 hours wall clock (lots of parallelism)
- Realistic: 6-8 hours (some agent retries, some foreground work)
- Pessimistic: 1.5 days (if Phase 5 features run long)

## CTO notes for the next session

- Start with `git status --short` and `cat docs/rollout-plan-2026-05-02.md | head -50`
- Don't grill the user. Make decisions. Surface when truly blocked.
- Commit every 5-10 minutes. Don't trust staging.
- After each phase, post a 3-line status: `Phase N done — X commits, Y files, Z tests passing.`
- If Basil says "go" or "lets go" or one-word affirmations — execute, don't re-plan.
- If a sub-agent reports back with claims, verify with grep + git log before believing.
- The audit doc `docs/ultra-audit-2026-05-01.md` is the source of truth for what to ship. Don't re-audit; ship.
