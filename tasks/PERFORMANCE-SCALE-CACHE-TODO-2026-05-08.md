# Performance Scale/Cache TODO - 2026-05-08

Scope: inspect-only planning artifact. No source-code changes were made. Execute later from a clean worktree or with exact-path staging only.

Target: make the public website fast and cache-friendly for roughly 10k daily active users. Optimize first for cache hits, smaller initial JS, lower root-layout server work, and measurable deploy gates.

## Non-Goals And Freshness Guardrails

- Do not disable, weaken, or remove data scraping, producer workflows, cron freshness checks, source fetchers, or freshness-state APIs.
- Do not cache auth, admin, cron, mutation, webhook, refresh, or user-specific API responses as public data.
- Do not hide stale upstream data behind longer page caches. Page caching must be paired with visible freshness metadata and existing freshness checks.
- Move scraping/refresh work out of page render paths only when it remains covered by background cron, explicit refresh APIs, data-store refresh hooks, or producer workflows.
- Keep `npm run freshness:check` and the freshness-state route as release gates after implementation.
- If a route currently triggers a scan during render, replace that with a background or on-demand refresh path before making the page cacheable.
- Public cache headers are only for deterministic public HTML/data responses. They are not for personalized watchlists, alerts, sessions, admin screens, or cron endpoints.

## Current Evidence

Local preflight:

- `npm run freshness:check` could not run because no local app was listening on `http://localhost:3023` (`ECONNREFUSED`). Re-run after starting the approved local dev/preview server.

Live route probes against `https://trendingrepo.com` on 2026-05-08:

| Route | Observed cache behavior | Compressed TTFB / total | Download |
| --- | --- | ---: | ---: |
| `/` | `X-Vercel-Cache: HIT` | 0.476s / 0.523s | 116 KB |
| `/signals` | `private, no-store`, MISS | 3.453s / 4.074s | 89 KB |
| `/githubrepo` | HIT | 0.758s / 0.782s | 79 KB |
| `/skills` | HIT | 0.465s / 0.494s | 83 KB |
| `/mcp` | HIT | 0.468s / 0.495s | 61 KB |
| `/reddit/trending` | HIT | 0.508s / 0.537s | 50 KB |
| `/twitter` | `private, no-store`, MISS | 5.702s / 6.314s | 68 KB |
| `/compare` | `private, no-store`, MISS | 1.195s / 1.631s | 52 KB |
| `/repo/vercel/next.js` | `private, no-store`, MISS | 3.585s / 6.441s | 92 KB |
| `/devto` | `private, no-store`, MISS | 1.200s / 1.623s | 73 KB |
| `/lobsters` | `private, no-store`, MISS | 2.031s / 2.267s | 69 KB |

Bundle/cache evidence from the existing `.next` output:

- Route JS raw totals are high: `/compare/page` ~1.90 MB, `/page` ~1.80 MB, `/repo/[owner]/[name]/page` ~1.73 MB, `/githubrepo/page` ~1.60 MB, `/signals/page` ~1.54 MB, `/layout` ~1.46 MB.
- A shared ECharts/zrender chunk is ~731 KB raw and appears on `/`, `/signals`, `/githubrepo`, `/compare`, and repo detail.
- Root `PostHogProvider` imports `posthog-js` into a root chunk of ~187 KB raw.
- A `/compare` chunk of ~235 KB raw contains large source data strings, indicating static data is crossing into a client bundle.
- Root layout calls `buildSidebarData({ reposByIdTopN: 200 })` for every page. That path calls derived repo builders, pipeline readiness, alerts, and source counts before render.
- `docs/ENGINE.md` references `.github/workflows/cron-warmup.yml`, but the workflow is missing in the current checkout. Existing smoke/uptime workflows do not enforce cache or TTFB budgets.
- Existing backlog item `AGN-122` already records Lighthouse savings opportunities for `/` and `/signals`: server latency, unused JS, and minify/bundle consistency.

## P0 Execution TODO

### 1. Make Public Pages Cacheable

- `/signals`
  - Remove render-time `triggerScanIfStale` side effects from the page render path.
  - Stop letting server `searchParams` force dynamic rendering for normal filters.
  - Keep an ISR default route with `revalidate`, then move filters/tabs into client state or pre-rendered segment variants.

- `/twitter`
  - Move tab/window filtering out of the server render path or pre-render each stable view.
  - Preserve freshness through an ISR route plus explicit background refresh jobs.

- `/devto` and `/lobsters`
  - Add explicit `revalidate`.
  - The page comments already say `searchParams` opts the route out of static rendering. Replace server-side `?win=` filtering with client filtering over precomputed windows, or create explicit route segments for each window.

