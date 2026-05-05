# AGN-927 Bundle Analyzer Report (2026-05-05)

## Scope
- Issue: `AGN-927` `[QUE-24][PERF] Bundle analyzer report — top 10 fattest modules + per-module action`
- Runtime: Next.js `15.5.15`
- Command attempted: `npm run analyze` on 2026-05-05

## Build status
- `npm run analyze` generated:
  - `.next/analyze/nodejs.html` (2026-05-05 00:28 local)
  - `.next/analyze/edge.html` (2026-05-05 00:29 local)
- It failed before `client.html` due to existing edge build import leakage:
  - `Module not found: Can't resolve 'string_decoder'` via `ioredis` chain
  - `Module not found: Can't resolve 'path'` from `src/lib/data-store.ts`
  - `Module not found: Can't resolve 'crypto'` via `ioredis`
  - Import trace rooted at `src/app/api/oembed/route.ts` edge route build path.

## Data source for top-10 client modules
Because this run failed before writing `client.html`, client top-module ranking is taken from the latest committed analyzer snapshot in `docs/BUNDLE.md` (same Next baseline, prior successful analyze run).

## Top 10 fattest modules/packages + action

| Rank | Module/package | Parsed | Gzip | Action |
|---|---|---:|---:|---|
| 1 | `next` | 998.1 kB | 367.3 kB | Keep as framework floor; focus on reducing app and chart imports that sit on top of framework cost. |
| 2 | `<app>` (local code) | 667.1 kB | 238.3 kB | Split large client islands by route and convert non-interactive sections to Server Components to reduce shared app JS. |
| 3 | `recharts` | 282.1 kB | 109.9 kB | Gate charts behind route-level `dynamic()` islands and do not load chart code on routes without visible charts. |
| 4 | `react-dom` | 167.3 kB | 53.1 kB | Baseline runtime cost; minimize additional client components to avoid compounding hydration work. |
| 5 | `framer-motion` | 122.5 kB | 40.7 kB | Restrict to routes needing complex animation; replace simple transitions with CSS where possible. |
| 6 | `lucide-react` | 104.0 kB | 72.2 kB | Continue strict named imports only; audit any icon-heavy client components and move decorative icons to server-rendered SVG where possible. |
| 7 | `victory-vendor` | 46.0 kB | 15.5 kB | Verify transitive owner (likely chart stack); remove by consolidating chart surface per AGN-538 direction. |
| 8 | `sonner` | 33.1 kB | 9.1 kB | Keep toast UI lazy-mounted so non-interactive pages do not pay upfront. |
| 9 | `@reduxjs/toolkit` | 19.1 kB | 7.8 kB | Audit import path owner; remove if dead/transitive since primary state stack is Zustand. |
| 10 | `es-toolkit` | 18.2 kB | 12.2 kB | Replace broad imports with per-function imports and dedupe utility usage in shared client code. |

## Immediate unblock required (owner + action)
- Unblock owner: `[ENG] Backend` / platform runtime owner for edge route compatibility.
- Unblock action: fix edge-route server-only dependency leakage from `src/app/api/oembed/route.ts` import chain (`data-store`/`ioredis`/Node built-ins) so `npm run analyze` can complete and emit `.next/analyze/client.html`.

## Frontend follow-up once unblocked
1. Re-run `npm run analyze` and replace snapshot-derived table with fresh `client.html` values.
2. Produce a delta table (`before -> after`) after first optimization pass (targeting `recharts`, `framer-motion`, and `<app>` shared client code).
3. Enforce module budget tracking in CI with current `scripts/check-bundle-size-budget.mjs` plus package-level watchlist for top offenders.
