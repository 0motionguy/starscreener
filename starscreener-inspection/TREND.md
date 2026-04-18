# StarScreener — Trend Engine Analysis

**Scope:** the exact math currently shipped, how it behaves against known AI blowups in stored data, and what would need to change to actually surface rising AI repos **before** anyone else.

---

## The core formula

`src/lib/pipeline/scoring/engine.ts:229-239`:

```
overall = clamp(
  round1(
    (Σ_k  w_k * c_k) * decayFactor * antiSpamDampening * breakoutMultiplier
    + quietKillerBonus
  ),
  0, 100
)
```

where:
- `c_k` = one of 10 components, each normalized to `[0, 100]`
- `w_k` = category-weighted mix, re-normalized so `Σ w_k = 1.0` per category
- `decayFactor`, `antiSpamDampening`, `breakoutMultiplier` ∈ `[0.3, 1.5]` multiplicative modifiers
- `quietKillerBonus` additive bonus for the "quiet killer" class

---

## The 10 components (with live weights and live health)

| # | Component | Normalization | Weight | Dead in prod? | Why |
|---|-----------|---------------|--------|---------------|-----|
| 1 | `starVelocityScore` | log-normalized 24h stars-gained | ~25% | **YES on 96% of seed** | 296/309 seeded repos hit the 40k-star stargazer cap → `starsDelta24h = 0` |
| 2 | `forkVelocityScore` | log-normalized 7d forks | ~10% | partial | Same cap-adjacent issue |
| 3 | `contributorGrowthPct` | linear % over baseline | ~10% | partial | Contributors endpoint works; baseline needs history |
| 4 | `freshness` | step function on `lastCommit`, `lastRelease` | ~10% | live | Works; biased toward "active" over "new" |
| 5 | `releaseSignal` | bonus on `release_major` / `release_minor` / `release_patch` | ~10% | **FALSE POSITIVES ACTIVE** | `MAJOR_VERSION_RE` matches `1.3.0a3` pre-release as `release_major` — already in `.data/reasons.jsonl` line 2 |
| 6 | `issueActivity` | `linearNorm(openIssues, 0, 200)` | ~5% | **DESIGN BUG** | Rewards abandoned bug-swamps equally with healthy-but-busy projects |
| 7 | `commitFreshness` | step function on recent commits | ~5% | live | |
| 8 | `socialBuzzScore` | clamped `mentionCount24h` + decay | ~10% | **DEAD** | `.data/mentions.jsonl` empty — social adapters fire on-demand only, never persisted → 0 across all 309 scores |
| 9 | `categoryMomentum` | relative rank within category | ~5% | **SILENT HOLE** | defaults to 0 when `scoreRepo` is called without the pre-pass → always zero in individual recomputes |
| 10 | `rankMomentum` | linear % rank change | ~10% | partial | Depends on `previousRank` snapshot which isn't stored durably — fabricated downstream |

**Net:** **at least 3 of 10 components are dead or structurally broken** on the currently stored data. Everything else is math downstream of a silent score underestimation.

---

## The modifiers

### `antiSpamDampening` — never fires

Exists at `src/lib/pipeline/scoring/modifiers.ts:64-94`, but across all 309 rows in `.data/scores.jsonl` the value is **exactly 1.0** (no-op). Three issues:

1. Uses `forksDelta7d` in place of total forks (author admits at lines 67-74).
2. All three gates require absolute spikes (`starsDelta24h > 200` **and** `stars > 1000`) — small-repo vanity star attacks are invisible.
3. The check order means a high-activity legit repo can trigger the gate identically to a buy-star pattern.

### `breakoutMultiplier` — fires 0 times in stored data

`detectBreakout` looks for `starsDelta24h > 3 * baseline_7d` and `score.overall > 70`. With 300/309 repos carrying `starsDelta24h = 0`, the numerator is zero. Across all 309 stored scores: **0 repos flagged as breakout**.

### `decayFactor` — works as designed

Penalizes stale repos (`lastCommit > 30d`). Clean.

### `quietKillerBonus` — structurally sound, untested on real data

Adds points for "steady growth + low social noise" — good idea in principle. Unverified in practice because `socialBuzzScore` is 0 everywhere, which trivially satisfies the "low noise" side.

---

## Backtest — did we catch known AI blowups?

**Methodology:** inspected `.data/snapshots.jsonl`, `.data/scores.jsonl`, `.data/reasons.jsonl` for the canonical AI blowup set. Limitation: without GH Archive / BigQuery access, we can only check **what the stored pipeline observed**, not what would have been observed against live historical data.

| Repo | In seed? | In `.data/repos.jsonl`? | Flagged as breakout/rising? | Verdict |
|------|----------|------------------------|------------------------------|---------|
| `anthropics/claude-code` | ✓ | **✗** | — | missed (never ingested) |
| `modelcontextprotocol/servers` | ✓ | **✗** | — | missed (never ingested) |
| `crewAIInc/crewAI` | ✓ | **✗** | — | missed (never ingested) |
| `ollama/ollama` | ✓ | ✓ (manual burst) | ✗ (flat sparkline due to 40k cap) | missed (cap + no history) |
| `chroma-core/chroma` | ✓ | ✓ | ✗ | missed |
| `langchain-ai/langchain` | ✓ | partial | ✗ (cap) | missed |
| `vllm-project/vllm` | ✓ | partial | ✗ | missed |
| `huggingface/smolagents` | not in seed | — | — | seed gap |

