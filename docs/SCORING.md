# StarScreener Scoring Methodology

This document describes the scoring algorithms StarScreener publishes via its
public API surfaces. Each algorithm is intentionally simple, fully deterministic
given the upstream signal payloads, and unit-tested in the worker.

---

## Engagement Composite (0-100)

**Slug:** `ss:data:v1:engagement-composite`
**Worker fetcher:** `apps/trendingrepo-worker/src/fetchers/engagement-composite/`
**Schedule:** hourly at minute `:45` (`45 * * * *`)
**Public route:** `GET /api/scoring/engagement?limit=N` (default 50, max 200)
**App-side reader:** `src/lib/engagement-composite.ts`

### Purpose

A single 0-100 leaderboard score per repo that aggregates seven independent
attention/usage signals. Designed to surface repos with broad, multi-platform
traction (vs. a one-shot HN front-page hit). The score is cohort-relative — a
score of 80 today does not mean the same absolute traction as a score of 80
six months from now; it always means "in the top X% of the cohort observed
in this run."

### Inputs

The fetcher reads seven upstream Redis slugs at the top of every run:

| Component | Upstream slug | Field / derivation |
|---|---|---|
| `hn` | `hackernews-repo-mentions` | `mentions[full_name].scoreSum7d` (sum of HN post scores in 72h window) |
| `reddit` | `reddit-mentions` | `mentions[full_name].upvotes7d` (sum of upvotes in 7d window) |
| `bluesky` | `bluesky-mentions` | `mentions[full_name].likesSum7d + repostsSum7d` |
| `devto` | `devto-mentions` | `mentions[full_name].reactionsSum7d` |
| `npm` | `npm-packages` | sum of `downloads7d` across every package whose `linkedRepo` matches |
| `ghStars` | `deltas` | `repos[full_name].delta_7d.value`, falling back to `delta_24h.value × 7` when 7d is unavailable |
| `ph` | `producthunt-launches` | sum of `votesCount` across every launch whose `linkedRepo` matches |

The cohort is the **union** of repos seen across all seven slugs **plus** the
canonical tracked-repo set from `loadTrackedRepos()` (Redis-backed, sourced
from `trending` + `recent-repos`). Typical cohort size: 200-500 repos.

Repos with no signal in a component get raw=0 for that component. They still
rank in the leaderboard — just lower.

### Normalization

Two normalization strategies are applied per component, picked to match the
shape of the underlying distribution.

#### Percentile rank — `hn`, `reddit`, `bluesky`, `devto`, `ph`

These distributions are bursty but bounded; a quiet day's HN-points sum looks
very different from a launch-day sum. Cohort-relative percentile rank gives a
score that stays meaningful across days without an absolute calibration.

For value `v` in cohort positives `S` (sorted ascending, zeros excluded):

```
percentileRank(v) = (count(s ∈ S : s < v) + 0.5 × count(s ∈ S : s = v)) / |S|
```

The mid-rank tiebreak (the `0.5 ×` term) prevents the cohort max from
collapsing many ties to exactly `1.0`.

#### Log10 normalization — `npm`, `ghStars`

These are heavy-tailed power-law distributions: one repo with 50 million
weekly npm downloads should not crowd everyone else into ≈0 normalized.
Log10 compression keeps the dynamic range usable.

```
logNormalize(v, max) = log10(v + 1) / log10(max + 1)
```

For both methods, raw=0 short-circuits to normalized=0 (cold repos collapse
to 0 instead of taking a tiny non-zero floor).

### Composition

The seven normalized component scores (each in `[0, 1]`) are combined as a
weighted sum. The weights sum to **exactly 1.00** — invariant asserted in
`tests/fetchers/engagement-composite/scoring.test.ts`.

| Component | Weight | Rationale |
|---|---|---|
| `ghStars` | **0.25** | Strongest leading indicator of mainstream traction |
| `hn` | **0.20** | Best engagement signal pre-mainstream |
| `npm` | **0.20** | Actual usage, not just attention |
| `reddit` | **0.15** | Broader-but-noisier developer attention |
| `ph` | **0.10** | Launch moment, mostly orthogonal to other signals |
| `bluesky` | **0.05** | Early-mover signal, low volume so capped low |
| `devto` | **0.05** | Slow-burn long-tail content signal |

Final score:

```
compositeScore = round( clamp01(Σ_i normalized_i × weight_i) × 100, 1 decimal )
```

### Tiebreak

Sorted by `compositeScore` descending. On ties (typical for cold repos with
all-zero signals), break by `fullName` ascending. This keeps the leaderboard
deterministic across runs even on quiet days.

### Output shape

`ss:data:v1:engagement-composite` is JSON of type `EngagementCompositePayload`
(see `apps/trendingrepo-worker/src/fetchers/engagement-composite/types.ts`):

```ts
{
  computedAt: ISO string,
  cohortSize: number,         // total repos seen across all upstream slugs
  itemCount: number,          // length of `items` (capped at 200)
  weights: { hn, reddit, bluesky, devto, npm, ghStars, ph },
  items: [
    {
      fullName: 'owner/repo',
      rank: 1,                // 1-based, sorted by score desc
      compositeScore: 82.4,   // 0..100, 1 decimal
      components: {
        hn:       { raw: 250,    normalized: 0.92 },
        reddit:   { raw: 800,    normalized: 0.85 },
        bluesky:  { raw: 50,     normalized: 0.74 },
        devto:    { raw: 40,     normalized: 0.68 },
        npm:      { raw: 5000000, normalized: 0.91 },
        ghStars:  { raw: 1200,   normalized: 0.78 },
        ph:       { raw: 800,    normalized: 0.95 },
      },
    },
    ...
  ],
}
```

Top 200 items are persisted; consumers may further cap via the route's
`?limit` query parameter (default 50, max 200).

### Operational properties

- **Determinism:** given the same upstream payloads, the fetcher produces
  byte-identical output (modulo `computedAt`).
- **Cold cohort:** when every upstream slug is empty, the fetcher still
  publishes an empty `items: []` payload — readers should treat `itemCount=0`
  as a soft signal but not as an error.
- **Staleness budget:** the `/api/scoring/engagement` route returns 503 if
  the payload is older than 6 hours. Under nominal operation it should
  always be <75 minutes (1h cron + one missed tick).
- **Failure isolation:** any single upstream slug being missing degrades the
  affected component to raw=0 across the cohort but does not fail the run.
  The `coverage` field in worker logs reports per-source row counts so an
  operator can spot a slug-level outage.

### Verification gates

From `apps/trendingrepo-worker/`:

```
npm run typecheck
npm test
DATA_STORE_DISABLE=1 ./node_modules/.bin/tsx src/index.ts engagement-composite --dry-run
```

From repo root:

```
npm run typecheck
```
