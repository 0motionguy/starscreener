---
title: AGN-1751 freshness metadata provenance check (top 10 blocking sources)
date: 2026-05-05
owner: paperclip-data
status: completed-evidence
---

# Scope

Validate freshness metadata provenance for 10 high-blast-radius blocking sources:

1. trending-repos
2. hackernews
3. reddit
4. bluesky
5. lobsters
6. devto
7. producthunt
8. twitter
9. arxiv
10. huggingface

Selection basis: blocking sources with highest route fan-out from `docs/SITE-WIREMAP.md` and explicit freshness bindings in `src/app/api/cron/freshness/state/route.ts`.

# Mandatory preflight evidence

- Required docs re-read this heartbeat: `CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/archive/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`.
- `npm run freshness:check` result: FAIL.
  - localhost status: reachable (`http://localhost:3023` responds).
  - product status: stale/degraded due to `GET /api/health?soft=1 -> HTTP 500`.
- Direct `/api/cron/freshness/state` probe also failed with 500 due to dev runtime manifest error:
  - `ENOENT ... .next/server/app/api/cron/freshness/state/[__metadata_id__]/route/app-paths-manifest.json`

Because runtime freshness endpoints are failing, provenance was verified statically from source code + metadata files + workflow ownership.

# Evidence table (top 10 blocking sources)

| Source | freshness route spec | `_meta` sidecar present | Latest sidecar ts | Workflow owner | Provenance verdict |
|---|---|---|---|---|---|
| trending-repos | `metaSource: "trending"` | yes (`data/_meta/trending.json`) | `2026-05-04T08:06:14.928Z` | `scrape-trending.yml` | PASS |
| hackernews | `metaSource: "hackernews"` | yes | `2026-05-05T03:41:21.066Z` | `scrape-trending.yml` | PASS |
| reddit | `metaSource: "reddit"` | yes | `2026-05-05T03:45:18.677Z` | `scrape-trending.yml` | PASS |
| bluesky | `metaSource: "bluesky"` | yes | `2026-05-05T03:40:40.718Z` | `scrape-bluesky.yml` | PASS |
| lobsters | `metaSource: "lobsters"` | yes | `2026-05-05T06:29:41.207Z` | `scrape-lobsters.yml` | PASS |
| devto | `metaSource: "devto"` | yes | `2026-05-05T03:34:16.746Z` | `scrape-devto.yml` | PASS |
| producthunt | `metaSource: "producthunt"` | yes | `2026-05-03T23:55:30.517Z` | `scrape-producthunt.yml` | PASS (staleness risk, provenance intact) |
| twitter | **no `metaSource`** | n/a | n/a | `collect-twitter.yml` | **GAP** (no sidecar provenance path in route) |
| arxiv | `metaSource: "arxiv"` | yes | `2026-05-04T04:32:35.983Z` | `scrape-arxiv.yml` + `enrich-arxiv.yml` | PASS |
| huggingface | `metaSource: "huggingface"` | yes | `2026-05-04T04:10:43.543Z` | `scrape-huggingface.yml` | PASS |

# Verified collector ownership (grep-backed)

- `collect-twitter.yml`: cron `9 */3 * * *`, runs `npm run collect:twitter`
- `scrape-trending.yml`: cron `7,27,47 * * * *`, runs `scrape-trending`, `scrape-reddit`, `scrape-hackernews`
- `scrape-bluesky.yml`: cron `17 * * * *`, runs `node scripts/scrape-bluesky.mjs`
- `scrape-lobsters.yml`: cron `37 * * * *`, runs `node scripts/scrape-lobsters.mjs`
- `scrape-devto.yml`: cron `18 */6 * * *`, runs `node scripts/scrape-devto.mjs`
- `scrape-producthunt.yml`: cron `22 11,15,19,23 * * *`, runs `node scripts/scrape-producthunt.mjs`
- `scrape-arxiv.yml`: cron `43 */3 * * *`, runs `node scripts/scrape-arxiv.mjs`
- `enrich-arxiv.yml`: cron `13 */12 * * *`, runs `node scripts/enrich-arxiv.mjs`
- `scrape-huggingface.yml`: cron `13 */6 * * *`, runs `node scripts/scrape-huggingface.mjs`

# Findings

1. Runtime freshness endpoints are currently not auditable live due to local Next/Turbopack manifest ENOENT.
2. Metadata provenance is structurally present for 9/10 checked blocking sources.
3. `twitter` is the only checked source without route-level `metaSource` provenance wiring, which weakens sidecar-based auditability compared to peers.

# Recommended follow-up

1. Fix local `.next` manifest runtime fault so `/api/health` and `/api/cron/freshness/state` can be validated live.
2. Add explicit `metaSource` sidecar provenance for `twitter` in `SOURCE_SPECS` to align with other blocking sources.
