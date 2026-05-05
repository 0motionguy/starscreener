# AGN-353 Release QA Evidence - Browser smoke for top 10 revenue routes

Checked at: 2026-05-04T12:06:44.447Z  
Environment: production (`https://trendingrepo.com`) via Playwright Chromium headless (`1366x768`)

## Route set (revenue funnel + monetization-adjacent)
1. /
2. /breakouts
3. /top10
4. /funding
5. /revenue
6. /tools/revenue-estimate
7. /submit/revenue
8. /pricing
9. /compare
10. /watchlist

## Binary acceptance
- PASS: 10/10 routes returned HTTP 200, rendered non-empty body text (`>500` chars), no navigation hard-fail.

## Per-route results
| Route | HTTP | Title | Body chars | Console errors | Request fails | Result |
|---|---:|---|---:|---:|---:|---|
| `/` | 200 | TrendingRepo — The trend map for open source | 8621 | 0 | 3 | GREEN |
| `/breakouts` | 200 | Cross-Signal Breakouts — TrendingRepo | 1833 | 0 | 11 | GREEN |
| `/top10` | 200 | Top 10 — TrendingRepo — TrendingRepo | 4412 | 0 | 9 | GREEN |
| `/funding` | 200 | TrendingRepo — Funding Radar — TrendingRepo | 2999 | 0 | 10 | GREEN |
| `/revenue` | 200 | Revenue Terminal — TrendingRepo | 26468 | 1 | 0 | GREEN |
| `/tools/revenue-estimate` | 200 | Revenue Estimator — TrendingRepo — TrendingRepo | 2396 | 0 | 7 | GREEN |
| `/submit/revenue` | 200 | Claim or Submit Revenue — TrendingRepo | 1769 | 0 | 5 | GREEN |
| `/pricing` | 200 | TrendingRepo — Pricing — TrendingRepo | 4751 | 0 | 2 | GREEN |
| `/compare` | 200 | Compare — TrendingRepo — TrendingRepo | 1780 | 0 | 4 | GREEN |
| `/watchlist` | 200 | Watchlist - TrendingRepo | 1353 | 0 | 3 | GREEN |

## Failure taxonomy
- Product failures: none observed for acceptance gate.
- Environment/transient noise: `requestfailed` events were predominantly aborted RSC/prefetch fetches (`net::ERR_ABORTED`) during navigation and did not block route render.

## Residual risk
- `/revenue` emitted 1 console resource error (`Failed to load resource: 404`) during this run. Route still rendered full content and passed smoke criteria, but this should be tracked for cleanup if it reproduces in deeper regression.
- Frequent aborted prefetch/RSC requests on several routes indicate noisy navigation telemetry; not a release blocker for this smoke gate.