- `/compare`
  - Remove `force-dynamic` for the default public shell.
  - Keep share-state parsing out of the default cached page where possible. Dynamic behavior should be isolated to share-specific payload/API/metadata, not the whole route.

- `/repo/[owner]/[name]`
  - Split tracked repo detail from live GitHub fallback.
  - Known/tracked repo pages should be ISR/HIT after warmup.
  - Unknown repo fallback should use a bounded cached API or cached fetch, not make the whole detail route `no-store`.
  - Add `generateStaticParams` or a warmup list for the top N hot repos.

- `/repo/[owner]/[name]/star-activity` and `/tools/revenue-estimate`
  - Re-check whether `force-dynamic` is actually required. If the data is public, convert to ISR or cache the expensive reads behind APIs with `READ_*_HEADERS`.

### 2. Cut Root Layout Server Cost And RSC Payload

- Stop building the full live sidebar payload in `src/app/layout.tsx` for every public page.
- Split sidebar into:
  - static navigation rendered in root layout,
  - small cached public counts fetched after hydration,
  - user-specific watchlist/alerts fetched only when signed in.
- Remove `pipeline.ensureReady()` from the root layout path. Pipeline readiness must not gate every page request.
- Add cache headers to `src/app/api/pipeline/sidebar-data/route.ts` for public/no-user responses. Use private/no-store only for user-specific responses.
- Reduce default sidebar repo map size from 200 to a smaller top-N, or load repo lookup data on demand.
- Avoid fetching `/api/auth/session` from sidebar for anonymous traffic on every public page.

### 3. Remove ECharts From Initial Bundles

- Replace table sparklines in `src/components/home/LiveTopTable.tsx` with tiny inline SVG/canvas sparklines, or dynamically import the ECharts sparkline after idle.
- Split `src/lib/charts/theme.ts` so small line charts do not register Radar, Heatmap, Treemap, DataZoom, VisualMap, and other heavy modules.
- Dynamically load below-the-fold chart sections with stable skeleton dimensions.
- Add a bundle budget that fails if any route pulls the ECharts chunk into first-load JS without an explicit allowlist.

### 4. Stop Static Data From Entering Client Bundles

- Audit `"use client"` import boundaries for `data/*.json`, data-store readers, and source snapshots.
- Fix `/compare` so large HN/ProductHunt/source data is passed from server/API as compact props rather than imported into client chunks.
- Add a lint or build guard that blocks `src/data`, `data`, or server-only data-store imports from client components.

### 5. Lazy-Load Analytics And Global Client Providers

- Change `PostHogProvider` so `posthog-js` is loaded with dynamic `import()` only when the public key exists and preferably after first paint/idle.
- Do not wrap the whole tree in heavy analytics context when analytics is disabled.
- Review root-mounted client components (`GlobalShortcuts`, `BrowserAlertBridge`, `MobileNav`, `MobileDrawerLazy`, `ToasterLazy`, `ClerkRefHandoff`) and defer anything that is not needed for first paint.
- Keep auth/client-session work off anonymous public page startup unless the page needs it.

### 6. Restore Warmup And Add Performance Gates

- Restore `.github/workflows/cron-warmup.yml` or update `docs/ENGINE.md` if the warmup strategy moved.
- Warm the hot cached paths after deploy and on cadence:
  - `/`
  - `/githubrepo`
  - `/skills`
  - `/mcp`
  - `/reddit/trending`
  - `/signals`
  - `/twitter`
  - top repo detail pages
- Extend post-deploy smoke to record and enforce:
  - `cache-control`
  - `x-vercel-cache`
  - compressed TTFB
  - compressed transfer size
  - route JS budget from `.next/app-build-manifest.json`
- Add a local script such as `npm run perf:routes` that fails when public pages return `private, no-store` or exceed TTFB/size budgets.

## P1 Hardening TODO

- Add `Server-Timing` or structured perf logs around root layout, sidebar data, data-store load, source refresh hooks, and repo detail fallback.
- Use `unstable_cache` around pure derived computations keyed by data version and route-specific inputs.
- Review page-level refresh hooks so ISR generation refreshes only the sources needed for that page and always has timeout bounds.
- Move route-specific CSS out of global/root imports where possible. Current root CSS chunks are large and include feature surfaces that many pages do not need.
- Add a documented top-route list for 10k DAU operations: hot pages, cache policy, warmup cadence, owner, and expected TTFB.

## Developer Speed And Quality-Of-Life TODO

These are low-risk engineering speedups that should make future perf work faster without changing scraping behavior.

