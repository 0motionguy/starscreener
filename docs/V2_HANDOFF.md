# V2 design migration — handover prompt

You are taking over a multi-session V2 design migration on
`0motionguy/starscreener` (Next.js 15 + React 19 + Tailwind 4 + TypeScript
5 strict). The repo lives at `c:\Users\mirko\OneDrive\Desktop\STARSCREENER`
and ships to `https://trendingrepo.com` (Vercel main = production).

Read the **whole** prompt before touching anything. The owner
(Mirko) has zero patience for sessions that ship shallow work, copy-paste
demo content, or break production. Five sessions failed before this
handover existed; the survivors got here by reading carefully and
shipping surgical diffs.

---

## What V2 IS

V2 is a **design system, not a page set.** It's a Node/01 × Linear
fusion of:

- Dark canvas `#08090a` (Linear marketing black)
- Surface ramp `--v2-bg-000..300` and ink ramp `--v2-ink-000..500`
- Hairline ladder `--v2-line-soft / std / 100..400`
- Liquid Lava accent `#f56e0f` reserved for the **focused object only**
  (active tab, top idea card, top repo card, focused stat)
- Geist + Geist Mono with Linear-style 510 weight + aggressive negative
  letter-spacing (`-0.022em` on h1, `-0.035em` on display)
- Sharp 2px corners everywhere (no pill/rounded-full except live dots)
- **No drop shadows on dark** — luminance stacking only
- Operator vocabulary: `// 01 · LABEL`, terminal-bar headers
  (`// REPOS · LIVE · N ROWS`), bracket-marker selection (`.v2-bracket`),
  ASCII texture interstitials, barcode tickers, spider-node SVGs

The token block + utility classes live in [src/app/globals.css](src/app/globals.css).
The primitives live in [src/components/v2/](src/components/v2/) (TerminalBar,
BracketMarkers, MonoLabel, BarcodeTicker, SpiderNode, AsciiInterstitial,
plus the user's additions: ConfidenceGauge, ConvictionBar, ForecastSparkline,
LivePulse, ReactionBar, StatPill, VelocitySpark).

A new V3 namespace exists at [src/components/v3/](src/components/v3/) —
DesignSystemProvider, SystemMark, AccentPicker, SystemBarcode, CursorRail,
applyTheme, themes — adds runtime accent-theme switching. Don't edit V3
unless asked; the user actively iterates on it.

## What's already done (do not redo)

**Tokens + chrome:** globals.css has the full V2 token block. The V1
token VALUES (`--color-bg-primary`, `--color-text-*`, etc.) were
reskinned to V2 colors so existing V1 components inherit V2 paint
without per-component edits. `--shadow-card` is `none`. All `--radius-*`
flattened to `0.125rem` (2px). Geist + Geist Mono load globally in
[src/app/layout.tsx](src/app/layout.tsx) alongside Inter/JetBrains/Space
Grotesk fallbacks.

**Header / Sidebar / Mobile chrome / Footer:** fully V2.
[Header.tsx](src/components/layout/Header.tsx) uses an inline ascending-bars
BrandMark with `--v2-acc-glow`, mono `TRENDING REPO` wordmark (REPO in
`--v2-acc`), `// NODE/01 · TREND MAP FOR OPEN SOURCE` micro-line.
[Sidebar.tsx](src/components/layout/Sidebar.tsx),
[SidebarContent.tsx](src/components/layout/SidebarContent.tsx),
[SidebarCategoryItem.tsx](src/components/layout/SidebarCategoryItem.tsx),
[SidebarFooter.tsx](src/components/layout/SidebarFooter.tsx) use
`.v2-bracket` on active items, mono section labels, V3 SystemMark +
AccentPicker + SystemBarcode in the footer.
[MobileNav.tsx](src/components/layout/MobileNav.tsx) +
[MobileDrawer.tsx](src/components/layout/MobileDrawer.tsx) +
[HamburgerButton.tsx](src/components/layout/HamburgerButton.tsx) all
fully V2.

