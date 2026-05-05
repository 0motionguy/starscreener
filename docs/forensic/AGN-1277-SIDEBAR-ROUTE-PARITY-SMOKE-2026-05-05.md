# AGN-1277 Sidebar route parity smoke with data-path notes (2026-05-05)

## Scope
- Issue: `AGN-1277`
- Lane: Frontend (sidebar reachability + route/data-path parity)
- Focus: `src/components/layout/SidebarContent.tsx` targets against `src/app/**` plus local runtime smoke

## Mandatory opening + freshness gate
- Read: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- Ran: `npm run freshness:check`
- Result: localhost `3023` reachable (not missing), but stale/degraded (`GET /api/health?soft=1 -> HTTP 500`).

## Sidebar target parity (`SidebarContent.tsx`)
Verified targets in code:
- Core links: `/`, `/skills`, `/mcp`, `/agent-repos`, `/breakouts`, `/consensus`
- Signals links: `/signals`, `/hackernews/trending`, `/lobsters`, `/devto`, `/bluesky/trending`, `/reddit/trending`, `/twitter`, `/producthunt`
- LLM/Pack links: `/npm`, `/huggingface`
- Launch links: `/funding`, `/revenue`, `/agent-commerce`
- Research/Explore/Tools links: `/arxiv/trending`, `/research`, `/digest`, `/ideas`, `/collections`, `/watchlist`, `/compare`, `/tierlist`, `/mindshare`, `/top10`
- Disabled (non-clickable): `Hackathons`, `Launch`

Route parity verdict:
- Clickable targets all resolve to a route implementation (`page.tsx` or `route.ts` redirect).
- Redirect-backed targets:
  - `/huggingface` -> `/huggingface/models` (`src/app/huggingface/route.ts`, HTTP 308 design)
  - `/collections` -> `/categories` (`src/app/collections/route.ts`, HTTP 308 design)
- No dead sidebar target found in current codebase.

## Data-path notes (verified from route files + wiremap)
- Derived fan-out surfaces (`/`, `/skills`, `/mcp`, `/agent-repos`, `/breakouts`, `/mindshare`, `/top10`) use `getDerivedRepos()` and/or ecosystem aggregators (`getSkillsSignalData`, `getMcpSignalData`) after `refresh*FromStore` hydration.
- Signal surfaces (`/signals`, `/hackernews/trending`, `/lobsters`, `/devto`, `/bluesky/trending`, `/reddit/trending`, `/twitter`, `/producthunt`) call source-specific `refresh*FromStore` loaders before rendering.
- Pack/research/funding surfaces (`/npm`, `/huggingface/*`, `/arxiv/trending`, `/research`, `/funding`, `/revenue`, `/agent-commerce`) likewise read via store refresh hooks, not raw ad-hoc file reads.
- Known non-data-store style page remains in sidebar scope: `/ideas` (`loadFeed` path), already tracked as broader product/data-path debt outside this heartbeat.

## Local smoke (`http://localhost:3023`)
Status check across all clickable sidebar targets in this heartbeat:
- Every checked route returned HTTP 500 (including `/`, `/skills`, `/signals`, `/twitter`, `/top10`, `/collections`, `/huggingface`).

Interpretation:
- Static route parity: PASS.
- Browser/runtime parity acceptance: BLOCKED by local runtime degradation (global 500 state), not by missing sidebar routes.

## Blocker handoff
- Blocked on: local runtime health (`/api/health?soft=1` and route responses returning 500).
- Needs: platform/runtime owner to restore localhost route health, then rerun this same sidebar smoke for render-level acceptance (overflow/overlap/no-fail assertions).
