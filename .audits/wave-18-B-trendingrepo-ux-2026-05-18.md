# Wave 18 Lane B — Trendingrepo UX + Lighthouse Baseline
2026-05-18

## Verdict: YELLOW

The site has strong fundamentals — proper viewport, OG metadata on most routes, swap-display fonts, next/image usage, dedicated not-found.tsx, dark-by-design `color-scheme: dark`, security headers, CSP — but **two material regressions** are visible in the live perf-routes probe:

1. **`/repo/[owner]/[name]` cold TTFB is catastrophic** (11.6 s for `next.js`, 5.8 s for `ky`). Once warmed, ISR serves the page fine; but every cache miss across the dynamic catalog is a 5–12 s wait.
2. **8 routes return `cache-control: no-store`** despite being labelled ISR in `perf/routes.json`. This means the warmup workflow can't keep them hot; they refill from origin on every cold edge hit.

Plus one product-level concern: **`/repo/notarealuser/notarealrepo` returns 200 with full HTML** for any random owner/repo combo (no 404 fallback), opening the catalog to junk-page SEO indexing.

Lighthouse PSI runs **were not collected** because the anonymous PSI bucket rate-limits at the first request and never recovers across 3-attempt 60 s/120 s/180 s backoffs. Adding `PAGESPEED_API_KEY` as a repo secret unblocks both the local script and the new CI workflow.

## Lighthouse score table

Not collected this run — PSI anonymous bucket returned HTTP 429 on every attempt. Baseline file (`.perf/lighthouse-baseline-2026-05-18.json`) has `lighthouse_mobile`/`lighthouse_desktop` set to null with `note: "PSI key required"` so the comparison workflow can populate them on first run with the secret in place.

The five-route CI gate (`.github/workflows/lighthouse-baseline.yml`) calls PSI with `PAGESPEED_API_KEY`, compares against baseline, and fails the PR if any of perf / a11y / seo / best-practices regresses by more than 5 points on `/`, `/githubrepo`, `/skills`, `/repo/vercel/next.js`, or `/funding` (mobile + desktop).

## Top regressions / issues (from live perf-routes probe)

Total: **16 pass / 11 fail / 0 warn** across 27 routes (`base=https://trendingrepo.com`, captured 2026-05-18 T08:04Z, two hits per route).

### Severity HIGH

1. **`/repo/vercel/next.js` — TTFB 11592 ms** (budget 1500 ms uncached). Cold miss. Likely the `/repo/[owner]/[name]` page does live GitHub API + DB fetch in `getStaticProps`-equivalent for any uncached repo, with no ISR cap on time-to-first-byte. Once warm it's fine (the route is in the cron-warmup matrix), but every cold edge region pays this.
2. **`/repo/sindresorhus/ky` — TTFB 5805 ms**. Same root cause as #1.
3. **8× `cache_control_violation: no-store`** on routes declared ISR: `/skills`, `/signals`, `/top10`, `/revenue`, `/producthunt`, `/npm`, `/breakouts`, `/categories`. These return `Cache-Control: no-store` from origin so Vercel's edge can't cache them — every request hits the function. Likely cause: a `headers()`/`cookies()`/`auth()` call up the tree forces dynamic rendering, or `unstable_cache` is bypassed.
4. **`/reddit/trending` transfer 370.6 KB** (budget 90 KB). 4× over budget despite hitting the edge cache (vercel=HIT). The HTML payload itself is bloated; either the page server-renders too many list items, or a JSON island is inlined into RSC.

### Severity MEDIUM

5. `/skills` transfer 97.3 KB — 8% over the 90 KB budget. Marginal.
6. `/repo/notarealuser/notarealrepo` returns 200 with full HTML. The `/repo/[owner]/[name]` dynamic page does NOT 404 on unknown repos — it renders a "this repo has 0 stars / 0 contributors" empty shell. SEO crawlers can index infinite garbage URLs.
7. **404 page is text/plain "Not Found"** for unmatched top-level routes (e.g. `/asdf-not-a-real-route`). `src/app/not-found.tsx` exists and is well-designed, but Vercel's edge appears to short-circuit before the App Router not-found renders. Likely cause: the `/_not-found` route is dynamic (reads `getDerivedRepos()`) and fails to render at edge, falling back to the framework default.

### Severity LOW

8. 3 routes have **no og:image** in their HTML: `/skills`, `/reddit/trending`, `/hackernews/trending`. og:title + og:description + twitter:card all present, but social cards will use the apex `opengraph-image` fallback. Cosmetic — the apex one is good, but route-specific would be better.

## OG card validity

| Route | og:title | og:desc | og:image | twitter:card | viewport |
|-------|----------|---------|----------|--------------|----------|
| `/` | yes | yes | yes | summary_large_image | yes |
| `/githubrepo` | yes | yes | yes | summary_large_image | yes |
| `/skills` | yes | yes | **MISSING** | summary_large_image | yes |
| `/mcp` | yes | yes | yes | summary_large_image | yes |
| `/signals` | yes | yes | yes | summary_large_image | yes |
| `/funding` | yes | yes | yes | summary_large_image | yes |
| `/breakouts` | yes | yes | yes | summary_large_image | yes |
| `/twitter` | yes | yes | yes | summary_large_image | yes |
| `/reddit/trending` | yes | yes | **MISSING** | summary_large_image | yes |
| `/hackernews/trending` | yes | yes | **MISSING** | summary_large_image | yes |
| `/repo/vercel/next.js` | yes | yes | yes | summary_large_image | yes |
| `/repo/anthropics/anthropic-cookbook` | yes | yes | yes | summary_large_image | yes |
| `/repo/openai/openai-python` | yes | yes | yes | summary_large_image | yes |
| `/asdf-not-a-real-route` | n/a (404) | n/a | n/a | n/a | n/a |

