## /collections audit — 2026-05-13

Focus: the collections index (`/collections`) plus the slug detail (`/collections/[slug]`) it links into. Curated AI-repo lists ranked live against the trending index, attributed to OSS Insight (Apache 2.0).

## Files audited

- [src/app/collections/page.tsx](../../../src/app/collections/page.tsx) — index
- [src/app/collections/[slug]/page.tsx](../../../src/app/collections/[slug]/page.tsx) — slug detail (V4 ProfileTemplate)
- [src/app/collections/layout.tsx](../../../src/app/collections/layout.tsx) — imports `compare.css` + `categories.css`
- [src/app/collections/loading.tsx](../../../src/app/collections/loading.tsx) — skeleton
- [src/app/collections/error.tsx](../../../src/app/collections/error.tsx) — error boundary
- [src/lib/collections.ts](../../../src/lib/collections.ts) — `formatFreshness`, `summarizeCollection`
- [src/components/categories/categories.css](../../../src/components/categories/categories.css) — `.collection-card`, `.collection-freshness`, `.collection-foot`
- [src/app/globals.css](../../../src/app/globals.css) — `.page-head .clock .live`, `.panel-head .right .live`, `.tool`
- [src/components/ui/v4.css](../../../src/components/ui/v4.css) — `.v4-collection-activity`, `.v4-collection-rail-list`

## P0 findings (honest-chrome + canonical-badge)

