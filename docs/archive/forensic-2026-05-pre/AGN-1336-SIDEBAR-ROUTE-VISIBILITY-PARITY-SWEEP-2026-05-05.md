# AGN-1336 Sidebar route visibility parity sweep (2026-05-05)

## Scope
- Issue: `AGN-1336`
- Objective: verify sidebar route visibility parity across:
  - `src/components/layout/SidebarContent.tsx`
  - local route implementation under `src/app/**`
  - production reachability (`https://trendingrepo.com`)

## Mandatory opening + freshness gate
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran: `npm run freshness:check`
- Result: `freshness-check: request timed out while contacting http://localhost:3023`.

## Sidebar parity table

| Sidebar entry route | Local file target | Expected visibility | Production status |
|---|---|---|---|
| `/` | `src/app/page.tsx` | visible | 200 |
| `/skills` | `src/app/skills/page.tsx` | visible | 200 |
| `/mcp` | `src/app/mcp/page.tsx` | visible | 200 |
| `/agent-repos` | `src/app/agent-repos/page.tsx` | visible | 200 |
| `/breakouts` | `src/app/breakouts/page.tsx` | visible | 200 |
| `/consensus` | `src/app/consensus/page.tsx` | visible | 200 |
| `/signals` | `src/app/signals/page.tsx` | visible | 200 |
| `/hackernews/trending` | `src/app/hackernews/trending/page.tsx` | visible | 200 |
| `/lobsters` | `src/app/lobsters/page.tsx` | visible | 200 |
| `/devto` | `src/app/devto/page.tsx` | visible | 200 |
| `/bluesky/trending` | `src/app/bluesky/trending/page.tsx` | visible | 200 |
| `/reddit/trending` | `src/app/reddit/trending/page.tsx` | visible | 200 |
| `/twitter` | `src/app/twitter/page.tsx` | visible | 200 |
| `/producthunt` | `src/app/producthunt/page.tsx` | visible | 200 |
| `/npm` | `src/app/npm/page.tsx` | visible | 200 |
| `/huggingface` | `src/app/huggingface/route.ts` | visible | 200 |
| `/funding` | `src/app/funding/page.tsx` | visible | 200 |
| `/revenue` | `src/app/revenue/page.tsx` | visible | 200 |
| `/agent-commerce` | `src/app/agent-commerce/page.tsx` | visible | 200 |
| `/hackathons` | `src/app/hackathons/page.tsx` | visible | **404** |
| `/arxiv/trending` | `src/app/arxiv/trending/page.tsx` | visible | 200 |
| `/research` | `src/app/research/page.tsx` | visible | 200 |
| `/digest` | `src/app/digest/page.tsx` | visible | 200 |
| `/ideas` | `src/app/ideas/page.tsx` | visible | 200 |
| `/collections` | `src/app/collections/route.ts` | visible | 200 |
| `/watchlist` | `src/app/watchlist/page.tsx` | visible | 200 |
| `/compare` | `src/app/compare/page.tsx` | visible | 200 |
| `/tierlist` | `src/app/tierlist/page.tsx` | visible | 200 |
| `/mindshare` | `src/app/mindshare/page.tsx` | visible | 200 |
| `/top10` | `src/app/top10/page.tsx` | visible | 200 |

## Mismatch findings
1. `HIGH` - `/hackathons` is visible in sidebar and exists locally, but returns `404` in production.
   - Impact: users can click into a broken route.
   - Action: hide `/hackathons` from sidebar until route is live in production, or deploy route before exposing nav.
2. `LOW` - `Launch` remains disabled placeholder in sidebar.
   - Impact: no click path, so no runtime breakage.
   - Action: keep disabled until route/data are implemented.

## HTTP verification evidence
- Method: `curl -L --max-time 20 -D - -o NUL https://trendingrepo.com/<route>`
- Key result:
  - `/hackathons` -> `404`
  - All other checked clickable sidebar routes -> `200`

