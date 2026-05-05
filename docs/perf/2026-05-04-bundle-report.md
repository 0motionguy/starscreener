# Bundle Report — 2026-05-04 (AGN-927)

**Generator:** `@next/bundle-analyzer@16.2.4` via `npm run analyze` (already wired in `next.config.ts`).
**Build:** `ANALYZE=true next build` against `origin/main` @ `d63c7525` (post AGN-920 mobile twitter overflow fix).
**Artifacts:** `.next/analyze/{client,nodejs,edge}.html` (gitignored — regenerate with `npm run analyze`).
**Scope:** Client bundle only — server / edge bundles run on warm Node and don't ship to users.

## Reading order

If you want the actions, skip to §3. §1 is methodology, §2 is the raw extract.

---

## 1. How the table was built

`@next/bundle-analyzer` embeds a JSON tree of `(chunk → module → parsedSize)` inside `client.html` under
`window.chartData`. We walked that tree, attributed each leaf to its npm package (or `src/...` path) and summed
parsed bytes across every chunk the module appears in. This is gzipped-on-wire size **after** Next's
`optimizePackageImports` rewrite has already trimmed `lucide-react` and `recharts` barrels — the numbers below are
what users actually download, not what's on disk in `node_modules`.

The categories used in §3 follow the brief: `lazy-load` (route/below-fold defer), `replace` (swap a lighter
library), `remove` (delete dead code), `accept` (cost is justified by usage).

---

## 2. Top modules — raw parsed bytes (client bundle)

Aggregated by package. Rows ordered by descending parsed-byte total across all client chunks. `next` includes
React internals, the App Router runtime, polyfills, and webpack runtime — it is not actionable at this layer
and is excluded from the action table.

