# AGN-239 Mobile Overflow Regression Matrix (2026-05-05)

Viewport: `390x844` (mobile)

## Mandatory opening freshness result

- `npm run freshness:check` at `2026-05-04` reached `http://localhost:3023` (not missing) but failed:
  - `GET /api/cron/freshness/state -> HTTP 500 Internal Server Error`
- Interpretation: localhost exists, but product is stale/degraded in this heartbeat.

## Browser matrix (production probe)

Target host used for visual verification: `https://trendingrepo.com` (localhost routes returned HTTP 500).
Evidence bundle:
- `qa-artifacts/agn-239/matrix.json`
- `qa-artifacts/agn-239/home-390.png`
- `qa-artifacts/agn-239/signals-390.png`
- `qa-artifacts/agn-239/twitter-390.png`
- `qa-artifacts/agn-239/skills-390.png`
- `qa-artifacts/agn-239/compare-390.png`
- `qa-artifacts/agn-239/top10-390.png`

| Route | HTTP | `scrollWidth` | Viewport | Page overflow px | Result |
|---|---:|---:|---:|---:|---|
| `/` | 200 | 399 | 390 | 9 | FAIL |
| `/skills` | 200 | 390 | 390 | 0 | PASS |
| `/mcp` | 200 | 390 | 390 | 0 | PASS |
| `/signals` | 200 | 390 | 390 | 0 | PASS |
| `/compare` | 200 | 390 | 390 | 0 | PASS |
| `/top10` | 200 | 390 | 390 | 0 | PASS |
| `/twitter` | 200 | 390 | 390 | 0 | PASS |

## Defect list (selector + severity + owner)

| Route | Selector | Severity | Owner | Notes |
|---|---|---|---|---|
| `/` | `main#main-content > div.home-surface > div.ds-card.ds-card-panel:nth-of-type(10) > div.live-top > div.table-scroll:nth-of-type(2) > table.tbl.tbl-rich.tbl-live` | High | Frontend (`src/components/home/LiveTopTable.tsx`, table container styling) | Real page-level overflow: `scrollWidth 399` on `390px` viewport. |
| `/skills` | `main#main-content > main.home-surface > div.live-top:nth-of-type(4) > div.table-scroll:nth-of-type(2) > table.tbl.tbl-rich.tbl-live` | Low | Frontend (`src/components/skills/SkillsTopTable.tsx`) | Table is wider than viewport but contained in horizontal scroller; no page overflow. |
| `/signals` | `main.signals-page > div:nth-of-type(10) > div:nth-of-type(2) > div.signals-ticker-track > span:nth-of-type(48)` | Low | Frontend (`signals` ticker strip) | Large translated ticker children exceed viewport in geometry, but page-level overflow remains zero. |

## Root offender path on `/`

- Overflowing content came from the live table subtree:
  - `TABLE.tbl.tbl-rich.tbl-live <- DIV.table-scroll <- DIV.live-top <- DIV.ds-card.ds-card-panel`

## Audit-only status

- This issue is defined as read-only audit scope.
- Local re-verification remains blocked by localhost freshness failure (`/api/cron/freshness/state` HTTP 500).
