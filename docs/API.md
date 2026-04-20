# StarScreener API Reference

All routes live under `/api/*`. Every response is `application/json`. Public routes are unauthenticated; a small set of admin routes under `/api/pipeline/*` require `Authorization: Bearer $CRON_SECRET` via `verifyCronAuth`.

Replace `$HOST` with `http://localhost:3008` (dev) or your deployed URL.

---

## Repos

### `GET /api/repos`

List trending repos with optional filtering, sorting, pagination.

**Query params**

| Param | Type | Default | Values |
|-------|------|---------|--------|
| `period` | string | `week` | `today`, `week`, `month` |
| `filter` | string | `all` | `all`, `breakouts`, `quiet-killers`, `hot`, `new-under-30d`, `under-1k-stars` |
| `category` | string \| null | null | any category id |
| `sort` | string | `momentum` | `momentum`, `stars-today`, `stars-total`, `newest` |
| `limit` | number | 25 | 1-100 |
| `offset` | number | 0 | >= 0 |

**Example**

```bash
curl "$HOST/api/repos?period=week&filter=breakouts&limit=10"
```

**Response**

```json
{
  "repos": [
    {
      "id": "repo_abc",
      "fullName": "owner/name",
      "stars": 12543,
      "momentumScore": 87,
      "movementStatus": "breakout",
      "rank": 3,
      "categoryId": "ai-agents",
      "starsDelta24h": 412,
      "sparklineData": [/* ... */]
    }
  ],
  "meta": {
    "total": 57,
    "limit": 10,
    "offset": 0,
    "period": "week",
    "filter": "breakouts"
  }
}
```

---

### `GET /api/repos/[owner]/[name]`

Full detail bundle for a single repo.

**Example**

```bash
curl "$HOST/api/repos/vercel/next.js"
```

**Response (abbreviated)**

```json
{
  "repo": { "id": "...", "fullName": "vercel/next.js", "stars": 132400, "..." : "..." },
  "score": { "overall": 82, "components": { "starVelocity24h": 71, "...": 0 } },
  "category": { "categoryId": "frameworks", "confidence": 0.93 },
  "reasons": { "summary": "Rank climber + fresh release", "details": [/* ... */] },
  "social": { "mentionCount": 42, "buzz": 61.2 },
  "mentions": [/* social mentions */],
  "whyMoving": { "headline": "...", "factors": [/* ... */] },
  "relatedRepos": [/* ... */]
}
```

Returns `404` when the repo id is unknown.

---

## Search

### `GET /api/search`

Fuzzy search across name, owner, description.

```bash
curl "$HOST/api/search?q=ollama"
```

**Response**

```json
{ "repos": [ /* matching Repo[] */ ] }
```

---

## Pipeline

### `GET /api/pipeline/status`

Pipeline health snapshot (repo count, last recompute, persistence enabled).

```bash
curl "$HOST/api/pipeline/status"
```

### `POST /api/pipeline/recompute`

Force a full recompute (deltas + scores + classifications + reasons + ranks + alerts) and flush to disk.

```bash
curl -X POST "$HOST/api/pipeline/recompute"
```

**Response**

```json
{
  "ok": true,
  "summary": {
    "reposRecomputed": 80,
    "scoresComputed": 80,
    "reasonsGenerated": 80,
    "alertsFired": 3,
    "durationMs": 412
  }
}
```

### `POST /api/pipeline/ingest`

Ingest a specific list of repos (no auth, ad-hoc).

```bash
curl -X POST "$HOST/api/pipeline/ingest" \
  -H 'Content-Type: application/json' \
  -d '{"fullNames":["vercel/next.js","ollama/ollama"]}'
```

Limits: 1-50 repos per call.

### `GET /api/pipeline/featured`

Featured trending cards for the homepage.

```bash
curl "$HOST/api/pipeline/featured?limit=8"
```

### `GET /api/pipeline/meta-counts`

Counts per meta filter (breakouts / quiet killers / etc.).

```bash
curl "$HOST/api/pipeline/meta-counts"
```

### `GET /api/pipeline/sidebar-data`

Aggregate data for the left sidebar (category list, hot badges, mini stats).

### `GET /api/pipeline/alerts`

Fired alert events.

```bash
curl "$HOST/api/pipeline/alerts?userId=local"
```

### `GET/POST/DELETE /api/pipeline/alerts/rules`

Alert rule CRUD.

```bash
# Create
curl -X POST "$HOST/api/pipeline/alerts/rules" \
  -H 'Content-Type: application/json' \
  -d '{
    "userId": "local",
    "trigger": { "type": "momentum_threshold", "value": 80, "direction": "up" },
    "target": { "type": "repo", "repoId": "repo_abc" }
  }'

# List
curl "$HOST/api/pipeline/alerts/rules?userId=local"

# Delete
curl -X DELETE "$HOST/api/pipeline/alerts/rules?id=rule_123"
```