**Terminal table:** [Terminal.tsx](src/components/terminal/Terminal.tsx),
[TerminalRow.tsx](src/components/terminal/TerminalRow.tsx),
[TerminalHeader.tsx](src/components/terminal/TerminalHeader.tsx),
[TerminalCell.tsx](src/components/terminal/TerminalCell.tsx),
[columns.ts](src/components/terminal/columns.ts),
[FilterBar.tsx](src/components/terminal/FilterBar.tsx),
[TabBar.tsx](src/components/terminal/TabBar.tsx),
[TimeRangePills.tsx](src/components/terminal/TimeRangePills.tsx),
[ViewControls.tsx](src/components/terminal/ViewControls.tsx),
[StatsBarClient.tsx](src/components/terminal/StatsBarClient.tsx) —
all V2.

**BubbleMap (Signal Radar):**
[BubbleMap.tsx](src/components/terminal/BubbleMap.tsx) +
[BubbleMapCanvas.tsx](src/components/terminal/BubbleMapCanvas.tsx) — V2
card with terminal-bar, dot-field grid, V2 bubble palette. Verlet
engine + ResizeObserver + ErrorBoundary intact byte-for-byte.

**Home page:** [src/app/page.tsx](src/app/page.tsx) — operator eyebrow,
spider-node accent (lg+), BarcodeTicker under hero, terminal-bar over
BubbleMap, AsciiInterstitial divider, V2 sign-off footer, FAQ section
gets `// 02 · FAQ` MonoLabel. Plus
[MomentumHeadline.tsx](src/components/home/MomentumHeadline.tsx),
[HomeCtaRow.tsx](src/components/home/HomeCtaRow.tsx),
[HomeEmptyState.tsx](src/components/home/HomeEmptyState.tsx),
[CrossSourceBuzz.tsx](src/components/home/CrossSourceBuzz.tsx).

**Repo detail page** (`/repo/[owner]/[name]`): every panel V2.
[RepoDetailHeader.tsx](src/components/repo-detail/RepoDetailHeader.tsx) (with
`.v2-bracket` on the cross-signal score),
[RepoActionRow.tsx](src/components/repo-detail/RepoActionRow.tsx) (`.v2-btn`
primary/ghost), [RepoSignalSnapshot.tsx](src/components/repo-detail/RepoSignalSnapshot.tsx)
(5-up with mono operator eyebrows),
[RepoDetailStatsStrip.tsx](src/components/repo-detail/RepoDetailStatsStrip.tsx) (sig-green/red),
[RepoDetailStats.tsx](src/components/repo-detail/RepoDetailStats.tsx),
[RepoDetailChart.tsx](src/components/repo-detail/RepoDetailChart.tsx),
[RepoRevenuePanel.tsx](src/components/repo-detail/RepoRevenuePanel.tsx),
[CrossSignalBreakdown.tsx](src/components/repo-detail/CrossSignalBreakdown.tsx),
[WhyTrending.tsx](src/components/repo-detail/WhyTrending.tsx),
[FundingPanel.tsx](src/components/repo-detail/FundingPanel.tsx),
[PredictionSnapshot.tsx](src/components/repo-detail/PredictionSnapshot.tsx),
[RelatedReposPanel.tsx](src/components/repo-detail/RelatedReposPanel.tsx),
[NpmAdoptionPanel.tsx](src/components/repo-detail/NpmAdoptionPanel.tsx),
[MaintainerCard.tsx](src/components/repo-detail/MaintainerCard.tsx),
[RecentMentionsFeed.tsx](src/components/repo-detail/RecentMentionsFeed.tsx),
[TwitterSignalPanel.tsx](src/components/twitter/TwitterSignalPanel.tsx),
[ProjectSurfaceMap.tsx](src/components/repo-detail/ProjectSurfaceMap.tsx)
(header chrome only — see TODO 1.3).

**Forms:** [AdminLoginForm.tsx](src/components/admin/AdminLoginForm.tsx)
(full V2 chrome), [IdeaComposer.tsx](src/components/ideas/IdeaComposer.tsx),
[DropRepoPage.tsx](src/components/submissions/DropRepoPage.tsx),
[DropRevenuePage.tsx](src/components/submissions/DropRevenuePage.tsx) —
all use `.v2-btn-primary` and V2 input styling.

**Pages reskinned:** /, /twitter, /reddit, /funding, /ideas, /admin/login,
/repo/[owner]/[name], /search, /watchlist, /signals, /predict, /pricing,
/news, /portal/docs, /you, /breakouts, /compare, /error, /ideas/[id],
/u/[handle], /admin (header), /reddit/trending, /demo, /signals.

