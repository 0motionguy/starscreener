# Tech-Debt Audit — Handoff Role Prompt

> Paste the section under `--- ROLE PROMPT ---` into a new Claude Code session
> as the opening user message. It briefs the next Claude on where today's work
> ended and what to ship next, with file:line citations so the agent doesn't
> have to spelunk.

---

## Where things stand (2026-04-27 end of day)

**Audit doc**: [TECH_DEBT_AUDIT.md](../TECH_DEBT_AUDIT.md) — 87 findings from a 5-module pass using the [ksimback/tech-debt-skill](https://github.com/ksimback/tech-debt-skill).

**Sprint plan**: [SPRINTS.md](../SPRINTS.md).

**Closed today** (29 of 87, including all 3 Critical):
| Sprint | Findings closed | Commits |
|---|---|---|
| 0 — Stripe XS-01 | XS-01 (stub fallback + Redis SETNX idempotency) | `3f3419b` |
| 1 — UI dead code + RSC | UI-01 (delete `src/components/detail/`), UI-15, UI-17, LIB-12 | `8c88622` |
| 2 — API boundary hardening | parseBody + serverError helpers, APP-02 (6 routes), APP-03, APP-11, APP-06 | `c7f9e4b`, `98cd176` |
| 6 — UI cleanup | UI-02 (delete RepoReactions dup), UI-08, UI-07 (ErrorBoundary), UI-12, UI-14 | `0bc04b1`, `2d9abe4`, `c9d5983`, `3949aa1` |
| 4 — `derived-repos.ts` decomp | LIB-01 (754→415 LOC, 4 of 5 steps) | `b3d3f31`, `c02121c`, `534ece0`, `985a373` |
| 5 — Pipeline perf cluster | LIB-04, LIB-05, LIB-10, LIB-11, LIB-13 | `620e380`, `1bfcec4`, `1eefae5`, `2295816`, `b345679` |

**Shared modules added today** — these are the canonical helpers the next
session should keep using and not re-implement:

| Module | Use for |
|---|---|
| `src/lib/api/parse-body.ts` | Zod-validated request body parsing — replaces typeof ladders |
| `src/lib/api/error-response.ts` | `serverError<T>(err, { scope, code, status })` — replaces `err.message` echoes |
| `src/lib/admin/scan-sources.ts` | Source-of-truth `SCAN_SOURCES` whitelist + script paths |
| `src/lib/stripe/idempotency.ts` | `acquireStripeEventLock(redis, eventId)` — Redis SETNX idempotency |
| `src/components/shared/ErrorBoundary.tsx` | V2-styled boundary; wrap heavy canvases / chart mounts |
| `src/lib/derived-repos/sparkline.ts` | `synthesizeSparkline` + `synthesizeRecentRepoSparkline` |
| `src/lib/derived-repos/loaders/pipeline-jsonl.ts` | mtime-cached `.data/repos.jsonl` loader |
| `src/lib/derived-repos/loaders/trending-aggregates.ts` | OSSInsights aggregation + `baseRepoFromTrending` |
| `src/lib/pipeline/storage/debounced-persist.ts` | `createDebouncedPersist({ flush, label, debounceMs })` factory |

**V2 design system** — non-negotiable. Use `var(--v2-bg-*)`, `--v2-line-*`,
`--v2-ink-*`, `--v2-sig-*` and `.v2-mono`/`.v2-btn`/`.v2-btn-ghost`/`.v2-card`/
`.v2-stat` classes. **Never** introduce Tailwind `text-zinc-*`/`bg-gray-*`/etc.
Tokens are defined in `src/app/globals.css:162-220`. V2 primitives live in
`src/components/v2/`.

**Branch / commit policy**:
- The operator (`Kermit457`) runs an aggressive auto-commit process that
  sweeps every working-tree change into the next stability commit. Strategy
  that worked today: edit + verify typecheck + commit immediately. Don't
  let work sit uncommitted overnight.
- Worker dir (`apps/trendingrepo-worker/`) is currently broken on this
  branch (registry imports fetcher dirs that aren't on disk). Don't touch
  worker-dir items until that's resolved upstream.

---

## --- ROLE PROMPT ---

You are picking up a tech-debt audit cleanup mid-stream on the **STARSCREENER** repo
(Next.js 15 App Router + Tailwind 4 + worker monorepo at `c:\Users\mirko\OneDrive\Desktop\STARSCREENER`).

**Read first** (in this order, do not skip):
1. `docs/AUDIT_HANDOFF.md` — this file
2. `TECH_DEBT_AUDIT.md` — the 87-finding audit
3. `SPRINTS.md` — the sprint plan
4. `CLAUDE.md` — project conventions (data-store reads MUST go through `data-store.ts`,
   collectors run in `direct` mode not `api`, etc.)

**Context that matters**:
- 29 of 87 findings closed in the prior session (see `docs/AUDIT_HANDOFF.md`).
- Helper modules at `src/lib/api/parse-body.ts`, `src/lib/api/error-response.ts`,
  `src/lib/stripe/idempotency.ts`, `src/components/shared/ErrorBoundary.tsx`,
  `src/lib/pipeline/storage/debounced-persist.ts` are the canonical primitives
  for their domains — extend them, don't fork them.
- V2 design system: only use `var(--v2-*)` tokens and `.v2-*` classes. Zero
  legacy Tailwind grayscale (`text-zinc-*`, `bg-gray-*`).
- Mirko's voice: direct, action-oriented. He wants commits + verification, not
  proposals. "Crushing it" = ship more, commit, verify. He is OK with you
  picking the next sprint autonomously.
- Pattern that worked: every commit is typecheck-clean (`npm run typecheck`
  — ignore `apps/trendingrepo-worker` and `.next/types/` errors, those are
  pre-existing branch-state issues). Stripe tests via PowerShell:
  `.\node_modules\.bin\tsx.cmd --test src/lib/pipeline/__tests__/stripe-events.test.ts`.

**Operating rules**:
1. **Cite `file:line` for every claim.** No vibes.
2. **Each commit is independently shippable.** Verify typecheck before commit.
3. **Stay inside the requested scope.** Don't widen.
4. **Use the helpers.** `serverError(err, { scope: "[<route>]" })` instead of
   echoing `err.message`. `parseBody(req, ZodSchema)` instead of typeof ladders.
   `<ErrorBoundary>` around any new canvas/chart mount.
5. **Commit fast.** The operator's auto-commit process can sweep working-tree
   work; staging-then-committing in one shell sequence wins the race.
6. **No old design.** V2 tokens only. If a fallback UI needs styling, mirror
   the existing ErrorBoundary fallback.

**Pick from this queue** (ranked by ROI):

### Tier A — quick wins (≤30 min each, low risk)

- **UI-13**: `src/components/reddit-trending/SubredditMindshareCanvas.tsx:1049-1062`
  collapse 80 per-seed `<radialGradient>` defs into ~4 tier-keyed defs.
- **UI-18**: `src/components/terminal/Terminal.tsx:81-92` rAF-throttle the
  `useWindowWidth` resize handler (currently 60+ re-renders/s during drag).
- **UI-10**: `src/components/repo-detail/RepoDetailChart.tsx:599-636` — the
  Tooltip `content={(props) => ...}` is a fresh closure on every render so
  Recharts re-mounts the tooltip. Move to a stable component reference.
- **UI-11**: extract `useDebouncedSearch(q, opts)` from
  `src/components/shared/SearchBar.tsx:119-143` and dedupe with
  `src/components/compare/CompareSelector.tsx:73-119`.
- **UI-05**: `src/components/watchlist/WatchlistManager.tsx:142-172` diff the
  refetch on `repoId.sort().join(",")` instead of the array reference.
- **APP-15**: `src/app/page.tsx:179-181` (FAQ JSON-LD) reconcile
  "every 20 minutes" with `CLAUDE.md`'s "3h interval default."
- **SCR-15**: `scripts/compute-deltas.mjs:54-71` — single `git log` + JS
  partition into windows, drops 3 process spawns per cron run.
- **APP-17**: `src/app/api/repos/[owner]/[name]/route.ts:96-103` — add a
  `console.warn` when the `?v=1` legacy path is hit so we know whether
  the sunset criterion has been met.
- **LIB-19**: `src/lib/pipeline/pipeline.ts:130-141, :559-563` — collapse
  the racey double-`ensureReady()` pattern; both branches reduce to one
  unconditional `await ensureReady()` (it's idempotent).

### Tier B — medium architectural (½–1 day each)

- **LIB-09**: `src/lib/pipeline/pipeline.ts:176-389` — extract `recomputeAll`'s
  6 numbered phases into named functions (`phaseScore`, `phaseClassify`,
  `phaseRank`, `phaseAlerts`). Once extracted, `recomputeRepo` (the single-repo
  variant that currently inlines phases 1-4) can call them directly, closing
  **LIB-08** (the `rank_changed` / `breakout_detected` event divergence).
- **UI-04**: extract `usePhysicsBubbles({ seeds, width, height, onClick })` hook
  from the 3-way fork: `BubbleMapCanvas` (683 LOC), `SubredditMindshareCanvas`
  (1086 LOC), `TopicMindshareCanvas` (564 LOC). Each duplicates the same verlet
  integrator + pointer capture + click-vs-drag + rAF auto-stop. ~600 LOC × 3 dups.
- **UI-03**: `src/components/reddit-trending/SubredditMindshareCanvas.tsx:732-937`
  the `bubbleElements` `useMemo` deps include `draggingId` and `hoveredId` so
  every hover rebuilds JSX for 50+ bubbles. Drive hover via `setAttribute` on
  the same `groupRefs` the physics loop already uses.
- **APP-04**: `src/app/demo/page.tsx` (1644 LOC) — split the inline mock data
  into `_demo-fixtures.ts`, leave the page <400 LOC.
- **APP-05**: `src/app/news/page.tsx` (982 LOC) — extract per-source
  `<NewsTab source="..."/>` server components.

### Tier C — Sprint 4 step 5 (optional, diminishing returns)

- Extract decorator splits from `src/lib/derived-repos.ts:415` (the orchestrator)
  into `src/lib/derived-repos/decorators/{twitter,producthunt,cross-signal}.ts`.
  Stylistic cleanup; not a perf/correctness fix.

### Tier D — Sprint 7 test coverage backfill

- **LIB-06**: `src/lib/pipeline/__tests__/stripe-events.test.ts:384-405` add
  3 negative tests for sig verification (expired ts, replay, missing header).
- **WK-08** (parked, worker-dir broken): per-fetcher fixture-driven normalizer
  tests for producthunt/reddit/bluesky/hackernews/devto.
- **SCR-07** (parked, MCP changes blocked on worker dir): one MCP test that
  mocks fetch + asserts metering doesn't throw on 500.
- **SCR-11**: smoke test for `scripts/_data-store-write.mjs` + funding extractor.

---

## Bonus quality-of-life wins (NOT in the audit)

These weren't in the original audit but came up while doing the work today.
Each is small, durable, and improves day-to-day velocity:

### 1. CI guard against legacy design tokens (~20 min)
Add an ESLint rule or a `prebuild` script that fails when `text-zinc-*`,
`bg-gray-*`, `border-zinc-*`, `text-neutral-*` appear in `src/components/`
or `src/app/`. The V2 rebrand is mostly done; this prevents regression.

```bash
# scripts/check-no-legacy-tokens.mjs (sketch)
const pattern = /(text|bg|border)-(zinc|gray|neutral|slate)-\d+/g;
// scan src/, fail on match outside allow-listed v2/* primitives
```

### 2. CI guard against err.message echoes (~20 min)
After today's APP-03 sweep, prevent backsliding. ESLint custom rule or grep:
```regex
NextResponse\.json\([\s\S]{0,200}?err\.message
```
Fail if any new route handler ships with that pattern. Point fixers at
`src/lib/api/error-response.ts:serverError`.

### 3. CI guard for Zod on mutating endpoints (~30 min)
`src/app/api/**/route.ts` files exporting `POST`/`PUT`/`DELETE` should
import `parseBody` from `@/lib/api/parse-body` OR have a comment-justified
exception. Catches the next typeof ladder.

### 4. Add a `npm run audit:status` script (~30 min)
Parses `TECH_DEBT_AUDIT.md`'s findings table + `git log --grep '\bUI-\|APP-\|LIB-\|SCR-\|XS-\|WK-\b'`
and prints a closure rate per category. Pin this in `package.json` so
"how much debt is left" is one command away.

### 5. Pre-commit hook for V2 conformance (~15 min)
Husky `pre-commit` running the legacy-tokens check from #1 against staged
files only. Fast (only checks staged), high-signal.

### 6. `docs/RUNBOOK.md` (~45 min)
Consolidate the things that bit us today:
- "Operator auto-commits — work in small + verify locally" workflow
- V2 token reference card
- How to reset cache state in tests (`__resetDerivedReposCache` etc.)
- How to run worker tests from PowerShell when bash flakes
  (`.\node_modules\.bin\tsx.cmd --test ...`)
- Branch policy: when to switch, when not to

### 7. Standardize `runtime` declarations on every API route (~1 hour)
Every `route.ts` should declare `export const runtime = "nodejs"` (or `"edge"`)
explicitly. Currently inferred. The Stripe webhook depends on this being
nodejs — making it explicit prevents a future Edge-runtime experiment from
silently breaking signature verification.

### 8. Auto-rotate `.data/admin-scan-runs/` (~30 min — APP-13 from audit)
The audit flagged this; it pairs naturally with the rest of the admin
hygiene cluster. Ship a helper that keeps newest N=20 logs per source and
deletes the rest, called from `api/admin/scan/route.ts:104` after spawn.

### 9. A weekly `/tech-debt-audit` re-run cron (~10 min via /schedule)
The skill at `.claude/skills/tech-debt-audit/SKILL.md` supports repeat-run
mode. Schedule it weekly, diff against `TECH_DEBT_AUDIT.md`, surface NEW
findings as a PR comment. Keeps the audit honest as the codebase moves.

### 10. README badges (~15 min)
- "Audit progress: 29/87" (auto-updated by #4)
- "V2 conformance: 100%" (auto-updated by #1)
- "Critical findings open: 0"

These three numbers are what you check first thing every morning. Putting
them in the README means everyone sees them.

---

## Pitfalls observed today

1. **Don't touch `apps/trendingrepo-worker/` until it stabilizes.** The
   registry references fetcher subdirs that aren't on disk. Several Sprint 3
   items are parked behind this. Parking is the right call — fixing the
   worker state is upstream of fixing worker findings.

2. **The operator's auto-commit landed my changes under unrelated commit
   messages multiple times.** This is a feature: if you write good code +
   typecheck-clean it, it ships even if your direct `git commit` races.
   Don't be alarmed when `git status` clears unexpectedly — check the log.

3. **Recharts `TooltipProps<...>` typing is broken in the version we use.**
   UI-16 attempted a typed-prop fix and reverted because Recharts doesn't
   expose `payload` on `TooltipProps`. Leave the localized `as` cast and
   move on.

4. **The `recharts` string `dataKey` (`"counts.${src}"`) does work** even
   though the docs are unclear about it. Verified via UI-14 (`3949aa1`).

5. **`commit git status` (with the leading word `command`) bypasses the
   `rtk` proxy** and gives you raw git output when the proxy parser flakes.
   Use it when you need accurate state.

6. **`schedulePersist` invocations during `recomputeAll` go through
   `withSuspendedPersistHook` now**. If you add a new bulk-mutation phase,
   wrap it the same way. Don't manually call `schedulePersist` inside a
   bulk pass.

End of role prompt.
