---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# Regression Map

Last updated: 2026-05-04
Route inventory source: `src/app/**/page.tsx` (live filesystem audit on 2026-05-04).

Legend for owning lane:
- `FE-Platform`: layout/navigation/shell/state surfaces.
- `Data-Platform`: collector/data-store-backed list/detail surfaces.
- `Growth`: submission, pricing, revenue conversion surfaces.
- `Ops`: admin/operator-only surfaces.

## Release Smoke Tier (must check every release)

| Route | Owning lane | Smallest validation check |
|---|---|---|
| `/` | Data-Platform | At least one repo row/card renders. |
| `/consensus` | Data-Platform | At least one consensus row or bounded fallback renders. |
| `/skills` | Data-Platform | Skills table/list renders at least one row. |
| `/mcp` | Data-Platform | MCP table/list renders at least one row. |
| `/agent-repos` | Data-Platform | At least one agent repo card renders. |
| `/breakouts` | Data-Platform | Breakout list renders at least one item. |
| `/top` | Data-Platform | Ranked rows render with rank + repo identity. |
| `/signals` | Data-Platform | Source chips and at least one signal row render. |
| `/hackernews/trending` | Data-Platform | HN rows render with non-empty content. |
| `/lobsters` | Data-Platform | Lobsters rows render with non-empty content. |
| `/devto` | Data-Platform | Dev.to rows render with non-empty content. |
| `/bluesky/trending` | Data-Platform | Bluesky rows render with non-empty content. |
| `/reddit/trending` | Data-Platform | Reddit rows render with non-empty content. |
| `/twitter` | Data-Platform | Twitter leaderboard/table renders at least one row. |
| `/producthunt` | Data-Platform | Product Hunt launch rows render. |
| `/npm` | Data-Platform | NPM table/list renders at least one package row. |
| `/huggingface/trending` | Data-Platform | HF models list renders at least one model row. |
| `/huggingface/datasets` | Data-Platform | HF datasets list renders at least one row. |
| `/huggingface/spaces` | Data-Platform | HF spaces list renders at least one row. |
| `/funding` | Data-Platform | Funding feed renders at least one item. |
| `/revenue` | Growth | Revenue rows/cards render with non-empty data. |
| `/submit/revenue` | Growth | Form fields + submit CTA are visible. |
| `/arxiv/trending` | Data-Platform | arXiv list renders at least one paper row. |
| `/research` | Data-Platform | Research/cited repos render at least one row. |
| `/digest` | Data-Platform | At least one digest entry/date renders. |
| `/ideas` | Growth | Ideas list shell and CTA render. |
| `/predict` | Data-Platform | Forecast rows render at least one item. |
| `/categories` | Data-Platform | Category cards/list render. |
| `/collections` | Data-Platform | Collection rows/cards render. |
| `/pricing` | Growth | Pricing plans + CTA render. |
| `/tools/revenue-estimate` | Growth | Estimator inputs + CTA render. |
| `/watchlist` | FE-Platform | Empty/non-empty watchlist state renders without crash. |
| `/compare` | FE-Platform | Input controls + compare action render. |
| `/tierlist` | FE-Platform | Tierlist builder shell renders. |
| `/mindshare` | Data-Platform | Mindshare chart/list renders data or bounded fallback. |
| `/top10` | Data-Platform | Top10 renders ranked rows or bounded fallback. |

## Secondary Reachability Tier (daily/targeted regression)

| Route/pattern | Owning lane | Smallest validation check |
|---|---|---|
| `/about` | FE-Platform | Static content renders. |
| `/agent-commerce` | Data-Platform | List/shell renders without crash. |
| `/agent-commerce/[slug]` | Data-Platform | Valid slug page renders with bounded fallback. |
| `/agent-commerce/facilitator/[name]` | Data-Platform | Valid facilitator page renders with bounded fallback. |
| `/agent-repos/[slug]` | Data-Platform | Detail page renders with bounded fallback. |
| `/alerts` | FE-Platform | Alerts shell renders. |
| `/alerts/new` | FE-Platform | Rule form renders. |
| `/categories/[slug]` | Data-Platform | Category detail renders with data/fallback. |
| `/cli` | FE-Platform | CLI docs content renders. |
| `/collections/[slug]` | Data-Platform | Collection detail renders with data/fallback. |
| `/consensus/[owner]/[name]` | Data-Platform | Detail page resolves and renders bounded state. |
| `/demo` | FE-Platform | Demo shell renders. |
| `/design-lab/primitives` | FE-Platform | Primitives page renders. |
| `/digest/[date]` | Data-Platform | Valid date detail renders. |
| `/embed/top10` | FE-Platform | Embed renders without layout break. |
| `/githubrepo` | FE-Platform | Legacy/alternate landing renders without crash. |
| `/huggingface` | Data-Platform | HF landing shell renders. |
| `/huggingface/models` | Data-Platform | Model list route renders. |
| `/ideas/[id]` | Growth | Detail route renders with data/fallback. |
| `/mcp/[slug]` | Data-Platform | MCP detail renders with data/fallback. |
| `/model-usage` | Data-Platform | Model usage charts/list render or bounded fallback. |
| `/papers` | Data-Platform | Papers list renders with data/fallback. |
| `/portal/docs` | FE-Platform | Docs route renders. |
| `/privacy` | FE-Platform | Legal page renders. |
| `/reddit` | Data-Platform | Base reddit route renders. |
| `/repo/[owner]/[name]` | Data-Platform | Repo profile renders with non-empty shell. |
| `/repo/[owner]/[name]/star-activity` | Data-Platform | Star chart renders with data/fallback. |
| `/s/[shortId]` | FE-Platform | Share route resolves or bounded missing state. |
| `/search` | FE-Platform | Search UI renders and accepts input. |
| `/skills/[slug]` | Data-Platform | Skill detail renders with data/fallback. |
| `/submit` | Growth | Submission form/shell renders. |
| `/terms` | FE-Platform | Legal page renders. |
| `/tierlist/[shortId]` | FE-Platform | Shared tierlist page renders/fallback. |
| `/tools` | FE-Platform | Tools hub renders. |
| `/tools/star-history` | FE-Platform | Tool renders without runtime error. |
| `/tools/treemap` | FE-Platform | Treemap tool renders without runtime error. |
| `/top10/[date]` | Data-Platform | Date snapshot renders with data/fallback. |
| `/u/[handle]` | Data-Platform | User profile renders/fallback. |
| `/you` | FE-Platform | Personal surface renders/fallback. |

## Admin/Ops Tier (pre-release if touched)

| Route | Owning lane | Smallest validation check |
|---|---|---|
| `/admin` | Ops | Admin landing renders with auth gate behavior. |
| `/admin/login` | Ops | Login form renders. |
| `/admin/keys` | Ops | Keys page renders with no client crash. |
| `/admin/pool` | Ops | Pool page renders token status shell. |
| `/admin/pool-aggregate` | Ops | Aggregate pool page renders. |
| `/admin/staleness` | Ops | Staleness table renders. |
| `/admin/scoring-shadow` | Ops | Shadow report page renders. |
| `/admin/unknown-mentions` | Ops | Unknown mentions list renders. |
| `/admin/ideas-queue` | Ops | Queue table/shell renders. |
| `/admin/revenue-queue` | Ops | Queue table/shell renders. |

## Completeness Note
- Current map includes all 93 `page.tsx` routes in `src/app` as of 2026-05-04.
- If a new route is added, this file must be updated in the same PR.


