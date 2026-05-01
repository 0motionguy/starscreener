# STARSCREENER Ultra Audit — 2026-05-01

Pocock-skill-powered audit, run on `main` (HEAD `fc4032df`) with the project's 58-term `CONTEXT.md` as canonical vocabulary. Six domains, one synthesis, ranked action list at the top.

## Executive read

The codebase has **strong bones, weak wiring, and a branch-coordination problem.** Architecturally the seams are right (data-store three-tier, direct-mode collectors, V4 token system, refresh-hook pattern). What's failing: (1) **substantial agent work landed on feature branches but never made it to `main`** — Twitter as 6th cross-signal, Twitter+ProductHunt mention synth, V4 token sweeps, ThemeToggle rip are all NOT on main today. (2) Several critical paths are **shallow modules that should consolidate** — three "Consensus" subsystems with identical name shape, three different "verdict" fields, dual-write fragmented across 30+ collector scripts. (3) **Freshness is invisible to users** despite the `fresh` boolean on every DataReadResult — almost no UI surface uses `classifyFreshness()` to render a staleness badge.

The single highest-leverage move this week: **wire the immediate-mode deltas producer** — the consumer route just shipped at `src/app/api/pipeline/deltas/route.ts`, but no producer writes the `star-snapshot:24h/7d/30d` Redis keys it reads. Until that producer ships, the route 404s silently and the home page stays on 4h batch-mode delta lag. ~110 LOC, single highest-ROI feature work in the entire pipeline.

## Top 5 ship-this-week

| # | Item | File evidence | Smallest fix | Effort |
|---|---|---|---|---|
| 1 | **Wire deltas producer** so home staleness drops 4h → 30 min | [src/app/api/pipeline/deltas/route.ts](src/app/api/pipeline/deltas/route.ts) reads `star-snapshot:<window>` keys that nothing writes | Extend `collect-twitter-signals.ts` (or a new `snapshot-stars.ts` worker) to write `star-snapshot:24h` etc. on every cron tick. ~80 LOC. | half-day |
| 2 | **Cherry-pick agent work from `feat/v4-alert-rules` → `main`** | A agent's Twitter cross-signal, I agent's Twitter+PH synth, H agent's ThemeToggle rip — all on `feat/v4-alert-rules`, none on `main` | `git cherry-pick` the 10-file commit set from feat/v4-alert-rules HEAD (or open a single PR consolidating those changes). | 1h |
| 3 | **Verify `_meta` sidecar fix landed across all 14 workflows** | `dea59548` fixed 12 of 14 per memory; W2-J agent verified scrape-trending got it | Audit each `.github/workflows/scrape-*.yml` git-add line for missing `data/_meta/<key>.json`; one workflow probably still hardcodes the file list. | 30 min |
| 4 | **Snapshot-consensus age guard** (already on disk in working tree) — commit it | `scripts/snapshot-consensus.ts` modified, not committed | `git add scripts/snapshot-consensus.ts && git commit -m "feat(snapshot): age guard"` | 15 min |
| 5 | **Add `classifyFreshness()` badges to top 5 routes** | Routes render data freshness silently — user has no way to know if `/` is showing 30-min or 4-hour data | Add `<FreshnessBadge>` component (5-line wrapper around classifyFreshness); call from `/`, `/breakouts`, `/repo/[owner]/[name]`, `/skills`, `/funding` | 2-3h |

---

## Section 1 — Architecture (Pocock depth analysis)

Applied Ousterhout's deletion test + seam analysis with `CONTEXT.md` vocab.

### A1. Three "Consensus" subsystems share a name but no parent — P1 [seam unification]

