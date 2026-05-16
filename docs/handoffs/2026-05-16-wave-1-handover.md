# Handover — Wave 1 audit + /simplify polish (2026-05-16)

Status at handoff: `audit/imp-wave-1` pushed to origin, 6 commits ahead of `main`.
Working tree clean of tracked changes. Two other Claude sessions worked the same
branch in parallel; coordinate before any merge to `main`.

PR URL (not yet opened): https://github.com/0motionguy/starscreener/pull/new/audit/imp-wave-1

---

## What shipped on `audit/imp-wave-1`

```
0dd44ff55 audit(wave-1): SEO titles + tier-list URL state + search filter contract
fd737b8a2 feat(tier-list): hasTierListUrlState helper + share-bar polish
3ab988fa6 feat(alerts): ownership-scoped updateAlertRule + useToggleAlertRule hook
f3bf9da4e feat(toolbox): dual-write HN + Reddit mentions to TOOLBOX signal lake
6226c1aa3 harden(api): apply withBodySizeLimit + Zod input validation on mutation routes
bf1b24ba6 harden(worker): explicit 20s timeoutMs on outbound HTTP
f4f2a265f Improve account and repo detail flows                                   ← previous HEAD
```

Mine: `0dd44ff55`. Others: committed by parallel sessions on this same checkout.

**Verification at push time:** `npm run typecheck` ✓ · `npm run lint:guards` ✓ ·
tier-list + toolbox-ingest test suites ✓. No browser smoke yet — operator must
run visual smoke before merge.

**What `0dd44ff55` covers (49 files):**
- ~30 page metadata blocks: drop `— TrendingRepo` suffix (root template `%s — TrendingRepo` covers it), switch to keyword-led titles
- `TerminalLayout` / `TerminalBody` gained `filterMode="none"` prop that bypasses persisted filter AND sort so `/search` keeps server-side relevance order
- `SearchBar` gained `initialValue` prop; search page chips derive labels from `CATEGORIES`; `disposed` flag replaced with `controller.signal.aborted` (one source of truth)
- `ProjectSurfaceMap`: dropped `resolveLogoUrl` on website/docs/PH tiles — monogram fallback only
- `next.config.ts`: `output: "standalone"` enabled (Docker VPS runner; Vercel ignores)
- `agent-commerce`: dead `heroes` slice removed
- `agent-repos`, `githubrepo`, home: corrected internal hrefs

---

## /simplify pass — skipped findings (judgment calls)

These were flagged by reviewers but consciously left alone. **Do not re-fix without explicit ask.**