- Add a single `npm run perf:quick` script that probes hot routes and prints: status, `cache-control`, `x-vercel-cache`, TTFB, total time, compressed size, and pass/fail budget.
- Add a `npm run perf:bundle` script that reads `.next/app-build-manifest.json` and reports largest route JS totals plus largest chunks. This should not require the full analyzer UI.
- Add a checked-in route budget file, for example `perf/routes.json`, so performance limits are reviewed like normal code.
- Add a checked-in hot-route inventory with route owner, cache policy, freshness source, and warmup eligibility.
- Add a `docs/DEV-PERF-PLAYBOOK.md` with exact commands for: local server, freshness check, build, bundle report, route probes, Lighthouse, and production smoke.
- Make the post-deploy smoke workflow upload a small perf artifact so every deploy keeps historical TTFB/size/cache data.
- Add GitHub Actions cache for package-manager cache and `.next/cache` during builds, scoped by lockfile and Next config.
- Enable or verify lint/typecheck caches where safe. Prefer cache directories outside noisy source paths and document when to clear them.
- Add a preflight script that detects:
  - no local server on the expected port,
  - duplicate `next dev` or `next build` processes,
  - stale `.next` output after dependency changes,
  - missing env needed for freshness checks,
  - public routes unexpectedly returning `no-store`.
- Add `PERF_TRACE_ROUTES=1` examples to the playbook and keep logs structured enough to compare before/after.
- Add an allowlist for intentionally dynamic routes. Any new public route returning `private, no-store` should fail CI unless it is on the allowlist with a reason.
- Add bundle import guardrails:
  - no chart library imports in first-paint table/list components,
  - no `posthog-js` root import,
  - no server/data-store/static-source imports from `"use client"` components,
  - no route-specific CSS imported from the root layout unless explicitly justified.
- Add a small “route cache contract” comment near each public page export documenting whether it is ISR, dynamic, or private.
- Add dependency-size review to Renovate/dependency update workflow. Large new client packages should require an explicit bundle note.
- Add a short troubleshooting note for slow Windows builds: kill duplicate Next processes, clear `.next` only when needed, and avoid running heavy builds from synced folders.
- Add a one-command local baseline capture that writes ignored output under `.perf/` so developers can compare before/after without touching tracked files.

## General Performance Best Practices To Apply

- Keep expensive source refresh and scraping outside request render paths. Page render should read prepared data; refresh paths should update prepared data.
- Prefer ISR/public cache for deterministic public pages and private/no-store only for personalized or mutating surfaces.
- Use small API payloads for above-the-fold UI. Load large tables, chart detail, and long histories after first paint.
- Keep first-load JavaScript boring: no heavy charts, analytics SDKs, rich editors, maps, or large data blobs in the initial route unless the page's primary action needs them.
- Use stable skeleton dimensions for deferred sections so lazy loading does not create layout shift.
- Put cache headers on read APIs consistently through `READ_FAST_HEADERS`, `READ_MEDIUM_HEADERS`, `READ_SLOW_HEADERS`, or `READ_HEAVY_HEADERS`.
- Add timeouts around optional upstream/live fetches. Slow optional sources should degrade, not hold the full page response.
- Prefer top-N and pagination over sending large derived maps to every page.
- Measure server latency and browser bundle size separately. A cached page can still feel slow if first-load JS is too large.
- Treat freshness metadata as part of the UI contract. Users should see how current the data is when pages are cached.

## Validation Plan

Run in this order when implementing:

1. Start the approved local server and re-run `npm run freshness:check`.
2. Run `npm run build`.
3. Run `ANALYZE=true npm run build` or `npm run analyze` and record route JS deltas.
4. Run the new route perf script against local preview and production preview.
5. Run Lighthouse on `/` and `/signals`.
6. Run live probes after deploy and confirm public routes are HIT/STALE after warmup.

Target budgets:

- Public pages should not return `private, no-store` unless they are auth/admin/user-specific.
- Warm public pages should return `X-Vercel-Cache: HIT` or `STALE` after warmup.
- Cached compressed TTFB target: <= 800 ms for hot pages.
- Uncached public generation target: <= 1500 ms for normal pages.
- Compressed transfer target: <= 90 KB for listing pages, <= 120 KB for home/repo detail.
- Initial route JS target: <= 900 KB raw for normal pages, with no unapproved route-specific chunk over 250 KB.

## Suggested Work Order To Avoid Conflicts

1. Cache policy lane: fix dynamic/no-store pages and add perf probe script.
2. Layout lane: split sidebar data and defer anonymous/user-specific work.
3. Bundle lane: remove ECharts/PostHog from first-load bundles.
4. CI lane: restore warmup and enforce budgets.
5. Final validation lane: build, analyze, route probes, Lighthouse, production cache verification.
