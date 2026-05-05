# AGN-1196 Frontend empty/loading/error state coverage audit (2026-05-05)

## Scope
- Issue: `AGN-1196`
- Surface: top 12 release-smoke routes from `docs/regression-map.md`
- Requirement: loading/error boundary presence + meaningful empty-state path + per-route command/browser evidence

## Mandatory preflight evidence
- Session-opening docs re-read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` (2026-05-05 heartbeat): localhost:3023 reachable; freshness gate fails (`health=stale`, `blocking_non_green=12`, includes `trending-repos RED`, `producthunt RED`).

## Top 12 route matrix

| Route | loading.tsx | error.tsx | Empty-state quality | Evidence |
|---|---|---|---|---|
| `/` | yes | yes | PASS (home has branded fallback via `HomeEmptyState`) | command + source grep |
| `/consensus` | yes | yes | PASS (`items.length===0` + warming copy + gated fallback) | command + source grep |
| `/skills` | yes | yes | PASS (leaderboard empty/new/cited empty copy) | command + source grep |
| `/mcp` | yes | yes | PASS (explicit MCP empty panel) | command + source grep |
| `/agent-repos` | yes | yes | PASS after fix (route-level warming panel when rows empty) | code diff + source grep |
| `/breakouts` | yes | yes | PASS (filter empty + fallback guidance) | command + source grep |
| `/top` | yes | yes | PASS after fix (route-level warming shell when `repos.length===0`) | code diff + source grep |
| `/signals` | yes | yes | PASS after fix (filter-aware `no signals match current filters`) | code diff + source grep |
| `/hackernews/trending` | yes | yes | PASS (`ColdState` + windowed table support) | command + source grep |
| `/lobsters` | yes | yes | PASS (`ColdState` + windowed table empty title) | command + source grep |
| `/devto` | yes | yes | PASS (`ColdState` + per-window empty subtitle with scrape-lag hint) | command + source grep |
| `/bluesky/trending` | yes | yes | PASS (`ColdState` + windowed table) | command + source grep |

## Production reachability evidence (browser-command)
Command used: `Invoke-WebRequest https://trendingrepo.com<route>` + `<title>` extraction.

- `/` -> `200` -> `TrendingRepo — The trend map for open source`
- `/consensus` -> `200` -> `Trending Consensus — TrendingRepo`
- `/skills` -> `200` -> `Trending Skills - TrendingRepo — TrendingRepo`
- `/mcp` -> `200` -> `Trending MCP - TrendingRepo — TrendingRepo`
- `/agent-repos` -> `200` -> `Agent Repos — TrendingRepo — TrendingRepo`
- `/breakouts` -> `200` -> `Cross-Signal Breakouts — TrendingRepo`
- `/top` -> `200` -> `Top 100 GitHub Repos by Stars — TrendingRepo`
- `/signals` -> `200` -> `Signals — Cross-Source Newsroom — TrendingRepo`
- `/hackernews/trending` -> `200` -> `Trending on Hacker News — TrendingRepo`
- `/lobsters` -> `200` -> `TrendingRepo — Lobsters Trending — TrendingRepo`
- `/devto` -> `200` -> `Trending on Dev.to — TrendingRepo`
- `/bluesky/trending` -> `200` -> `Trending on Bluesky — TrendingRepo`

## Prioritized fix-ready list (ownership)
No P0/P1 UI-state gaps remain for the audited top-12 routes.

P2 follow-ups:
1. Add explicit browser screenshot artifact capture in CI for these 12 routes (owner: frontend engineer).
2. Stabilize freshness blockers causing stale/degraded local gate failures (`trending-repos`, `producthunt`, related blockers) to reduce false blocked audits (owner: data/platform engineer).

## Conclusion
Acceptance intent for AGN-1196 is met: all top-12 routes have loading/error boundaries and meaningful empty states; missing empty-state gaps were closed on `/agent-repos`, `/top`, and `/signals` in this heartbeat sequence.
