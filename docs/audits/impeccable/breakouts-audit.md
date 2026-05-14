# Impeccable Audit — `/breakouts`

**Scope:** `src/app/breakouts/{page,loading,error}.tsx`, `src/components/breakouts/ChannelHeatStrip.tsx`, plus the `.board` / `.lb-row` / `.chip` chrome in `src/app/globals.css`.
**Surface:** Cross-Signal Breakouts leaderboard — high-traffic, public.
**Date:** 2026-05-13 · Wave 8.

---

## Headline

`/breakouts` lies about its own freshness in three places and ships a green-coded "consensus" badge on rows whose 24h delta is **negative**. The leaderboard's six-column grid mislabels its own columns ("Channels" carries only GitHub; "Signals" carries Reddit+HN), and the page advertises six signal sources in the OG description but renders only three. Chrome is in place (PageHead + VerdictRibbon + FreshnessBadge + FreshnessChip), but the wiring is incorrect: `force-static` + the build-frozen `lastFetchedAt` import constant means the badge reports build-time age forever. The standalone `ChannelHeatStrip` primitive — explicitly designed for this route per its own header comment — is unused. Filter chips are 24px tall (fail 44×44 mobile).

**Counts:** 4 P0 · 5 P1 · 4 P2 · 2 P3.

---

## P0 — Honest chrome / correctness

### P0-1 — `force-static` + `lastFetchedAt` constant freezes freshness at build time
**File:** `src/app/breakouts/page.tsx:20`, `:7`, `:112`, `:240`
**Evidence:** `export const dynamic = "force-static"` + `import { lastFetchedAt } from "@/lib/trending"`. `lastFetchedAt` is exported as a captured-at-import-time constant (`src/lib/trending.ts:57`), not the live getter `getLastFetchedAt()`. The badge and per-row chip will read the data file's `fetchedAt` from whenever the build ran — usable for hours/days. There is no ISR `revalidate` either.
**Fix:** Either (a) switch to `dynamic = "force-dynamic"` + call `await refreshTrendingFromStore()` and use `getLastFetchedAt()`, or (b) add `export const revalidate = 1800` and still use the getter so each ISR window reads the in-memory cache post-refresh. Per CLAUDE.md "data reads MUST go through the data-store."
**Call:** Mechanical.

### P0-2 — VerdictRibbon stamp asserts "refreshed live" on a force-static page
**File:** `src/app/breakouts/page.tsx:122`
**Evidence:** `sub: \`of ${totalFiring} firing · ${allThree} all-three · refreshed live\``. The page is `force-static`; nothing is live. This is a hardcoded LIVE-class assertion outside `<FreshnessBadge>` / `classifyFreshness()` — the exact pattern the project rules name as P0.
**Fix:** Replace with a derived age (e.g. `\`updated ${ageLabel}\`` computed from `getLastFetchedAt()`), or drop the phrase entirely. Let the FreshnessBadge in the clock slot carry the verdict.
**Call:** Design + mechanical.

### P0-3 — `.badge.cons` renders ALL delta24 values in green, including negatives
**File:** `src/app/breakouts/page.tsx:255-258`; CSS `src/app/globals.css:5371-5376`
**Evidence:** Row badge is hardcoded `className="badge cons"` with the consensus token (`--b-cons` → `--color-positive`, green). `deltaLabel` can be `-500` when `delta24 < 0` (line 220), but the badge stays green. A negative momentum number tinted green is misleading numeric encoding on a momentum surface.
**Fix:** Branch the modifier by sign: `cn("badge", delta24 > 0 && "cons", delta24 < 0 && "div", delta24 === 0 && "single")` — the divergence (amber) and single (neutral) tokens already exist at `globals.css:5385-5403`. Optionally suppress the badge entirely when `delta24 === 0`.
**Call:** Mechanical (semantic bug).

### P0-4 — OG / meta description promises six sources, surface delivers three
**File:** `src/app/breakouts/page.tsx:24-39`
**Evidence:** metadata.description = "GitHub stars, Reddit, Hacker News, Bluesky, dev.to, and X/Twitter". `visibleFiring()` (line 55-58) sums only `github`, `reddit`, `hn` from `getChannelStatus`. The page renders three rank columns, the SEO claim says six. Public-page truthfulness rule.
**Fix:** Either align the description to the rendered three-channel reality, or extend `getChannelStatus`/`visibleFiring` to include the four missing channels. Lede on line 107 already correctly says "Three signal sources" — copy that into metadata.
**Call:** Mechanical.

