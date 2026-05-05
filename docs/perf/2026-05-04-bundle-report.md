# Bundle Report — 2026-05-04 (AGN-927)

## Command + status
- Command run: `npm run analyze` (executed 2026-05-05 local)
- Result: partial success
  - Generated: `.next/analyze/nodejs.html`, `.next/analyze/edge.html`
  - Missing: `.next/analyze/client.html` (build terminated before client report write)

## Build failure details (blocker)
Analyzer run failed due to edge-route dependency leakage from server-only modules:
- `Module not found: Can't resolve 'string_decoder'` (via `ioredis` chain)
- `Module not found: Can't resolve 'path'` (`src/lib/data-store.ts`)
- `Module not found: Can't resolve 'crypto'` (via `ioredis` chain)
- Trace includes `src/app/api/oembed/route.ts` edge app-route path.

Unblock owner/action:
- Owner: `[ENG] Backend` / runtime owner for edge route dependency boundaries.
- Action: remove server-only `data-store`/`ioredis` chain from edge route import graph so `npm run analyze` can emit `client.html`.

## Top 10 fattest modules + action
Source: latest committed client analyzer baseline in `docs/BUNDLE.md` (used because current run did not emit client report).

| Rank | Module/package | Parsed | Gzip | Action | Rationale |
|---|---|---:|---:|---|---|
| 1 | `next` | 998.1 kB | 367.3 kB | `keep` | Framework baseline; optimize app-level imports first. |
| 2 | `<app>` | 667.1 kB | 238.3 kB | `dynamic-import` | Split heavy client islands and move static sections to Server Components. |
| 3 | `recharts` | 282.1 kB | 109.9 kB | `dynamic-import` | Route-gate chart code to avoid paying on non-chart page loads. |
| 4 | `react-dom` | 167.3 kB | 53.1 kB | `keep` | Runtime floor for React hydration. |
| 5 | `framer-motion` | 122.5 kB | 40.7 kB | `dynamic-import` | Only load on motion-heavy surfaces; prefer CSS transitions for simple cases. |
| 6 | `lucide-react` | 104.0 kB | 72.2 kB | `tree-shake` | Enforce named icon imports; eliminate broad icon pulls. |
| 7 | `victory-vendor` | 46.0 kB | 15.5 kB | `drop` | Remove by chart-stack unification (AGN-538 alignment). |
| 8 | `sonner` | 33.1 kB | 9.1 kB | `dynamic-import` | Keep toast UI lazy-mounted off initial route payloads. |
| 9 | `@reduxjs/toolkit` | 19.1 kB | 7.8 kB | `drop` | Audit/remove if dead or transitive given Zustand-first app state. |
| 10 | `es-toolkit` | 18.2 kB | 12.2 kB | `tree-shake` | Replace broad imports with per-function imports in shared client paths. |

## Child issues required by acceptance
Child issue tracks to create under AGN-927:
1. Tree-shake track: `lucide-react`, `es-toolkit` import narrowing (+ validate any `@reduxjs/toolkit` dead usage).
2. Dynamic-import track: `<app>` client islands, `recharts`, `framer-motion`, `sonner` route-gated loading.

## Next action
- After edge-route blocker is resolved, rerun `npm run analyze`, replace snapshot-derived rows with fresh `client.html` data, then post delta (`before -> after`) per module.
