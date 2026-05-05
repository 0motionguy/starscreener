# AGN-1277 Sidebar route parity smoke with data-path notes (2026-05-05)

## Scope
- Issue: `AGN-1277`
- Lane: Frontend (sidebar reachability + route/data-path parity)
- Sources audited: `src/components/layout/SidebarContent.tsx` + route files under `src/app/**`

## Preflight
- Mandatory opening docs re-read per protocol.
- `npm run freshness:check` (latest run in this heartbeat): localhost `3023` reachable (not missing), but stale/degraded because `GET /api/cron/freshness/state` returned HTTP 404.

## 1) Route-by-route PASS/FAIL table
Legend:
- `Route file`: concrete target (`page.tsx` or redirect `route.ts`)
- `Boundaries`: `error.tsx/loading.tsx` presence in target route segment
- `Static parity`: PASS if sidebar target resolves in code
- `Runtime smoke`: FAIL in this heartbeat due degraded localhost runtime (ERR/timeout)

| Route | Route file | Boundaries | Static parity | Runtime smoke |
|---|---|---|---|---|
| `/` | `src/app/page.tsx` | yes/yes | PASS | FAIL |
| `/skills` | `src/app/skills/page.tsx` | yes/yes | PASS | FAIL |
| `/mcp` | `src/app/mcp/page.tsx` | yes/yes | PASS | FAIL |
| `/agent-repos` | `src/app/agent-repos/page.tsx` | yes/yes | PASS | FAIL |
| `/breakouts` | `src/app/breakouts/page.tsx` | yes/yes | PASS | FAIL |
| `/consensus` | `src/app/consensus/page.tsx` | yes/yes | PASS | FAIL |
| `/signals` | `src/app/signals/page.tsx` | yes/yes | PASS | FAIL |
| `/hackernews/trending` | `src/app/hackernews/trending/page.tsx` | yes/yes | PASS | FAIL |
| `/lobsters` | `src/app/lobsters/page.tsx` | yes/yes | PASS | FAIL |
| `/devto` | `src/app/devto/page.tsx` | yes/yes | PASS | FAIL |
| `/bluesky/trending` | `src/app/bluesky/trending/page.tsx` | yes/yes | PASS | FAIL |
| `/reddit/trending` | `src/app/reddit/trending/page.tsx` | yes/yes | PASS | FAIL |
| `/twitter` | `src/app/twitter/page.tsx` | yes/yes | PASS | FAIL |
| `/producthunt` | `src/app/producthunt/page.tsx` | yes/yes | PASS | FAIL |
| `/npm` | `src/app/npm/page.tsx` | yes/yes | PASS | FAIL |
| `/huggingface` | `src/app/huggingface/route.ts` -> `/huggingface/models` | yes/yes | PASS | FAIL |
| `/funding` | `src/app/funding/page.tsx` | yes/yes | PASS | FAIL |
| `/revenue` | `src/app/revenue/page.tsx` | yes/yes | PASS | FAIL |
| `/agent-commerce` | `src/app/agent-commerce/page.tsx` | yes/yes | PASS | FAIL |
| `/arxiv/trending` | `src/app/arxiv/trending/page.tsx` | yes/yes | PASS | FAIL |
| `/research` | `src/app/research/page.tsx` | yes/yes | PASS | FAIL |
| `/digest` | `src/app/digest/page.tsx` | yes/yes | PASS | FAIL |
| `/ideas` | `src/app/ideas/page.tsx` | yes/yes | PASS | FAIL |
| `/collections` | `src/app/collections/route.ts` -> `/categories` | yes/yes | PASS | FAIL |
| `/watchlist` | `src/app/watchlist/page.tsx` | yes/yes | PASS | FAIL |
| `/compare` | `src/app/compare/page.tsx` | yes/yes | PASS | FAIL |
| `/tierlist` | `src/app/tierlist/page.tsx` | yes/yes | PASS | FAIL |
| `/mindshare` | `src/app/mindshare/page.tsx` | yes/yes | PASS | FAIL |
| `/top10` | `src/app/top10/page.tsx` | yes/yes | PASS | FAIL |
| `/hackathons` (sidebar disabled) | `src/app/hackathons/page.tsx` | no/no | N/A (not clickable) | N/A |