---

## P1 — Hierarchy & honesty

### P1-1 — Column headers "Channels" + "Signals" don't match content split
**File:** `src/app/breakouts/page.tsx:207-214`, `:248-254`
**Evidence:** Header row declares 6 columns: `# · Repository · Score · Channels · Signals · 24h`. Body row puts ONLY GH under "Channels" and Reddit+HN under "Signals". There's no semantic distinction — all three are channels and signals. Scanning a row, the reader can't reconcile "GH appears under Channels but R/HN appear under Signals."
**Fix:** Merge into a single "Channels" cell containing all three pips (GH | R | HN) in a 3-grid, drop the second column, and rebalance the grid template (`42px 1fr 92px 130px 100px`).
**Call:** Design.

### P1-2 — `ChannelHeatStrip` exists, is documented for this route, and is unused
**File:** `src/components/breakouts/ChannelHeatStrip.tsx:1-17` (header comment: "24-cell hourly heatmap used in sub-pages.html § /breakouts polish"); `src/app/breakouts/page.tsx` (no import)
**Evidence:** The breakout surface ranks repos by momentum but shows no temporal shape — a reader can't tell whether a `+1.2k` delta is one spike or a steady climb. The primitive built for exactly this gap is sitting unused.
**Fix:** Compute per-repo hourly bucket from existing signal timestamps (derive in `getDerivedRepos`) and render `<ChannelHeatStrip hours={...}>` inside `.lb-row .repo` under the description line. Falls back to invisible if hours unavailable.
**Call:** Design.

### P1-3 — FreshnessBadge wired with `source="mcp"` on a breakout/cross-signal page
**File:** `src/app/breakouts/page.tsx:112`
**Evidence:** `<FreshnessBadge source="mcp" lastUpdatedAt={lastFetchedAt} />`. The `mcp` threshold is set for slow-cron MCP feeds; the breakout source is the trending pipeline (refreshed by /api collectors + Redis). Picking the wrong `NewsSource` mis-classifies live/warn/cold — a 90-min-old payload could read FRESH on the slow MCP threshold when it is actually STALE for trending.
**Fix:** Use the matching source. If `classifyFreshness` lacks a "trending" or "github-cron" key, add it; otherwise use the closest cadence (3h cron → roughly the `skills` or a new `trending` band).
**Call:** Mechanical.

### P1-4 — `FreshnessChip updatedAt={lastFetchedAt}` on every row reuses page-level timestamp
**File:** `src/app/breakouts/page.tsx:240`
**Evidence:** All 50 rows render the same chip value (the page-wide `lastFetchedAt`). The chip's purpose per its header comment is "per-row freshness companion" — one value for every row makes it ornamental noise that defeats the chip's purpose and adds 50× redundant token weight.
**Fix:** Either (a) drop the per-row chip and let the page-level FreshnessBadge carry it, or (b) wire per-repo signal-last-seen (e.g. `repo.lastSignalAt` from `getDerivedRepos`) so the chip actually differs row-to-row.
**Call:** Design.

### P1-5 — Score "conf-bar" caps at 100% but `crossSignalScore` is unbounded
**File:** `src/app/breakouts/page.tsx:223`
**Evidence:** `score = Math.max(4, Math.min(100, Math.round((repo.crossSignalScore ?? 0) * 32)))`. The 32× multiplier and 100 clamp encode an assumption that the score lives in `[0, 3.125]`. A repo at score 5.0 (top hit) shows the same 100% bar as a repo at 3.125 (mid-pack). The bar stops differentiating the highest scorers — the exact rows the page exists to surface.
**Fix:** Normalize against the page's actual max: `score = Math.round((repo.crossSignalScore / topScore) * 96) + 4` (topScore is already computed at line 89). Keeps a 4% floor for legibility, scales the rest honestly.
**Call:** Mechanical.

---

## P2 — Information density, accessibility

### P2-1 — Filter chips 24px tall — fail 44×44 mobile tap target
**File:** `src/app/breakouts/page.tsx:188-198`; CSS `src/app/globals.css:5220-5229`
**Evidence:** `.chip` is `height: 24px`. The three filter chips ("All firing" / "2+ channels" / "3 channels") are the primary mobile interaction on the page. At 375px width with 16px gutters, they sit in a row alongside the "Filter" label and the "N repos" right-counter — finger targets ~24×60.
**Fix:** Add a mobile-only override: `@media (max-width: 640px) { .filter-bar .chip { min-height: 44px; padding: 0 14px; } }`. Don't bloat desktop.
**Call:** Mechanical (a11y).

