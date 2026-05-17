# Twitter Cancellation — Forensic Note 2026-05-17

**Status:** Investigation only. No code change in this PR. Decision required from operator.

**Symptom:** `.github/workflows/collect-twitter.yml` (`collect-twitter`) consistently cancels at the 90-minute job timeout. The latest 5 runs (`25985373914`, `25983611341`, `25983181517`, `25978415462`, `25973593462`) all show `conclusion: cancelled`. `data/_meta/twitter.json` has been stuck at `ts: 2026-05-04` for 13+ days.

**Prior hypothesis (handover §6):** The Nitter scraper is the bottleneck — 50 repos × 4 queries × ~10s/query = ~33 min sequential, eating the 90-min budget. Proposed fix: bounded-concurrency queue (4-8 parallel) OR split into 5 batched workflows of 10 repos each.

**This investigation invalidates that hypothesis.**

## Timeline from run 25985373914 log

| Wall clock | Event |
|---|---|
| 08:04:03 | Workflow start (checkout) |
| 08:04:29 | Checkout done — note hundreds of bot/data refresh branches being fetched (`data/collect-funding-signals-*`, `data/collect-twitter-signals-*`, `data/nitter-health-check-*`) |
| 08:05:00 | Setup-node + npm ci done, collector step begins |
| 08:05:05 | `[twitter-collector] provider=nitter mode=direct candidates=50 dryRun=false` |
| **08:06:32** | **`[twitter-collector] FLUSH SUMMARY repoSignals=50 scans=50 posts=107 idempotencyConflicts=0` — collector DONE in 87 seconds** |
| 08:06:32 | `[twitter-collector] lake: 6 candidates → data/unknown-mentions.jsonl` |
| *gap of ≈ 87 min — unknown* | |
| 09:34:14 | Twitter signal count: 481 (was 409) [monitor step still printing] |
| 09:34:14 | Post job cleanup. |
| 09:34:14 | `Terminate orphan process: pid (2557) (npm run collect:twitter)` ← **a second collector was still running** |
| 09:34:14 | `Terminate orphan process: pid (2580) (node)` |
| 09:34:14 | `Terminate orphan process: pid (2593) (esbuild)` |

## Key findings

1. **The first `collect:twitter` invocation completes in 87 seconds.** That run successfully writes `repoSignals=50 / posts=107` with zero idempotency conflicts. The Nitter latency hypothesis is wrong — at ~1.7s per repo wall-clock, the collector is fast enough to scan 50 repos several times over inside the 90-min budget.

2. **A second `npm run collect:twitter` was still alive at timeout cleanup** (pid 2557 listed under "orphan processes"). The workflow YAML in main does NOT show two collector invocations — there's a single `Collect Twitter signals` step. This means either:
   - A post-collector step (auto-commit, ingest, or PR-create) re-invokes the collector under the hood;
   - OR a child process from the first collector never reaped properly and pid 2557 is the same one from 08:05 still listed because its child esbuild/node workers held it open.

3. **The line-count health monitor passes (`481 > 409`)** even when the run is mid-cancel. The meta-age check shipped in PR #1615 would catch this — that's the right fix for the visibility problem, but does NOT explain the hang.

4. **The `git-auto-commit-action` step is the most likely hang surface.** That step runs after the collector with `paths:` covering `.data/twitter-repo-signals.jsonl` etc. PR #1529 already added `timeout-minutes: 5` to `git-commit-data`, but the underlying `git-auto-commit-action` may still loop on `gh pr merge --auto` when concurrent data PRs are open. The repo currently has dozens of `data/collect-twitter-signals-*` and `data/collect-funding-signals-*` branches lingering on origin (visible in the checkout step output as hundreds of `* [new branch]` lines).

## What to do (recommendation tree)

### Option A — Verify before patching (1 hour, operator-runnable)

Re-trigger one manual `workflow_dispatch` run of `collect-twitter.yml` with `limit=10` and watch the LIVE step timing in the Actions UI. Specifically watch:

1. How long the "Collect Twitter signals" step takes (likely under 30s for 10 repos)
2. How long the "Auto-commit" step takes (should be under 30s; if it sits longer, that's the hang)
3. Whether the "Auto-commit" step issues `gh pr merge --auto` and whether that blocks

If the auto-commit step is the hang: Option B1. If the collector somehow re-runs: Option B2.

### Option B1 — Drop auto-merge from the data PR (recommended, 1 PR, ~20 min)

The `stefanzweifel/git-auto-commit-action` we use commits + pushes + opens a PR. If a follow-on step calls `gh pr merge --auto --squash` and the queue has lots of concurrent data PRs, the merge can wait on a queue that never drains within the timeout. Patch:

- Replace the auto-commit-action step with explicit `git add` + `git commit` + `git push` to a `data/collect-twitter-signals-<run_id>` branch, and let the cron's auto-merge bot pick it up out-of-band. No `gh pr merge --auto` from this workflow.
- Drop the `pull-requests: write` permission from the workflow once auto-merge moves to a separate workflow.

### Option B2 — Cap the collector to one invocation (defensive, 1 PR, ~10 min)

Wrap the `Collect Twitter signals` step in a hard 5-min `timeout` shell command so it cannot run twice or hang internally. If the underlying script ever does spawn a stuck child, the wrapper kills it.

```yaml
- name: Collect Twitter signals
  timeout-minutes: 5
  run: |
    timeout 280 npm run collect:twitter
```

### Option C — Stop accumulating data-PR branches (related cleanup)

The checkout step's hundreds of `[new branch]` lines (data/collect-funding-*, data/collect-twitter-*, data/nitter-health-*) mean past data PRs are not deleting their head refs after merge. The auto-commit action's `delete-branch: true` parameter is likely missing or unset. Each new run pays a fetch cost for every stale branch. Independent fix; recommend as a follow-up to Option B1.

## Recommendation

**Operator: pick Option A first** — a single manual dispatch with logged step timings turns the recommendation tree into a deterministic patch. The handover's "Nitter is slow" framing is empirically wrong (87s real time); the previous Option A (bounded-concurrency queue) and Option B (5-batch split) would not help, since the collector itself is already fast.

After Option A confirms which step hangs, ship Option B1 if the auto-commit step is the culprit (most likely), or Option B2 if the collector somehow re-runs.

## Reference

- Run `25985373914`: https://github.com/0motionguy/starscreener/actions/runs/25985373914
- Workflow: `.github/workflows/collect-twitter.yml`
- Health monitor (line-count + meta-age): shipped in PR #1615
- Collector script: `scripts/collect-twitter-signals.ts`
- Prior fixes that did NOT resolve the cancellation: #1529 (git-commit-data timeout), #1601 (409 tolerance), #1587 (nitter reorder), #1611 (3x/day cadence, limit=50, 90-min timeout)

