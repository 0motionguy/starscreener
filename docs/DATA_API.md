# Data API

The Data API is the authenticated bulk-data surface for API-key clients that need more than one repo profile at a time.

Auth is required. Send either:

```bash
x-api-key: sskey_...
```

or a legacy user token:

```bash
x-user-token: ...
```

## Endpoints

### `GET /api/data/repos`

Bulk repo feed with filtering, projection, sorting, and pagination.

```bash
curl 'https://trendingrepo.com/api/data/repos?window=24h&filter=breakouts&limit=25&fields=fullName,stars,starsDelta24h,momentumScore,url' \
  -H 'x-api-key: YOUR_API_KEY'
```

Query params:

| Param | Values | Default |
| --- | --- | --- |
| `window` | `24h`, `7d`, `30d` | `7d` |
| `sort` | `trend`, `momentum`, `stars`, `delta`, `newest` | `trend` |
| `filter` | `all`, `breakouts`, `hot`, `quiet-killers`, `new-under-30d` | `all` |
| `category` | category id | unset |
| `language` | exact language match, case-insensitive | unset |
| `tag` / `topic` | exact tag or topic match, case-insensitive | unset |
| `q` | simple text search across name, description, language, tags, topics | unset |
| `fields` | comma-separated field allow-list | curated default |
| `limit` | `1..500` | `100` |
| `offset` | `0+` | `0` |

Allowed `fields`:

`id`, `fullName`, `owner`, `name`, `description`, `url`, `language`, `topics`, `tags`, `categoryId`, `stars`, `forks`, `contributors`, `openIssues`, `starsDelta24h`, `starsDelta7d`, `starsDelta30d`, `momentumScore`, `movementStatus`, `rank`, `createdAt`, `lastCommitAt`, `lastReleaseAt`, `lastReleaseTag`, `ownerAvatarUrl`, `collectionNames`, `crossSignalScore`, `channelsFiring`.

### `GET /api/data/snapshot`

Dataset summary plus the top momentum repos.

```bash
curl 'https://trendingrepo.com/api/data/snapshot?top=10' \
  -H 'x-api-key: YOUR_API_KEY'
```

## Rate limits

Responses include:

- `X-RateLimit-Limit`
- `X-RateLimit-Remaining`
- `X-RateLimit-Reset`

Paid tiers multiply the base Data API budget through the shared pricing tier table.
