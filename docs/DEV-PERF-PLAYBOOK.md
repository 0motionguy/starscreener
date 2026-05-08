# Dev Perf Playbook

Practical reference for editing public pages without regressing cache behavior, first-load JS, or freshness. Pair with `tasks/PERFORMANCE-SCALE-CACHE-TODO-2026-05-08.md` and `docs/ENGINE.md`.

## TL;DR

- Touching a `src/app/**/page.tsx`? Run `npm run perf:quick` before committing.
- Adding a new public page? It must appear in `perf/routes.json` (or be allowlisted in `perf/.perfignore`) — `npm run lint:routes-config` enforces this.
- A public page is **never** allowed to return `private, no-store` unless its config entry has `expectsDynamic: true` with a `reason`.
- Freshness gates (`npm run freshness:check`) take precedence over cache wins. If a perf change risks degrading source freshness, surface it; do not ship.

## Quick perf check

```bash
npm run perf:quick      # build + parse manifest + assert per-route JS budgets
```

Output is a table of route → first-load JS total → budget → status, plus the top 10 chunks and a list of any forbidden-import violations (echarts in non-chart routes, posthog-js anywhere in root, large `data/*.json` blobs in client chunks).

To probe live cache + TTFB behavior locally, start the server in another terminal and probe:

```bash
npm run start &           # default port 3023
npm run perf:routes       # probes every route in perf/routes.json
```

Against production:

```bash
npm run perf:routes:prod
```

To probe a subset:

```bash
node scripts/perf-routes.mjs --prod --only=/signals,/twitter
```

## Cache contract on every public page

Each public `src/app/**/page.tsx` should declare its cache contract at the top of the file, above imports:

```ts
// CACHE CONTRACT
// kind:        ISR | static | dynamic | private
// revalidate:  <seconds> | none
// audience:    public | private
// freshness:   <human window the route guarantees, e.g. "≤5min behind cron">
// invalidates: <list of API routes that bust this page on demand>, or "n/a"
```

The route's behavior in code must match — Next 15 will silently mark a route dynamic if any of these slip in:

- `await searchParams` in a server component (without a `<Suspense>` boundary or generated static params)
- `cookies()` / `headers()` / `auth()` / `currentUser()` anywhere in the page render tree, including children rendered by a layout
- `fetch(..., { cache: "no-store" })` or `unstable_noStore()` anywhere on the path
- Middleware writing a `Set-Cookie` header on every response (turns the response private at the edge)

If the diagnosed cause is layout/middleware, fix the cause; do not stack `revalidate` exports hoping they win.

## Reading X-Vercel-Cache

| Value | Meaning | Action |
| --- | --- | --- |
| `HIT` | Served fully from edge cache | nothing |
| `STALE` | Served from cache while ISR regenerates in background | nothing |
| `PRERENDER` | Statically prerendered at build, served as-is | nothing |
| `REVALIDATED` | Edge had stale; this hit triggered a revalidate that returned fresh | nothing |
| `MISS` once | Cold cache (first hit after deploy or after revalidate window) | tolerate; warmup compensates |
| `MISS` repeatedly | Cache is being bypassed | investigate (see "Cache contract") |
| `BYPASS` | Route opted out (`cache: "no-store"`, `dynamic = "force-dynamic"`, etc.) | confirm intentional |

`scripts/perf-routes.mjs` does two probes 5s apart for warmed routes — if both miss, it fails.

## Adding a new public route

1. Create `src/app/<segment>/page.tsx`.
2. Decide policy:
   - `isr` (default): `export const revalidate = N`. Avoid `cache: "no-store"` in fetches — they neutralize ISR.
   - `static`: pure deploy-time content. No data fetching at runtime.
   - `dynamic-public`: must be cacheable BUT requires per-request data (e.g. `/api/health`). Add `expectsDynamic: true, reason: "..."` in routes.json.
   - `private`: behind auth. Never `warmupOnDeploy: true`; never publicly cached.
3. Add an entry to `perf/routes.json` with budgets. Pick conservative budgets initially; tighten once measured.
4. Run `npm run lint:routes-config` — should pass.
5. If the route deserves warmup, add it to `.github/workflows/cron-warmup.yml` matrix.

## Bundle analysis