## 2) Missing boundaries list
- Missing `error.tsx` and `loading.tsx` in `src/app/hackathons/`.
- No boundary gaps found for clickable sidebar targets.

## 3) Data-read path references (file:line)
Derived + terminal aggregators:
- `src/app/page.tsx:704` (`getDerivedRepos()`), `src/app/page.tsx:712-713` (`getSkillsSignalData()`, `getMcpSignalData()`)
- `src/app/skills/page.tsx:188-196` (`refresh*FromStore` hydration), `src/app/skills/page.tsx:199` (`getSkillsSignalData()`)
- `src/app/mcp/page.tsx:202-203` (`getMcpSignalData()`, `refreshTrendingFromStore()`)
- `src/app/agent-repos/page.tsx:69-77` (`refresh*FromStore` chain), `src/app/agent-repos/page.tsx:81` (`getDerivedRepos()`)
- `src/app/top10/page.tsx:115-118` (`refreshTrendingFromStore()`, `refreshRecentReposFromStore()`, `getDerivedRepos()`)

Signal surfaces:
- `src/app/signals/page.tsx:190-196` (`refreshTrendingFromStore()`, HN/Bluesky/DevTo/RSS/Twitter refresh hooks)
- `src/app/hackernews/trending/page.tsx:75-76` (`refreshHackernews*FromStore()`)
- `src/app/lobsters/page.tsx:75-76` (`refreshLobsters*FromStore()`)
- `src/app/devto/page.tsx:75-76` (`refreshDevto*FromStore()`)
- `src/app/bluesky/trending/page.tsx:70-71` (`refreshBluesky*FromStore()`)
- `src/app/reddit/trending/page.tsx:75` (`refreshRedditAllPostsFromStore()`)
- `src/app/twitter/page.tsx:320` (`refreshTwitterSignalsFromStore()`)
- `src/app/producthunt/page.tsx:102` (`refreshProducthuntLaunchesFromStore()`)

Pack / launch / research surfaces:
- `src/app/npm/page.tsx:112` (`refreshNpmFromStore()`)
- `src/app/huggingface/trending/page.tsx:81` (`refreshHfModelsFromStore()`)
- `src/app/funding/page.tsx:171` (`refreshFundingNewsFromStore()`)
- `src/app/revenue/page.tsx:72-73` (`refreshRevenueStartupsFromStore()`, `refreshRevenueOverlaysFromStore()`)
- `src/app/agent-commerce/page.tsx:300` (`refreshAgentCommerceFromStore()`)
- `src/app/arxiv/trending/page.tsx:135-136` (`refreshArxivFromStore()`, `refreshTrendingFromStore()`)
- `src/app/research/page.tsx:78` (`refreshResearchSignalsFromStore()`)

Known outlier in sidebar scope:
- `src/app/ideas/page.tsx:87` (`loadFeed(...)`) uses non-`refresh*FromStore` read path.

## 4) Prioritized remediation list
1. Restore local runtime health so acceptance can include browser-level pass/fail (current failure mode: freshness state endpoint 404).
2. Add `error.tsx` and `loading.tsx` under `src/app/hackathons/` for consistency with the rest of sidebar-adjacent segments.
3. Decide whether `/ideas` should migrate to `refreshXxxFromStore` pattern (currently non-standard path) or stay explicitly exempt with documentation.
4. Keep redirect routes documented in wiremap parity notes (`/huggingface`, `/collections`) to avoid false-positive “missing page.tsx” findings.

## Verdict
- Static sidebar route parity: PASS.
- Data-path reference audit: PASS (with one known outlier: `/ideas`).
- Boundary audit: PASS for clickable routes; one gap on disabled `hackathons` segment.
- Runtime/browser smoke: FAIL this heartbeat due local runtime degradation (freshness endpoint 404), not missing routes.
