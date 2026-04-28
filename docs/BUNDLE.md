# Bundle size — baseline + top heavy modules

Snapshot from a production `npm run analyze` (Next.js 15.5.15 + webpack, ANALYZE=true).
Re-run via `npm run analyze` to refresh; reports land in `.next/analyze/{client,nodejs,edge}.html`.

## Route sizes (per-page First Load JS)

From `next build` output. "Stat" is the route's own page chunk; "First Load" includes the shared 102 kB.

| Route | Page chunk | First Load |
|---|---:|---:|
| `/reddit/trending` | 53.3 kB | 167 kB |
| `/compare` | 17.8 kB | 160 kB |
| `/repo/[owner]/[name]` | 10.8 kB | 136 kB |
| `/search` | 6.23 kB | 179 kB |
| `/predict` | 5.67 kB | 108 kB |
| `/submit` | 5.57 kB | 111 kB |
| `/watchlist` | 5.12 kB | 178 kB |
| `/ideas` | 5.01 kB | 111 kB |
| `/funding` | 3.44 kB | 114 kB |
| `/breakouts` | 3.04 kB | 109 kB |
| **shared (every route)** | — | **102 kB** |

The shared 102 kB splits across two chunks:
- `chunks/4bd1b696-…` — 54.2 kB (framework + react-dom)
- `chunks/1255-…` — 45.7 kB (mostly recharts + framer-motion runtime)

## Top packages by parsed size (client bundle)

`@next/bundle-analyzer` walks the client chunk graph and groups leaves by `node_modules/<pkg>`. Snapshot:

| Package | Parsed | Gzip | Files |
|---|---:|---:|---:|
| `next` | 998.1 kB | 367.3 kB | 347 |
| `<app>` (our code) | 667.1 kB | 238.3 kB | 318 |
| `recharts` | 282.1 kB | 109.9 kB | 237 |
| `react-dom` | 167.3 kB | 53.1 kB | 4 |
| `framer-motion` | 122.5 kB | 40.7 kB | 261 |
| `lucide-react` | 104.0 kB | 72.2 kB | 453 |
| `victory-vendor` | 46.0 kB | 15.5 kB | 81 |
| `sonner` | 33.1 kB | 9.1 kB | 1 |
| `@reduxjs/toolkit` | 19.1 kB | 7.8 kB | 3 |
| `es-toolkit` | 18.2 kB | 12.2 kB | 54 |
| `decimal.js-light` | 12.6 kB | 5.4 kB | 1 |

`ioredis` (92 kB) and `@upstash/redis` (70 kB) appear in the client report because the analyzer scans every chunk graph, but they're stubbed at the client boundary (`next.config.ts` `webpack.fallback` + `turbopack.resolveAlias`) and never actually load in browsers. They show up here as "would-be parsed" stat-size only, not in the gzip column anyone downloads.

## What's actually loadable from the parsed numbers

The 102 kB shared First Load is dominated by the framework chunk (~54 kB gzip) and the recharts/framer-motion split (~45 kB gzip). On routes that import a chart, recharts pulls another ~30 kB-50 kB on top.

## Already-optimized

- `lucide-react`, `recharts` — declared in `next.config.ts` `experimental.optimizePackageImports`, so barrel imports are rewritten to named-export-only at build time.
- `framer-motion` — INTENTIONALLY excluded from `optimizePackageImports` (its 12.x ESM barrel re-exports break Next 15's RSC chunk graph during `/_not-found` static prerender). Documented at `next.config.ts:25-31`.
- `ioredis` + `@upstash/redis` — `serverExternalPackages` so they resolve as Node externals at runtime instead of being scanned by webpack.

## Plausible next moves (NOT shipped — proposals)

1. **`recharts` per-route dynamic import** — 282 kB / 110 kB gzip is the biggest single client dep that isn't framework. Routes that conditionally render charts (e.g. compare, repo detail) could `dynamic(() => import(…), { ssr: false })` to keep the chunk off the initial First Load. Would need to verify FCP impact vs CLS from the chart skeleton.
2. **`@reduxjs/toolkit` audit** — 19 kB parsed for a project that mostly uses Zustand. Likely a transitive (recharts? sonner?) — verify and tree-shake if so.
3. **`/reddit/trending` page** — 53 kB own-chunk is the biggest route after frameworks. Owner: `SubredditMindshareCanvas` (already on the same `usePhysicsBubbles` hook as the bubble map). One concrete win: lazy-load the canvas below the fold.
4. **`framer-motion` watch** — 122 kB / 40 kB gzip is heavy. If we drop Recharts-driven animations or ship V2 surfaces with CSS-only transitions, framer might be a candidate for partial dynamic loading on heavy routes.

## How to refresh

```bash
npm run analyze
# → .next/analyze/client.html  (interactive treemap of the client bundle)
# → .next/analyze/nodejs.html  (server bundle)
# → .next/analyze/edge.html    (edge runtime bundle)
```

The build crashes near the end on Windows under OneDrive (worker exit code -1 / `Build error occurred`) AFTER the reports are written. Reports are still readable; ignore the trailing build error on this machine. Vercel CI is unaffected.

If running on Windows + OneDrive: copy `.next/analyze/client.html` to a temp dir before reading — OneDrive sync can race the read.