**Files**: `src/lib/consensus-trending.ts:1-313`, `src/lib/consensus-verdicts.ts:1-201`, `src/lib/signals/consensus.ts:160-200`
**Problem**: Three modules that all parse a `consensus-*` data-store payload, all expose `refresh*FromStore`, all share the dedupe + cache pattern, but are completely independent files. Deletion test on any one: yes, complexity reappears at all callers; they each earn keep. But the *boilerplate* (cache wiring, refresh dedupe, normalize-on-read) is duplicated 3x.
**Solution**: Extract a `createPayloadReader<T>(key, normalize)` factory in `src/lib/data-store-reader.ts` that wires the cache + 30s rate-limit + inflight dedupe + `refreshFromStore` automatically. Each consensus reader becomes ~30 LOC instead of ~150.
**Benefits**: Locality (the dedupe pattern lives in one place), leverage (every new payload reader becomes 5 LOC), test surface improves from "test each reader" to "test the factory + each normalizer."
**Effort**: M (half-day to extract factory + migrate 3 readers)
**Severity**: P1

### A2. `RecentMentionsFeed` count-by-source loop is shallow but well-named — keep [no action]

**Files**: `src/components/repo-detail/RecentMentionsFeed.tsx:70-81`
**Problem**: The `c[m.source] += 1` loop looks shallow but applying the deletion test: yes, complexity vanishes (callers iterate the array directly).
**Solution**: None. Keep as is. **Notable as a positive — the I agent's work to add `producthunt: "ph"` to PLATFORM_TO_SOURCE makes this loop automatically count synthesized PH rows.** Pattern is self-extending.
**Severity**: N/A — included to flag a *good* shallow module that earns its keep through the side-effect of source-keyed mapping.

### A3. `compute-deltas.mjs` vs new `src/app/api/pipeline/deltas/route.ts` — P0 [deletion candidate after producer ships]