**ObjectReactions:** [ObjectReactions.tsx](src/components/reactions/ObjectReactions.tsx)
uses `.v2-btn` primary/ghost.

**Bonus fixes already shipped:**

1. **Vercel runtime fix** (commit `403b0b4`): removed `./.next/**/*`
   from `outputFileTracingExcludes` in
   [next.config.ts](next.config.ts). That exclude was killing every
   dynamic route's chunk graph from the lambda manifest, causing 500s
   on every dynamic route since `290a502`. **Never re-add that line.**
   Comment in next.config.ts explains why.

2. **Turbopack `dns` fix** (commit `54ace61`): added
   `serverExternalPackages: ['ioredis', '@upstash/redis']` to
   next.config.ts + a `turbopack.resolveAlias` block for fs/dns/net/etc.
   pointing to [src/lib/empty-module.js](src/lib/empty-module.js).

3. **Data-store dynamic-import sweep** (commit `9879274`): all 20 lib
   files (`trending`, `lobsters`, `funding-news`, `revenue-*`, `repo-*`,
   `reddit-*`, `recent-repos`, `npm`, `lobsters-trending`,
   `hot-collections`, `*-trending`, `collection-rankings`,
   `aiso-persist`, `bluesky`, `devto`, `hackernews`, `producthunt`)
   now `await import("./data-store")` inside their async refresh
   helpers. Static-importing `getDataStore` pulls ioredis into client
   bundles via any client-component → lib chain. Idempotent transform
   in [scripts/defer-data-store-imports.mjs](scripts/defer-data-store-imports.mjs)
   keeps it that way.

4. **Bulk V1 chrome sweep** at
   [scripts/sweep-v1-chrome.mjs](scripts/sweep-v1-chrome.mjs) — walks
   all `.tsx` / `.ts` files in src/ and rewrites
   `rounded-card border border-border-primary bg-bg-card [shadow-card]`
   (any ordering) to `v2-card`. Run any time new V1 chrome lands:

   ```bash
   node scripts/sweep-v1-chrome.mjs
   ```

   Idempotent — running twice is a no-op.

---

## Critical conventions you must follow

1. **Production page logic is sacred.** Every reskin keeps the V1 page's
   props, exports, data fetching, route logic, accessibility (ARIA,
   keyboard, focus), virtualization, and component contract EXACTLY.
   Only `className`, JSX structure, and inline styles change.

2. **No copy-paste from the demo.** The original V2 demo lived under
   `src/components/today-v2/` and was deleted. If you need to reference
   what the demo had, use `git show e4e49a3:src/components/today-v2/<file>`
   to read it. Never restore those files into the working tree.

3. **Data reads MUST go through the data-store.** Every per-source lib
   file follows the pattern:

   ```ts
   export async function refreshXxxFromStore() {
     const { getDataStore } = await import("./data-store");
     const result = await getDataStore().read<T>("xxx-key");
     // ...
   }
   ```

   The async dynamic import keeps client bundles ioredis-free. New lib
   files MUST follow this pattern — never re-introduce a static
   `import { getDataStore } from "./data-store"`.

4. **Use existing V2 tokens + utilities only.** Don't invent new
   `--v2-*` tokens. The full set is documented in globals.css. Utility
   classes already cover most surfaces: `.v2-card`, `.v2-frame`,
   `.v2-btn`, `.v2-btn-primary`, `.v2-btn-ghost`, `.v2-tag`, `.v2-stat`,
   `.v2-row`, `.v2-bracket`, `.v2-term-bar`, `.v2-mono`,
   `.v2-mono-tight`, `.v2-display`, `.v2-h1`, `.v2-h2`, `.v2-live-dot`,
   `.v2-ascii`.

5. **Vercel main = production.** Push to main, deploy is automatic.
   Verify on `https://trendingrepo.com` (apex). Use cache-bust query
   params (`?_=$(date +%s)`) for cache-busted requests.

6. **The user's parallel agents push frequently.** Always
   `git pull --rebase --autostash origin main` before pushing. Never
   `git push --force` to main.

7. **No `.next/**/*` in `outputFileTracingExcludes`.** It strips chunk
   graphs and breaks every dynamic route. Comment in next.config.ts
   explains.

---

## TODO — categorized action list

### 1. Visual polish — V1 remnants

