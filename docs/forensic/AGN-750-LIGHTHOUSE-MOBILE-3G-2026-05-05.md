# AGN-750 Mobile/3G Lighthouse audit (5 hot routes)

Date: 2026-05-05
Scope: production `https://trendingrepo.com` mobile Lighthouse runs under 3G-like throttling.

## Method
- Command: `npx lighthouse <url> --form-factor=mobile --throttling.rttMs=300 --throttling.throughputKbps=700 --throttling.downloadThroughputKbps=700 --throttling.uploadThroughputKbps=700 --throttling.cpuSlowdownMultiplier=4 --only-categories=performance,accessibility,best-practices,seo --output=json`
- Route set audited: `/`, `/signals`, `/skills`, `/mcp`, `/twitter`
- Raw artifacts: `docs/forensic/lighthouse-agn-750/*.json`

## Results

| Route | Perf | A11y | Best Practices | SEO | FCP (ms) | LCP (ms) | TBT (ms) | Speed Index (ms) | CLS |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| `/` | 29 | 93 | 100 | 100 | 6283 | 8375 | 3061 | 7598 | 0.000 |
| `/signals` | 41 | 90 | 100 | 100 | 4311 | 10828 | 624 | 16124 | 0.000 |
| `/skills` | 25 | 100 | 100 | 100 | 6222 | 10983 | 21492 | 22102 | 0.000 |
| `/mcp` | 29 | 100 | 96 | 100 | 5399 | 6550 | 9451 | 9722 | 0.000 |
| `/twitter` | 47 | 96 | 100 | 100 | 6295 | 6391 | 450 | 15466 | 0.000 |

## Route-level risk callouts
- `/skills`: worst perf score and very high TBT/Speed Index under mobile 3G profile.
- `/mcp`: high TBT despite moderate LCP.
- `/` and `/signals`: perf below acceptable mobile baseline; both need payload and render-cost reduction.
- `/twitter`: best in cohort but still below mobile performance target.