### `POST /api/pipeline/persist`

Flush all stores to disk manually.

```bash
curl -X POST "$HOST/api/pipeline/persist"
```

### `POST /api/pipeline/backfill-history`

On-demand stargazer backfill for a single repo. Walks `/repos/{owner}/{name}/stargazers` with the `application/vnd.github.star+json` Accept header, buckets the real `starred_at` timestamps into daily counts, and writes up to 30 backdated `RepoSnapshots` so the delta engine has actual history to work with for that repo.

**Auth:** shared `verifyCronAuth` (tri-state — see [src/lib/api/auth.ts](../src/lib/api/auth.ts)). Header: `Authorization: Bearer $CRON_SECRET` (raw `$CRON_SECRET` also accepted). `maxDuration: 300s`.

**Body (required JSON)**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `fullName` | string | required | Must match `^[A-Za-z0-9._-]+/[A-Za-z0-9._-]+$` |
| `maxPages` | number | unset (helper picks) | Clamped to 1-200 when supplied |

```bash
curl -X POST "$HOST/api/pipeline/backfill-history" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"fullName":"vercel/next.js","maxPages":50}'
```

**Response 200**

```json
{
  "ok": true,
  "fullName": "vercel/next.js",
  "snapshotsWritten": 30,
  "daysCovered": 30,
  "rateLimitRemaining": 4823,
  "skipped": null,
  "durationMs": 8412
}
```

**Error responses**

| Status | Reason |
|--------|--------|
| 400 | `invalid JSON body`, `body must be an object`, `fullName must be in the form 'owner/repo'` |
| 401 | `unauthorized` (missing or wrong header — also returned when `CRON_SECRET` is unset, see callout) |
| 500 | `GITHUB_TOKEN is not set — stargazer backfill requires a PAT with public_repo scope` or `internal error: <message>` |

**Side effects:** mutates `snapshotStore` for the named repo only. Does NOT recompute scores; chase with `POST /api/pipeline/recompute` if leaderboard refresh is desired.

### `POST /api/pipeline/cleanup` (also `GET`)

Re-fetches a batch of tracked repos from GitHub and flags those that are now archived, disabled, or 404'd. Soft flag only — preserves historical snapshots so user-visible charts don't lose data; downstream queries filter on the `archived` / `deleted` flags. Healthy repos previously flagged get revived (both flags cleared).

**Auth:** shared `verifyCronAuth` (tri-state — see [src/lib/api/auth.ts](../src/lib/api/auth.ts)). `maxDuration: 300s`.

**Body (optional JSON; defaults applied when absent)**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `mode` | string | `"all"` | One of `"archived"`, `"deleted"`, `"all"` |
| `dryRun` | boolean | `false` | When true, computes counts + change list without mutating |
| `max` | number | `50` | Repos to check this call. Clamped to 1-500. Rate-limit guard. |

```bash
curl -X POST "$HOST/api/pipeline/cleanup" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"mode":"archived","dryRun":true,"max":100}'
```

**Response 200**

```json
{
  "ok": true,
  "mode": "archived",
  "dryRun": true,
  "checked": 100,
  "wouldArchive": 3,
  "wouldDelete": 0,
  "updated": 0,
  "rateLimitRemaining": 4720,
  "changes": [
    { "id": "repo_xyz", "fullName": "owner/abandoned", "change": "archived" }
  ]
}
```

**Side effects:** when `dryRun: false`, mutates `repoStore` via `upsert` for each match — flips `archived` / `deleted` flags, or clears both for revivals. The `updated` count excludes `dryRun` runs (always `0`).

### `POST /api/pipeline/rebuild` (also `GET`)

Full-data rebuild. Iterates tracked repos, runs stargazer backfill to reconstruct 30-day history from real GitHub timestamps, then optionally recomputes scores so the leaderboard reflects actual momentum instead of zero-delta defaults. The "give me real data NOW" path that goes beyond the snapshot cron's forward-only history. 100% real GitHub data — no mocks, no synthesized values; fails loudly on missing `GITHUB_TOKEN`.

**Auth:** shared `verifyCronAuth` (tri-state). Requires `GITHUB_TOKEN` env var. `maxDuration: 300s`.

**Candidate selection priority**

1. Explicit `fullNames` array (targeted rebuild) — overrides everything else.
2. `onlyMegaRepos: true` — only repos with `> 40000` stars (hardcoded threshold). Triggers the events-API fast path on stargazer-list-cap hits.
3. `skipSeeded: true` — only repos missing meaningful sparkline history (empty array OR ≤1 unique value).
4. All repos in the store.

After selection, `offset` + `limit` slice the candidate pool for cursor pagination.

**Body (optional JSON)**