**Headline:** the engine has not flagged **a single breakout** in stored data. This is not a scoring math bug — it's a **no-data** bug. Fix the data and most of the backtest turns green automatically. See `trend.json` for the full per-repo trace.

---

## False-positive patterns the code will not catch

1. **Pre-release tags as `release_major`.** Actively firing (evidence in `.data/reasons.jsonl` line 2). Fix: tighten `MAJOR_VERSION_RE` to reject `[a-zA-Z]` suffixes after the version digits.
2. **Awesome-list / readme-dump repos.** No detector. An `awesome-ai` list getting 500 stars/day will score as breakout. Fix: add a `isResourceList` heuristic based on owner/name/topics + flat commit-frequency prior.
3. **Buy-star / vanity attacks on small repos.** `antiSpamDampening` gate at `stars > 1000` and `starsDelta24h > 200` skips the repos most likely to be manipulated. Fix: change the gates to delta-ratio-based (`starsDelta24h / max(stars, 100) > 0.5` is suspicious).
4. **Re-hyped legacy repos.** An old repo re-surfacing on HN will spike `starVelocityScore` without real sustained momentum. Fix: add a `hasCommitFreshness` floor under breakout flag.

## False-negative patterns the code will not catch

1. **Cold-start AI repos under 100 stars.** If not in seed, they're invisible — there is no discovery of non-seed repos anywhere in the pipeline. Fix: periodic GH search for AI keywords + auto-promotion into the seed.
2. **Mega-repos over the 40k cap.** Flat-zero deltas make breakout detection impossible. Fix: switch the history source to Events API firehose for anything over the cap.
3. **Social-first spikes.** HN frontpage → GitHub star surge takes 2-6 hours. Today we catch the second leg (star surge) late and the first leg (social mentions) not at all because `.data/mentions.jsonl` is empty.
4. **Rank-climbers on a nearly-empty ranked set.** Very few repos ever have complete components → rank changes are noisy. Fix: persist `previousRank` durably and compute `rankMomentum` as a rolling 7d change.

---

## Tests

`src/lib/pipeline/__tests__/*.test.ts` run `tsx --test`. 100/100 pass. Coverage shape:

| Area | Tests | Notes |
|------|-------|-------|
| Alerts rule logic | 17 | Good — covers evaluators, cooldown, digest |
| Scoring engine | **0** | `computeScore`, `detectBreakout`, `detectQuietKiller`, `logNorm`, weight-sum invariant — **none tested** |
| Ingestion | sparse | Happy-path sanity only |
| Filters | sparse | |
| Rate limiting / retry | none | |
| Snapshot eviction behavior | none | |

Every scoring change ships blind today.

---

## Recommended algorithm changes, ranked

1. **Stop being a closed-seed screener.** Add a periodic GH search pass ("`topic:llm created:>30d stars:100..5000 sort:stars-desc`") that promotes new candidates. The whole point of a "next mover" signal is repos not yet on a curated list — and the current closed seed forecloses that by construction.

2. **Replace `starsDelta24h` with a multi-signal velocity index** built from Events API counts (`WatchEvent` rate) rather than stargazer list diffs. Kills the 40k-star cap problem at the root.

3. **Z-score vs category baseline instead of absolute thresholds.** Current breakout test is absolute (`starsDelta24h > 3 * baseline`). At 30k-repo scale this produces too few or too many fires depending on category heat. Convert to a per-category rolling mean + standard deviation with a Z-score trigger (>2σ → rising, >3σ → breakout).

4. **Persist mentions to make `socialBuzzScore` a real input.** On-demand is a UX decision; persistence is a pipeline decision. Fire all social adapters during ingestion, dedupe, compute `buzzAcceleration = mentions_1h / mentions_24h`. That derivative **is** the leading indicator you want.

5. **Fix component 9 (`categoryMomentum`) to not default to 0.** Either make it a hard requirement that the pre-pass ran, or compute it lazily from the current `repoStore` on each `scoreRepo` call.

6. **Add at least these 6 scoring tests:**
   - `computeScore` weight-sum invariant (∀ category: `Σ w_k == 1.0 ± 0.001`)
   - `logNorm` monotonicity + zero-input behavior
   - `detectBreakout` boundary (`Δ = 3 × baseline ± ε`)
   - `detectQuietKiller` boundary
   - Pre-release tag handling — `1.3.0a3` must not fire `release_major`
   - `categoryMomentum` with and without pre-pass

7. **Add a "surface unverified" toggle.** Repos without enough history to score reliably should be **hidden** by default (honoring the no-mock rule) and shown only on opt-in. Today they silently pollute the leaderboard with zero deltas.

---

## One-paragraph conclusion

The math in `engine.ts` is competent — log-normalized components, sensible weights, real modifiers. The problem isn't the formula. It's that **three components are silently zero** on most of the stored data, **one modifier never fires**, **one false positive is actively shipping**, and **zero tests cover the engine**. Almost every remediation is small (tighten a regex, persist mentions, add 6 unit tests, make component 9 not default to 0) except for the one that actually matters for "first to find AI repos": **switch the history source from stargazer listing to the Events API firehose**, and **open the candidate set beyond the curated seed**. Until those two land, StarScreener is a pretty leaderboard over stale data, not a trend engine.

**Detail trace:** `starscreener-inspection/trend.json`.