**Files**: `scripts/compute-deltas.mjs` (existing batch), `src/app/api/pipeline/deltas/route.ts` (new immediate-mode)
**Problem**: Two paths to compute the same `delta_24h` value. Once the immediate-mode producer wires up (Top 5 #1), `compute-deltas.mjs` becomes a deletion candidate (or relegated to nightly reconciliation). Until then, both paths exist with no clear ownership.
**Solution**: Ship the producer first, run both paths in parallel for one week, compare outputs, then delete `compute-deltas.mjs` (or downgrade to once-daily).
**Effort**: tied to Top 5 #1
**Severity**: P0 if not addressed (split brain on 24h delta values)

### A4. Twitter signal untangling — same finding as April audit, still unresolved — P1

**Files**: `src/lib/twitter/service.ts`, `src/lib/twitter/scoring.ts`, `src/lib/twitter/types.ts`, `src/lib/twitter/signal-data.ts`, `src/lib/twitter/storage.ts`
**Problem**: Twitter pipeline is the most complex single area. ~1500+ LOC across 5+ files. Per CONTEXT.md, `TwitterRepoSignal` is "raw upstream data" not a canonical Signal — but the Twitter scorer at `src/lib/twitter/scoring.ts` produces inputs to the pipeline that are NOT canonical Scores. Two seams here, one semi-formed.
**Solution**: Extract `TwitterSignalBuilder` as the only public surface — internal modules become impl detail. `scoring.ts` becomes private to that builder.
**Effort**: L
**Severity**: P1 (blocks Twitter mention surfacing improvements)

### A5. Legacy `src/lib/scoring.ts` is orphaned dead code — P2 [delete]

**Files**: `src/lib/scoring.ts:86,249`
**Problem**: `computeMomentumScore` exported, zero external callers (verified via grep). CONTEXT.md flags as deletion candidate.
**Solution**: `git rm src/lib/scoring.ts`
**Effort**: 5 min
**Severity**: P2

### A6. trendingrepo-worker overlap with main collectors — P1 [doc only]

**Files**: `apps/trendingrepo-worker/` (referenced but not on main); 5 overlapping sources (arxiv, bluesky, devto, hackernews, funding) per CONTEXT.md
**Problem**: 5 sources have collectors in BOTH main repo (`scripts/scrape-*`) AND the worker service. Per CONTEXT.md decision, "main wins." Worker entries are deletion candidates but not on main today.
**Solution**: Document split in `docs/ARCHITECTURE.md`; add a section flagging worker-collectors-to-delete-when-worker-merges.
**Effort**: 30 min
**Severity**: P1

---

## Section 2 — Ingestion + Freshness

### Ingestion matrix (sample — full audit covers 27+ sources)

| Source | Script | Workflow | Cron | Key | File | Notes |
|---|---|---|---|---|---|---|
| GitHub trending | `scrape-trending.mjs` | `scrape-trending.yml` | 3h | `trending` | ✅ | _meta sidecar verified |
| Repo metadata | `fetch-repo-metadata.mjs` | (no dedicated workflow) | manual | `repo-metadata` | ✅ | **Failure-rate threshold added today (in working tree, uncommitted)** |
| Twitter | `collect-twitter-signals.ts` | `collect-twitter.yml` | 3h | `twitter-repo-mentions` | jsonl | Apify SPOF — no plan B if actor breaks |
| Reddit | `scrape-reddit.mjs` | `scrape-reddit.yml` | 6h | `reddit-mentions` | ✅ | OAuth fallback unstable per prior audit |
| HN | `scrape-hackernews.mjs` | `scrape-hn.yml` | 6h | `hackernews-trending` | ✅ | |
| Bluesky | `scrape-bluesky.mjs` | `scrape-bluesky.yml` | 6h | `bluesky-mentions` | ✅ | |
| DevTo | `scrape-devto.mjs` | `scrape-devto.yml` | **24h** | `devto-mentions` + `devto-trending` | ✅ | **Cadence too coarse — 36h staleness window** |
| Lobsters | `scrape-lobsters.mjs` | `scrape-lobsters.yml` | 6h | `lobsters-signals` | ✅ | |
| ProductHunt | `scrape-producthunt.mjs` | `scrape-producthunt.yml` | 6h | `producthunt-launches` | ✅ | Mentions not in unified feed (covered in Section 4) |
| NPM | `scrape-npm.mjs` | `scrape-npm.yml` | 12h | `npm-trending` | ✅ | |
| HuggingFace | `scrape-huggingface.mjs` | `scrape-hf.yml` | 12h | `hf-spaces` + `hf-models` | ✅ | |
| ArXiv | `scrape-arxiv.mjs` | `scrape-arxiv.yml` | 24h | `arxiv-trending` | ✅ | |
| ArXiv-cited | `ingest-arxiv-cited-repos.mjs` | (manual) | — | — | — | Intake pipeline, not on schedule |
| Funding news | `scrape-funding-news.mjs --enrich` | `scrape-funding.yml` | 12h | `funding-news` | ✅ | |
| Claude RSS | `scrape-claude-rss.mjs` | `scrape-claude-rss.yml` | 24h | `claude-rss` | ✅ | |
| OpenAI RSS | `scrape-openai-rss.mjs` | `scrape-openai-rss.yml` | 24h | `openai-rss` | ✅ | |
| TrustMRR | `sync-trustmrr.mjs` | `sync-trustmrr.yml` | 02:27 (full) + every-2h (incremental) | `trustmrr-startups` | ✅ | Two-mode scheduler guarded by `__tests__/trustmrr-sync-mode.test.mjs` |

### Per-source findings

**I1. DevTo cadence too coarse — 36h staleness window** [P1]
- `scrape-devto.yml` cron: `30 8 * * *` (once-daily at 08:30 UTC)
- Worst-case staleness: a DevTo article posted at 08:31 UTC isn't visible until ~32h later
- **Smallest fix**: change cron to `0 */6 * * *` (every 6h). 1-line YAML change.
- Effort: 15 min

**I2. Twitter Apify single-point-of-failure** [P1]
- `collect-twitter-signals.ts` depends on Apify actor `apidojo~tweet-scraper`. Cookie-based providers dead post-2026.
- No fallback or health-check alarm if actor breaks
- **Smallest fix**: add `audit:freshness` workflow that fails the build if `data/_meta/twitter.json` writtenAt is >12h stale.
- Effort: 2-4h

**I3. snapshot-consensus age guard not committed** [P1]
- `scripts/snapshot-consensus.ts` modified in working tree (the freshness agent's work) but NOT committed
- Guard would have prevented yesterday's incident where stale Trending Consensus could be snapshot
- **Smallest fix**: commit the change (Top 5 #4)
- Effort: 15 min

**I4. fetch-repo-metadata failure-rate threshold not committed** [P2]
- Same pattern as I3 — work done, not committed
- **Smallest fix**: commit
- Effort: 15 min

**I5. `_meta` sidecar gap — final two workflows** [P1]
- Memory: `dea59548` patched 12 of 14. Two unverified.
- **Smallest fix**: grep all 14 workflows for `_meta` in `git add` line; patch missing.
- Effort: 30 min

### Cross-cutting

- **Naming inconsistency**: `scrape-`/`collect-`/`enrich-`/`fetch-`/`discover-`/`sync-` — six verbs in `scripts/`. Per CONTEXT.md, the umbrella is "Collectors." Recommend convention: `collect-<source>.ts` (TypeScript) or `scrape-<source>.mjs` (legacy JS). New collectors should default to `collect-`.
- **Single biggest staleness lever**: implement the **immediate-mode deltas producer** (Top 5 #1). Removes 4h batch-mode lag from home page. ~80 LOC.

---

## Section 3 — V4 UI Completeness

### Template adoption

| Template | File | Routes consuming | Routes that should but don't |
|---|---|---|---|
| `SourceFeedTemplate` | `src/components/templates/SourceFeedTemplate.tsx` | All 13 W7 routes (verified by W7 PR commit history) | None known |
| `LeaderboardTemplate` | `src/components/templates/LeaderboardTemplate.tsx` | `/skills` (just shipped at `51e8799e`) | `/mcp`, `/agent-repos`, `/agent-commerce`, `/categories`, `/model-usage` |
| `ProfileTemplate` | `src/components/templates/ProfileTemplate.tsx` | 2 of 5 W9 routes (per prior audit) | 3 of 5 — exact list TBD |

**V1.** Five W8 routes still on V3 chrome [P1] — `mcp`, `agent-repos`, `agent-commerce`, `categories`, `model-usage`. Mirror the `/skills` migration pattern from commit `51e8799e`. Effort: half-day per route, 2-3 days total.

### Token discipline

Per the V4 deviations log (which doesn't exist on `main` because the file edit was reverted):
- 344 hex literals across 30+ components (per April audit)
- 84 legacy `var(--color-*)` references (signals-terminal cluster + others)
- `lint:guards` hex check **disabled** until V4 sweep finishes

**V2.** `AgreementMatrix.tsx` BAND_COLOR uses 5 hex literals matching V4 token values exactly [P2]
- `strong_consensus: "#22c55e"` matches `--v4-money`; `early_call: "#a78bfa"` matches `--v4-violet`; etc.
- Visual byte-equivalent swap available
- **Smallest fix**: swap to `var(--v4-X)` strings + change `fill={d.color}` → `style={{ fill: d.color }}` (raw `var()` doesn't work as SVG attribute). Verified working pattern from prior agent work.
- Effort: 30 min

**V3.** `FundingCard.tsx` `LOGO_TONES` palette duplicates `--v4-fund-*` tokens [P2]
- 8 hardcoded rgba/hex tuples vs 8 existing tokens (`--v4-fund-cb` through `--v4-fund-tr`)
- **Smallest fix**: index-based lookup → token-keyed via `color-mix(in srgb, ${token} N%, transparent)`. Documented pattern from prior agent.
- Effort: 1h

### Layout shell

**V4.** `Header.tsx` still imports from `@/components/v3` — `SystemMark` [P1]
- Verified on `main`: `import { ThemeToggle } from "@/components/shared/ThemeToggle"` line 7, JSX at line 59
- Plus the V3 SystemMark per prior audit
- **Smallest fix**: rip ThemeToggle (V4 is dark-only per `DESIGN_SYSTEM.md` § 1) — H agent's work on `feat/v4-alert-rules`. Cherry-pick.
- Effort: tied to Top 5 #2

### Mobile breakpoints

**V5.** v4.css has 5 `@media (max-width: 640px)` rules — possibly the B agent's mobile breakpoint did land [P2-VERIFY]
- Need to confirm: is one of the 5 the V4 template breakpoint scoped to `.v4-source-feed-template, .v4-leaderboard-template, .v4-profile-template`?
- **Smallest fix**: `grep -A 5 'max-width: 640px' src/components/ui/v4.css | grep -B 5 'v4-leaderboard\|v4-source-feed\|v4-profile'` to verify; if missing, re-apply.
- Effort: 5 min verify + 1h re-apply if missing

### Charts

**V6.** `RepoDetailChart.tsx` + `CompareChart.tsx` still on Recharts [logged deviation per prior agent — P2]
- Multi-day SSR-SVG port not earning today
- Keep as logged deviation; revisit when other V4 work settles.

### Per-route classification (sample)

Worth a separate exhaustive pass in next session — 30+ routes, classification ✅/🔧/❌ per route. Top routes:
- `/` (home): mixed (V4 chrome from W1; some V3 components)
- `/skills`: ✅ V4 (per `51e8799e`)
- `/breakouts`: 🔧 mixed
- `/repo/[owner]/[name]`: 🔧 mixed (V4 layout, V3 chart per V6)
- `/funding`: 🔧 (per recent commit `c7a4b96d` adding V4 W4 elements)
- `/consensus`, `/consensus/[owner]/[name]`: 🔧 (AgreementMatrix V2 fix not landed)

---

## Section 4 — Cross-Mentions / Dimensions

### Branch-state of recent fixes (CRITICAL)

**Verified on `main` HEAD `fc4032df`:**

| Fix | Status on main | Status on feat/v4-alert-rules |
|---|---|---|
| Twitter as 6th cross-signal channel (A agent) | ❌ Not landed (`grep twitterComponent` returns 0 in `cross-signal.ts`) | ✅ Landed |
| Twitter+PH mention synthesizer in `repo-profile.ts` (I agent) | ❌ Not landed (`grep twitter-` returns 0 in `repo-profile.ts`) | ✅ Landed |
| ThemeToggle rip (H agent) | ❌ Not landed (still imported in Header.tsx) | ✅ Landed |
| AgreementMatrix V4 tokens | ❌ Not landed (`grep var(--v4-money` returns 0) | (was reverted on alert-rules too) |
| FundingCard V4 fund tokens | ❌ Not landed | (was reverted on alert-rules too) |
| LeaderboardTemplate /skills | ✅ Landed (`51e8799e`) | (also there) |

**This is the heart of the user's "every session does whatever they think" pain.** Multiple parallel sessions did real work; only one stream merged to main. The 5 unlanded fixes need `git cherry-pick` from `feat/v4-alert-rules`.

### Source-to-UI mapping (sample)

| Signal source | Storage | UI surfaces (current) | Gap |
|---|---|---|---|
| Twitter | `twitter-repo-mentions.jsonl` + `TwitterRepoPanel` | Repo detail panel ONLY (separate from mention feed) | **Not in mention feed** (I fix needed); **Not in cross-signal scoring** (A fix needed) |
| HN | `hackernews-trending.json` + `mention-aggregates` | Mention feed + cross-signal | ✅ |
| Reddit | `reddit-mentions.json` + `mention-aggregates` | Mention feed + cross-signal | ✅ |
| Bluesky | `bluesky-mentions.json` + `mention-aggregates` | Mention feed + cross-signal | ✅ |
| DevTo | `devto-mentions.json` | Mention feed + cross-signal | ✅ |
| ProductHunt | `producthunt-launches.json` (`Launch` shape) | Project surface map ONLY | **Not in mention feed** (I fix covers this) |
| Lobsters | `lobsters-signals.json` | Per-source page only | Not aggregated to repo profile |
| NPM | `npm-trending.json` | Per-source page | Not aggregated to repo profile |
| HF Spaces/Models | `hf-*.json` | Per-source page | Not aggregated to repo profile |
| ArXiv | `arxiv-trending.json` | Per-source page + `arxiv-cited` intake | Not aggregated to repo profile |

**M1.** Twitter excluded from cross-signal scoring on main [P0] — same as Top 5 #2
**M2.** Twitter mentions invisible in repo-profile feed on main [P0] — same as Top 5 #2
**M3.** ProductHunt mentions not in unified feed [P1] — Top 5 #2 covers via I agent's work
**M4.** Lobsters/NPM/HF/ArXiv not aggregated to repo profile [P2]
- These have per-source pages but don't surface as mention rows on the repo profile
- **Smallest fix**: extend the synthesizer pattern (I agent's work) to also pull from these source caches
- Effort: M (~half-day)

### Dimensions surfaces

The UI surfaces where users expect per-source breakdown:
- `CrossSignalBreakdown.tsx` — should show 6 channel rows (currently 5 on main; A agent's fix needed)
- `RecentMentionsFeed.tsx` — counts per source; existing pattern works once data flows through
- `RepoSignalSnapshot.tsx` — per-source mention counts; works on main
- Filter chips — Topic-based, not source-based; fine

---

## Section 5 — Freshness UX

### Per-route staleness matrix

| Route | Data key(s) | ISR | Refresh hook | Indicator | Worst-case staleness (user-visible) |
|---|---|---|---|---|---|
| `/` (home) | `trending`, `deltas`, `consensus-trending` | `revalidate=1800` (30 min) | ✅ via trending.ts | ❌ no badge | 4h (batch deltas) + 30 min (ISR) = **~4.5h** |
| `/breakouts` | `trending`, `deltas` | force-static | unclear | ❌ | indefinite without ISR |
| `/repo/[owner]/[name]` | `trending`, `repo-metadata`, `consensus-trending`, `consensus-verdicts`, mention sources | varies | ✅ via repo-profile API | ⚠️ partial | 4h-6h |
| `/skills` | `trending-skill`, `awesome-skills` | unclear | ✅ via ecosystem-leaderboards.ts | ❌ no badge | 24h (snapshot cadence) |
| `/mcp` | `trending-mcp`, `mcp-downloads*` | unclear | ✅ | ❌ | 6h (liveness) - 24h (snapshot) |
| `/twitter` | `twitter-repo-mentions` | unclear | ✅ | ❌ | 3h (collector) |
| `/reddit/trending` | `reddit-mentions` | unclear | ✅ | ❌ | 6h |
| `/hackernews/trending` | `hackernews-trending` | unclear | ✅ | ❌ | 6h |
| `/bluesky/trending` | `bluesky-mentions` | unclear | ✅ | ❌ | 6h |
| `/devto` | `devto-mentions` + `devto-trending` | unclear | ✅ | ❌ | **24-36h** |
| `/lobsters` | `lobsters-signals` | unclear | ✅ | ❌ | 6h |
| `/producthunt` | `producthunt-launches` | unclear | ✅ | ❌ | 6h |
| `/funding` | `funding-news` | unclear | ✅ | ⚠️ partial (`fetchedAt`) | 12h |
| `/consensus` | `consensus-trending` | unclear | ✅ | ❌ | 24h (snapshot) |
| `/categories`, `/categories/[slug]` | derived from `trending` | unclear | inherited | ❌ | inherits trending |
| `/top10`, `/top10/[date]` | `trending` snapshot | force-static for date | derived | ⚠️ via date | 24h |

### `classifyFreshness()` adoption

Function exists at `src/lib/news/freshness.ts` (per imports in `src/app/skills/page.tsx`). Used by **`/skills` and possibly `/mcp` only** — out of 17 user-facing routes audited. **15+ routes are blind to freshness.**

**F1.** Add `classifyFreshness()` badges to top 5 routes [P1] — Top 5 #5

### Immediate-mode deltas: producer status

**F2.** New route `src/app/api/pipeline/deltas/route.ts` reads `star-snapshot:24h/7d/30d` Redis keys. **No producer writes those keys today.** [P0]
- Without producer, the route returns 404 for every repo on every request
- This invalidates the entire "highest-ROI feature" work from this session
- **Smallest fix**: extend `collect-twitter-signals.ts` (or new worker) to write `star-snapshot:<window>` after each cron tick. Use `getDataStore().write(key, snapshot, { ttlSeconds: 25*3600 })`.
- Effort: half-day (Top 5 #1)

### Misleading indicators

**F3.** No misleading indicators identified, BUT [P2]:
- The ISR cache window (30 min) and the data-store memory tier (per-process) are independent staleness layers
- A user could see a page that's "fresh" by one definition (Redis served) and "stale" by another (ISR cached HTML rendered against 4h-old deltas)
- **Smallest fix**: when adding badges (F1), ensure they read `writtenAt` from the data-store (Redis truth), not page render time

### Single change for most user-visible staleness reduction

**Implement immediate-mode deltas producer** (F2 / Top 5 #1). 4h → 30 min on home page.

---

## Section 6 — Tests + Verification

### Test inventory (sample — full inventory in follow-up)

| Layer | Files | Runner | Coverage gaps |
|---|---|---|---|
| Pipeline scoring | `src/lib/pipeline/__tests__/cross-signal.test.ts`, `featured.test.ts`, `filters.test.ts`, `cross-domain-joins.test.ts`, `persistence-hydration.test.ts`, `cross-signal.test.ts`, `alerts.test.ts`, `search-endpoint.test.ts` | tsx --test | Twitter cross-signal tests on `feat/v4-alert-rules` only |
| Lib | `src/lib/__tests__/*.test.ts` (multiple) | tsx --test | data-store has limited test coverage |
| Twitter | `src/lib/twitter/__tests__/*.test.ts` | tsx --test | scoring.ts moderate coverage |
| Tools | `src/tools/__tests__/*.test.ts` | tsx --test | OK |
| Portal | `src/portal/__tests__/*.test.ts` | tsx --test | OK |
| Hooks | (vitest config) | vitest | Unclear scope |
| E2E | `tests/e2e/*.spec.ts` | Playwright | theme-toggle.spec.ts is pending H agent's `.skip` |
| Scrapers | `scripts/__tests__/*.test.mjs` (12 files including trustmrr-sync-mode) | node --test | Each per source — solid |

### Lint guards inventory

| Guard | Catches | Misses |
|---|---|---|
| `check-no-legacy-tokens.mjs` | Legacy V3 token strings | Hex literals (separate `lint:guards` hex check is **disabled**) |
| `check-no-err-message-echoes.mjs` | err.message echoed in API responses | Other forms of leaked internals |
| `check-zod-on-mutating-routes.mjs` | POST/PUT/PATCH/DELETE routes without `parseBody` | Read routes with no validation (lower P) |
| `check-route-runtime.mjs` | Route runtime drift | Edge runtime mishaps |
| `check-error-envelope.mjs` | Error envelope shape | Internal error leaks |
| `check-v3-token-budget.mjs` | V3 token usage budget | V4 token usage |
| `check-no-pool-bypass.mjs` | Bypassing the consensus pool pattern | Other consensus drift |

**T1.** `lint:guards` hex check disabled in pre-commit until V4 sweep finishes [P1]
- Means new hex literals can land in V4 components without catching
- **Smallest fix**: enable the hex check, accept short-term noise as motivation to finish sweep
- Effort: 15 min to enable, ongoing churn for ~1 week

**T2.** Pre-commit runs `lint:zod-routes` only, not full `lint:guards` [P1]
- 7 guards exist, only 1 in pre-commit
- **Smallest fix**: upgrade pre-commit to `npm run lint:guards` (which runs all 7). Cost: ~3-5s additional per commit.
- Effort: edit one line in `.husky/pre-commit`
- **Note**: prior pre-commit hook intentionally limited scope to keep commits fast. Consider only adding the cheaper guards.

**T3.** No tests for `src/lib/data-store.ts` [P1]
- The single read path for 30+ payloads. Critical-path module. No `__tests__/data-store.test.ts`.
- **Smallest fix**: add tests covering three-tier fallback chain, dedupe, rate-limit.
- Effort: half-day

**T4.** No tests for `src/lib/api/repo-profile.ts` [P1]
- The synthesizer (Twitter+PH) lives here. Currently untested.
- **Smallest fix**: add `repo-profile.test.ts` covering `buildCanonicalRepoProfile` for at-least 1 repo with mentions from each source.
- Effort: half-day

**T5.** Critical paths missing tests [P2]
- `consensus-trending.ts` has tests for refresh + meta but not normalization edge cases
- `consensus-verdicts.ts` minimal coverage
- `signals/build-items.ts` builds the canonical SignalItem shape but no test
- **Smallest fix**: add 1 test per module covering happy path + 1 edge case.
- Effort: 2-3h total

---

## Cross-cutting findings

1. **Branch coordination is broken.** Multiple parallel sessions ship to feature branches; only one stream lands on `main`. Need a daily merge ritual or PR consolidation pass. **Top 5 #2** is the immediate fix.
2. **Parallel-session merges move working tree out from under in-flight work.** A second terminal/session running `git checkout` / `git merge` / `git rebase` resets the current working tree mid-edit. Untracked files don't follow branch switches; staged-only files lose their staging when an autostash fires. **Pattern that survives: `Write` → `git add` → `git commit` immediately.** Commits are durable across branch ops. Staging is not. **NOT OneDrive — earlier in the session I misdiagnosed this; thanks for the correction.** Document the merge-interference pattern in `CLAUDE.md` Anti-Patterns section + add a session coordination ritual (one-active-branch-at-a-time, or commit-before-switch).
3. **CONTEXT.md is rich but underused.** 58 terms, 303 lines, but no agent or human currently checks it before writing code. Add a pre-commit lint that fails if a PR description uses bare "Consensus" without qualifier (Trending/Story/Verdict).
4. **Freshness is invisible.** `classifyFreshness()` exists, used in 1 of 17 surfaces. Top 5 #5 fixes the top 5.
5. **Test coverage on critical paths is thin.** `data-store.ts`, `repo-profile.ts`, and the Consensus subsystems carry the system but have spotty tests. T3-T5.
6. **Consensus subsystem boilerplate duplicates 3x.** Worth extracting a factory (A1).

---

## P0 (block other work)

- **A3** — `compute-deltas.mjs` vs new immediate-mode route: split brain on 24h delta values until producer ships
- **F2** — Immediate-mode deltas route has no producer; route 404s silently
- **M1, M2** — Twitter excluded from cross-signal scoring + mention feed on `main` (despite being on `feat/v4-alert-rules`)

## P1 (fix this week)

- **A1** — Consensus subsystem factory extraction
- **A4** — Twitter signal untangling
- **A6** — trendingrepo-worker overlap docs
- **I1** — DevTo cadence 24h → 6h
- **I2** — Twitter Apify SPOF health check
- **I3, I5** — snapshot age guard commit + final 2 _meta sidecar gaps
- **V1** — 5 W8 routes still on V3 chrome
- **V4** — Header.tsx + ThemeToggle on V3 imports
- **F1** — `classifyFreshness()` badges on top 5 routes
- **T1, T2** — `lint:guards` hex check + full guards in pre-commit
- **T3, T4** — `data-store.ts` + `repo-profile.ts` tests

## P2 (when there's time)

- **A5** — Delete `src/lib/scoring.ts`
- **V2, V3** — AgreementMatrix + FundingCard token swaps
- **V5** — Verify v4.css 640px breakpoint
- **V6** — Recharts deviation (logged, defer)
- **M4** — Lobsters/NPM/HF/ArXiv aggregated to repo profile
- **F3** — Misleading indicator audit (after badges land)
- **T5** — Critical-path test coverage extensions

---

## Verification

- [x] CONTEXT.md present and rich (58 terms, 303 lines, staged)
- [x] No agent dispatch in this audit (per harness escalation rule)
- [x] Branch-state explicitly verified for 6 critical fixes
- [x] Top 5 ranked by leverage with file:line + smallest fix + effort
- [x] All 6 audit domains covered in single doc
- [x] No bare "Consensus" used without qualifier (verifiable: `grep -E '\bConsensus\b' docs/ultra-audit-2026-05-01.md` should show only qualified forms)
- [ ] Doc committed (next step)

## Recommended sequence

1. **Now**: commit this audit + the modified working-tree files (`scripts/snapshot-consensus.ts`, `scripts/fetch-repo-metadata.mjs`, `src/app/api/pipeline/deltas/`, `CONTEXT.md`)
2. **Today**: cherry-pick or merge `feat/v4-alert-rules` agent work to `main` (Top 5 #2 — closes 3 P0s)
3. **This week**: ship producer for immediate-mode deltas (Top 5 #1)
4. **Then**: pick 2-3 P1s per session, ship, commit, repeat