| Field | Type | Default | Notes |
|-------|------|---------|-------|
| `limit` | number | `20` | Repos to process this call. Clamped to 1-500. |
| `offset` | number | `0` | Start index into candidate pool. `>= 0`. |
| `maxPages` | number | `4` | Max stargazer pages per repo (~100 stars/page). Clamped to 1-50. |
| `skipSeeded` | boolean | `false` | See selection priority. |
| `skipRecompute` | boolean | `false` | Skip the final `pipeline.recomputeAll()`. Use when paginating through a large rebuild — only recompute on the last call. |
| `fullNames` | string[] | none | Explicit targeted rebuild. |
| `onlyMegaRepos` | boolean | `false` | See selection priority. |

```bash
curl -X POST "$HOST/api/pipeline/rebuild" \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H 'Content-Type: application/json' \
  -d '{"limit":20,"maxPages":4,"skipSeeded":true}'
```

**Response 200**

```json
{
  "ok": true,
  "processed": 20,
  "totalCandidates": 20,
  "totalInPool": 412,
  "offset": 0,
  "nextOffset": 20,
  "hasMore": true,
  "backfilled": 18,
  "skipped": 1,
  "failed": 1,
  "aborted": false,
  "rateLimitRemaining": 3812,
  "durationMs": 67421,
  "recompute": { "reposRecomputed": 80, "scoresComputed": 80 },
  "details": [
    { "fullName": "owner/x", "ok": true, "snapshotsWritten": 30, "daysCovered": 30, "ms": 3211, "rateLimitRemaining": 4823 },
    { "fullName": "owner/y", "ok": true, "snapshotsWritten": 30, "daysCovered": 30, "ms": 2840, "reason": "events-api watch=412", "rateLimitRemaining": 4801 },
    { "fullName": "owner/z", "ok": false, "snapshotsWritten": 0, "daysCovered": 0, "ms": 412, "reason": "404 Not Found" }
  ]
}
```

**Mega-repo fallback:** when stargazer backfill returns `skipped: "exceeds_list_cap"` (GitHub caps the stargazers list at ~40k), the route falls back to `backfillFromEvents` with `days: 30, maxPages: 3` (both hardcoded, passed inline). The `details` entry annotates `reason: "events-api watch=N"`.

**Rate-limit guard:** the loop aborts mid-run when `rateLimitRemaining < 200` (hardcoded threshold, no env override) so scheduled crons retain headroom. `aborted: true` in the response signals an early break.

**Side effects:** mutates `snapshotStore` per repo via stargazer or events-API path. Triggers `pipeline.recomputeAll()` at the end unless `skipRecompute: true`.

---

## Health

### `GET /api/health`

Freshness-gated health endpoint for external uptime monitors. Reports
ages of both the OSS Insight scrape and the git-history delta computation
against a 2-hour threshold. No auth.

```bash
curl "$HOST/api/health"
```

**Response shape**

```json
{
  "status": "ok",
  "lastFetchedAt": "2026-04-20T03:07:15.126Z",
  "computedAt": "2026-04-20T03:07:20.412Z",
  "ageSeconds": { "scraper": 1342, "deltas": 1337 },
  "thresholdSeconds": 7200,
  "stale": { "scraper": false, "deltas": false },
  "coveragePct": 12.4,
  "warning": "delta coverage 12.4% < 50% — expected during 30-day cold-start window"
}
```

`status` is `"ok"` when both signals are within threshold, `"stale"` when
either is older than 2h. `warning` appears when `coveragePct < 50` (i.e.
fewer than half the tracked repos have at least one non-null delta) —
expected during the first 30 days of accumulation, not a failure.

**Status codes**

- `200` — `status: "ok"`.
- `503` — `status: "stale"` (either scraper or deltas older than 2h) or
  `status: "error"` (read failure on the committed JSON).

**Stale example**

```json
{
  "status": "stale",
  "lastFetchedAt": "2026-04-20T00:07:15.126Z",
  "computedAt": "2026-04-20T00:07:20.412Z",
  "ageSeconds": { "scraper": 10800, "deltas": 10795 },
  "thresholdSeconds": 7200,
  "stale": { "scraper": true, "deltas": true },
  "coveragePct": 62.1
}
```

Both signals exceeded the 2h threshold — scraper workflow skipped a run,
or a Vercel build failed to pick up a committed snapshot. See
[INGESTION.md → Operator runbook](./INGESTION.md#operator-runbook) for
diagnosis steps.

---

## Categories

### `GET /api/categories`

List all categories with repo counts.

### `GET /api/compare?ids=repo_a,repo_b,repo_c`

Side-by-side comparison bundle (up to 4 repos).

---

## Error shape

All routes return a consistent error envelope:

```json
{ "error": "message", "...": "optional detail" }
```

with appropriate HTTP status codes (`400`, `401`, `404`, `500`).
