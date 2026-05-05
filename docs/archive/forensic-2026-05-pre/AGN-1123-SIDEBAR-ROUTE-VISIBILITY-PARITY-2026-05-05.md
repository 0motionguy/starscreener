# AGN-1123 Sidebar route visibility parity check (2026-05-05)

## Scope
- Issue: `AGN-1123`
- Lane: Frontend route visibility parity (`src/components/layout/SidebarContent.tsx` vs actual app routes)

## Mandatory opening and freshness gate
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran `npm run freshness:check`.
- Result: localhost `http://localhost:3023` reachable (not missing), but stale/degraded (`blocking_non_green=8`; `trending-repos` RED).

## Sidebar target set (current code)
Source: `src/components/layout/SidebarContent.tsx`

Enabled nav destinations:
- `/`
- `/skills`
- `/mcp`
- `/agent-repos`
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

Intentionally disabled rows (no route navigation):
- `Hackathons`
- `Launch`

## File-system parity verification
Method: `Test-Path` checks for `src/app/<route>/page.tsx` or `src/app/<route>/route.ts`.

Result:
- Every enabled sidebar destination resolved to an existing route implementation.
- No missing/dead route target in current frontend nav config.

## Runtime route checks (local)
Method: `Invoke-WebRequest` against localhost for each sidebar route.

Result snapshot:
- HTTP `500`: `/huggingface`, `/collections`, `/compare`, `/tierlist`
- `ERR` (request failure/timeout) on most remaining routes including `/`, `/skills`, `/mcp`, `/signals`, `/twitter`, `/top10`.

Interpretation:
- Static route parity is confirmed.
- Browser-visible path acceptance cannot be concluded because local runtime responses are unstable/degraded in this heartbeat.

## Heartbeat outcome
- Code parity: PASS.
- Browser/runtime parity evidence: BLOCKED on local app health.

## Unblock owner/action
- Blocked on: local runtime instability on `localhost:3023` (route failures and 500s).
- Needs: platform/runtime owner to restore healthy local route responses (non-500/non-ERR), then rerun browser/Playwright sweep for final visible-path proof.
