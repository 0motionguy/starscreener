# AGN-590 Sidebar route visibility parity audit (2026-05-05)

## Scope
- Issue: `AGN-590`
- Owner lane: Frontend (`src/components/layout/SidebarContent.tsx` parity vs `src/app/**` routes)
- Objective: verify sidebar-visible destinations map to real app routes and collect browser evidence.

## Mandatory opening + freshness preflight
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran `npm run freshness:check` on `2026-05-05`; result:
  - localhost `3023` reachable (not missing)
  - `GET /api/health?soft=1` returned `HTTP 500`
  - product state is stale/degraded for this heartbeat

## Sidebar target extraction
Source: `src/components/layout/SidebarContent.tsx`

Direct links (`href`):
- `/`
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
- `/hackathons`
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

Programmatic pushes:
- `/trending/agents`
- `/trending/skills`
- `/trending/mcp`

Disabled nav item (no target): `Launch` (intentionally disabled row).

## Route parity verification against `src/app/**`
Verification method:
- Enumerated all page routes via `Get-ChildItem -Recurse src/app -Filter page.tsx`.
- Checked sidebar target coverage against route files plus explicit redirect route handlers.

Findings:
- All sidebar targets have an implemented destination.
- `/huggingface` is implemented as redirect route (`src/app/huggingface/route.ts`) and sends to `/huggingface/models` (HTTP 308 by design), so this is not a dead link.
- No missing `src/app/**` target was found for any sidebar destination.

## Browser/runtime evidence attempt (local)
Playwright sweep executed over all sidebar targets at `http://localhost:3023`.

Result:
- All checked routes returned `HTTP 500` in this local heartbeat.
- Because runtime is currently degraded, browser-level acceptance (render health / overlap / no-failure proof) cannot be concluded from local.

## Conclusion for AGN-590 heartbeat
- Static sidebar-to-route parity: PASS (no dead/missing targets in code).
- Runtime/browser parity proof: BLOCKED by local server health regression (`/api/health?soft=1` returns 500 and route loads return 500).

## Unblock owner and action
- Blocked on: platform/runtime health regression on localhost (`HTTP 500` path).
- Needs: platform engineer restore local app health so sidebar routes render non-500, then rerun Playwright parity pass for final browser evidence.
