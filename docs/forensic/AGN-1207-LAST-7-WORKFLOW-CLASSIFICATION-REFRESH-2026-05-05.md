# AGN-1207 Release/SRE last-7 workflow classification refresh (2026-05-05)

Capture timestamp (UTC): 2026-05-05T05:xxZ
Scope: high-impact workflows affecting freshness or release visibility.

## Local freshness preflight (mandatory)

Command:
- `npm run freshness:check`

Result in this heartbeat:
- `freshness-check: local server not reachable at http://localhost:3023 ... ECONNREFUSED`

Verdict:
- `localhost:3023` is missing in this run context (different from prior heartbeat’s HTTP 500 state).

## Last-7 classification

Taxonomy:
- `PASS`: 7/7 success
- `FLAKY`: mix of success and failure in last 7
- `FAIL`: 0/7 success

### 1) Refresh fast discovery (`scrape-trending.yml`)
- Classification: `FAIL`
- Last-7: `0 success / 7 failure`
- Run IDs (newest->oldest):
  - 25352686125 (2026-05-05T01:18:33Z)
  - 25349394588 (2026-05-04T23:34:51Z)
  - 25347040280 (2026-05-04T22:29:24Z)
  - 25343958282 (2026-05-04T21:15:44Z)
  - 25340045986 (2026-05-04T19:51:36Z)
  - 25334549029 (2026-05-04T17:56:22Z)
  - 25330147025 (2026-05-04T16:22:26Z)
- Latest failure signature (`gh run view 25352686125 --log-failed`):
  - commit step fails when adding ignored file:
  - `.data/trending-dual-write-trace.jsonl`
  - `The following paths are ignored by one of your .gitignore files`

### 2) Cron - freshness check (`cron-freshness-check.yml`)
- Classification: `FLAKY`
- Last-7: `1 success / 6 failure`
- Non-green run IDs:
  - 25354147740 (2026-05-05T02:10:33Z)
  - 25349814827 (2026-05-04T23:47:08Z)
  - 25345640192 (2026-05-04T21:55:18Z)
  - 25342866188 (2026-05-04T20:51:10Z)
  - 25339627924 (2026-05-04T19:43:27Z)
  - 25334635580 (2026-05-04T17:58:10Z)
- Success run ID:
  - 25347910324 (2026-05-04T22:52:29Z)
- Latest failure signature (`gh run view 25354147740 --log-failed`):
  - health body stale: `"status": "stale"`
  - push blocked by branch protection: `GH006 Protected branch update failed for refs/heads/main`

### 3) Source health watch (`health-watch.yml`)
- Classification: `FAIL`
- Last-7: `0 success / 7 failure`
- Run IDs (newest->oldest):
  - 25353629778 (2026-05-05T01:52:09Z)
  - 25349658125 (2026-05-04T23:42:39Z)
  - 25347727458 (2026-05-04T22:47:28Z)
  - 25345526509 (2026-05-04T21:52:33Z)
  - 25342556912 (2026-05-04T20:44:32Z)
  - 25338716249 (2026-05-04T19:24:35Z)
  - 25334602791 (2026-05-04T17:57:32Z)
- Latest failure signature (`gh run view 25353629778 --log-failed`):
  - `16 source(s) unhealthy of 17 checked`
  - repeated stale sources include `trending`, `reddit`, `hackernews`, `bluesky`, `lobsters`, `producthunt`, `twitter`, `npm`, `arxiv`, HF feeds.

### 4) Audit - source freshness (`audit-freshness.yml`)
- Classification: `FAIL`
- Last-7: `0 success / 7 failure`
- Run IDs (newest->oldest):
  - 25350311352 (2026-05-05T00:01:51Z)
  - 25348159034 (2026-05-04T22:59:27Z)
  - 25345748107 (2026-05-04T21:57:54Z)
  - 25341089762 (2026-05-04T20:12:57Z)
  - 25335313654 (2026-05-04T18:12:26Z)
  - 25329196055 (2026-05-04T16:00:57Z)
  - 25323063361 (2026-05-04T13:54:22Z)
- Latest failure signature (`gh run view 25350311352 --log-failed`):
  - `FAIL — 10 violation(s)` including `trending`, `reddit`, `hackernews`, `bluesky`, `producthunt`, `twitter`, `npm`, `awesome-skills`, `claude-rss`, `openai-rss`.

### 5) Refresh collection rankings (`refresh-collection-rankings.yml`)
- Classification: `FLAKY`
- Last-7: `4 success / 3 failure`
- Non-green run IDs:
  - 25356838231 (2026-05-05T03:49:59Z)
  - 25340207526 (2026-05-04T19:54:44Z)
  - 25324873928 (2026-05-04T14:30:25Z)
- Success run IDs:
  - 25309502967, 25300532068, 25288310229, 25280901406
- Latest failure signature (`gh run view 25356838231 --log-failed`):
  - commit/push to `main` rejected by protection:
  - `GH006: Protected branch update failed for refs/heads/main`
  - `Changes must be made through a pull request`

## Repeat-failure impact summary

- Highest impact freshness outage:
  - `scrape-trending.yml` is 0/7; this blocks core trending freshness and cascades into stale gates.
- Monitoring/gate instability:
  - `health-watch.yml` and `audit-freshness.yml` are both 0/7 due to widespread stale budgets.
- Process/config defect:
  - workflows attempting direct push to `main` are repeatedly rejected by branch protection (`GH006`), creating deterministic failures independent of source freshness.

## Operator-ready next actions (priority order)

1. **P0 – Stop hard failure in `scrape-trending.yml` commit step**
   - Remove ignored `.data/trending-dual-write-trace.jsonl` from staged path list or force-add policy explicitly.
2. **P0 – Align cron commit strategy with branch protection**
   - Replace direct push-to-main path with bot PR flow (`scripts/bot-push.mjs`) or disable commit step in protected-branch workflows.
3. **P1 – Restore freshness budgets for gate-critical sources**
   - Trending + Reddit + HN + Bluesky + ProductHunt + Twitter first; then npm and advisory feeds.
4. **P1 – Re-run last-7 classification after first two fixes merge**
   - Expect immediate state change from `FAIL` to at least `FLAKY` for `scrape-trending` and collection workflows.