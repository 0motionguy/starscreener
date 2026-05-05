# AGN-1239 Frontend Route-State Drift Audit

Generated: 2026-05-05 08:58:38 +08:00
Scope: docs/SITE-WIREMAP.md vs implemented frontend route state on sidebar-owned surfaces.

## Verification Command Bundle
- Get-Content docs/SITE-WIREMAP.md -TotalCount 260
- g --files src/app
- g -n "loading\.tsx|error\.tsx|not-found\.tsx|Empty|empty|No data|fallback" src/app src/components
- Route-state coverage probe (PowerShell): checks page.tsx/loading.tsx/error.tsx across sidebar routes.

Run window (local): 2026-05-05 05:31 to 2026-05-05 05:38 (Asia/Makassar)

## Route-by-Route Matrix (Owned Surfaces)
| Route | Reachable Page | Loading State | Error State | Empty State Signal | Evidence |
|---|---|---|---|---|---|
| / | yes | yes | yes | yes | src/app/page.tsx, src/app/loading.tsx, src/app/error.tsx |
| /consensus | yes | yes | yes | not explicit in page | src/app/consensus/page.tsx, src/app/consensus/loading.tsx, src/app/consensus/error.tsx |
| /skills | yes | yes | yes | delegated to table components | src/app/skills/page.tsx, src/app/skills/loading.tsx, src/app/skills/error.tsx |
| /mcp | yes | yes | yes | delegated to table components | src/app/mcp/page.tsx, src/app/mcp/loading.tsx, src/app/mcp/error.tsx |
| /agent-repos | yes | yes | yes | delegated to table components | src/app/agent-repos/page.tsx, src/app/agent-repos/loading.tsx, src/app/agent-repos/error.tsx |
| /breakouts | yes | yes | yes | delegated to metrics components | src/app/breakouts/page.tsx, src/app/breakouts/loading.tsx, src/app/breakouts/error.tsx |
| /signals | yes | yes | yes | fallback handling in source cards | src/app/signals/page.tsx, src/app/signals/loading.tsx, src/app/signals/error.tsx |
| /hackernews/trending | yes | yes | yes | feed-table empty title | src/app/hackernews/trending/page.tsx, src/app/hackernews/trending/loading.tsx, src/app/hackernews/trending/error.tsx |
| /lobsters | yes | yes | yes | feed-table empty title | src/app/lobsters/page.tsx, src/app/lobsters/loading.tsx, src/app/lobsters/error.tsx |
| /devto | yes | yes | yes | explicit fallback mention | src/app/devto/page.tsx, src/app/devto/loading.tsx, src/app/devto/error.tsx |
| /bluesky/trending | yes | yes | yes | feed components own empty-state | src/app/bluesky/trending/page.tsx, src/app/bluesky/trending/loading.tsx, src/app/bluesky/trending/error.tsx |
| /reddit/trending | yes | yes | yes | table empty-state | src/app/reddit/trending/page.tsx, src/app/reddit/trending/loading.tsx, src/app/reddit/trending/error.tsx |
| /twitter | yes | yes | yes | fallback mention in page | src/app/twitter/page.tsx, src/app/twitter/loading.tsx, src/app/twitter/error.tsx |
| /producthunt | yes | yes | yes | delegated to list components | src/app/producthunt/page.tsx, src/app/producthunt/loading.tsx, src/app/producthunt/error.tsx |
| /npm | yes | yes | yes | explicit empty metric labels | src/app/npm/page.tsx, src/app/npm/loading.tsx, src/app/npm/error.tsx |
| /huggingface/trending | yes | yes | yes | delegated to list components | src/app/huggingface/trending/page.tsx, src/app/huggingface/trending/loading.tsx, src/app/huggingface/trending/error.tsx |
| /huggingface/datasets | yes | yes | yes | delegated to list components | src/app/huggingface/datasets/page.tsx, src/app/huggingface/datasets/loading.tsx, src/app/huggingface/datasets/error.tsx |
| /huggingface/spaces | yes | yes | yes | delegated to list components | src/app/huggingface/spaces/page.tsx, src/app/huggingface/spaces/loading.tsx, src/app/huggingface/spaces/error.tsx |
| /funding | yes | yes | yes | empty metrics supported | src/app/funding/page.tsx, src/app/funding/loading.tsx, src/app/funding/error.tsx |
| /revenue | yes | yes | yes | empty metrics supported | src/app/revenue/page.tsx, src/app/revenue/loading.tsx, src/app/revenue/error.tsx |
| /arxiv/trending | yes | yes | yes | explicit fallback mention | src/app/arxiv/trending/page.tsx, src/app/arxiv/trending/loading.tsx, src/app/arxiv/trending/error.tsx |
| /research | yes | yes | yes | delegated to table components | src/app/research/page.tsx, src/app/research/loading.tsx, src/app/research/error.tsx |
| /papers | yes | yes | yes | explicit fallback mention | src/app/papers/page.tsx, src/app/papers/loading.tsx, src/app/papers/error.tsx |
| /digest | yes | yes | yes | empty date list handled by page | src/app/digest/page.tsx, src/app/digest/loading.tsx, src/app/digest/error.tsx |
| /ideas | yes | yes | yes | list fallback handled in page components | src/app/ideas/page.tsx, src/app/ideas/loading.tsx, src/app/ideas/error.tsx |
| /collections | **no (redirect route)** | n/a | n/a | n/a | src/app/collections/route.ts |
| /watchlist | yes | yes | yes | explicit EmptyWatchlist component | src/app/watchlist/page.tsx, src/components/watchlist/WatchlistManager.tsx |
| /compare | yes | yes | yes | explicit EmptyPanel / empty state | src/app/compare/page.tsx, src/components/compare/CompareClient.tsx |
| /tierlist | yes | yes | yes | delegated to builder state | src/app/tierlist/page.tsx, src/app/tierlist/loading.tsx, src/app/tierlist/error.tsx |
| /mindshare | yes | yes | yes | chart fallback in page/client | src/app/mindshare/page.tsx, src/app/mindshare/loading.tsx, src/app/mindshare/error.tsx |
| /top10 | yes | yes | yes | emptyBundle cold-start path | src/app/top10/page.tsx, src/app/top10/loading.tsx, src/app/top10/error.tsx |

## Confirmed Mismatches vs docs/SITE-WIREMAP.md
1. /collections route shape drift
- Wiremap still describes /collections as a normal page surface in Explore (docs/SITE-WIREMAP.md, section 3f).
- Current implementation is a redirect handler (GET/HEAD 308) to /categories, no page.tsx at route root.
- Evidence: src/app/collections/route.ts.

2. Sidebar section taxonomy drift in code comments
- Wiremap describes 8 nav sections including EXPLORE and WATCHING.
- SidebarContent.tsx top-of-file section comment is stale and still documents 7 sections (missing EXPLORE and mismatched section ordering/labels), while render tree below includes EXPLORE section.
- Evidence: src/components/layout/SidebarContent.tsx lines near the header block and lines around section renders (V2Section label="EXPLORE").

## Follow-up Issue Requirement
Child issues should be created for each mismatch above (docs correction and sidebar comment/spec alignment).
