# TrendingRepo Agentic Website Mode Audit

## Route map

- `/`, `/githubrepo`, `/agent-repos`, category pages: repo leaderboards backed by `getDerivedRepos()` and table/terminal controls.
- `/search`: query and category surface backed by `/api/search`.
- `/repo/[owner]/[name]`: canonical repo detail backed by `buildCanonicalRepoProfile()` and `/api/repos/[owner]/[name]?v=2`.
- `/compare`: multi-repo compare backed by local compare state plus `/api/compare` and `/api/compare/github`.
- `/watchlist`: local/private watchlist surface backed by Zustand localStorage and optional private watchlist APIs.
- `/mcp`, `/skills`: agent/MCP discovery surfaces.

## Data source map

- TrendingRepo UI reads the existing data-store and route APIs; Agentic Mode does not add a crawler.
- Toolbox remains the data engine for signal health, skills, scans, `/v1/query`, and x402-priced execution when server env is configured.
- Current local freshness gate requires a running server on `localhost:3023`; without it `npm run freshness:check` reports `ECONNREFUSED`.

## UI control map

- Annotated controls: global search input, search category chips, leaderboard sort buttons, repo rows, repo detail links, compare buttons, and watchlist buttons.
- Safe actions: search, filter, sort, open repo, compare, scroll, wait, read-only brief.
- Confirmation actions: watchlist changes, alerts, export/share, Toolbox scan handoff, paid x402 execution.
- Blocked actions: arbitrary JavaScript, API key/token/cookie access, hidden input extraction, destructive saved-state deletion, paid execution without quote/confirmation.

## Liveness gaps

- TypeScript/language filters are not globally exposed on `/search`; the operator only applies them when a visible control exists.
- Toolbox deep scan depends on `TOOLBOX_API_URL` and `TOOLBOX_API_KEY`; without those env vars the panel reports that handoff is not configured.
- Brief generation in the first slice is deterministic from selected repo names; richer evidence should come from Toolbox/AISO scans.

## First vertical slice

Command: `Find browser agents like PageAgent and compare the top three.`

Flow:

1. Navigate to `/search?q=browser%20agent%20DOM%20automation&category=agent`.
2. Wait for visible results.
3. Click the top three visible compare controls.
4. Navigate to `/compare`.
5. Render a short brief and offer confirmation-gated Toolbox/watchlist CTAs.
