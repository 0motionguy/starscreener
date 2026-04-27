# V2 Bug Catalog

**Generated:** 2026-04-27 (replaces aborted Sub-Agent 0 run)
**Source plan:** `~/.claude/plans/plan-mode-full-fluttering-kite.md`
**Source commits:** `9b74494..e01f100` (15 commits, chronological)
**Method:** Static analysis via `git diff` / `git show` / `Grep`. No `npm install / build / typecheck / lint` runs at historical commits — Sub-Agent 1A runs those after cherry-pick lands.

---

## Top-line summary

- **Cherry-pick conflicts:** ZERO real conflicts for the 3 foundation commits (`9b74494` + `75526a3` + `580f0fc`) against current `feat/trendingrepo-worker-scaffold`. The two branches modify disjoint file sets.
- **Deleted-import risk:** Mostly resolved. The 4 components PR #12 deleted (`IdeaComposer`, `IdeaVisuals`, `IdeasFeedView`, `IdeaDiscussion`) — only `IdeaComposer.tsx` still exists in the current tree and is imported by exactly one consumer (`src/app/ideas/page.tsx`). The other 3 are already gone.
- **Likely revert root cause:** Not deleted-import crashes (those were trivially fixable). More likely: site-wide chrome swap (HeaderV2 + SidebarV2 in root layout) introduced runtime issues, OR the 21 pages migrated in `9b74494` itself had data-adapter bugs that follow-ups `75526a3` + `580f0fc` partially patched but did not fully resolve. Recommend Sub-Agent 1A walk every route after cherry-pick before merging.
- **Branch geometry:** `9b74494^` parent (`e2a0908`) is 1 commit away from current branch's merge-base. 170 commits accumulated on current branch since merge-base — but on **disjoint files** from V2's. Cherry-pick is geometry-friendly.

## Cross-cutting issues

### Issue C1 — Site-wide chrome swap is the highest-blast-radius change
**Severity:** critical
**Type:** runtime-risk
**Affected files:** `src/app/layout.tsx` (V2), `src/components/today-v2/HeaderV2.tsx`, `src/components/today-v2/SidebarV2.tsx`
**Why this matters:** `9b74494` replaces the legacy `Header` + `Sidebar` with `HeaderV2` + `SidebarV2` in the root layout. A single navigation prop mismatch, missing `'use client'` directive, or missing `aria-` attribute breaks the entire app. This is the single most likely place the production bugs originated.
**Suggested action (Sub-Agent 1A):**
1. After cherry-pick, walk these routes manually in dev: `/`, `/twitter`, `/funding`, `/admin/login`, `/repo/{any}/{any}`, `/u/{any}`, mobile drawer (resize to 375px).
2. Diff `HeaderV2`/`SidebarV2` props against current `Header`/`Sidebar` consumers to find any missing pass-through.
3. Open DevTools console — flag every hydration warning.
**Owning sub-agent:** 1A.