- **[P0] Hardcoded green-pulse `<span className="live">` violates honest-chrome rule (2 sites on index)** — [page.tsx:83](../../../src/app/collections/page.tsx#L83) renders `<span className="live">collections live</span>` inside `.page-head .clock`; [page.tsx:92](../../../src/app/collections/page.tsx#L92) renders `<span className="live">Updated {freshness}</span>` inside `.panel-head .right`. Both inherit the `.live` style at [globals.css:1657-1673](../../../src/app/globals.css#L1657) / [globals.css:4134-4150](../../../src/app/globals.css#L4134) which sets `color: var(--sig-green)` plus a 5–6px green ::before dot with `box-shadow: var(--shadow-live)`. The pulse fires unconditionally — when `getCollectionRankingsFetchedAt()` returns null, `formatFreshness` returns "never" and the page literally renders "Updated never" with a green-pulse halo. This is the exact pattern memory `feedback_freshness_chrome_must_be_honest` flags: bypassing `<FreshnessBadge>` / `classifyFreshness()` and inlining a hardcoded LIVE/green-pulse. **Mechanical fix.**

- **[P0] Page never renders the canonical `<FreshnessBadge>`** — [page.tsx](../../../src/app/collections/page.tsx) imports `formatFreshness` from `@/lib/collections` but never imports `FreshnessBadge` from `@/components/shared/FreshnessBadge`. Every other audited surface (`/mcp`, `/skills`, `/news`) wires the badge next to the page-head clock so the verdict (`fresh`/`stale`/`cold`) routes through one classifier. Without it, /collections is the only top-level data surface whose freshness has no machine-classified verdict — a user can't tell 1h-fresh from 7d-stale rankings. Fix: import `FreshnessBadge`, add `<FreshnessBadge source="<closest enum>" lastUpdatedAt={collectionRankingsFetchedAt} />` next to the clock, and delete the `.live` chrome around `formatFreshness`. **Mechanical fix once a `NewsSource` enum value is picked.**

## P1 findings (mobile + radius drift on the slug detail)

- **[P1] `.v4-collection-rail-list__link` fails 44×44 mobile tap target** — [v4.css:2711-2721](../../../src/components/ui/v4.css#L2711). Padding `8px 12px` + 11px font ≈ 27px tall. The right-rail "Related collections" list is a primary cross-nav (each row links to another collection), and it's well below the 375px minimum height rule. Fix: `padding: 12px 14px; min-height: 44px;` (matches the `/mcp` `.fchip` fix shape from wave-2).

- **[P1] Card radius drift on the [slug] detail — 4px tiles inside a 2px-card system** — [[slug]/page.tsx:446](../../../src/app/collections/[slug]/page.tsx#L446) inline `borderRadius: 4` on the identity-strip 2-letter tile; [v4.css:2620](../../../src/components/ui/v4.css#L2620), [v4.css:2661](../../../src/components/ui/v4.css#L2661), [v4.css:2702](../../../src/components/ui/v4.css#L2702) all set `border-radius: 4px` on the activity feed, rail card, and rail list. DESIGN.md cards = 2px (`--radius-card: 0.125rem`). Topic chips on the same component correctly use `borderRadius: 2` at [[slug]/page.tsx:501](../../../src/app/collections/[slug]/page.tsx#L501) — so the inconsistency is visible within a single eyeful. Fix: swap all four hits to `2px` / `var(--radius-card)`. **Mechanical.**

- **[P1] Loading skeleton diverges from the rendered grid** — [loading.tsx:21](../../../src/app/collections/loading.tsx#L21) renders `grid-cols-1 sm:grid-cols-2 md:grid-cols-3` with 9 cards. The real `.collections-grid` is `repeat(3, ...)` ≥1100px, `repeat(2, ...)` 640–1100px, `1fr` <640px ([categories.css:108-119](../../../src/components/categories/categories.css#L108)) — so at the 768–1099px window the skeleton shows 3 columns while the real page shows 2, producing a visible layout jolt on hand-off. Also 9 cards understates the 28 collections currently shipping. Fix: align breakpoints (`md:grid-cols-2 xl:grid-cols-3`), bump skeleton to 12 cards. **Mechanical.**

## P2 findings (motion, empty-state copy, attribution position)

- **[P2] `.tool:hover` has no transition — border-color snaps instantly** — [globals.css:3588-3590](../../../src/app/globals.css#L3588). Card hover swaps `--line-200` → `--line-400` with no `transition: border-color 150ms ease`. DESIGN.md wants 120–180ms non-bouncy on hover. Affects every `/collections` card + every other `.tool` consumer in the app. Single-property fix on `.tool`. **Mechanical.**

- **[P2] Empty-state copy leaks implementation detail (mirrors /mcp wave-2 finding)** — [page.tsx:103](../../../src/app/collections/page.tsx#L103) reads `"Collections are curated via data/collections/*.yml."` This is a build-time invariant the user never sees (28 YAMLs ship in the repo), and surfaces a filesystem path. Same anti-pattern wave-2 caught on `/mcp` ("the cron writes to Redis at 03:30 UTC..."). Fix: either delete the section entirely (unreachable in practice) or rewrite as user-facing copy: `"// no collections yet · check back soon"`. **Design call** — operator may want to keep the path for transparency.

- **[P2] Index has no sort or filter for 28 collections** — [page.tsx:106-130](../../../src/app/collections/page.tsx#L106). Cards render alphabetically by slug; no chip to filter by `moving > 0`, no sort by `live` count, no search. With 28 cards at 178px min-height that's a 1900px+ scroll on mobile. Collections with breakouts get buried below `agent-skills.yml`. Lowest-effort fix: a single "MOVING NOW" toggle chip above the grid using the existing `.live-top-filters .fchip` primitive (already in `globals.css`). **Design call.**

- **[P2] Curator attribution buried in the footer** — [page.tsx:132-142](../../../src/app/collections/page.tsx#L132). Every card represents OSS Insight curation, but the attribution sits 1900px below the grid in a footer the user almost certainly never reaches. The [slug] page handles this correctly with `CURATOR_NAME` in the identity strip + the right-rail About card. Fix: hoist a one-line attribution into `.page-head` ("Curated by OSS Insight") or into the `.collection-freshness` panel-head. **Design call.**

- **[P2] Clock "X collections live" overloads "live"** — [page.tsx:81-84](../../../src/app/collections/page.tsx#L81). The count is correct, but pairing the number with the word "live" + green pulse implies real-time data. Collections are static YAMLs; only the rankings refresh. Copy nit: "X total" or "X curated lists" with the data-freshness verdict moved to the (canonical) `<FreshnessBadge>`. Bundled with the P0 honest-chrome fix.

- **[P2] `compare-empty-state` reused for collections index empty-state — wrong domain class** — [page.tsx:99](../../../src/app/collections/page.tsx#L99). The CSS lives under `.compare-*` and is imported via `compare.css` in the layout. The class name is misleading and any future `/compare` change accidentally affects `/collections`. Move the empty-state to a `.collections-empty-state` selector or use a shared `.empty-state` primitive. **Mechanical refactor.**

## What's working well — keep

- **Cards uphold the 2px-radius / no-shadow contract on the index.** `.tool` uses border-only (`var(--line-200)`), `.collection-card` adds a 2px top border without per-card color-keys — no side-tab AI-slop. ([categories.css:13](../../../src/components/categories/categories.css#L13))
- **Honest stub-data discipline.** `summarizeCollection` only counts repos with `movementStatus` set; `liveCountFor` only counts items present in the live index. No fabricated "moving now" counts on quiet collections. ([collections.ts:204-226](../../../src/lib/collections.ts#L204))
- **Mobile reflow is clean.** Grid steps 3→2→1 at 1100/640. Page-head stacks at 767. No horizontal-scroll risk at 375px.
- **Error boundary uses canonical V4 tokens + Sentry capture** ([error.tsx](../../../src/app/collections/error.tsx)).
- **Detail page wires the `RelatedRepoCard` shared primitive + V4 `ProfileTemplate`** — the [slug] avoids ad-hoc layouts.

## Verify-in-context

Before shipping fixes:
- `npm run dev` → load `http://localhost:3023/collections` at 375px and 1440px.
- Wipe `collectionRankingsFetchedAt` (set Redis key to null OR cold-boot): confirm the page does NOT render "Updated never" with a green pulse — should render the COLD verdict via `<FreshnessBadge>`.
- Tab through the `.collection-card` grid → confirm focus ring; hover one → confirm transition is 120–180ms.
- Open a slug page at 375px → confirm `.v4-collection-rail-list__link` is ≥44px tap target.

## Mechanical fixes ready to ship

1. **P0** [page.tsx:81-95](../../../src/app/collections/page.tsx#L81) — replace both `<span className="live">…</span>` blocks with a single `<FreshnessBadge>` next to the clock; reword "collections live" → "total".
2. **P1** [v4.css:2716](../../../src/components/ui/v4.css#L2716) — `padding: 8px 12px` → `padding: 12px 14px; min-height: 44px;` on `.v4-collection-rail-list__link`.
3. **P1** [[slug]/page.tsx:446](../../../src/app/collections/[slug]/page.tsx#L446), [v4.css:2620](../../../src/components/ui/v4.css#L2620), [v4.css:2661](../../../src/components/ui/v4.css#L2661), [v4.css:2702](../../../src/components/ui/v4.css#L2702) — `border-radius: 4px` → `2px` (or `var(--radius-card)` where available).
4. **P1** [loading.tsx:21](../../../src/app/collections/loading.tsx#L21) — `sm:grid-cols-2 md:grid-cols-3` → `md:grid-cols-2 xl:grid-cols-3`; bump skeleton from 9 → 12 cards.
5. **P2** [globals.css:3588](../../../src/app/globals.css#L3588) — add `transition: border-color 150ms ease;` to `.tool`.
6. **P2** [page.tsx:99-104](../../../src/app/collections/page.tsx#L99) + sibling CSS — rename `.compare-empty-state` usage to a `.collections-empty-state` or shared `.empty-state` primitive; rewrite copy.

## Quick-fix patches

### P0 — kill green-pulse, wire canonical badge

```diff
- import { Layers } from "lucide-react";
+ import { Layers } from "lucide-react";
+ import { FreshnessBadge } from "@/components/shared/FreshnessBadge";

  <div className="clock">
    <span className="big">{cards.length}</span>
-   <span className="live">collections live</span>
+   <span>total</span>
+   <FreshnessBadge source="mcp" lastUpdatedAt={collectionRankingsFetchedAt} />
  </div>

- {freshness && (
-   <section className="panel collection-freshness">
-     <div className="panel-head">
-       <span className="key">{"// COLLECTION RANKINGS"}</span>
-       <span className="right">
-         <span className="live">Updated {freshness}</span>
-       </span>
-     </div>
-   </section>
- )}
```

(The panel-head block becomes redundant once the badge ships next to the clock. If keeping for visual rhythm, drop the `.live` className on the `<span>`.)

### P1 — tap-target on rail list

```diff
  .v4-collection-rail-list__link {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
-   padding: 8px 12px;
+   padding: 12px 14px;
+   min-height: 44px;
```

### P2 — hover transition on `.tool`

```diff
  .tool {
    position: relative;
    ...
    padding: 14px;
    color: inherit;
    text-decoration: none;
+   transition: border-color 150ms ease;
  }
```

---

**Surface verdict:** /collections is structurally honest — the data layer, summarization, and stub handling all respect the project's no-fabrication rule. The chrome lies. Two `<span className="live">` strings turn the page-head into a perpetual green-pulse regardless of rankings age, and the canonical `<FreshnessBadge>` is missing. Fix those two clusters and the surface is shippable.
