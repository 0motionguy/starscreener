# StarScreener API Reference

All routes live under `/api/*`. Every response is `application/json`. No auth on the public routes; cron routes require `Authorization: Bearer $CRON_SECRET`.

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

## Cron (auth required)

All cron routes require `Authorization: Bearer $CRON_SECRET`. Accept both GET (Vercel Cron) and POST (manual curl).

### `POST /api/cron/ingest?tier=hot|warm|cold`

Run the tier scheduler: pick the top N overdue repos for the given tier and ingest them.

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  "$HOST/api/cron/ingest?tier=hot"
```

**Response**

```json
{
  "ok": true,
  "tier": "hot",
  "processed": 50,
  "okCount": 49,
  "failed": 1,
  "rateLimitRemaining": 4831,
  "durationMs": 8210,
  "source": "github"
}
```

Error responses return `{ "ok": false, "reason": "..." }` with status 401 (auth), 400 (tier), or 500.

### `POST /api/cron/seed`

One-shot seed from `ALL_SEED_REPOS` (chunks of 25 with a 300ms delay). Safe to re-run — existing repos skip gracefully.

```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" "$HOST/api/cron/seed"
```

**Response**

```json
{
  "ok": true,
  "total": 300,
  "okCount": 287,
  "failed": 13,
  "rateLimitRemaining": 2415,
  "chunks": 12,
  "durationMs": 92341,
  "source": "github",
  "stoppedEarly": false
}
```

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