### Issue C2 — `IdeaComposer.tsx` deletion lands in Batch A (commit `2c2038e`), not foundation
**Severity:** medium
**Type:** missing-import (latent)
**Affected files:** current `src/components/ideas/IdeaComposer.tsx` (will be deleted by `2c2038e`); `src/app/ideas/page.tsx` (only consumer).
**Why this matters:** `9b74494` does NOT delete `IdeaComposer.tsx`. The deletion happens in `2c2038e` (commit #6, Batch A). Foundation cherry-pick is safe; Batch A must verify no other importers exist when it runs.
**Repro:** `Grep "IdeaComposer" src/` after foundation cherry-pick → expect 2 hits (the file + the consumer). After Batch A → expect 0 hits.
**Suggested action (Sub-Agent 2 / Batch A):** confirm Grep finds 0 references post-cherry-pick. If new consumers were added since `2c2038e` was authored (170 commits of branch drift), they'll show up here and need patching.
**Owning sub-agent:** 2 (Batch A).

### Issue C3 — `IdeaCard.tsx` modified by `9b74494`
**Severity:** low
**Type:** prop-shape
**Affected files:** `src/components/ideas/IdeaCard.tsx`
**Why this matters:** `9b74494` modifies `IdeaCard.tsx` (it's in the foundation commit's file list — purpose unknown without reading the diff). `IdeaCard` is shared across `/ideas`, `/`, possibly `/categories/[slug]`. If V2 changes its prop shape, every consumer breaks.
**Suggested action (Sub-Agent 1A):** read `git show 9b74494 -- src/components/ideas/IdeaCard.tsx` and verify the prop signature change is backward-compatible. If not, file as a Batch A pre-condition.
**Owning sub-agent:** 1A (verify) → 2 (patch if needed).

### Issue C4 — `globals.css` cherry-picks 719 lines onto a zero-drift base
**Severity:** low (informational)
**Type:** clean-cherry-pick-confirmation
**Affected files:** `src/app/globals.css`
**Why this matters:** Confirmation that the V2 token block lands without conflict. Diff shows `9b74494^..HEAD -- src/app/globals.css` is empty — the current branch hasn't touched globals.css since the V2 author's base.
**Suggested action:** none — proceed.

### Issue C5 — Demo theme override (Blockworks indigo) inside `.v2-root`
**Severity:** medium
**Type:** brand-leak
**Affected files:** `src/app/globals.css` (V2 block), `src/components/today-v2/ThemePickerV2.tsx`
**Why this matters:** Per `DESIGN_SYSTEM_V2.md` §"Active theme": *"The base palette is Liquid Lava orange. The .v2-root block currently overrides it to Blockworks indigo (#9297f6) for the demo. To remove the override, delete the second token block inside .v2-root in globals.css."* If this override survives the cherry-pick, Liquid Lava orange is replaced by indigo in production.
**Suggested action (Sub-Agent 1A):** locate the second token block in `.v2-root` after cherry-picking globals.css. If demo override is still present, remove it. Confirm `--v2-acc` resolves to `#f56e0f`.
**Owning sub-agent:** 1A.

### Issue C6 — `next-themes` light-theme support is now visually broken (V2 is dark-only)
**Severity:** low
**Type:** stale-feature
**Affected files:** `src/components/providers/ThemeProvider.tsx`, `src/app/globals.css` `.light` block, `src/components/shared/ThemeToggle.tsx`.
**Why this matters:** V2 token aliasing makes V1 names resolve to V2 dark values. The `.light` class still flips a token block (light theme), but V2 chrome (dot-field, hairlines, ink ramp) is dark-only — toggling light theme produces a visually broken hybrid.
**Suggested action:** defer to Phase 5 cleanup (planned). During the migration window, light theme is acceptably-broken. Sub-Agent 9 (A11yAndQA) flags any contrast regression.
**Owning sub-agent:** Phase 5 cleanup PR.

---

## Per-commit findings

### `9b74494` — full V2 rebrand (FOUNDATION)
**Scope:** 59 files, +8949 / -4388. Adds 17 V2 components in `today-v2/` (incl. 8 primitives), modifies `globals.css` (+697 lines), `layout.tsx`, `Header.tsx`, `IdeaCard.tsx`, `CompareProfileGrid.tsx`. Migrates 21+ pages directly.
**Cherry-pick conflict prediction:** **CLEAN.** Per-file diffs `9b74494^..HEAD` for foundation files: `globals.css` = 0 drift, `layout.tsx` = 0 drift (byte-identical). No real conflicts.
**Findings:**
- Issue C1 (site-wide chrome swap — runtime risk).
- Issue C3 (`IdeaCard.tsx` prop shape — verify).
- Issue C4 (clean globals.css cherry-pick).
- Issue C5 (demo theme override).
- 21 pages migrated in this single commit — high surface area for data-adapter bugs that 75526a3 / 580f0fc patched. After cherry-pick, walk every page that this commit touched (see file list above) at least at 1280px desktop.

### `75526a3` — fix(v2): replace synthetic data with real snapshot values
**Scope:** 12 files. Touches 9 source pages (`/bluesky/trending`, `/devto`, `/hackernews/trending`, `/lobsters`, `/news`, `/producthunt`, `/reddit`, `/reddit/trending`, `/twitter`) plus `NewsTemplateV2.tsx`, `TrendingTableV2.tsx`, `newsAdapters.ts`.
**Conflict:** none — foundation commit owns those files. Sequential apply works.
**Findings:** This is a bug-fix on top of `9b74494`. Confirms the data-adapter wiring was the bug class that got fixed. **Sub-Agent 1A must apply this in sequence (not skip)**.

### `580f0fc` — fix(v2): wire Phase 1B refresh hooks
**Scope:** 8 files — same 8 source pages as `75526a3` (minus `/twitter`).
**Conflict:** none.
**Findings:** Refresh-hook plumbing — per CLAUDE.md, every server component should call its per-source `refreshXxxFromStore()` once at the top. This commit appears to wire that pattern into V2 source pages. **Verify after cherry-pick that each of the 8 pages calls a refresh hook.**

### `3cb8aa5` — feat(v2): rebuild /pricing
**Scope:** 1 file (`src/app/pricing/page.tsx`).
**Conflict prediction:** none — current branch hasn't touched `/pricing`.
**Findings:** Single-page migration. Low risk. Owned by Batch E.

### `4215b78` — feat(v2): rebuild /funding
**Scope:** 1 file (`src/app/funding/page.tsx`).
**Conflict:** none.
**Findings:** Single-page. Owned by Batch E.

### `2c2038e` — feat(v2): rebuild /ideas + /ideas/[id]
**Scope:** 2 files. **Likely also deletes `IdeaComposer.tsx`, `IdeaVisuals.tsx`, `IdeasFeedView.tsx`, `IdeaDiscussion.tsx`** (from PR #12 revert diff, the deletions originated in this commit's batch — confirm via `git show 2c2038e --stat`).
**Conflict:** none — current branch has not touched `/ideas`.
**Findings:** **HIGHEST-RISK BATCH (Batch A).**
- Issue C2 applies — confirm 0 remaining `IdeaComposer` imports after cherry-pick.
- Verify `IdeaCard.tsx` (modified by `9b74494`) is consumed correctly by the new `/ideas` page, since both commits work the same component.
- Walk `/ideas` and `/ideas/[id]` at desktop + mobile.

### `f0ce3ad` — feat(v2): rebuild /you
**Scope:** 1 file (`src/app/you/YouClient.tsx`).
**Conflict:** none.
**Findings:** Client component (per filename). Verify `'use client'` directive survives. Owned by Batch B.

### `1707cbd` — feat(v2): rebuild /watchlist
**Scope:** 1 file (`src/app/watchlist/page.tsx`).
**Conflict:** none.
**Findings:** Owned by Batch B.

### `b1439eb` — feat(v2): rebuild /search
**Scope:** 1 file (`src/app/search/page.tsx`).
**Conflict:** none.
**Findings:** Client component (per CLAUDE.md / inventory). Owned by Batch B.

### `5a3af14` — feat(v2): wrap /submit + /submit/revenue
**Scope:** 2 files.
**Conflict:** none.
**Findings:** Forms — verify input/button V2 styling renders correctly. Owned by Batch B.

### `72908ad` — feat(v2): rebuild /collections + /collections/[slug]
**Scope:** 2 files.
**Conflict:** **POSSIBLE.** Current branch has committed changes to `src/app/collections/page.tsx` (likely a refactor in the worker-scaffold work). Sub-Agent 4 (Batch C) must do `git diff 72908ad^..HEAD -- src/app/collections/page.tsx` to scope the conflict.
**Findings:** Inspect at Batch C dispatch — small file, likely a 5-min resolution.

### `7a936bd` — feat(v2): wrap /admin/* surfaces
**Scope:** 4 files (admin pages).
**Conflict:** none — current branch hasn't touched `/admin/*`.
**Findings:** Cookie-based auth-gated pages. Verify session middleware still works. Owned by Batch F.

### `498ff68` — feat(v2): rebuild /categories/[slug] + /compare + /cli
**Scope:** 3 files.
**Conflict:** none.
**Findings:** `/compare` has 18 components in `src/components/compare/` — V2 page rebuild may need to update consumer components too. Verify after cherry-pick. Owned by Batch D.

### `f1ca19a` — feat(v2): rebuild /portal/docs + /tools + /predict + /research + /revenue + /npm
**Scope:** 6 files.
**Conflict:** **YES** on `src/app/research/page.tsx` (current branch has UNCOMMITTED modification per `git status`). The current branch's modification is in the working tree (not committed). Cherry-pick of `f1ca19a` will fail or produce a conflict marker on this file.
**Suggested resolution:**
- Sub-Agent 5 (Batch D — owner of `f1ca19a`) at dispatch: orchestrator stashes uncommitted changes first, cherry-picks, then verifies the V2 version of `/research` is what's wanted. The uncommitted changes may be obsolete or may need to be re-applied on top of V2.
- Read `git diff -- src/app/research/page.tsx` (uncommitted) to understand what was being changed.
**Findings:** This is the only foundation/route-batch cherry-pick with a real conflict. Owned by Batch D.

### `e01f100` — feat(v2): wrap /u/[handle]
**Scope:** 1 file.
**Conflict:** none.
**Findings:** Profile header wrap. Owned by Batch F (or Batch B — orchestrator may reassign).

---

## Build / type / lint status

**SKIPPED** — running `npm install + build + typecheck + lint` at each historical commit would take >30 min and Sub-Agent 1A will run them post-cherry-pick anyway. Recommendation: Sub-Agent 1A runs the suite once after `9b74494` cherry-picks, again after `75526a3`, again after `580f0fc`, and reports each delta in the PR description.

---

## Recommendations to Sub-Agent 1A (FoundationCherry)

1. **Cherry-pick order:** `9b74494` → `75526a3` → `580f0fc`. Apply sequentially, run `npm run build && npm run typecheck && npm run lint` after each. Stop and patch if any step fails before proceeding.
2. **Working-tree handling:** the current branch has uncommitted modifications. Stash them BEFORE cherry-picking: `git stash push -u -m "pre-v2-foundation"`. After foundation lands cleanly, decide per-file whether to pop or discard. Files affected:
   - `.gitignore`, `next.config.ts`, `package.json`, `package-lock.json`, `src/app/research/page.tsx`, `src/components/layout/SidebarContent.tsx`, `src/components/signal/SourceMonogram.tsx`, `src/lib/news/freshness.ts`, plus several worker files.
   - None of these conflict with foundation — but stash provides safety.
3. **Demo theme override removal:** after cherry-picking globals.css, locate the second token block in `.v2-root` defining Blockworks indigo (`#9297f6`). Remove unless user explicitly opts to keep. Confirm `--v2-acc: #f56e0f`.
4. **Site-wide chrome verification:** after cherry-pick, walk these routes in dev (`npm run dev`) at 1280px AND 375px:
   - `/`, `/twitter`, `/funding`, `/news`, `/admin/login`, `/repo/{any}/{any}`, `/u/{any}`.
   - DevTools console must show no hydration warnings, no missing-prop warnings, no missing-key warnings.
5. **Bundle size check:** `npm run build` then check `.next/static/chunks/` size delta. Geist + Geist Mono add ~25–30 KB gzipped — anything beyond +50 KB needs investigation.
6. **Migration history note:** when re-introducing `DESIGN_SYSTEM_V2.md` (Sub-Agent 1B's work), append a "Migration history" appendix noting PR #12, the revert, and the cherry-pick re-application.

---

## Recommendations to subsequent sub-agents

- **Batch A (Sub-Agent 2 — `2c2038e`):** highest-risk batch. Confirm zero remaining imports of all 4 deleted V1 components after cherry-pick. Walk `/ideas` and `/ideas/[id]` carefully.
- **Batch D (Sub-Agent 5 — `f1ca19a`):** has the only real cherry-pick conflict (on `src/app/research/page.tsx`). Read uncommitted changes first, resolve conflict deliberately.
- **Batch C (Sub-Agent 4 — `72908ad`):** possible conflict on `src/app/collections/page.tsx` from current-branch work. Verify at dispatch.
- **All batches:** after cherry-pick, walk owned routes at 1280px and 375px. DevTools console must show 0 errors. Run axe-core on each owned route — flag any new critical violation.

---

## Open questions surfaced

1. **Should Sub-Agent 1A run on a fresh worktree off `main`, or directly on `feat/trendingrepo-worker-scaffold`?** The current branch has unrelated worker work in progress. Recommendation: branch off current HEAD (`feat/v2-foundation` from `feat/trendingrepo-worker-scaffold`) so worker work merges cleanly when the V2 stack is done. Stash uncommitted changes first.
2. **What was the original PR #12's specific bug report?** If the user has the bug list (Vercel logs, console errors, screenshots), it would dramatically narrow Sub-Agent 1A's verification scope. Currently flagging "site-wide chrome swap" as the most likely culprit per architectural reasoning.
3. **Demo theme override (Blockworks indigo) — keep or remove?** Default in plan: remove. User can override at Sub-Agent 1A dispatch if the indigo demo is still desired.
