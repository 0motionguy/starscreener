# /huggingface audit — 2026-05-13

> Impeccable design audit on `/huggingface` and its three sub-surfaces (`/trending` = Models, `/datasets`, `/spaces`). Project rules applied: honest freshness chrome non-negotiable; HF has THREE independent sources (models / datasets / spaces) each with its own cron cadence — freshness must reflect each surface's actual state; HF brand yellow `#FFD21E` is the functional source color but **no `--source-hf` / `--v4-src-hf` token exists**, so the value is currently hardcoded across four files.

## Files audited

- [src/app/huggingface/page.tsx](../../../src/app/huggingface/page.tsx) — 5-line redirect alias to `/huggingface/models`
- [src/app/huggingface/models/page.tsx](../../../src/app/huggingface/models/page.tsx) — 1-line re-export from `../trending/page`
- [src/app/huggingface/trending/page.tsx](../../../src/app/huggingface/trending/page.tsx) — Models feed (host page; canonical `/huggingface` per metadata)
- [src/app/huggingface/datasets/page.tsx](../../../src/app/huggingface/datasets/page.tsx) — Datasets feed
- [src/app/huggingface/spaces/page.tsx](../../../src/app/huggingface/spaces/page.tsx) — Spaces feed
- [src/app/huggingface/{trending,datasets,spaces}/loading.tsx](../../../src/app/huggingface/) — 3 identical skeleton stubs
- [src/app/huggingface/{trending,datasets,spaces}/error.tsx](../../../src/app/huggingface/) — 3 identical error boundaries
- [src/components/huggingface/HfNavTabs.tsx](../../../src/components/huggingface/HfNavTabs.tsx) — tab strip across all 3 sub-surfaces
- Cross-refs: [src/components/shared/FreshnessBadge.tsx](../../../src/components/shared/FreshnessBadge.tsx), [src/lib/news/freshness.ts](../../../src/lib/news/freshness.ts), [src/components/ui/LiveDot.tsx](../../../src/components/ui/LiveDot.tsx)

## P0 findings

### 1. Hardcoded `<LiveDot label="FRESH · 3H" />` on all 3 sub-pages — honest-chrome violation × 3

