# Backtest Harness Spec — P1.8

**Status:** spec only. Implementation deferred to Prompt 3.

**Why deferred:** requires 50-repo ground-truth dataset built from 90d of ClickHouse demo data, plus a CI gate that runs on every PR. That's 2–3 days of focused work. Shipping it blocks Prompt 2's main deliverable (unfreezing the pipeline + classifier fix), so we spec it here and pick it up in Prompt 3.

---

## Goal

Every PR that touches:
- `src/lib/pipeline/scoring/**`
- `src/lib/pipeline/classification/**`
- `src/lib/pipeline/reasons/**`
- `src/lib/pipeline/alerts/triggers.ts`

runs a deterministic backtest against 50 labeled repos on 90d of real GitHub star-history data. The CI gate fails if the PR regresses >2/50 detections against the committed baseline.

---

## Ground-truth set (50 repos, labeled)

Drawn from two sources:

**Positive labels — "real breakouts in last 90d" (35 repos):**
- OSSInsight AI Agent Frameworks collection — the 17 repos with rank-jumps >3 places in trailing 90d per their rank-change indicator
- WATCHLIST_SEED.md tier A + tier E repos that had >40% of their all-time stars land in the last 90d (sampled by star-history.com data, filtered to >1k total stars)
- Known-canonical mid-season breakouts: `cline/cline`, `Aider-AI/aider`, `sst/opencode`, `block/goose`, `All-Hands-AI/OpenHands`, `plandex-ai/plandex`, `letta-ai/letta`

**Negative labels — "should NOT fire breakout" (15 repos):**
- Stable mega-repos: `facebook/react`, `vuejs/core`, `torvalds/linux`, `nodejs/node` — high stars, low momentum
- Archived repos: any repo with `archived=true` on the current seed
- Steady risers that should be "rising" but not "breakout": `tauri-apps/tauri`, `zed-industries/zed`

**Label format** (to commit at `test-data/backtest/ground-truth.jsonl`):

```jsonl
{"repoId":"cline--cline","label":"breakout","window":"2026-01-01/2026-04-01","expectedReasonCodes":["breakout_detected","star_spike"]}
{"repoId":"facebook--react","label":"steady","window":"2026-01-01/2026-04-01","expectedReasonCodes":[]}
```

---

## Data source

**Primary:** ClickHouse public demo (`sql.clickhouse.com`) — free public access to GitHub Archive data back to 2011. Query: star events grouped by day for each `(owner, repo)` in the ground-truth set, restricted to the test window.

**Fallback:** GH Archive (`https://www.gharchive.org/`) — raw hourly dumps. Used to backfill any repo ClickHouse demo doesn't cover.

**Caching:** the queried 90d slices are committed to `test-data/backtest/clickhouse-cache/*.json` so the CI run doesn't hit external services. Refresh cache every 30 days (checked into the repo, reviewable in PR).

---

## Harness API (once implemented)

```ts
// src/lib/pipeline/__tests__/backtest.test.ts
import { runBacktest } from "../backtest/harness";

test("backtest: classifier + trend engine against 50-repo ground truth", async () => {
  const result = await runBacktest({
    groundTruthPath: "test-data/backtest/ground-truth.jsonl",
    cacheDir: "test-data/backtest/clickhouse-cache/",
    windowDays: 90,
  });

  // Assertions are comparative against the last green baseline,
  // not absolute — PRs only fail on regression.
  assert.ok(result.truePositives >= result.baseline.truePositives - 2);
  assert.ok(result.falsePositives <= result.baseline.falsePositives + 2);
});
```

---

## Baseline format

Committed to `test-data/backtest/baseline.json`:

```json
{
  "computedAt": "2026-04-18T00:00:00Z",
  "commitSha": "<last-known-green-on-main>",
  "groundTruthSize": 50,
  "truePositives": 28,
  "falseNegatives": 7,
  "trueNegatives": 13,
  "falsePositives": 2,
  "classifierF1": 0.87,
  "breakoutPrecision": 0.93,
  "breakoutRecall": 0.80
}
```

Baseline is refreshed **manually** when:
- A PR intentionally improves detection (e.g., adds a new reason code that catches repos the old heuristic missed).
- The ground-truth set is updated (30d refresh window).

Baseline refresh requires its own PR with a clear note — it's never auto-bumped.

---

## CI wiring

**`.github/workflows/ci.yml` addition:**

```yaml
- name: Backtest
  if: github.event_name == 'pull_request'
  run: npm run test:backtest
  env:
    CLICKHOUSE_CACHE_DIR: test-data/backtest/clickhouse-cache/
```

**`package.json` addition:**

```json
"test:backtest": "tsx --test src/lib/pipeline/__tests__/backtest.test.ts"
```

Runtime budget: under 45s for the full 50-repo backtest when cache is warm.

---

## Classifier-specific F1 gate

Separate from breakout backtest, the classifier has its own F1 metric computed against `WATCHLIST_SEED.md` tier A–F (~100 AI-positive labels) vs non-AI seeds (~200 negatives).

```
expected_primary = "ai-agents" OR "ai-ml" OR "local-llm" OR "mcp" (any ai-*)
actual_primary = classifyRepo(repo).primary.categoryId

precision = true-AI-labeled-as-AI / all-AI-labels
recall = true-AI-labeled-as-AI / all-AI-positives
F1 = harmonic mean
```

**Target from PLAN.md P0.4:** F1 ≥ 0.85.

**Today (post P0.4 commit, pre-harness):** unmeasured. The 11 regression tests cover the 7 canonical gate-4 repos and the modern coding-agent keyword shape — but 11 repos is not 100. Full measurement ships with the harness.

---

## Regression-triggering events (expected failure modes)

- Weight shift on a classification rule flips a borderline repo's primary
- Adding a keyword that accidentally matches a non-AI description
- Tightening a threshold in `scoring/engine.ts` that drops breakout detections
- A new reason-code detector that fires on too-broad a pattern

The harness catches these before merge. PR author sees precisely which repos flipped + which reason codes regressed.

---

## Explicit non-goals for P1.8

- Live-data A/B testing (production shadow mode) — deferred further.
- Real-time detection-lead-time measurement vs GitHub Trending (requires a scraper on GitHub Trending + time-alignment logic). Separate workstream.
- Cross-source cross-check (ClickHouse vs OSSInsight vs BigQuery) — that's P1.5.