| Finding | Where | Why skipped |
| --- | --- | --- |
| `CATEGORY_VALUES` hardcoded subset | [src/app/search/page.tsx:34-41](src/app/search/page.tsx#L34) | Explicit 6-item enumeration is the right pattern for chip order + `as const` type narrowing. Labels already derive from `CATEGORIES`. |
| `ShareBar.shareUrl()` not memoized | [src/components/tier-list/ShareBar.tsx:99-104](src/components/tier-list/ShareBar.tsx#L99) | Click-handler helper, not a render hot path. |
| `ProjectSurfaceMap.logoUrl: null` for 3 tiles | [src/components/repo-detail/ProjectSurfaceMap.tsx:226-269](src/components/repo-detail/ProjectSurfaceMap.tsx#L226) | Intentional design simplification (favicon → monogram), not a regression — operator confirm if doubt. |
| `handleDeleteRule` + `ensureSessionCookie` duped across /alerts, /watchlist | both pages | Pre-existing duplication, K3 surgical — only `handleToggleRule` was introduced this PR (already extracted to `useToggleAlertRule`). |
| `deleteAlertRule` could take `userId` like `updateAlertRule` | [src/lib/pipeline/pipeline.ts](src/lib/pipeline/pipeline.ts) | Pre-existing 2-scan pattern in DELETE route. Out of scope. |

---

## Outstanding work (priority-ordered)

### Track A — Operator UI asks

| ID | Item | Status | Concrete next step |
| --- | --- | --- | --- |
| **A1.1** | Remove Collections nav row | UNBLOCKED | Delete `V2NavRow` block at [SidebarContent.tsx:741-749](src/components/layout/SidebarContent.tsx#L741). 5-min mechanical. |
| **A1.2** | Recent visited repos broken | UNBLOCKED | Diagnose `RECENT_VIEWED_REPOS_KEY` localStorage write at [SidebarRecentViewedRepos.tsx](src/components/layout/SidebarRecentViewedRepos.tsx); confirm `MarkRepoViewed` fires on repo-detail mount. |
| **A1.5** | Sidebar profile widget (post-signup) | UNBLOCKED (B3 enhances) | New `SidebarProfileCard.tsx` + `SidebarProfileTile.tsx`. Data: Clerk `useUser()` + `useWatchlistStore` + `GET /api/alerts/rules`. 6-tile grid: WATCH/ALERTS/DROPS/AGENT/CLI/MCP. Hydration-safe skeleton. |
| **A2** | /twitter remove SCORE column | UNBLOCKED | Delete column header [twitter/page.tsx:487](src/app/twitter/page.tsx#L487), cell [:611-616](src/app/twitter/page.tsx#L611), desktop grid track [:528](src/app/twitter/page.tsx#L528); widen Repo from `minmax(320px,2fr)` → `minmax(380px,3fr)`. |
| **A3** | Tools page tile headers | UNBLOCKED | Each `ToolTile` gets internal header band: route badge (`CHART`/`ESTIMATOR`/`CONTRIBUTE`) + title. |
| **A4** | /research broken viewport | BLOCKED (operator) | Operator must name the specific viewport. Then repro at 375/768/1280 and fix CSS. |
| **A5** | Repo hover preview | UNBLOCKED | New `src/components/repo/RepoHoverCard.tsx` (ref: `BubbleTooltip.tsx` pattern); new `src/app/api/repos/[owner]/[name]/hover/route.ts` returning ~1KB summary. Cache `s-maxage=300, swr=3600`. `<RepoLink>` wrapper on `@media (hover: hover)` only. ~20 callsite migration. |
| **A6** | Funding Radar upgrade | UNBLOCKED | `funding/page.tsx`: capital radar eyebrow + 6-cell KpiBand (signals/extracted/capital/this-week/mega/confidence) + `FundingSourcePillRow` + stage pill table + just-published tape. |
| **A7** | Drop-a-Repo redesign | UNBLOCKED | [DropRepoPage.tsx](src/components/submissions/DropRepoPage.tsx): new step strip, category picker, tag chips (max 4), funnel widget, queue widget. |
| **A8** | Agent Commerce workover | UNBLOCKED | Wire cold-state at `agent-commerce/page.tsx:322` to render "Pipeline warming…"; reshape to hero band + 2-col; run `/impeccable` + `/design-pass`. |
| **A9** | Hide freshness badges | LIKELY MERGED | Memory says PR #1321 shipped via env flag `NEXT_PUBLIC_HIDE_FRESHNESS_BADGES`. Confirm with `gh pr view 1321` before re-shipping. |
| **A10** | NITTER on TOOLBOX | UNBLOCKED | Run `node scripts/check-nitter-health.mjs` → wire NITTER output through `POST /v1/signals/ingest` → ensure NITTER fires when Apify off. |
| **A11** | Image-system doc + monogram fallback | UNBLOCKED | Write `docs/IMAGE-SYSTEM-2026-05-15.md` (system is GitHub avatars + Google Favicons + bundled HF JSON — costs zero). Add `src/app/api/logo/[seed]/route.tsx` ImageResponse monogram for upstream-404 cases. |

### Track B — Data layer + collector recovery

| ID | Item | Status | Concrete next step |
| --- | --- | --- | --- |
| **B1** | Reddit zero-engagement bug | OPERATOR ENV | Set `REDDIT_COLLECTOR_PROVIDER=apify` in prod env (per [memory](C:\Users\mirko\.claude\projects\c--dev-trendingrepo\memory\project_reddit_apify_pivot.md)). |
| **B2** | postgres-js SSL fix | LIKELY MERGED | Memory says shipped on main 2026-05 at [src/lib/db/client.ts:47,71](src/lib/db/client.ts#L47). Verify in main; close if redundant. |
| **B3** | Clerk webhook | OPERATOR DASHBOARD | Configure Clerk → trendingrepo webhook in Clerk Dashboard. Test signup → row in `tr.profiles`. Not a code change. |
| **B4** | 7/7 sources stale >48h | OPS | Re-trigger each `scrape-*.yml` via `gh workflow run`. Verify `data/_meta/<source>.json` ts ≤ 4h. |
| **B5** | 13 broken Sprint Triage workflows | TRIAGE | `gh workflow run` each (AGN-857..871); classify transient vs real; ship one-line `fix:` PR per real failure. |
| **B6** | Twitter stale on 386/402 repos | OPS | Confirm `APIFY_API_TOKEN` valid; trigger `collect-twitter.yml` manually; verify `.data/twitter-repo-signals.jsonl` grows. Pairs with A10. |
| **B7** | consensus-trending 71h+ stale | OPS | Re-trigger `snapshot-consensus.yml`. Confirm Kimi K2.6 worker still uses `stream: true` + UA allowlist (anti-pattern, see CLAUDE.md). |
| **B8** | 40k-star cap fix | CODE | Port dual-ended fetch from `daily-stars-explorer` into `scripts/append-star-activity.mjs` + `apps/trendingrepo-worker/src/fetchers/repo-metadata`. 296/309 repos affected. |

### Track C — TOOLBOX read-path

| ID | Item | Status | Concrete next step |
| --- | --- | --- | --- |
| **C1** | Phase A.2 wiring | BLOCKED | Operator merges PRs #1214 (HF + PH) + #1216 (ArXiv + RSS + Lobsters + npm-dependents). Then add `tryFetchXxxFromToolbox()` per source (pattern: [hackernews.ts:240-299](src/lib/hackernews.ts#L240)), 24h dual-read parity, archive corresponding `scrape-*.yml` → `_archived/`. |
| **C2** | 3 schema-gap sources | DEFERRED | File upstream TOOLBOX schema-extension issue: `npm.packages` (downloads24h/trendScore7d), `github.repos` (appearances_top10), `awesome-skills` taxonomy. |
| **C3** | Data-layer Phase 1.5 | UNBLOCKED | Ship HF rolling-delta script; route `/twitter` + `/ideas` through `refreshXxxFromStore` pattern. |

### Track D — Perf + mobile

| ID | Item | Status | Concrete next step |
| --- | --- | --- | --- |
| **D1** | searchParams perf-debt | BLOCKED | Operator picks URL strategy (path vs client-side vs feature-drop) per affected route. See `docs/proposals/PERF-DEBT-SEARCHPARAMS-2026-05-15.md`. 9 routes are force-dynamic. |
| **D2** | /twitter lazy-load | BLOCKED | Operator design preview review. Refactor `TwitterTabSwitcher` to receive trending JSON, render client-side only on activate. ~120KB transfer saved. |
| **D3** | Mobile 375px overflow | UNBLOCKED | AGN-723 `/` (scrollWidth 386>375); AGN-725 `/githubrepo`. Per-page CSS at offending breakpoint. Test 375/390/768. |
| **D4** | Lighthouse perf restoration | UNBLOCKED | AGN-710 `/` (35→≥80), AGN-711 `/signals` (43), AGN-712 `/trends` (404 → restore route). Capture fresh Lighthouse → mechanical wins per route. |

### Track E — Hardening + tooling

| ID | Item | Status | Concrete next step |
| --- | --- | --- | --- |
| **E1** | Open-PR drain | TRIAGE | Walk PRs #1313/#1240/#1239/#1238/#1237/#1236/#1234/#1233/#1231/#1229. Per-PR: merge / close-stale / land-after-wave-1. |
| **E2** | Smoke test 12→24 routes | LIKELY DONE | Memory `reference_smoke_test_12_routes.md` flagged STALE — PR #1329 already expanded to 30 routes. Verify `.github/workflows/post-deploy-smoke.yml` matches before re-doing. |
| **E3** | Storybook gap | CODE | 16 components missing stories (ChartShell, Chip, ConfirmDialog, DataList, EntityLogo, FooterBar, GaugeStrip, KpiBand, Metric, PageHead, PanelHead, RankRow, SectionHead, TabBar, Toaster, VerdictRibbon). 1 story per component, bulk PR. |
| **E4** | compute-deltas split-brain | CODE | Issue #89: consume immediate-mode API, delete `scripts/compute-deltas.mjs`, remove workflow step, update doc. |
| **E5** | Doc hygiene | LOW | Relocate >30d worklogs to `docs/archive/worklogs/`; fix 30 broken internal links; reconcile `/you` auth/copy contradiction. |

### Track F — AISO / cross-product (low)

F1 (AISO dashboard tile), F2 (13 self-scan findings triage), F3 (AGN-813 typecheck blockers), F4 (newsletter digest content verify), F5 (brand-cutover external — Stripe display names, alerts.trendingrepo.com DNS, GH rename, npm publish — operator-only), F6 (Stripe — DEFERRED per operator).

### Track G — Decisions required from operator

1. **Clerk Best-Practices ceiling** — lazy-load Clerk vs CNAME to first-party vs accept 73-77 BP score.
2. **OG card editorial style** — Bloomberg / Blockworks tear-sheet direction.
3. **/repo/* visual hero reorg** — demote raw signal table to a tab?
4. **TOOLBOX PRs #1214/#1216 merge** — unblocks C1.
5. **searchParams URL strategy** per affected route (D1).
6. **/research broken viewport** — name the size (A4).
7. **PR #1253** — visual smoke + merge approval (37 commits queued).

---

## Coordination + constraints

**Two other Claude sessions** worked this same branch in parallel during this
window. The git log shows 5 commits from them since `main`. Future merge:

1. Confirm with operator whether the other sessions are still active before
   pushing anything new.
2. Open PR for `audit/imp-wave-1` once all parallel work is in (`gh pr create`).
3. Land sequence to `main`: hardening (already in) → tier-list/alerts (already in) → SEO/search/filterMode (already in) → other-sessions' branches → main → prod.

**Hard rules (NEVER):**
- Push to `main` without per-push operator approval ([feedback memory](C:\Users\mirko\.claude\projects\c--dev-trendingrepo\memory\feedback_no_push_without_approval.md)).
- `git add .` or `git add -A` or directory-wide staging — explicit file paths only (parallel-session anti-pattern, CLAUDE.md).
- Touch `audit/imp-wave-1` while other sessions are mid-flight without coordination.
- Touch `chore/vps-docker-deploy`, PRs #1214/#1216, any GHA `scrape-*.yml` before TOOLBOX read-path is parity-verified live.
- Mock Redis / database in scoring-logic tests (Q1 2026 incident).
- Use cookie-based Twitter scrapers (dead provider post-2026).
- `readFileSync(process.cwd(), "data", ...)` for new sources — use the data-store ([CLAUDE.md anti-patterns](CLAUDE.md)).

**Parallel-session survival pattern:**
- Stage by explicit file: `git add <SPECIFIC-FILE>` only.
- Commit IMMEDIATELY after each Write so the boundary is durable.
- Staging is shared mutable state; commits are durable history.

---

## Verification gates (run per milestone, before claiming done)

```bash
npm run verify           # typecheck + lint:guards + test:hooks
npm run build            # production build
npm run freshness:check  # confirm no stale collectors block work
npx impeccable detect src/   # expect 0 for touched pages
# UI changes: npm run dev → manual smoke at 375 / 768 / 1280 on the affected route
```

Final gate (only when full track ships):

```bash
npm run lighthouse:routes:prod
# Compare vs docs/audits/lighthouse/BASELINE-2026-05-15.md
# A11y ≥90, SEO ≥95 everywhere; BP ≥90 conditional on Clerk decision
```

---

## Pickup prompt (paste this into the next session)

```
Resume the audit/imp-wave-1 sprint. Read these first:

1. docs/handoffs/2026-05-16-wave-1-handover.md (THIS file — full status)
2. CLAUDE.md + CLAUDE.local.md (rules + working-with-Basil)
3. ~/.claude/plans/vivid-moseying-treasure.md (full roadmap)
4. tasks/CURRENT-SPRINT.md + tasks/BACKLOG.md (in-flight context)

Then:
- Run `npm run freshness:check`. If anything past budget, surface before features.
- Run `git fetch origin && git log --oneline origin/audit/imp-wave-1 -10` —
  confirm the 6 commits above are still HEAD and no parallel session has moved it.
- Confirm with operator: are the other 2 sessions still active?
  If yes, coordinate before pushing.

Pickup order (operator already greenlit "do all"):
A1.1 (Collections nav row, 5min) → A2 (/twitter SCORE column, 10min) →
A3 (Tools tile headers) → A9 verification (PR #1321 state) →
A1.2 (Recent visited diagnose) → A1.5 (Sidebar profile widget) →
A11 (Image-system doc + monogram fallback) → A10 (NITTER on TOOLBOX) →
A6 (Funding Radar) → A7 (Drop-a-Repo) → A8 (Agent Commerce) →
A5 (Repo hover preview — biggest, last) → B-track ops →
C3 (data-layer Phase 1.5) → E3 (Storybook) → E4 (compute-deltas).

A4 stays BLOCKED until operator names the broken viewport.
Track C1, D1, D2 stay BLOCKED.

Use the K1-K4 + M1-M6 guardrails. Commit per scope; never `git add .`.
Visual proof for every UI change before claiming done.
```