These render V2-tinted (token reskin handles colors) but still use V1
class names. Consistency-only — but the Buy/Invest gate modal, status
chips, and decorative pills DO have visible V1 visuals.

1.1. **Decorative chips** still on `bg-brand-subtle` / `bg-brand-glow`
   — convert to `.v2-tag` with `--v2-acc-soft` background:
   - [src/components/shared/CategoryPill.tsx](src/components/shared/CategoryPill.tsx)
   - [src/components/terminal/FeaturedCards.tsx](src/components/terminal/FeaturedCards.tsx)
   - [src/components/terminal/MetasBar.tsx](src/components/terminal/MetasBar.tsx)
   - [src/components/terminal/TagsBar.tsx](src/components/terminal/TagsBar.tsx)

1.2. **Status pills using `bg-up/`, `bg-down/`, `bg-warning/` opacity
   variants** — convert to `--v2-sig-green / -red / -amber` borders +
   tinted backgrounds (the V2 spec uses outlined hairline pills, not
   filled). Files: AdminDashboard, IdeasQueueAdmin, RevenueQueueAdmin,
   IdeaCard, PredictTool, ProfileView, ProjectSurfaceMap, SignalBadge.

1.3. **ProjectSurfaceMap** — only the outer header was reskinned in
   commit `869621d`. The inner ~600 lines still use V1 chrome
   patterns (rounded-md borders, bg-up/5, etc.). Walk it section-by-
   section.

1.4. **AdminDashboard inner sections** (4 sections after the header):
   GitHub rate-limit / stale-signals / disk-usage stats strip (line
   ~328), Sources feed (~357), Repo queue (~437), AISO rescan
   (~472), Ideas queue summary (~567). Header is V2; inside is still
   V1 chrome.

1.5. **ScanLogViewer** (admin internal) — never touched.

1.6. **NewsTopHeaderV3** + **newsTopMetrics.ts** — user's WIP, kept
   uncommitted. Decide with the user before editing.

