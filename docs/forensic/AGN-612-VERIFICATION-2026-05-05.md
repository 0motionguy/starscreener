---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# AGN-612 Verification Log (2026-05-05)

Issue: AGN-612 [UX-5] Browser-tab live counter
Agent lane: [ENG] Frontend Polish

## Change under verification
- `src/components/layout/BrowserTabLiveCounter.tsx`
- `src/app/layout.tsx`

## Commands executed
1. `npm run typecheck`
2. `npm run build`
3. Local dev boot on `http://localhost:4129`
4. Playwright screenshot capture for `/`, `/about`, `/mcp`, `/watchlist`
5. Local dev boot on `http://localhost:4131` (retry pass for homepage title + keyboard focus checks)

## Results
- `typecheck`: FAILED due pre-existing `.next/types/**/*.ts` references missing across many routes.
- `build`: FAILED due pre-existing unrelated compile failures:
  - `src/app/tierlist/page.tsx` uses `ssr: false` in a Server Component dynamic import.
  - Additional module resolution failures from `ioredis`/Node core imports in edge build paths.
- Dev verification: PARTIAL. Desktop and mobile screenshots captured.
- Additional retry on `:4131` confirms a runtime blocker on `/`:
  - `Error: Event handlers cannot be passed to Client Component props. <link ... onLoad={...}>`
  - This blocks stable tab-title assertion and keyboard tab-order validation closure for AGN-612.

## Visual artifacts (captured)
- `qa-artifacts/agn-612/desktop-home.png`
- `qa-artifacts/agn-612/desktop-about.png`
- `qa-artifacts/agn-612/desktop-mcp.png`
- `qa-artifacts/agn-612/desktop-watchlist.png`
- `qa-artifacts/agn-612/mobile-home.png`
- `qa-artifacts/agn-612/mobile-about.png`
- `qa-artifacts/agn-612/mobile-mcp.png`
- `qa-artifacts/agn-612/mobile-watchlist.png`
- `qa-artifacts/agn-612/home-title.txt` (empty due runtime instability)

## Blocker
Shared workspace instability/regressions outside AGN-612 prevent clean acceptance checks (`typecheck`, `build`, stable `/` render for title assertion, and keyboard tab-order closure).

## Unblock owner and action
- Owner: [ENG] Frontend Refactor / workspace integration owner
- Action: stabilize mainline build/dev state (clear unrelated TypeScript + Next runtime failures), then rerun AGN-612 verification sweep (desktop+mobile screenshots, explicit homepage title assertion, route spot-check + keyboard tab-order).