Full data: `.audits/og-audit-2026-05-18.json` (not committed — regenerable).

## Bundle / perf budget

Bundle script (`scripts/perf-bundle.mjs`) requires `npm run build` first; not run this audit pass. Live transfer-budget data was collected via `scripts/perf-routes.mjs --prod`.

- **Homepage HTML transfer (cached)**: 78.4 KB — well under the 130 KB route budget. ✅
- **next/image usage**: 9 components import `from "next/image"`. ✅
- **Raw `<img>` usage**: 5 files (all share/social previews, defensible). ✅
- **font-display**: `Geist`, `Geist_Mono`, `Space_Grotesk` all loaded with `display: "swap"` in `src/app/layout.tsx`. ✅
- **Preload tags**: 3 fonts + `webpack-*.js` chunk preloaded from home HTML. ✅
- **Dark mode**: site-wide `color-scheme: dark` in `globals.css` (intentional — single-theme product). 5 `data-theme="…"` accent variants exist but no light mode. ✅
- **Tap targets**: 4 components use `min-h-[44px]`/`min-w-[44px]` explicitly. Most interactive elements rely on Tailwind defaults (`py-2.5 px-5` ≈ 38 px height, slightly under WCAG 44 px). Worth a sweep, but no obvious accessibility blockers.
- **Error boundary**: `src/app/global-error.tsx` exists. ✅

## Detail-page audits (with real data)

| Route | Status | TTFB (last) | OG image | Notes |
|-------|--------|-------------|----------|-------|
| `/repo/vercel/next.js` | 200 | 11592 ms (MISS) | yes | Cold TTFB is critical regression |
| `/repo/sindresorhus/ky` | 200 | 5805 ms (MISS) | n/a (not probed for OG) | Same pattern |
| `/repo/anthropics/anthropic-cookbook` | 200 | n/a | yes | Not in perf-routes config |
| `/repo/openai/openai-python` | 200 | n/a | yes | Not in perf-routes config |
| `/repo/notarealuser/notarealrepo` | **200** | n/a | yes | **Should 404 — page renders empty shell for any owner/repo** |

## CI workflow added

`.github/workflows/lighthouse-baseline.yml` — runs on PRs touching `src/app/`, `src/components/`, `src/lib/`, `next.config.ts`, `package.json`. Requires `PAGESPEED_API_KEY` repo secret. Skips gracefully (warning only) if secret missing.

Five tracked routes (mobile + desktop): `/`, `/githubrepo`, `/skills`, `/repo/vercel/next.js`, `/funding`.

Fail criterion: any of `perf`, `a11y`, `seo`, `best-practices` regresses by more than 5 points on either form factor.

## Fix PRs opened

This pass: **scaffolding only** — `.perf/lighthouse-baseline-2026-05-18.json` + `.github/workflows/lighthouse-baseline.yml` committed in this PR (`feat/w18-B-lighthouse-baseline`). No defensive-guard patches shipped because:

1. The `/repo/[owner]/[name]` 11 s TTFB is a meaty perf bug that warrants its own PR with proper diagnosis (data-source profile + caching strategy) — fixing it in a baseline PR would muddle the diff.
2. The `no-store` cache header regression on 8 ISR routes needs to be traced through `src/app/*/page.tsx` to find the dynamic-rendering trigger — also its own PR.
3. The "200 on any /repo/* path" issue needs a product-direction decision (should we 404? show an "is this repo on GitHub? we'll add it" CTA?) — own PR.

## Issues filed (defer-to-later)

- **`/repo/[owner]/[name]` cold TTFB ≥ 5–12 s** — investigate getStaticProps/`unstable_cache` path; the page is in the warmup matrix but still cold-cycles. Likely needs a `force-static` + `revalidate` pair, or a "loading skeleton then SWR" split.
- **8 ISR routes returning `Cache-Control: no-store`** — `/skills`, `/signals`, `/top10`, `/revenue`, `/producthunt`, `/npm`, `/breakouts`, `/categories`. Find the dynamic-rendering trigger (likely a `cookies()` or `auth()` call) and refactor.
- **`/reddit/trending` 370 KB HTML transfer** — 4× over budget. RSC payload investigation.
- **3 routes missing og:image** — `/skills`, `/reddit/trending`, `/hackernews/trending`. Add `opengraph-image.tsx` per route.
- **`/repo/*` accepts any owner/repo combo** — should 404 on unknown GitHub repos.
- **404 fallback returns text/plain** — App-router `not-found.tsx` exists but doesn't render at the edge for top-level unmatched routes. May be a Vercel edge config or a manifest issue.
- **Add `PAGESPEED_API_KEY` repo secret** — unblocks both `npm run lighthouse:routes:prod` and the new CI workflow.

## Files

- Audit: `C:\dev\trendingrepo-w18-B\.audits\wave-18-B-trendingrepo-ux-2026-05-18.md` (this file)
- Baseline: `C:\dev\trendingrepo-w18-B\.perf\lighthouse-baseline-2026-05-18.json`
- Perf-routes raw: `C:\dev\trendingrepo-w18-B\.audits\perf-routes-2026-05-18.json` (not committed; regenerable via `node scripts/perf-routes.mjs --prod --json --out=.audits/perf-routes-<DATE>.json`)
- CI workflow: `C:\dev\trendingrepo-w18-B\.github\workflows\lighthouse-baseline.yml`