- **Files**: [trending/page.tsx:144](../../../src/app/huggingface/trending/page.tsx#L144), [datasets/page.tsx:134](../../../src/app/huggingface/datasets/page.tsx#L134), [spaces/page.tsx:133](../../../src/app/huggingface/spaces/page.tsx#L133)
- **Mechanical**: All three pages render `<LiveDot label="FRESH · 3H" />` inside the PageHead clock slot with **no relation to actual `fetchedAt`**. `LiveDot` defaults to `tone="money"` (green, pulsing). The string is a static literal — the dot pulses green even when the underlying payload is hours stale, the Redis store is dark, or the scraper is broken. This is the exact pattern called out in [feedback_freshness_chrome_must_be_honest](C:\Users\mirko\.claude\projects\c--dev-trendingrepo\memory\feedback_freshness_chrome_must_be_honest.md): "Never inline hardcoded 'FRESH · 1H' / green-pulse LiveDot. Wire `lastUpdatedAt` to `FreshnessBadge` via `classifyFreshness()`."
- **Fix**: Replace each `<LiveDot label="FRESH · 3H" />` with `<FreshnessBadge source="huggingface" lastUpdatedAt={file.fetchedAt} />`. **Gated on #2**: `huggingface` is not yet a `NewsSource` union member — must add it (with `oldestRecordAt` stamping per the B4 pattern) before the badge can compile. Per-surface threshold likely matches `npm`/`mcp` (6h cron + 6h grace = 12h stale budget), since HF scrapers run on a slow cadence similar to MCP. Keep the static UTC clock text + `// UTC · SCRAPED` muted label — those are honest.
- **Design call**: mechanical with a tiny design tilt — 3 line-level swaps + 1 freshness.ts entry. The "lie" is identical on all three pages so the fix is identical.

### 2. `NewsSource` union has no `huggingface` entry — no freshness budget defined for any HF surface

- **File**: [src/lib/news/freshness.ts:18-29](../../../src/lib/news/freshness.ts#L18), `SOURCE_STALE_MS` at [L42-59](../../../src/lib/news/freshness.ts#L42)
- **Mechanical**: The `NewsSource` discriminated union lists `reddit | hackernews | bluesky | devto | lobsters | producthunt | twitter | npm | mcp | skills` — no `huggingface`. Means: even if an engineer tried to wire `FreshnessBadge` correctly (per #1), TypeScript would reject `source="huggingface"`. The page rules require **honest** chrome on all three HF surfaces; the badge can't exist until the type allows it.
- **Fix**: Add `"huggingface"` to `NewsSource` and `SOURCE_STALE_MS["huggingface"] = NPM_STALE_THRESHOLD_MS` (12h budget, matching slow-cron Redis publishers like `mcp`/`skills`). Consider three sub-keys (`huggingface-models`, `huggingface-datasets`, `huggingface-spaces`) if the cron cadences diverge — verify-in-context against `scripts/scrape-huggingface*.mjs` cadences before committing to one vs. three keys. Recommend **one key** unless cadence reading shows >2× spread.
- **Design call**: mechanical, **blocks #1**.

### 3. Three HF scrapers can be in three different freshness states — the page assumes they're identical

- **Files**: [trending/page.tsx:84](../../../src/app/huggingface/trending/page.tsx#L84) (`getHfTrendingFile().fetchedAt`), [datasets/page.tsx:75](../../../src/app/huggingface/datasets/page.tsx#L75) (`getHfDatasetsFile().fetchedAt`), [spaces/page.tsx:74](../../../src/app/huggingface/spaces/page.tsx#L74) (`getHfSpacesFile().fetchedAt`)
- **Mechanical**: Each sub-page reads its own `file.fetchedAt` and renders its own static `FRESH · 3H` label. There's no cross-surface awareness: a user landing on `/huggingface/spaces` cannot tell that `/datasets` may be 18h stale (cold) while spaces is 1h fresh. The nav tab strip ([HfNavTabs.tsx](../../../src/components/huggingface/HfNavTabs.tsx)) renders all three tabs at identical visual weight — no per-tab freshness signal. This is the cross-source honest-chrome corollary: when a single host page fans out to 3 collectors, the tab strip is the right place to surface per-source state.
- **Fix**: After #1 + #2, optionally add per-tab freshness dots in `HfNavTabs.tsx`: each tab shows a 6×6 dot in `var(--v4-money)` / `--v4-amber)` / `--v4-red)` derived from `classifyFreshness("huggingface", <perSourceFetchedAt>)`. Read all three file timestamps server-side once and thread them down as `tabBar={<HfNavTabs activeHref=... freshness={{models, datasets, spaces}} />}`. Without this, the user has no signal that switching tabs may show stale data.
- **Design call**: design — net-new affordance, three-source coordination. Lower urgency than #1+#2 but the highest-leverage fix for the "3 independent sources" rule called out in the audit brief.

### 4. `#FFD21E` HF brand yellow is hardcoded in 4 files — color budget drift; no `--source-hf` token

- **Files**: [trending/page.tsx:35](../../../src/app/huggingface/trending/page.tsx#L35) (`const HF_YELLOW = "#FFD21E"`), [datasets/page.tsx:35](../../../src/app/huggingface/datasets/page.tsx#L35) (`const HF_ACCENT_BAR = "#FFD21E"`), [spaces/page.tsx:34](../../../src/app/huggingface/spaces/page.tsx#L34) (`const HF_YELLOW`), [HfNavTabs.tsx:31-33](../../../src/components/huggingface/HfNavTabs.tsx#L31) (`#FFD21E` literal × 3 in style)
- **Mechanical**: Comment at `trending/page.tsx:34` admits the gap: "HF 'yellow' — no `--v4-src-hf` token exists; hardcoded once on the pip". The rest of the codebase has `--source-{github,hackernews,x,reddit,producthunt,bluesky,dev,openai,claude}` ([globals.css:174-191](../../../src/app/globals.css#L174)) and the V4 mirror `--v4-src-{hn,gh,x,reddit,bsky,dev,claude,openai}` ([globals.css:6226-6233](../../../src/app/globals.css#L6226)). HF is the largest-LOC source page family without a token. Drift risk: datasets uses `HF_ACCENT_BAR`, trending+spaces use `HF_YELLOW` for the same color — already two names for one value. The `#FFD21E` literal also leaks into inline `rgba(255, 210, 30, 0.08)` in HfNavTabs.tsx:33 (the 0.08 alpha tint) — another magic value tied to the same brand.
- **Fix**: Add `--source-hf: #FFD21E` + `--source-hf-oklch: oklch(...)` to `:root` block in globals.css (matching the pattern at L174-191), and `--v4-src-hf: #FFD21E` to the V4 mirror block at L6226-6233. Replace the four literal sites with `var(--v4-src-hf)`. Drop both `HF_YELLOW` and `HF_ACCENT_BAR` const declarations; pass the CSS var directly to the table `accent` prop and the inline styles. The HfNavTabs.tsx 0.08-alpha active background becomes `color-mix(in oklch, var(--v4-src-hf) 8%, transparent)` — survives token-switching, no magic alpha.
- **Design call**: design — small token addition, then mechanical literal-to-token sweep across 4 files. Sister fix to the openai/claude token additions.

## P1 findings

### 5. `huggingFaceLogoUrl` imported but never used in all three pages

- **Files**: [trending/page.tsx:22](../../../src/app/huggingface/trending/page.tsx#L22), [datasets/page.tsx:24](../../../src/app/huggingface/datasets/page.tsx#L24), [spaces/page.tsx:23](../../../src/app/huggingface/spaces/page.tsx#L23)
- **Mechanical**: Each page imports `{ huggingFaceLogoUrl, huggingFaceAuthorLogoUrl }` but only consumes `huggingFaceAuthorLogoUrl` — `grep huggingFaceLogoUrl\(` returns zero call-sites under `src/app/huggingface/`. Dead imports across three pages signal copy-paste shaped from an earlier draft that rendered a top-level brand logo (now replaced by `<HuggingFaceIcon />` from `brand/BrandIcons`). Lint is presumably suppressing `no-unused-vars` here.
- **Fix**: Drop `huggingFaceLogoUrl` from the destructure in all three pages.
- **Design call**: mechanical — three identical 1-symbol edits.

### 6. ColdState fallback is duplicated near-verbatim across all three pages

- **Files**: [trending/page.tsx:358-393](../../../src/app/huggingface/trending/page.tsx#L358), [datasets/page.tsx:328-363](../../../src/app/huggingface/datasets/page.tsx#L328), [spaces/page.tsx:363-405](../../../src/app/huggingface/spaces/page.tsx#L363)
- **Mechanical**: Three `function ColdState()` definitions, each ~35 LOC, differ only in the embedded `npm run` / `node scripts/...` hint and the `data/huggingface-*.json` filename. Same inline styles, same `// no data yet` heading, same `border-radius: 2`. Duplicate triplet means a fix to one (e.g. updating the cold-state copy when the scraper changes name) doesn't propagate. The codebase already has an `EmptyState` primitive used elsewhere (see `/reddit/trending` cold path) — HF is the outlier.
- **Fix**: Extract `HfColdState({ source: "models" | "datasets" | "spaces" })` co-located under `src/components/huggingface/HfColdState.tsx`. Wire the scraper hint via a switch on `source`. Saves ~70 LOC and gives the three pages one shape to maintain.
- **Design call**: mechanical — straight extraction.

### 7. `MomentumBar` defined three times verbatim — same drift surface as #6

- **Files**: [trending/page.tsx:321-352](../../../src/app/huggingface/trending/page.tsx#L321), [datasets/page.tsx:291-322](../../../src/app/huggingface/datasets/page.tsx#L291), [spaces/page.tsx:326-357](../../../src/app/huggingface/spaces/page.tsx#L326)
- **Mechanical**: Three identical `function MomentumBar({ value, accent }: { value: number; accent: string })` declarations. ~30 LOC each. Magic numbers in all three: `height: 6`, `borderRadius: 1` (note: not 2; the row-level bar uses 1px corners while every other card uses `--radius-card: 2px` — minor radius drift). `boxShadow: 0 0 6px ${accent}66` is the same trick. Triplet duplication.
- **Fix**: Extract `<MomentumBar value={..} accent={..} />` to `src/components/huggingface/MomentumBar.tsx`. Already accepts `accent` so it's source-agnostic. Same drop pattern propagates if other source pages adopt the same bar later. Pin `borderRadius` to a token while extracting.
- **Design call**: mechanical — straight extraction; the radius drift is a 1-char fix that rides along.

### 8. Loading skeleton uses `var(--v3-bg-050)` / `var(--v3-bg-100)` — drift vs surrounding `--v4-*` tokens

- **Files**: [trending/loading.tsx:10,14,18,23,30,38](../../../src/app/huggingface/trending/loading.tsx#L10), [datasets/loading.tsx:10,14,18,23,30,38](../../../src/app/huggingface/datasets/loading.tsx#L10), [spaces/loading.tsx:10,14,18,23,30,38](../../../src/app/huggingface/spaces/loading.tsx#L10)
- **Mechanical**: Three identical skeleton files all reference `--v3-bg-*` tokens. globals.css L426-427 + L6176-6177 confirm v3 and v4 alias the same `--color-bg-raised` / `--color-bg-muted` so the visual outcome is identical TODAY, but the v3 → v4 sweep is intentional and these are the only three files under `src/app/huggingface/` still on v3. Sister loading.tsx files in newer sources use v4 directly.
- **Fix**: `--v3-bg-050` → `--v4-bg-050`, `--v3-bg-100` → `--v4-bg-100`. Three files × 6 lines each = trivial mechanical sweep.
- **Design call**: mechanical.

### 9. Error boundaries reference `--v2-*` tokens — same drift, older generation

- **Files**: [trending/error.tsx:23,32,42,49,52](../../../src/app/huggingface/trending/error.tsx#L23), [datasets/error.tsx:23,32,42,49,52](../../../src/app/huggingface/datasets/error.tsx#L23), [spaces/error.tsx:23,32,42,49,52](../../../src/app/huggingface/spaces/error.tsx#L23)
- **Mechanical**: Three identical error pages all use `--v2-sig-red`, `--v2-ink-000`, `--v2-ink-300`, `--v2-ink-400`. The `--v2-*` family is two generations behind. globals.css L507-508 aliases v2 to v3 to v4 so it renders correctly, but the chain is fragile.
- **Fix**: Sweep `--v2-sig-red` → `--v4-red`, `--v2-ink-*` → `--v4-ink-*`. Three files, 15 token swaps total. Less urgent than #8 because error states are rare.
- **Design call**: mechanical.

### 10. Tab strip is a `<nav>` with `<Link>` chips — missing `role="tablist"` + `role="tab"` for the 3-source pattern

- **File**: [HfNavTabs.tsx:13-43](../../../src/components/huggingface/HfNavTabs.tsx#L13)
- **Mechanical**: The component renders `<nav aria-label="Hugging Face sections">` with `<Link>` children carrying `aria-current="page"` for active. Semantically defensible (it's navigation between three routes, not a tab control), but the visual pattern is the same as `/reddit/trending`'s `role="tablist"` strip ([AllTrendingTabs.tsx:321](../../../src/components/reddit-trending/AllTrendingTabs.tsx#L321)) which DOES use the ARIA pattern. Screen-reader users get different affordances for visually-identical patterns. Pick one.
- **Fix**: Two options: (a) keep `<nav>` semantics — explicitly correct since each tab routes; document in a code comment that this is intentional (consistency with sidebar routing); (b) switch to `role="tablist"` + `role="tab"` for consistency with reddit-trending's intra-page tab pattern. Recommend (a) — `HfNavTabs` truly navigates routes and `aria-current="page"` is the right shape. The 90% similar visual is acceptable.
- **Design call**: design — needs the project-wide rule on "when is a tab strip a tablist vs a route nav".

### 11. Tab strip uses `rounded-sm` (2px) + `border` (1px) — radii are correct, but the active state shifts `background` AND `borderColor` AND `color` simultaneously

- **File**: [HfNavTabs.tsx:30-34](../../../src/components/huggingface/HfNavTabs.tsx#L30)
- **Mechanical**: Active state changes three properties at once: `borderColor` (line → `#FFD21E`), `color` (ink-300 → `#FFD21E`), `background` (bg-050 → `rgba(255, 210, 30, 0.08)`). The `transition-colors` Tailwind utility only animates color/background/border-color (which is fine), but the simultaneous triple-shift on hover and active feels heavier than the single-axis active states elsewhere. PageHead clock is the visual anchor; tabs should be quieter when active.
- **Fix**: Keep the active background tint and active text-color, **drop the active border-color change**. The 1px border stays at `var(--v4-line-200)` in both states; the active state communicates via the 8% bg + bolder text. Sibling: `transition-colors duration-120` (matches `--motion-duration-fast`) — currently the duration is implicit (browser default ~150ms).
- **Design call**: design — small tonal call, propagates to the tab feel.

### 12. `formatClock(file.fetchedAt)` returns 8-char UTC time but the page never tells the user WHEN today

- **Files**: [trending/page.tsx:68-71](../../../src/app/huggingface/trending/page.tsx#L68), [datasets/page.tsx:68-71](../../../src/app/huggingface/datasets/page.tsx#L68), [spaces/page.tsx:67-70](../../../src/app/huggingface/spaces/page.tsx#L67)
- **Mechanical**: Helper slices `.toISOString().slice(11, 19)` → e.g. `"14:32:08"`. No date. If the user lands on the page at 09:00 UTC the day AFTER a scrape, the clock reads `"22:14:53"` with no date qualifier; combined with the (broken) `FRESH · 3H` LiveDot the user is told "live, 22:14:53" while actually viewing 30-hour-old data. Honest-chrome adjacent.
- **Fix**: Once #1 lands, `FreshnessBadge` carries the `title` tooltip with the full ISO (it already does: `Last updated ${iso} · ${verdict.status} · stale after ...`). The clock can stay as time-only because the badge owns the truth. Optionally tag the muted sub-label `UTC · SCRAPED` with the date when `ageMs > 24h`.
- **Design call**: design — gated on #1.

### 13. Cold-state hint references `npm run scrape:huggingface` for trending but `node scripts/scrape-huggingface-{datasets,spaces}.mjs` for the others — inconsistent runner

- **Files**: [trending/page.tsx:383](../../../src/app/huggingface/trending/page.tsx#L383), [datasets/page.tsx:353](../../../src/app/huggingface/datasets/page.tsx#L353), [spaces/page.tsx:394](../../../src/app/huggingface/spaces/page.tsx#L394)
- **Mechanical**: Trending tells operators `npm run scrape:huggingface`; datasets tells them `node scripts/scrape-huggingface-datasets.mjs`; spaces tells them `node scripts/scrape-huggingface-spaces.mjs`. CLAUDE.md lists `npm run scrape:huggingface` / `scrape:huggingface-spaces` as the canonical runners. The two raw `node …mjs` hints leak implementation; the operator-facing copy should match the documented runner.
- **Fix**: Verify in `package.json` whether `scrape:huggingface-datasets` / `:huggingface-spaces` scripts exist; if yes, use them. If not, propose adding them in a follow-up and update the cold-state hints. Will fold cleanly into #6 (shared `HfColdState`).
- **Design call**: mechanical — gated on `package.json` script check.

## P2 findings

### 14. `tone="acc"` and `tone="money"` props passed to KpiBand but cell color also passed as `pip="var(--v4-acc)"` — possible double-paint

- **Files**: [trending/page.tsx:152-178](../../../src/app/huggingface/trending/page.tsx#L152), [datasets/page.tsx:141-168](../../../src/app/huggingface/datasets/page.tsx#L141), [spaces/page.tsx:140-167](../../../src/app/huggingface/spaces/page.tsx#L140)
- **Mechanical**: Each KpiBand cell sets BOTH `tone: "acc"` and `pip: "var(--v4-acc)"` (or `money`/`v4-money`, etc.). Not necessarily a bug — `tone` likely scopes the value-row text color while `pip` is the small accent dot — but the same color is being threaded through two props for the same visual outcome. Without reading KpiBand internals it's a minor smell; if `tone="acc"` already implies the pip color, the explicit `pip` prop is redundant.
- **Fix**: Read [src/components/ui/KpiBand.tsx](../../../src/components/ui/KpiBand.tsx) to confirm whether `tone` alone covers the pip. If yes, drop the redundant `pip` prop across all 12 cells (3 pages × 4 cells). If no (i.e. pip is independent), keep both — currently doing no harm.
- **Design call**: mechanical, verify-in-context.

### 15. Models feed Type column renders `pipelineTag ?? libraryName ?? null` with same chrome — collapsed semantics

- **File**: [trending/page.tsx:236-253](../../../src/app/huggingface/trending/page.tsx#L236)
- **Mechanical**: Pipeline tag (e.g. `text-generation`) and library name (e.g. `transformers`) are different facets — one is the task, one is the runtime. The column header reads "Type" and uses the same `border + bg-100 + ink-300` chip for both. The `title={tag}` tooltip is the only disambiguation; on small screens (`hideBelow: "sm"`) the column hides entirely. Information conflation.
- **Fix**: Two options: (a) keep one column, tweak chip color: pipelineTag → `var(--v4-blue)`-tinted, libraryName → `var(--v4-ink-400)`-tinted, with the chip carrying a subtle outline color indicating which facet rendered; (b) split into two columns "Task" + "Lib" but at most 3 chars each. (a) preserves layout; (b) is more honest. Recommend (a) for now.
- **Design call**: design — small honest-information improvement.

### 16. Spaces "Models" column tooltip shows newline-joined model IDs via `\n` in title attribute — won't render

- **File**: [spaces/page.tsx:256-274](../../../src/app/huggingface/spaces/page.tsx#L256)
- **Mechanical**: `tooltip = s.models.slice(0, 3).join("\n") + (count > 3 ? "\n… +${count - 3} more" : "")` and set as `title={tooltip}`. HTML `title` attributes treat `\n` as whitespace — most browsers render the entire string on one line; some collapse the newlines entirely. The user sees a wall of text.
- **Fix**: Either (a) replace `\n` with ` · ` for a single-line `title` (browser-native, accessible), or (b) replace with a real tooltip popover. (a) is the K2-simplicity-first move.
- **Design call**: mechanical — one-line fix.

### 17. `momentum` value rendered as `Math.round(pct)` next to a 6px-tall bar — 24px-wide text reservation is wider than needed

- **Files**: [trending/page.tsx:344-348](../../../src/app/huggingface/trending/page.tsx#L344), datasets + spaces have the same render
- **Mechanical**: `<span ... width: 24, textAlign: "right">{Math.round(pct)}</span>` — max value is 100 (3 chars). At `text-[10px]` mono, 3 chars is ~18px. 24px is fine, but the bar is `flex-1` which means it stretches available width minus the 24px label. On the narrowest momentum-column width (120px → 96px available for bar after label + gap), the label dominates relative to the data.
- **Fix**: Either widen the column to 140px to give the bar 110px or replace the literal `width: 24` with `min-width: 24` and let it shrink for 2-digit values. Mechanical, gated on the extraction in #7.
- **Design call**: mechanical, low-impact.

### 18. Cold-state heading is uppercase `// NO DATA YET` mono with letter-spacing 0.18em — louder than the page H1

- **Files**: [trending/page.tsx:368-378](../../../src/app/huggingface/trending/page.tsx#L368), datasets/spaces equivalent
- **Mechanical**: H1 is sans 30px, weight 500, ink-000 — quiet. Cold-state H2 uses `v2-mono` + `fontWeight: 700` + `textTransform: "uppercase"` + `letterSpacing: "0.18em"` + 18px in HF yellow. On a cold page (no data) the loudest type on the screen is the empty-state banner — the H1 is muted by comparison. Inversion of hierarchy.
- **Fix**: Drop the HF-yellow tint on the heading; keep mono treatment but in `var(--v4-ink-300)` and `fontWeight: 600` to match the page lede tier. The empty-state should read as a subdued aside, not as the loudest element.
- **Design call**: design — small hierarchy correction, propagates via #6 extraction.

### 19. `MomentumBar` `boxShadow: 0 0 6px ${accent}66` is a glow — within DESIGN.md "glow reserved for focus/LIVE/overlay/popover/glow"

- **Files**: [trending/page.tsx:340](../../../src/app/huggingface/trending/page.tsx#L340), datasets/spaces equivalent
- **Mechanical**: 6px glow at 40% alpha on the momentum fill. DESIGN.md (per project rules) says no card shadows but allows glows for "focus, LIVE, overlay, popover, glow". A momentum bar is data viz, not a glow surface. Reads as a marketing-y touch on what should be tabular data.
- **Fix**: Drop the `boxShadow` line entirely. The accent fill on its own is plenty. Pairs cleanly with #7's extraction.
- **Design call**: design — single-line removal, restraint matters on a 100-row table.

## What's working well (reference patterns to propagate)

1. **Cold-state graceful degrade** ([trending/page.tsx:87-111](../../../src/app/huggingface/trending/page.tsx#L87), datasets + spaces same shape) — when `allModels.length === 0`, the page still renders PageHead + tab strip and only the body switches to ColdState. User never lands on a blank surface. Pattern matches `/reddit/trending` cold handling.
2. **Card radii honor the spec** — `borderRadius: 2` on type chips, sdk chips, cold-state container. No `rounded-md`/`xl` drift.
3. **No card shadows** — momentum-bar glow notwithstanding (#19), the page is clean: no `shadow-lg`, no `hover:shadow-*` on rows.
4. **Functional accent-color signaling** — top-10 rank colored HF yellow ([trending/page.tsx:200](../../../src/app/huggingface/trending/page.tsx#L200)), high-download rows tinted ([L264](../../../src/app/huggingface/trending/page.tsx#L264)), 3+ underlying models on a Space tinted ([spaces/page.tsx:266](../../../src/app/huggingface/spaces/page.tsx#L266)). All are information color-keys, not decoration. Do not strip.
5. **Tab `border-l`-equivalent functional color-key** — `HfNavTabs.tsx` active state uses HF yellow for border + text + bg-tint. This IS the functional color-key the rules call out — keep, just push through `var(--v4-src-hf)` per #4.
6. **`force-static` + `revalidate = 1800`** — ISR cache aligns with the home `revalidate=1800`. Honest cache contract.
7. **`MarkVisited routeKey="hfModels|hfDatasets|hfSpaces"`** — three distinct routeKeys mean the sidebar "fresh count" indicator is per-surface. Good per-source granularity.
8. **`SourceFeedTemplate` consumer pattern** — all three pages follow the same shape (head + snapshot + tabBar + list). Template usage is consistent.

## Verify-in-context

- **HF cron cadence**: project memory says HF scrapers exist but doesn't pin the exact cadence; the inline `FRESH · 3H` label suggests scrapers run every 3h, which would mean a 12h budget (3h cadence × 2 grace × 2 cron-cadence = matches `npm`/`mcp`). Confirm against `.github/workflows/scrape-huggingface*.yml` before pinning the `SOURCE_STALE_MS["huggingface"]` value in #2.
- **`oldestRecordAt` stamping**: `freshness.ts:findOldestRecordAt` looks for `lastRefreshedAt` strings in nested objects. Verify `scripts/scrape-huggingface*.mjs` writes per-record `lastRefreshedAt` — if yes, thread it through the `refreshHfModelsFromStore()` → page hook so `FreshnessBadge` gets the strongest signal. If no, the page-level `fetchedAt` alone is acceptable but the COLD-force escape hatch (per-record floor at `staleAfterMs × 2`) won't fire.
- **`HfNavTabs` accessibility**: confirmed `aria-current="page"` is set correctly; `role="tablist"` is intentionally absent because these are route links, not in-page tabs (per #10).
- **MarkVisited route keys** (`hfModels`, `hfDatasets`, `hfSpaces`): grep`ed in sidebar-content; routeKey strings match. Confirms the 3-surface independence is plumbed through to the sidebar fresh-count badge.
- **`force-static` + the cold-state `<ColdState />`**: cold rendering inside a `force-static` page means the ISR snapshot can be cached cold. When the scraper recovers, the page won't re-render until the next 30-min revalidate window. Acceptable for HF cadence, but worth a comment so future operators don't think the cold state is sticky.
- **No `bg-black` violations** detected on any HF surface. Audit-rule clean here.