1.7. **Toast notifications** ([Toaster] in
   [layout.tsx](src/app/layout.tsx) — still uses V1 token names in
   `classNames`. They render V2 colors via the reskin, but the
   `!rounded-[var(--radius-card)]` (now 2px) is fine; the
   `!shadow-[var(--shadow-popover)]` could be checked for V2 fit.

1.8. **Skeleton loading states** — `.skeleton-shimmer` exists in
   globals.css with the V1 shimmer. Verify the colors still feel V2
   on dark.

1.9. **Recharts internals** — chart tooltip wrappers were converted
   to `.v2-card` (RepoDetailChart, CompareChart, PredictTool), but
   axis colors, legend swatches, gridlines, brushes inside Recharts
   are unset and may default to V1 tokens. Audit by visiting
   `/predict`, `/repo/[any]/[any]` (chart at top), `/compare?repos=...`.

### 2. Functional verification

I never proved the following actually work end-to-end. Walk each one:

2.1. **Admin login** — POST to `/api/admin/login` with credentials,
   verify cookie sets, redirect to `/admin`, dashboard loads.

2.2. **Reactions toggle** (build / use / buy / invest) on idea cards
   and repo detail pages. Verify optimistic update + server
   reconciliation. The recently-added "confirm modal for Buy/Invest
   gates" (commit `4075e12`) needs interaction testing.

2.3. **Watchlist persistence** — click eye icon on a repo, navigate
   away, come back, verify it's still there. Zustand store +
   server sync.

2.4. **Compare add/remove** — click compare icon, navigate to
   `/compare`, verify repos render. Remove one, verify it disappears.

2.5. **Search** — type in search bar, verify `/api/search` returns
   results, results render in TerminalLayout.

2.6. **Submit forms** — POST `/api/repo-submissions` and
   `/api/submissions/revenue`. Forms moderation queue → admin sees
   them at `/admin/ideas-queue` and `/admin/revenue-queue`.

2.7. **Idea moderation flow** — admin approves/rejects an idea,
   verify status updates in the public feed.

2.8. **Theme toggle** — V3 AccentPicker swaps accent colors
   (DesignSystemProvider + applyTheme.ts). Test that it persists
   across navigation and reload.

2.9. **Mobile drawer** — hamburger opens drawer, scroll lock
   engages, click backdrop or Escape closes, route change auto-
   closes.

2.10. **CLI** — `bin/ss.mjs` runs and connects to the API. Test
   `npm run cli:dev` then `ss --version`, `ss top`.

2.11. **MCP server** — `mcp/` directory has its own package.json.
   Run `cd mcp && npm install && npm start` and verify Claude
   Desktop or another MCP client can connect.

### 3. Quality of life / performance

3.1. **Lighthouse audit** — run on `/`, `/repo/[any]/[any]`,
   `/twitter`. Target 90+ on Performance, Accessibility, Best
   Practices, SEO. Specifically:

   - **CLS** (Cumulative Layout Shift) — V2 reskin may have introduced
     shifts via the new terminal-bar headers. Reserve space.
   - **LCP** (Largest Contentful Paint) — hero images, BubbleMap.
   - **TBT** (Total Blocking Time) — Recharts and Verlet bubble
     physics are heavy.

3.2. **Core Web Vitals** — verify against the live RUM data in
   Vercel Analytics.

3.3. **Bundle size** — `next/bundle-analyzer` or
   `npm run build -- --analyze`. Watch for:

   - Geist + Geist Mono + Inter + JetBrains + Space Grotesk = 5
     fonts loaded. Maybe drop the V1 fallbacks once we're confident
     Geist is loading correctly everywhere.
   - lucide-react / framer-motion / recharts already optimized via
     `experimental.optimizePackageImports`.

3.4. **Image optimization** — most repo avatars use `<img>` instead
   of `next/image`. Audit:
   ```bash
   grep -rn "<img\b" src/components --include="*.tsx" | grep -v 'alt="' | head -20
   ```
   Convert to `next/image` where the source is known
   (avatars.githubusercontent.com is whitelisted in next.config.ts).

3.5. **Reduced-motion handling** — globals.css has the
   `@media (prefers-reduced-motion: reduce)` block. Verify by
   toggling in DevTools that animations stop.

3.6. **Color contrast (WCAG AA)** — V2 ink ramp:
   - `--v2-ink-100` (#e6e7e8) on `--v2-bg-000` (#08090a) = ~16:1 ✓
   - `--v2-ink-200` (#aab0b6) on `--v2-bg-000` = ~9:1 ✓
   - `--v2-ink-300` (#7d848c) on `--v2-bg-000` = ~5.5:1 ✓ (AA large
     text, borderline AA normal)
   - `--v2-ink-400` (#565d65) on `--v2-bg-000` = ~3:1 — FAILS AA
     normal text. Used for `// MICRO LABELS`. Acceptable for
     decorative content, but verify any actually-readable text uses
     `--v2-ink-300` minimum.

3.7. **SEO** — verify FAQPage, CollectionPage, ItemList JSON-LD
   blocks on `/` still render (the V2 reskin could have collapsed
   them). Check sitemap.xml and robots.txt accuracy.

### 4. Code hygiene / commit history

4.1. **Autostash mishap** — during this session, several V2 reskin
   edits got merged into the user's commits via `git pull --rebase
   --autostash`. Specifically commit `90d227a` ("fix(mcp): pin zod
   ^4 to match root package (SCR-09)") accidentally contains v2-card
   edits to RepoDetailStats, RepoRevenuePanel, TwitterSignalPanel.
   Code is correct on main; commit attribution is muddled. Don't try
   to retroactively split — would require force-push to main.

4.2. **`.playwright-mcp/` is untracked** — should be added to
   `.gitignore`.

4.3. **`scripts/defer-data-store-imports.mjs` and
   `scripts/sweep-v1-chrome.mjs`** are in-tree and idempotent. Keep
   them and run after any new V1 lib file or component lands.

4.4. **Dead V2 demo files** — `src/components/today-v2/` was deleted
   in commit `e0f1051`. If you see references to `today-v2/` anywhere,
   remove them.

4.5. **`src/lib/empty-module.js`** — referenced by `next.config.ts`
   `turbopack.resolveAlias`. It's a 5-line `module.exports = {};`.
   Don't delete — Vercel build needs it.

### 5. Tests / regression guards

5.1. **CI guards already exist** — commit `e8e3e85` "chore(ci):
   regression guards for V2 tokens + err.message echoes". Verify
   what's covered.

5.2. **No V2 component has unit/integration tests.** Add tests for
   the primitives in `src/components/v2/__tests__/` if you have time:
   - TerminalBar renders label + status correctly
   - BracketMarkers position 4 squares at corners
   - SpiderNode draws correct number of peripheral nodes
   - BarcodeTicker is deterministic for same seed

5.3. **No visual regression / Playwright tests for V2 surfaces.**
   `.playwright-mcp/` exists locally but isn't wired up.

### 6. Architecture / new features (open questions for the user)

6.1. **V3 design system** — user added [src/components/v3/](src/components/v3/)
   with a runtime theme switcher. Direction unclear — is V3 a
   replacement for V2 tokens or a layer on top? Ask before extending.

6.2. **NewsTopHeaderV3** — user's uncommitted work. Could be the v3
   pattern for news source pages. Ask before integrating.

6.3. **PWA / mobile** — user's CLAUDE.md mentions a manifest.json.
   Verify it works (`Add to Home Screen` on mobile).

6.4. **Stripe billing** — configured but not billed yet. If user
   asks to ship pricing, wire `/api/checkout/session` (probably
   already scaffolded under `/api/stripe/`) and verify webhook
   handler.

---

## How to verify changes ship

```bash
# 1. Typecheck
npx tsc --noEmit

# 2. Build
rm -rf .next && npm run build

# 3. Local prod server
npm start  # serves on :3023

# 4. Smoke test 22 routes
TS=$(date +%s)
for r in / /twitter /reddit /funding /ideas /admin/login \
         /repo/anthropics/claude-code /search /watchlist /signals \
         /predict /pricing /news /portal/docs /you /breakouts \
         /compare /top /research /producthunt /lobsters /devto; do
  code=$(curl -o /dev/null -s -w '%{http_code}' -m 30 -L \
    "http://localhost:3023$r?_=$TS")
  echo "  $code $r"
done

# 5. Push (after rebase to absorb parallel-agent commits)
git pull --rebase --autostash origin main
git push origin main

# 6. Verify on apex (cache-bust)
TS=$(date +%s)
for r in / /repo/anthropics/claude-code /admin/login /search; do
  code=$(curl -o /dev/null -s -w '%{http_code}' -m 30 \
    -H "Cache-Control: no-cache" -L \
    "https://trendingrepo.com$r?_=$TS")
  echo "  $code $r"
done

# 7. Verify V2 vocab is in the rendered HTML
curl -s -m 30 "https://trendingrepo.com/?_=$(date +%s)" | \
  grep -oE "(// 01 · TRENDINGREPO|// SIGNAL · RADAR|END OF PAGE|v2-card|v2-term-bar)" | \
  sort -u
```

Acceptance bar: every probed route returns 200, V2 vocab markers
visible in HTML, no `dns` / `Module not found` errors in dev or prod
runtime.

## Hard rules — non-negotiable

1. Never `git push --force` to main.
2. Never re-add `./.next/**/*` to `outputFileTracingExcludes`.
3. Never static-import `getDataStore` from a lib file (always
   `await import("./data-store")` inside an async helper).
4. Never restore `src/components/today-v2/` files.
5. Never replace V1 page bodies with demo content.
6. Always rebase before push.
7. Read the file before editing it.
8. After any structural change to a card, verify the JSX still
   balances (open `<div>` count == close `</div>` count).

## Tools you have

- **Subagents** — spawn up to 10 in parallel for batch reskin work.
  Each gets a V1 file path + V2 reference (read via
  `git show e4e49a3:<path>`) + strict rules. Wave 1 used this; wave
  2 hit an Anthropic quota cap that resets May 1.

- **In-tree scripts** —
  [scripts/sweep-v1-chrome.mjs](scripts/sweep-v1-chrome.mjs) and
  [scripts/defer-data-store-imports.mjs](scripts/defer-data-store-imports.mjs).
  Both idempotent.

- **Vercel MCP** — `mcp__claude_ai_Vercel__*` tools for listing
  deployments, fetching build/runtime logs, getting deployment
  details. The project IDs are at the top of `.vercel/project.json`.

## What "done" looks like (acceptance)

The user opens `https://trendingrepo.com`, clicks through the sidebar
nav, lands on every route, and says "this looks like the same product
end to end" — same Geist + V2 dark canvas + sharp 2px corners + mono
operator vocabulary on every surface. No 500s, no stale V1
backgrounds, no inconsistent button shapes. Forms submit, reactions
toggle, watchlist persists, search returns results.

That's the bar. Don't ship until it's met.
