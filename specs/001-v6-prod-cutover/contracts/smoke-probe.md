# Contract: Post-Deploy Smoke Probe

**Feature**: 001-v6-prod-cutover | **Date**: 2026-05-21

The post-deploy smoke probe is the primary automated gate against cutover regression.
This contract defines what the probe asserts, in what shape, against which deploys, and
under what failure semantics.

---

## Probe Target Inventory

Total per run: ~50 assertions, completing in ≤3 min wall-clock per FR-016.

### Mandatory (100% coverage per run) — 30 targets

**24 v6 routes**:

| `url` | `expected_status` | `expected_final_url` | `retry_on_503` |
|-------|-------------------|----------------------|----------------|
| `/` | 200 | `/` | true |
| `/breakout` | 200 | `/breakout` | true |
| `/market-signals` | 200 | `/market-signals` | true |
| `/funding` | 200 | `/funding` | true |
| `/ideas` | 200 | `/ideas` | true |
| `/repo/vercel/next.js` | 200 | `/repo/vercel/next.js` | true |
| `/twitter` | 200 | `/twitter` | true |
| `/account` | 200 | `/account` (or auth-gated 302) | true |
| _(6 more core routes)_ | 200 | self | true |
| `/tools` | 200 | `/tools` | false |
| `/tools/top-10` | 200 | `/tools/top-10` | false |
| `/tools/tier-list` | 200 | `/tools/tier-list` | false |
| `/tools/compare` | 200 | `/tools/compare` | false |
| `/tools/digest` | 200 | `/tools/digest` | false |
| `/tools/star-history` | 200 | `/tools/star-history` | false |
| `/tools/treemap` | 200 | `/tools/treemap` | false |
| `/tools/watchlist` | 200 | `/tools/watchlist` | false |
| `/sign-in` | 200 | `/sign-in` | false |
| `/sign-up` | 200 | `/sign-up` | false |

**6 moved/renamed redirects**:

| `url` | `expected_status` | `expected_location_header` | `expected_final_url` |
|-------|-------------------|----------------------------|----------------------|
| `/top10` | 308 | `/tools/top-10` | `/tools/top-10` |
| `/tierlist` | 308 | `/tools/tier-list` | `/tools/tier-list` |
| `/compare` | 308 | `/tools/compare` | `/tools/compare` |
| `/digest` | 308 | `/tools/digest` | `/tools/digest` |
| `/breakouts` | 308 | `/breakout` | `/breakout` |
| `/signals` | 308 | `/market-signals` | `/market-signals` |

### Sampled (probabilistic coverage per run) — 10 targets

10 legacy redirects drawn from the 91-entry pool (22 aggregator + 63 collection + 6
marketing). Sampling: SHA-256 hash of `(GITHUB_RUN_DATE, target_url)` → integer; take
10 lowest-hashing entries that day. This guarantees:

- Deterministic per-day coverage (re-runs same day hit the same 10).
- Different 10 each day.
- ~36-day full coverage cycle (91 routes × 10/day ≈ 9 days for one pass, but with
  random sampling expect ~36 days for ≥99% coverage by coupon-collector probability).

---

## Assertion Semantics

For each target:

1. **HTTP probe**: `curl -sI -o /dev/null -w "%{http_code} %{url_effective} %{redirect_url}"`
   against `{DEPLOY_URL}{url}`.
2. **Status assertion**: actual status equals `expected_status`. Fail otherwise.
3. **For redirects (`expected_status === 308`)**: assert `Location` response header
   equals `expected_location_header` exactly. Fail on any mismatch (including
   missing/extra trailing slash, case mismatch, query string).
4. **For followed redirects**: probe again with `-L` flag, assert final URL ends with
   `expected_final_url` and final status is 200.
5. **Chain depth**: count `Location` header hops; if >2, fail.
6. **503 retry**: if `retry_on_503` is true and status is 503, wait 5s and retry once.
   If still 503, fail.

---

## Workflow Integration

Extend `.github/workflows/post-deploy-smoke.yml`:

```yaml
jobs:
  smoke:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Probe v6 routes (100% coverage)
        run: node scripts/smoke/probe-v6-routes.mjs --deploy-url=${{ inputs.deploy_url }}
      - name: Probe moved/renamed redirects (100% coverage)
        run: node scripts/smoke/probe-moved-renamed.mjs --deploy-url=${{ inputs.deploy_url }}
      - name: Probe legacy redirects (10 sampled today)
        run: node scripts/smoke/probe-legacy-sampled.mjs --deploy-url=${{ inputs.deploy_url }} --sample-size=10
      - name: Emit summary
        if: always()
        run: node scripts/smoke/summary.mjs
```

The three probe scripts (`probe-v6-routes.mjs`, `probe-moved-renamed.mjs`,
`probe-legacy-sampled.mjs`) consume a shared JSON target inventory at
`scripts/smoke/targets.json` so the source-of-truth lives in one place.

---

## Failure Semantics

| Failure type | Workflow behavior | Cutover gate result |
|--------------|-------------------|---------------------|
| Any v6 route returns ≠ 200 | Workflow fails | Cutover BLOCKED |
| Any moved/renamed returns ≠ 308 | Workflow fails | Cutover BLOCKED |
| Any moved/renamed has wrong `Location` | Workflow fails | Cutover BLOCKED |
| Any sampled legacy returns 404 or 5xx | Workflow fails | Cutover BLOCKED |
| Any redirect chain > 2 hops | Workflow fails | Cutover BLOCKED |
| Any single probe times out (>10s) | Workflow fails after 1 retry | Cutover BLOCKED |
| Workflow itself runs > 3 min wall-clock | Step `timeout-minutes: 5` triggers; workflow fails | Cutover BLOCKED (FR-016 budget exceeded) |

---

## Coverage Validation

Once per implementation cycle (NOT every probe run), an offline coverage report runs:

```bash
node scripts/smoke/coverage-report.mjs
```

It reports:
- v6 route coverage: must be 100% (24/24)
- Moved/renamed coverage: must be 100% (6/6)
- Legacy sample coverage: report 7-day rolling window coverage as a percentage
- Probe latency p95: per-target

If v6 or moved/renamed coverage drops below 100%, the report exits non-zero. This is
intended for CI assertion but not on every PR (run weekly via `schedule:`).