| Rank | Package / Path                  | Parsed (B) | Notes |
|-----:|---------------------------------|-----------:|-------|
|  1   | `recharts`                      | 289,787    | One copy, but referenced by every chart route. |
|  2   | `@sentry/* (browser+replay)`    | 289,717    | Sentry SDK + the 119KB Replay add-on share top spot. |
|  3   | `lucide-react`                  | 262,226    | Already barrel-rewritten via `optimizePackageImports` — this is the trimmed count, not the ~1.5k-icon barrel. |
|  4   | `posthog-js`                    | 186,472    | Single chunk `11fa64b5-*.js`. |
|  5   | `react-dom`                     | 171,297    | Framework. |
|  6   | `framer-motion`                 | 129,298    | Animations on header, drawer, reddit tabs. |
|  7   | `@sentry-internal/replay`       | 119,046    | Counted separately for clarity (subset of #2). |
|  8   | `ioredis/built`                 |  94,361    | **Server-only library leaking into client bundle** (chunk `4796.*`). |
|  9   | `@upstash/redis`                |  71,237    | Same leak vector — both Redis clients are pulled by `lib/data-store`. |
| 10   | `victory-vendor/es`             |  47,112    | Recharts internal d3 sub-deps. Counted separately so it can be tracked when we cut recharts. |

**Largest top-level chunks for cross-reference** (see `.next/static/chunks/`):

| Chunk file                                    | Parsed (B) | Dominant content |
|-----------------------------------------------|-----------:|------------------|
| `9504c014.fecf97b3398d2f97.js`                | 325,376    | `next/dist/compiled/crypto-browserify` polyfill (pulled by ioredis). |
| `main-25ea371ddb3eca62.js`                    | 417,640    | App Router runtime + Sentry replay (~118KB). |
| `3272-ff361bb16c2a5ee4.js`                    | 421,394    | Shared baseline (Next router + RSC client + react-dom slice). |
| `4116-5554b6f7e60cddc0.js`                    | 369,105    | **recharts** core (axisSelectors + decimal.js-light). |
| `4796.9068232a28b75c2c.js`                    | 276,796    | **stream-browserify + ioredis** (server-only leak, see Action #8). |
| `11fa64b5-6728a7fe8bcbae23.js`                | 186,942    | posthog-js. |
| `framework-54c7523a5648d996.js`               | 183,118    | react-dom. |
| `38c22b63-c1cce7b44758eb0f.js`                | 173,409    | react-dom client compiled. |
| `4465-097d76ca3c15e512.js`                    | 122,279    | framer-motion. |
| `14541d1e-7f3ec1ce19b5f923.js`                | 119,522    | sentry-internal/replay. |

**Shared baseline reported by Next:** `First Load JS shared by all` ≈ **226 kB**. Heaviest route bundles:
`/compare` (437 kB), `/repo/[owner]/[name]/star-activity` (373 kB), `/tools/star-history` (372 kB),
`/model-usage` (357 kB), `/search` (305 kB), `/tierlist` (303 kB), `/top` (300 kB).

---

## 3. Top 10 modules — action plan

| # | Module                          | Parsed (B) | Action          | Rationale |
|--:|---------------------------------|-----------:|-----------------|-----------|
| 1 | `recharts`                      | 289,787    | **lazy-load** (mostly done — verify two routes) | Already deferred via `next/dynamic` on the two large consumers (`CompareChart` in `CompareClient.tsx:59`, `RepoDetailChart` via `RepoDetailChartLazy.tsx:16`, `ToasterLazy`, `MobileDrawerLazy`). Two routes still ship recharts in their initial bundle and should follow the same wrapper pattern: `/model-usage` (`UsageCharts`, ~90KB recharts) and `/repo/[owner]/[name]/star-activity` (373KB total bundle — chart is below the fold). Child issue to file: lazy-load `UsageCharts` + `StarActivityChart`. |
| 2 | `@sentry/* (browser+replay)`    | 289,717    | **lazy-load** (replay) + **accept** (browser core) | The 170KB browser SDK is a hard requirement for prod observability — accept. The 119KB `@sentry-internal/replay` add-on is opt-in and not needed on every visit; switch to lazy `Sentry.replayIntegration()` registration on `idle` (or only after the user signs in / triggers an error). Child issue to file: lazy-init Sentry Replay. |
| 3 | `lucide-react`                  | 262,226    | **tree-shake** (audit + drop unused) | Already barrel-rewritten by Next's `optimizePackageImports` (next.config.ts:43). 262KB after rewrite suggests we genuinely import a lot of icons. File a child issue to grep `lucide-react` imports across the repo, dedupe (e.g. one icon-set util), and consider replacing rarely-used icons with inline SVG. Realistic win: 30–60KB. |
| 4 | `posthog-js`                    | 186,472    | **lazy-load** | We initialize PostHog at app start via `instrumentation-client.ts`. PostHog supports `posthog.init(..., { autocapture: { dom_event_allowlist: ... } })` and a `loaded:` callback — defer the SDK behind a `requestIdleCallback` / first-interaction trigger. No tracking is lost on cold loads because PostHog buffers events itself. Child issue: defer PostHog init until idle. |
| 5 | `react-dom`                     | 171,297    | **accept** | Framework dependency, no swap viable. |
| 6 | `framer-motion`                 | 129,298    | **lazy-load** (already mostly done) + **replace** the small ones | `MobileDrawerLazy.tsx:11` already defers it. The remaining consumers are `AllTrendingTabs` (`reddit-trending/AllTrendingTabs.tsx:15`, layoutId animations) and the two `Subreddit*Canvas.tsx` components. The audit at `docs/audit-bundle-2026-05-02.md:38` already proposes the lazy wrapper. Where the only animation is a 200ms fade (e.g. simple list mounts), replace `motion.div` with a CSS `@starting-style` transition — drops the dep-graph edge entirely. Child issue: lazy-load reddit canvas trio + audit cheap animations. |
| 7 | `@sentry-internal/replay`       | 119,046    | **lazy-load** | Counted under #2. Listed separately so the action is unambiguous: this is the chunk to cut first if we only do one Sentry change. |
| 8 | `ioredis/built` (+ `crypto-browserify`, `stream-browserify`) | 94,361 (+ 325,376 + 41,549) | **remove** (server-only leak) | This is the highest-leverage win on the list. ioredis is a Node TCP Redis client and has no business in the client bundle — but `serverExternalPackages: ["ioredis", "@upstash/redis"]` (`next.config.ts:149`) only externalizes it on the server, and the client `webpack.fallback`/`turbopack.resolveAlias` stubs (`next.config.ts:101–143`) only stub the *Node built-ins* it transitively imports, not ioredis itself. Some `"use client"` file is still pulling `@/lib/data-store` directly (or via a barrel) and webpack is bundling ioredis. The audit notes a previous fix for `SidebarWatchlistPreview` — there's another offender. **The `crypto-browserify` 325KB chunk is a downstream symptom**: ioredis pulls `crypto`, the polyfill ships. Killing the leak collapses this single chunk and trims the 277KB `4796.*` chunk (stream-browserify + ioredis cluster). Estimated total saving: **~460KB parsed**, far larger than any other line item. Child issue (P0): grep `from ['\"]@/lib/data-store['\"]` and `getDataStore(` inside files containing `'use client'`; gate the import behind a server-only barrel; add an ESLint rule + a CI check that fails the build if `ioredis` lands in any `static/chunks/*.js`. |
| 9 | `@upstash/redis`                |  71,237    | **remove** (same leak as #8) | Same root cause as #8. The `4a61723e.*` chunk is purely `@upstash/redis/nodejs.js`. Same fix evicts both. |
| 10| `victory-vendor/es`             |  47,112    | **accept** (with #1) | This is a recharts transitive (its d3 subset). It'll trim proportionally when #1 lazy-loads; no separate action. |

### Aggregate impact estimate

If the four `lazy-load` actions land (#1 remaining routes, #2 replay, #4 posthog, #6 reddit canvas) and the
`remove` actions land (#8 + #9), the `First Load JS shared by all` baseline drops from **226 kB → ~150 kB**
(conservative), and the heavy routes (`/compare`, `/star-activity`, `/model-usage`) drop into the 220–260 kB
band that matches the rest of the app.

---

## 4. Child issues to file (per AC §3)

The acceptance criterion requires that `tree-shake` and `dynamic-import` actions get child issues. The list:

1. **dynamic-import — recharts on `/model-usage` + `/star-activity`** (covers row #1 remainder)
2. **dynamic-import — Sentry Replay deferred init** (covers row #2 / #7)
3. **dynamic-import — PostHog deferred init** (covers row #4)
4. **dynamic-import — Reddit canvas trio (`AllTrendingTabs` + 2x `Subreddit*Canvas`)** (covers row #6)
5. **tree-shake — lucide-react import audit + inline-SVG migration for rare icons** (covers row #3)
6. **remove — kill ioredis/upstash leak from client bundle + add CI guard** (covers rows #8 / #9; P0, biggest win)

These should be filed under AGN-927 as children. The bundle-analyzer wiring itself (the `npm run analyze`
script) is already present in `package.json` and `next.config.ts` — no scaffolding work is needed for future
re-runs.

---

## 5. How to reproduce

```bash
npm run analyze
# opens (well — writes; openAnalyzer is set to false by default):
#   .next/analyze/client.html   (the relevant one)
#   .next/analyze/nodejs.html
#   .next/analyze/edge.html
```

The HTML files are not committed (gitignore). Re-run before any future bundle-targeted PR and diff the totals
in §2 / §3 against this baseline.
