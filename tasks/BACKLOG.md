# BACKLOG — Items deferred from current sprint

## From audit (2026-05-04) — not in Sprint 1
- Profile completeness scanner (Sprint 3)
- Image coverage backfill (Sprint 3)
- Cross-mention completeness (Sprint 3)
- News + funding RSS sources (Sprint 2)
- AI vendor blog RSS (Sprint 2)
- Workflow consolidation (Sprint 5)
- VPS migration (Sprint 6, optional)

## Discovered during current work
- 2026-05-03 wire/UI inspection:
  - Update `docs/SITE-WIREMAP.md` after the current sidebar drift is resolved: local `SidebarContent.tsx` points Trending Repos at `/githubrepo`, while production and the wiremap still use `/`; local also removes sidebar `Top 100` while production still links `/top`.
  - Deploy or revert `/githubrepo` wiring before release. Current local route exists, but production `https://trendingrepo.com/githubrepo` returns 404.
  - Fix mobile topbar horizontal overflow at 390px. Production screenshots show the `Drop repo` action clipping past the right edge on `/`, `/skills`, `/mcp`, `/signals`, `/compare`, and `/top10`.
  - Fix mobile `/twitter` table overflow. The `TwitterLeaderboardTable` uses a `min-w-[920px]` grid that expands the page past the viewport.
  - Decide expected unauthenticated behavior for `/watchlist`: production currently logs 503 responses from `/api/auth/session`, `/api/pipeline/alerts`, and `/api/pipeline/alerts/rules`.
  - Replace brittle external icon/avatar fetches or add fallbacks: production logs favicon/avatar failures from gstatic favicon, unavatar X avatars, and Clearbit logos.
  - Apply the documented Windows OneDrive `.next` junction workaround before relying on local UI crawls; current `.next` manifest/type races caused local dev 500s and `npm run typecheck` TS6053 missing generated type files.
- Document or script the Windows OneDrive `.next` dev/build workaround. On 2026-05-03 the local `.next` directory was a junction at `%TEMP%\trendingrepo-next-dev`; `next dev` and `next build` both need `NODE_PATH=C:\Users\mirko\OneDrive\Desktop\STARSCREENER\node_modules` so chunks emitted under `%TEMP%` can resolve externals like `react/jsx-runtime` and Next's app-route runtime.
- Decide expanded freshness semantics for advisory side channels: `mcp-dependents` needs `LIBRARIES_IO_API_KEY`, `mcp-smithery-rank` needs `SMITHERY_API_KEY`, `skill-install-snapshots` currently has no install data, `model-usage` can have successful zero-event cron runs, and `hotness-snapshots` can publish only populated domains. Either provision the missing keys/data or mark these rows non-blocking in `/api/cron/freshness/state`.
