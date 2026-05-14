# Impeccable audit — Trendingrepo punch list

Generated: 2026-05-13 from `_cli-baseline.json` (28 raw findings, version impeccable@2.1.8).

This file tracks the deterministic CLI anti-pattern findings. The LLM-driven audit (`/impeccable audit/critique/polish` per top-8 surface) is deferred until PRODUCT.md is seeded (impeccable skill requires it as a pre-flight gate) — see "Open follow-ups" at the bottom.

**Convention:** every line item is consent-gated. Nothing ships without operator green-light per [feedback_no_push_without_approval](C:\Users\mirko\.claude\projects\c--dev-trendingrepo\memory\feedback_no_push_without_approval.md).

---

## ⚠ Recalibration — 2026-05-13 (post-in-context-inspection)

The original triage below was generated from CLI output alone. After reading 4 of the 28 hits in context, the verdict changed materially. Keeping the original analysis below for institutional memory; **the recalibrated table is the working punch list.**

### What the in-context inspection found

- **`.repo-verdict` in [globals.css#L1499](c:/dev/trendingrepo/src/app/globals.css#L1499)** (originally P0): the 3px tab pairs with a `linear-gradient(90deg, var(--acc-soft), var(--bg-025) 26%)` and is a *designed* verdict-card affordance, not a bare AI-template tab. Used on [src/app/repo/[owner]/[name]/page.tsx](c:/dev/trendingrepo/src/app/repo/[owner]/[name]/page.tsx) (currently 500ing in prod per [project_repo_detail_500](C:\Users\mirko\.claude\projects\c--dev-trendingrepo\memory\project_repo_detail_500.md)) and 3 other files. **Verdict: not a fix. The CLI flagged a designed pair as an anti-pattern.**
- **`compare/CompareClient.tsx` + `compare/RepoBannerCard.tsx`** (originally P1, 5 hits): the `borderLeft: \`3px solid \${accent}\`` is a *dynamic per-repo accent stripe* that encodes WHICH repo each card represents. Removing it loses information. **Verdict: not a fix. Same color-keying pattern likely explains the other compare/* hits.**

### Recalibrated table

| Severity | Action | Count | Notes |
|---|---|---|---|
| **P0** | 0 fixes | 0 | Original P0 was a CLI false positive (designed gradient+border pair). |
| **P1** | 0 confirmed | 0–2 | NewsTopHeaderV3 symmetric 4px tabs + OG /top10 still need in-context inspection. Likely same per-source color-keying. |
| **P2** | **1 confirmed shippable** | 1 | [SubredditHeatMapCanvas L387](c:/dev/trendingrepo/src/components/reddit-trending/SubredditHeatMapCanvas.tsx#L387) — `bg-black` → `bg-bg-canvas` (1-char fix using existing project token `--color-bg-canvas: #08090a`). |
| **P2 (polish)** | 3 candidates | 3 | The 3 `layout-transition` items remain plausible polish fixes pending animation review. |
| **Verify-in-context** | needs design call | ~19 | The 17 side-tab + 2 auth `bg-black/30` panel hits — each is likely a functional accent (color-keying repos / sources / signals). Removing destroys information; redesigning is a design call, not a mechanical fix. |
| **Documented FP** | none | 5 | Modal/drawer scrims at `bg-black/60` — CLI doesn't parse Tailwind opacity. |

### Key lesson

**The CLI gives LOCATIONS TO INSPECT, not VERDICTS TO FIX.** Most "side-tab" hits in this codebase are functional color-keys, not decorative slop. The actually-valuable audit is context-aware (`/impeccable audit` LLM pass), blocked on PRODUCT.md seeding — see "Open follow-ups" below.

### What this turn ships

- **PR-A (NEW, single shippable fix from this turn):** `audit(impeccable): tint SubredditHeatMapCanvas (-1 finding, 1 file, 1 line)`. Branch `audit/imp-heatmap-tint`. Closes the only high-confidence finding.

That's the entire mechanical-fix surface from the CLI alone. Further fixes require either (a) LLM audit unblock to triage the 19 functional-accent hits, or (b) operator design call on the per-repo accent stripe pattern.

---

## Wave 2 — LLM audits on 5 surfaces (2026-05-13, branch `audit/imp-wave-2`)

PRODUCT.md + DESIGN.md unblocked impeccable's preflight gate (committed in wave-1). 5 parallel LLM audit agents ran the `/impeccable audit` methodology on the top user-facing surfaces and produced one report per surface:

- [funding-audit.md](./funding-audit.md) — 4 P0 / 6 P1 / 6 P2
- [page-audit.md](./page-audit.md) — `/` (home) — 5 P0 / 9 P1 / 8 P2
- [signals-audit.md](./signals-audit.md) — 4 P0 / 6 P1 / 5 P2
- [mcp-audit.md](./mcp-audit.md) — 1 P0 / 3 P1 / 5 P2
- [skills-audit.md](./skills-audit.md) — 2 P0 / 4 P1 / 4 P2

**Totals: 16 P0 / 28 P1 / 28 P2 = 72 findings across 5 surfaces.**

### Dominant cross-surface patterns

1. **Honest-chrome rule violations** (12+ sites): hardcoded `<span className="live">LIVE</span>` / `live-pip` / "FEED LIVE" green-pulse strings on `/signals` (×4 — and the page already computes `sourceVerdicts` via `classifyFreshness()` but doesn't thread them in!), `/` (×5), `/mcp` (.live-pip), `/skills` (.live-pip). Same defect, same fix shape.
2. **44×44 mobile tap-target failures**: tab strips and filter chips at 22-36px tall on `/skills` tabs, `/mcp` `.fchip` filters, `/funding` tabs, `/signals` `<details>` summary.
3. **Token drift on V4 surfaces**: undefined `--v4-up` token on `/mcp` hero (falls back to hardcoded green, breaks theme-switch); ad-hoc `borderRadius: 3` / `4` literals instead of `var(--radius-card)`.
4. **Inline-tab reimplementation**: `/skills` reinvents the V4 `<TabBar>` primitive in ~78 LOC inline.

### What wave-2 SHIPS (mechanical fixes — low risk, high certainty)

1. **`/mcp` P0** — `page.tsx` `var(--v4-up, #4ade80)` → `var(--v4-money)`. Theme-switch now works on every mover row.
2. **`/mcp` P1** — Delete `<span className="live-pip">live</span>` from `LiveMcpTable.tsx` (page already has real `<FreshnessBadge>` in PageHead; the pip was duplicate + dishonest).
3. **`/mcp` P1** — `globals.css` `.fchip` mobile tap target: add `@media (max-width: 640px) { min-height: 44px; padding: 10px 14px; }`. Desktop unchanged.
4. **`/mcp` P1** — `page.tsx` hero `borderRadius: 4` → `2`. Matches `--radius-card` rule.
5. **`/mcp` P2** — `page.tsx` mover-row `borderRadius: 3` → `2` and `padding: "8px 10px"` → `"12px 10px"` (closes the 36px tap-target finding on the hero anchors).
6. **`/skills` P0** — Delete `<span className="live-pip">live</span>` from `SkillsTopTable.tsx`. Same defect as `/mcp` #2.

### What wave-2 DEFERS to wave-3 (bigger surface, needs careful threading)

These fixes are clearly mechanical per the audit reports but touch more files / require careful prop threading, so they get their own PR for reviewer focus:

- **`/signals` 4-P0 cluster** — thread `sourceVerdicts` into `SourceFeedPanel`, `VolumeAreaChart`, `LiveClock`, `LiveTicker` (5 files). The audit has exact patches. Highest leverage in the audit: 4 P0s close from one pattern; data is already computed.
- **`/` (home) 5-P0 cluster** — replace 5 hardcoded "LIVE" / green-pulse strings (BubbleMap, LiveTopTable, page.tsx) with `<FreshnessBadge>`. `FreshnessBadge` is never imported by `/` today — the fix is a 5-site import + swap.
- **`/funding` 4 P0s** — confidence chip always green, "warming" sentinel, VerdictRibbon tone locked, MoverRow same-tab link. The audit has 8 mechanical patches + 4 design-call items.
- **`/skills` P1 cluster** — swap inline `ListTaxonomyTabs` (~78 LOC) for the canonical `<TabBar>` primitive. Closes 3 findings in one substitution but is a refactor.
- **`/` chart-toggle "fake tabs" P0** — 3 non-interactive `<span>` styled as tabs need real interactivity or removal.
- **`/` ConsensusRow data lie** — slice-by-array-order instead of actual firing sources.

### Cross-cutting follow-ups (not surface-specific)

- **Chart palette drift**: `globals.css` `--color-series-1..5` vs `tokens.ts` `SERIES_PALETTE` disagree on first series color (green vs orange). Pick one canonical order.
- **3 coexisting type scales**: `--text-*`, `--font-size-*`, `--font-size-title-*` overlap. Pick one canonical, mark others as backwards-compat.
- **V2/V3/V4 generation sweep**: audit which components are on which generation; plan migration.
- **Update `.claude/skills/starscreener-*` files**: align with current radii / fonts / shadow policy, or archive as historical intent — DESIGN.md is the new source of truth.

### CLI baseline progression

| Snapshot | Finding count | Delta | File |
|---|---|---|---|
| Baseline (pre-audit) | 28 | — | `_cli-baseline.json` |
| After wave 1 (heatmap tint) | 27 | -1 | `_cli-post-pr-a.json` |
| After wave 2 (LLM-driven fixes) | 27 | 0 | `_cli-post-wave-2.json` |

The CLI count stayed at 27 because wave-2 fixes target *LLM-flagged honest-chrome lies and tap-target failures*, not the regex anti-patterns the CLI scans for. The two are complementary: CLI catches CSS/JSX surface patterns (side-tabs, untinted blacks, layout transitions); LLM agents catch semantic / UX / a11y violations (lies in chrome, mobile reflow, data fakery, token drift). Both metrics matter; neither alone is sufficient.

The 1 remaining CLI finding (`globals.css:1499` `.repo-verdict`) is a designed gradient+border pair, not slop — see Recalibration section above.

---

## Triage summary

| Severity | Count | Anti-patterns |
|---|---|---|
| **P0** | 1 cluster (1 file, blast radius = global) | `side-tab` in `globals.css` |
| **P1** | 4 clusters (15 findings) | `side-tab` in `compare/`, `news/`, `og/top10`, `repo/` + `pure-black-white` in 2 auth pages |
| **P2** | 3 clusters (7 findings, mostly false positives) | scrim `bg-black/xx` overlays (5 FPs), 1 real opaque-black on a heatmap canvas, 3 `layout-transition` polish items |
| **FP** | 5 findings | modal/drawer scrims at `bg-black/60` — CLI regex doesn't parse Tailwind opacity modifiers |

**Net real findings after FP triage: ~22 across 3 anti-pattern classes.**

---

## P0 — global blast radius (1 cluster)

### P0-1 · `globals.css` side-tab — shared blocked-item style

- **File:** [src/app/globals.css#L1499](c:/dev/trendingrepo/src/app/globals.css#L1499)
- **Snippet:** `border-left: 3px solid var(--acc)`
- **Affects:** Every component using the `.blocked-item-block` class (imported by `layout.tsx`, so universally available).
- **Why P0:** Single edit propagates to every blocked-item card in the product. Highest leverage fix; lowest blast radius PR.
- **Fix strategy:** Replace 3px hard left-tab with a subtler treatment per impeccable's side-tab rule. Options: (a) drop the border, lean on background tint for the same visual cue; (b) reduce to `1px` + reduce-opacity accent; (c) move the accent to a small leading dot/chip. Default to (a) unless visual proof shows (a) loses the affordance.
- **Verify:** `npx impeccable detect src/app/globals.css` → 0 findings. Visual proof: side-by-side screenshots of a route that shows a blocked item (any sprint surface using the class). Confirm the affordance still reads.
- **PR size:** S (1 file, 1 line). Goes through type-check + lint + visual diff.

---

## P1 — visible polish gaps (4 clusters)

### P1-1 · `/compare` route — 10 side-tab borders across 4 components

- **Files:**
  - [src/components/compare/CompareClient.tsx](c:/dev/trendingrepo/src/components/compare/CompareClient.tsx) L616, L641, L704
  - [src/components/compare/CompareHeatmap.tsx](c:/dev/trendingrepo/src/components/compare/CompareHeatmap.tsx) L223, L246
  - [src/components/compare/RepoBannerCard.tsx](c:/dev/trendingrepo/src/components/compare/RepoBannerCard.tsx) L51, L74
  - [src/components/compare/RepoProfileColumn.tsx](c:/dev/trendingrepo/src/components/compare/RepoProfileColumn.tsx) L62, L82, L158
- **Snippet:** All 10 hits are `borderLeft: \`3px solid …\`` template literals.
- **Why P1:** `/compare` is a public surface. The 3px-left-tab is the most recognizable "AI-slop" tell per impeccable. 10 hits in one route reads as a template, not design.
- **Fix strategy:** Replace the `borderLeft` accent with a leading 6×6 colored dot or a 2-px underline-on-hover. Whichever option `/impeccable polish` recommends becomes the canonical replacement. Reuse `--acc-*` tokens from [src/lib/charts/theme/](c:/dev/trendingrepo/src/lib/charts/theme/) so the accent color stays consistent with chart palette.
- **Verify:** `npx impeccable detect src/components/compare/` → 0 findings. Dev-server screenshot of `/compare` before/after (page works on 1280px desktop and 375px mobile per STARSCREENER mobile-UX skill).
- **PR size:** M (4 files, ~10 line-level edits, one shared style helper if patterns are identical).

### P1-2 · OG card template — `/api/og/top10/route.tsx`

- **File:** [src/app/api/og/top10/route.tsx#L494](c:/dev/trendingrepo/src/app/api/og/top10/route.tsx#L494)
- **Snippet:** `borderLeft: \`3px solid …\`` inside an OG image template
- **Why P1:** Affects every Twitter / OG share card preview for `/top10`. Public-facing impression in third-party feeds.
- **Fix strategy:** Same pattern replacement as P1-1, applied in the OG template (no shared CSS — these run in Satori, inline styles only). Pick a treatment that survives Satori's CSS subset.
- **Verify:** `npx impeccable detect src/app/api/og/top10/route.tsx` → 0 findings. Visual proof: render the OG endpoint locally (`curl http://localhost:3023/api/og/top10`) and diff the PNG.
- **PR size:** S.

### P1-3 · `NewsTopHeaderV3` — symmetric side-tabs

- **File:** [src/components/news/NewsTopHeaderV3.tsx](c:/dev/trendingrepo/src/components/news/NewsTopHeaderV3.tsx) L645 (`borderLeft: "4px solid …"`), L646 (`borderRight: "4px solid …"`)
- **Why P1:** Hero/news header component. The symmetric 4px treatment on both sides is even more "AI-slop" than the single side-tab.
- **Fix strategy:** Replace with a single bottom-border underline or remove entirely; lean on existing typography weight + spacing for hierarchy.
- **Verify:** `detect` clean on file; screenshot diff on any route rendering the V3 header.
- **PR size:** S.

### P1-4 · Auth pages — `bg-black/30` panels

- **Files:**
  - [src/app/sign-in/[[...sign-in]]/page.tsx#L43](c:/dev/trendingrepo/src/app/sign-in/[[...sign-in]]/page.tsx#L43)
  - [src/app/sign-up/[[...sign-up]]/page.tsx#L49](c:/dev/trendingrepo/src/app/sign-up/[[...sign-up]]/page.tsx#L49)
- **Snippet:** `bg-black/30 p-6 …`
- **Why P1:** Every signed-out user hits one of these surfaces. CLI flags `bg-black` substring — the actual usage is a translucent panel, not pure black. Still worth re-tinting toward the brand hue so the panel reads as "dark brand" not "untinted overlay."
- **Fix strategy:** Replace `bg-black/30` with a tinted dark token (e.g., `bg-[oklch(15%_0.01_250)]/30`) using existing globals.css variables if any match, otherwise pick the closest STARSCREENER dark token.
- **Verify:** Visual proof of both auth surfaces at 375px and 1280px. Confirm contrast still meets WCAG AA for the inner content.
- **PR size:** S.

---

## P2 — drift / polish (3 clusters)

### P2-1 · `side-tab` long-tail (4 files, 4 hits)

- [src/components/reddit-trending/trending-helpers.ts](c:/dev/trendingrepo/src/components/reddit-trending/trending-helpers.ts) L33, L66 (`border-l-4` class — Tailwind utility, not CSS-in-JS)
- [src/components/repo/WhyBadge.tsx#L64](c:/dev/trendingrepo/src/components/repo/WhyBadge.tsx#L64) (`borderLeft: \`3px solid …\``)
- **Why P2:** Lower visibility than `/compare` cluster but same anti-pattern. Roll up with P1-1 fix to share the replacement helper.
- **Fix strategy:** Same as P1-1.
- **PR size:** S (folded into P1-1's helper).

### P2-2 · Truly-opaque `bg-black` (1 real finding)

- [src/components/reddit-trending/SubredditHeatMapCanvas.tsx#L387](c:/dev/trendingrepo/src/components/reddit-trending/SubredditHeatMapCanvas.tsx#L387)
- **Snippet:** `className="relative w-full bg-black rounded-md overflow-hidden …"`
- **Why P2:** Full opaque black wrapping a heatmap canvas. Per impeccable rule, tint toward brand hue.
- **Fix strategy:** Swap `bg-black` for the canvas dark token; verify heatmap data still reads against the new background.
- **PR size:** S.

### P2-3 · `layout-transition` (3 hits, accept-or-fix)

- [src/components/layout/sidebar-nav.css](c:/dev/trendingrepo/src/components/layout/sidebar-nav.css) L9 (`transition: padding`), L101 (`transition: padding, height`)
- [src/components/reddit-trending/TopicMindshareCanvas.tsx#L149](c:/dev/trendingrepo/src/components/reddit-trending/TopicMindshareCanvas.tsx#L149) (`transition: width`)
- **Why P2:** Impeccable flags layout-property transitions (`padding`, `width`, `height`) because they trigger layout-reflow on every frame and feel janky vs `transform` + `opacity`. The sidebar collapse anim is a common offender.
- **Fix strategy:** Where possible, swap to `transform: translateX()` or `clip-path` for the sidebar; for the `transition: width` on a canvas, evaluate whether the canvas can use `scaleX` instead.
- **Verify:** Lighthouse CLS metric on the affected surfaces before/after; visual proof of the animation.
- **PR size:** M (touches animation behavior, needs careful visual review).

### P2-4 · Acceptable scrim-style `bg-black/xx` (5 false positives — documented, not actioned)

These are flagged by the CLI but represent intentional, standard modal/drawer/popover scrim patterns. Documented here so the next baseline diff doesn't re-surface them as "new findings":

- [src/components/layout/MobileDrawer.tsx#L85](c:/dev/trendingrepo/src/components/layout/MobileDrawer.tsx#L85) — `bg-black/60` mobile drawer scrim
- [src/components/ui/ConfirmDialog.tsx#L100](c:/dev/trendingrepo/src/components/ui/ConfirmDialog.tsx#L100) — `backdrop:bg-black/60` dialog backdrop
- [src/app/you/alerts/_components/AddAlertRuleDialog.tsx#L365](c:/dev/trendingrepo/src/app/you/alerts/_components/AddAlertRuleDialog.tsx#L365) — `backdrop:bg-black/60` dialog backdrop
- [src/components/tier-list/MobileTierPicker.tsx#L117](c:/dev/trendingrepo/src/components/tier-list/MobileTierPicker.tsx#L117) — `bg-black/60` tier-picker scrim
- [src/components/reddit/ContentTagChips.tsx#L270](c:/dev/trendingrepo/src/components/reddit/ContentTagChips.tsx#L270) — `bg-black/25` chip-state background (borderline; acceptable until a clearer dark-token replacement is chosen)

**Recommendation:** If impeccable ships a CLI flag to ignore Tailwind opacity modifiers in future versions, drop this list. Until then, the 5 entries are the project's permanent waiver.

---

## Suggested PR sequencing

Each PR is independent, mergeable in isolation, and verified by re-running `npx impeccable detect <path>` plus a screenshot:

1. **PR-A (P0):** `audit(impeccable): drop globals.css blocked-item side-tab (-1 finding)` — 1 file, S.
2. **PR-B (P1-1 + P2-1):** `audit(impeccable): replace borderLeft accents in compare/, news/, repo/, reddit-trending/ (-14 findings)` — 7 files, M. Introduces a shared dot/underline helper.
3. **PR-C (P1-2):** `audit(impeccable): retint OG /top10 card (-1 finding)` — 1 file, S. OG image visual diff in PR description.
4. **PR-D (P1-4):** `audit(impeccable): tint sign-in / sign-up panels (-2 findings)` — 2 files, S.
5. **PR-E (P2-2):** `audit(impeccable): tint SubredditHeatMapCanvas background (-1 finding)` — 1 file, S.
6. **PR-F (P2-3):** `audit(impeccable): swap layout-property transitions for transform on sidebar + topic mindshare (-3 findings)` — 2 files, M, needs animation review.

**After PR-A through PR-F land**, total findings drop from 28 → 5 (the documented false positives in P2-4). The 5 false positives stay until impeccable's regex understands Tailwind opacity modifiers.

---

## Open follow-ups (not actioned yet)

### LLM-driven audit (Phase 4 of plan)

Blocked on PRODUCT.md gate. Impeccable's SKILL.md says any `/impeccable audit/critique/polish` requires PRODUCT.md (>200 chars, no `[TODO]` markers) at project root, falling back to `.agents/context/` or `docs/`. Currently Trendingrepo has CLAUDE.md, docs/OPERATOR.md, docs/ENGINE.md — rich content, but not in the format impeccable expects.

**Three options to unblock:**
1. Run `/impeccable teach` interactively — the skill will prompt for product context and write PRODUCT.md + DESIGN.md.
2. Hand-write a minimal PRODUCT.md by extracting from CLAUDE.md / docs/OPERATOR.md (faster, but bypasses the skill's intended workflow).
3. Skip LLM audit entirely — the CLI findings above are the high-confidence, immediately-shippable surface; LLM audit catches qualitative issues (hierarchy, copy, density) that operator can evaluate ad-hoc when polishing a specific surface.

Operator pick determines whether Phase 4 (24 audit reports) happens.

### Top-8 surface shards

All 8 surfaces (`/`, `/signals`, `/skills`, `/mcp`, `/repo/[slug]`, `/funding`, `/twitter`, `/admin/*`) return **0 deterministic findings** at the route level. Anti-patterns live in shared components that those routes import. The LLM audit pass would still be valuable on these surfaces for hierarchy/copy/density review — but that's option-1/2 above.

---

## Re-baselining after each PR

After each PR lands on main (post-operator-consent push):

```bash
npx impeccable detect src/ --json 2> docs/audits/impeccable/_cli-current.json
diff <(jq length docs/audits/impeccable/_cli-baseline.json) <(jq length docs/audits/impeccable/_cli-current.json)
```

Expectation: total count monotonically decreases until it stabilizes at 5 (the documented false positives).