`npm run analyze` (or `ANALYZE=true npm run build`) emits HTML reports to `.next/analyze/{client,nodejs,edge}.html`. Open `client.html` and look for:

- Route bundles over 250 KB raw (before gzip)
- Accidental `echarts` / `zrender` imports in routes not in the chart allowlist
- Top-level `posthog-js` in any chunk (must be lazy-loaded via dynamic import)
- `data/<file>.json` strings in any chunk — that's a static-data leak via a server-only lib being imported from a client component

`npm run perf:bundle` automates the same checks against `.next/app-build-manifest.json` and is faster.

## Local server troubleshooting (Windows / OneDrive)

- Make sure the repo lives outside OneDrive (it does, at `C:\dev\trendingrepo`).
- Port 3023 in use → `npx kill-port 3023`.
- Stale `.next` cache after dependency change → `rm -rf .next` then rebuild. Don't delete `.next/cache` mid-build; let the postbuild step handle traces.
- Multiple `next dev` / `next build` running concurrently → `taskkill /im node.exe /f` then start one fresh.
- Always run `npm run typecheck` before committing — it surfaces subtle dynamic-render causes (e.g. accidental `cookies()` access).

## End-to-end verification flow for a perf fix

1. **Plan** — change one thing, know the predicted before/after delta.
2. **Build** — `npm run build`. Must pass without warnings.
3. **Bundle** — `npm run perf:bundle`. Compare before/after route totals; expect the predicted delta.
4. **Local probe** — `npm run start` in one terminal; `npm run perf:routes -- --only=/<route>` in another. Cache headers correct, TTFB within budget.
5. **Freshness** — `npm run freshness:check`. Must stay GREEN.
6. **Push to a preview branch** — Vercel auto-builds preview URL.
7. **Preview probe** — `npm run perf:routes -- --base-url=https://<preview>.vercel.app`. Hot routes HIT after warmup; no public route MISS twice.
8. **Lighthouse** — run on `/` and `/signals` from the preview URL; record before/after.
9. **Merge** — `post-deploy-smoke.yml` runs after deploy, uploads `perf-summary.json` artifact (30-day retention).
10. **Production sanity** — `npm run perf:routes:prod` 5 min after deploy lands. Expect HIT/STALE on all warmed routes.

## When a perf:routes failure appears in CI

The `post-deploy-smoke.yml` workflow runs `perf:routes:prod` and uploads `perf-summary.json`. During the warning-only rollout window (until ~2026-05-22), failures emit `::warning::` but don't fail the deploy. After PR6 flips `PERF_ENFORCE=true`, a failure breaks the deploy.

Common failure modes and fixes:

| Failure | Likely cause | Fix |
| --- | --- | --- |
| `cache_control_violation:no-store` | Page declares ISR but a child component forces dynamic | Grep child tree for `cookies/headers/auth/noStore/cache:"no-store"` |
| `cache_control_violation:private` | Response is being marked private at edge | Usually `Set-Cookie` from middleware on every request — gate cookie write |
| `warmup_cache_miss:MISS` | Route declared `warmupOnDeploy:true` but isn't actually warming | Confirm `cron-warmup.yml` matrix includes the route + workflow ran |
| `ttfb_budget:1820ms>800ms` | Page does heavy server work synchronously | Move work off render path (cron, on-demand refresh, deferred client fetch) |
| `transfer_budget:142kb>90kb` | Server-rendered payload is too large | Split RSC payload (move data behind a separate fetched API) |
| `forbidden_import:echarts` | A chart library landed on a route not in the chart allowlist | Lazy-load the chart with `next/dynamic` or split the theme import |
| `forbidden_import:posthog-js` | PostHog is being imported eagerly at module level | Use the `await import("posthog-js")` pattern in the provider |

## Reference

- `tasks/PERFORMANCE-SCALE-CACHE-TODO-2026-05-08.md` — the strategic TODO this playbook supports.
- `docs/ENGINE.md` — full workflow + cron inventory.
- `docs/SITE-WIREMAP.md` — route → data source map.
- `src/lib/api/cache.ts` — `READ_FAST/MEDIUM/SLOW/HEAVY_HEADERS` constants for read APIs.
- `perf/routes.json` — single source of truth for cache policy + budgets.
- `perf/.perfignore` — routes intentionally excluded from `lint:routes-config`.
