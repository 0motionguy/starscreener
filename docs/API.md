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
