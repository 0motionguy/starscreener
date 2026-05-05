# AGN-816 Artillery First Run Report (2026-05-05)

## Scenario
- Script: `scripts/load/agn-816-artillery.yml`
- Target: `https://starscreener-ecddputkd-kermits-projects-6330acd4.vercel.app` (Preview)
- Ramp profile: `arrivalRate 10 -> 1000` over `300s`
- Route sequence per virtual user: `/`, `/githubrepo`, `/repo/vercel/next.js`, `/api/repos/vercel/next.js?v=2`

## Aggregate
- Requests: 165309
- Responses: 18412
- Request rate (avg): 535.00 req/s
- HTTP 200: 9206
- HTTP 404: 4603
- HTTP 500: 4603
- Transport timeouts (ETIMEDOUT): 146897
- Computed error rate ((timeouts+4xx+5xx)/requests): 94.43%

## Latency (overall)
- p50: 273.2 ms
- p95: 327.1 ms
- p99: 772.9 ms

## Route-Level Signals
- `/`: 200 responses observed; substantial timeout pressure at high ramp.
- `/githubrepo`: 200 responses observed; similar timeout pressure at high ramp.
- `/repo/vercel/next.js`: consistently 500 under load windows.
- `/api/repos/vercel/next.js?v=2`: consistently 404 under load windows.

## Raw Evidence
- JSON output: `docs/forensic/AGN-816-artillery-run-2026-05-05.json`
- Command used:

```powershell
$env:STAGING_URL='https://starscreener-ecddputkd-kermits-projects-6330acd4.vercel.app'
npx --yes artillery@2.0.23 run scripts/load/agn-816-artillery.yml --output docs/forensic/AGN-816-artillery-run-2026-05-05.json
```

## Release SRE Verdict
- NO-GO for traffic ramp on this preview: endpoint correctness and saturation behavior fail acceptance for staged ramp readiness.
