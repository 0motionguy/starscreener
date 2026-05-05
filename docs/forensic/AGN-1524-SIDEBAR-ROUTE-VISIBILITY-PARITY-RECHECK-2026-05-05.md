# AGN-1524 Sidebar route visibility parity recheck (2026-05-05)

## Scope
- Issue: `AGN-1524`
- Owner lane: Frontend (`src/components/layout/SidebarContent.tsx`, route parity + reachability)
- Goal: recheck current sidebar visibility parity against real routes and live production status.

## Mandatory opening + freshness gate
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran `npm run freshness:check`.
- Result at `2026-05-05`: localhost `http://localhost:3023` reachable (not missing), product stale/degraded:
  - `summary: green=36 yellow=12 red=2 dead=0 blocking_non_green=12 advisory_non_green=2`
  - RED: `producthunt`, `trending-repos`

## Sidebar nav extraction (current code)
Source: `src/components/layout/SidebarContent.tsx`.

Clickable routes currently present:
- `/`
- `/skills` (via `router.push`/`prefetchHref`)
- `/mcp` (via `router.push`/`prefetchHref`)
- `/agent-repos` (via `router.push`/`prefetchHref`)
- `/breakouts`
- `/consensus`
- `/signals`
- `/hackernews/trending`
- `/lobsters`
- `/devto`
- `/bluesky/trending`
- `/reddit/trending`
- `/twitter`
- `/producthunt`
- `/npm`
- `/huggingface`
- `/funding`
- `/revenue`
- `/agent-commerce`
- `/arxiv/trending`
- `/research`
- `/digest`
- `/ideas`
- `/collections`
- `/watchlist`
- `/compare`
- `/tierlist`
- `/mindshare`
- `/top10`

Disabled placeholders (not clickable):
- `Hackathons`
- `Launch`

## Local route parity check (`src/app/**`)
Verification from `src/app/**/page.tsx` + redirect handlers:
- Every clickable sidebar target has a matching local route implementation.
- `/huggingface` is implemented as route handler redirect (`src/app/huggingface/route.ts`) to a concrete huggingface page path.
- No current sidebar item points to a missing local route.

## Production reachability check (`https://trendingrepo.com`)
Method: `curl.exe -L -s -o NUL -w "%{http_code}"` for each clickable sidebar route.

Result:
- All 29 clickable sidebar routes returned `200`.
- No current production 404 from clickable sidebar links.

## Parity result
- Sidebar route visibility parity: PASS.
- Regression noted from older audit state: prior `/hackathons` clickable-404 mismatch is no longer present in current sidebar because the entry is now disabled.

## Acceptance decision for AGN-1524
- Done criteria met for this recheck heartbeat:
  - navigation items map to actual local routes
  - clickable sidebar destinations are production-reachable (200)
  - disabled placeholders are non-clickable and do not break route parity