### P2-2 — `.rb us` / `.rb gh` / `.rb hf` class names are semantically scrambled
**File:** `src/app/breakouts/page.tsx:249-253`
**Evidence:** GitHub uses `rb us`, Reddit uses `rb gh`, Hacker News uses `rb hf`. The `.us` class makes the value orange (`.rb.us .v` → `--acc`), `.hf` makes it amber. Class names are inherited from a prior route incarnation and now lie about their content; any future maintainer reading "GH" and a class of "us" will lose 10 minutes.
**Fix:** Rename to `rb rb-github` / `rb rb-reddit` / `rb rb-hn` with matching CSS aliases, deprecate the old class names. Surgical CSS rename.
**Call:** Mechanical.

### P2-3 — "NOISE" KPI tile has no filter affordance
**File:** `src/app/breakouts/page.tsx:160-166`, `:188-198`
**Evidence:** KpiBand cell labelled "NOISE" with `oneChannel` count exists, but the three filter chips offer "all / multi / three" only — no "noise / single channel" toggle. The reader is told "32 single-channel" but cannot click to inspect them.
**Fix:** Add a fourth filter key `"single"` → `r._firing === 1`, and a chip "1 channel".
**Call:** Design.

### P2-4 — Score column splits `(score)` from `(conf-bar)` but no width for narrow rows
**File:** `src/app/breakouts/page.tsx:244-247`; CSS `src/app/globals.css:6018-6035`
**Evidence:** `.score` is `align-items: flex-end; gap: 3px`, conf-bar is `width: 78px; height: 3px`. On 901-1100px viewport, grid is `42px 1fr 92px 102px 96px 100px` — the 92px score column hosts a 78px bar plus the score text plus right-align padding. Bar and score number stack vertically inside a 92px cell; at the breakpoint just before 900px collapse, the bar bumps against the next column.
**Fix:** Either widen the grid column (`110px`) or shrink the bar (`width: 64px`).
**Call:** Mechanical.

---

## P3 — Polish

### P3-1 — Repo avatar shows two uppercase letters of `fullName`, includes the `/`
**File:** `src/app/breakouts/page.tsx:234`
**Evidence:** `repo.fullName.slice(0, 2).toUpperCase()` — for "vercel/next.js" produces "VE", for "a/b" produces "A/". The slash-edge case is real on short org names.
**Fix:** `repo.owner.slice(0, 2).toUpperCase()` — owner is already split on the Repo type.
**Call:** Mechanical.

### P3-2 — Empty-state copy is bare; no recovery affordance
**File:** `src/app/breakouts/page.tsx:201-204`
**Evidence:** `"No repos match this filter right now."` — no link back to a looser filter. User who landed on `?filter=three` and saw 0 has to discover the filter chips above.
**Fix:** Add a "Try '2+ channels' →" recovery link inside the empty state, defaulting to the next-looser filter.
**Call:** Design.

---

## What's already right

- PageHead + VerdictRibbon + KpiBand + SectionHead all primitives-correct.
- 2px radii (`rounded-[2px]` in loading, no shadows applied).
- Side-tab `border-left: 2px solid var(--acc)` on `.lb-row.first` is the canonical "leader" rail — keep.
- Loading skeleton mirrors the rendered layout (4-col KPI band, 12 row strips).
- Mobile collapse at 900px stacks score/badge/gauge/ranks into column 2 — sound.
- `scroll={false}` on filter Links prevents jarring scroll resets.

---

## Mechanical vs Design split

| Class | Count | Where it lives |
|---|---|---|
| Mechanical | 9 | P0-1, P0-3, P0-4, P1-3, P1-5, P2-1, P2-2, P2-4, P3-1 |
| Design | 5 | P0-2 (also mech), P1-1, P1-2, P1-4, P2-3, P3-2 |
| Both | 1 | P0-2 |

Mechanical = code/wiring fixes touching the page and the data-store integration. Design = visual hierarchy and component-composition decisions that move the surface from "leaderboard chrome" to "breakout-first scanning instrument."
