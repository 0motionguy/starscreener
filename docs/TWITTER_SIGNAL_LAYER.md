# Twitter/X Signal Layer

## A. System overview

TrendingRepo now has a dedicated Twitter/X signal subsystem for targeted repo scans. It is intentionally narrow:

- input is a canonical repo descriptor
- OpenClaw fetches prioritized known repos from `GET /api/internal/signals/twitter/v1/candidates`
- OpenClaw runs targeted X searches for that repo
- OpenClaw posts a typed findings payload to `POST /api/internal/signals/twitter/v1/ingest`
- the server re-applies guardrails, recomputes metrics, scores, and badge state
- latest per-repo signal is stored for UI reads
- full scan records are retained for review and retries
- idempotency conflicts are enforced by `scan.scanId` + payload hash
- an ingestion audit log is retained for internal review

Runtime storage is JSONL-backed today:

- `twitter-repo-signals.jsonl` - latest summary per repo
- `twitter-scans.jsonl` - full scan records with queries and matched posts
- `twitter-ingestion-audit.jsonl` - append-safe ingest audit log

Future Postgres descriptors live in [src/lib/db/schema.ts](../src/lib/db/schema.ts).

## B. Query generation rules

Implemented in [src/lib/twitter/query-bundle.ts](../src/lib/twitter/query-bundle.ts).

Tier 1:

- exact repo slug
- exact GitHub URL
- exact homepage/docs URL
- exact package name

Tier 2:

- quoted project name
- quoted repo short name
- quoted scoped package name
- owner + project phrase

Tier 3:

- repo short name fallback
- aliases

Tier 3 fallbacks are disabled when the phrase is too generic.

## C. OpenClaw agent workflow

1. Receive canonical repo input.
2. Build the query bundle.
3. Search X with Tier 1 -> Tier 2 -> Tier 3 queries.
4. Collect candidate posts.
5. Attach match metadata per post:
   - `matchedBy`
   - `confidence`
   - `matchedTerms`
   - `whyMatched`
   - optional `authorAvatarUrl`
   - optional `supportingContext`
6. POST the structured payload to TrendingRepo.
7. Retry safely with the same `scan.scanId` on transport failures.

## C.1 Low-cost collector

TrendingRepo also includes a local collector wrapper for the same contract:

```txt
npm run collect:twitter
npm run collect:twitter:api
npm run collect:twitter:dry
```

Default behavior:

- provider: `nitter`
- mode: `direct`
- candidates: `GET /api/internal/signals/twitter/v1/candidates` equivalent via the local service
- writes: direct `ingestTwitterAgentFindings()` call, then JSONL flush
- display target: the existing `/twitter` leaderboard and repo-detail `TwitterSignalPanel`

Use `collect:twitter:api` when a Next server is already running and you want
the page to update immediately without restarting the process.

The Nitter provider is intentionally best-effort. Nitter's upstream project
notes that running an instance now requires real X accounts, and public
instances can fail or challenge scripted requests. The collector therefore:

- rotates across `TWITTER_NITTER_INSTANCES`
- tries RSS first, then HTML
- caps candidates, queries, posts per query, and posts per repo
- supports targeted refreshes with `--repo owner/name` or `TWITTER_COLLECTOR_REPOS`
- skips zero-post ingests by default so a flaky source cannot overwrite useful
  existing leaderboard data; pass `--ingest-empty` only when you want quiet-scan
  bookkeeping
- keeps the official X API / cloud-browser path pluggable instead of binding
  scoring or UI to a specific source

Key env:

```txt
TWITTER_COLLECTOR_PROVIDER=nitter
TWITTER_COLLECTOR_MODE=direct
TWITTER_COLLECTOR_LIMIT=25
TWITTER_COLLECTOR_QUERIES_PER_REPO=4
TWITTER_COLLECTOR_POSTS_PER_QUERY=10
TWITTER_COLLECTOR_POSTS_PER_REPO=25
TWITTER_COLLECTOR_INGEST_EMPTY=false
TWITTER_COLLECTOR_REPOS=
TWITTER_NITTER_INSTANCES=https://xcancel.com,https://nitter.poast.org
```

## D. Internal API design

Implemented routes:

- `GET /api/internal/signals/twitter/v1/candidates`
- `POST /api/internal/signals/twitter/v1/ingest`
- `POST /api/internal/twitter/v1/findings` (legacy compatibility alias)

Properties:

- authenticated with `Authorization: Bearer <internal-agent-token>`
- versioned in both path and payload (`version: "v1"`)
- idempotent by `scan.scanId` plus payload hash
- safe for retries
- canonical metrics / score / badge computed server-side
- audit log written on first successful ingest

Admin review route:

- `GET /api/internal/twitter/v1/review/[owner]/[name]`

Public read routes:

- `GET /api/twitter/leaderboard`
- `GET /api/twitter/repos/[owner]/[name]`

## E. DB schema proposal

Design-time tables are in [src/lib/db/schema.ts](../src/lib/db/schema.ts):

- `twitter_repo_signals`
- `twitter_scans`
- `twitter_scan_queries`
- `twitter_scan_posts`
- `twitter_ingestions`

This split keeps:

- latest repo summary fast to read
- scan history append-safe
- query metadata reviewable
- matched post evidence auditable
- ingest attempts attributable to a specific agent principal

## F. Matching and confidence rules

Implemented in [src/lib/twitter/scoring.ts](../src/lib/twitter/scoring.ts).

High confidence:

- exact repo URL
- exact repo slug
- exact package name

Medium confidence:

- project phrase
- owner + project context

Low confidence:

- loose alias-only matches

Guardrails:

- generic repo names require strong supporting context
- duplicates collapse by canonical id / post id / URL / normalized text
- low-context generic matches are dropped before scoring

## G. Score formula

Implemented in `computeTwitterScore()`.

Base score:

```txt
0.35 * normalized mention count
0.25 * normalized unique authors
0.20 * normalized reposts
0.10 * normalized replies + quotes
0.10 * normalized capped likes
```

Then:

```txt
final = base + confidenceBonus - ambiguityPenalty - singleAuthorPenalty
```

Current modifiers:

- confidence bonus from exact-match ratio + confidence ratio
- ambiguity penalty from weak exact-match ratio, weak confidence ratio, low diversity, low-confidence bulk
- single-author penalty when one author drives too much of the volume

## H. Badge thresholds

Implemented in `decideTwitterBadge()`.

`X`:

- `mentionCount24h >= 3`
- `uniqueAuthors24h >= 2`
- `high >= 1` or `medium >= 2`

`X🔥`:

- `mentionCount24h >= 8`
- `uniqueAuthors24h >= 4`
- `finalTwitterScore >= 70`
- `exactMatchRatio >= 0.2`
- not dominated by a single author
- stronger high-confidence coverage

## I. UI output format

Latest repo panel:

- [src/components/twitter/TwitterSignalPanel.tsx](../src/components/twitter/TwitterSignalPanel.tsx)

Repo detail integration:

- [src/app/repo/[owner]/[name]/page.tsx](../src/app/repo/[owner]/[name]/page.tsx)
- [src/components/repo-detail/RepoDetailHeader.tsx](../src/components/repo-detail/RepoDetailHeader.tsx)

Leaderboard page:

- [src/app/twitter/page.tsx](../src/app/twitter/page.tsx)

Public DTOs:

- `TwitterRepoPanel`
- `TwitterLeaderboardRow`
- `TwitterRepoRowBadge`

## J. Retry / rescan strategy

- Retry transport failures with the same `scan.scanId`.
- Older scans are stored, but they do not overwrite a newer repo-level signal.
- Store keeps up to 10 scans per repo and prunes scans older than 30 days.
- Recommended cadence:
  - hot candidate: every 2-4h
  - review queue: manual or 12h
  - quiet repo: on-demand only

## K. False-positive prevention checklist

- exact URL/slug/package evidence outranks engagement
- generic names require supporting context
- alias-only noise does not badge by itself
- duplicate/repost chains collapse
- one-author domination is penalized
- low-confidence bulk lowers score
- breakout badge requires both breadth and strong evidence

## L. Pseudocode for implementation

```txt
GET candidates -> repo -> build query bundle
     -> OpenClaw searches X
     -> collect candidate posts
     -> attach match metadata
     -> POST findings

server:
  authenticate internal agent
  validate payload + repo identity
  compute payload hash
  reject idempotency conflicts
  sanitize + dedupe posts
  drop weak generic-name matches
  compute 24h metrics
  compute score
  decide badge
  upsert scan record
  upsert latest repo signal if scan is newest
  write audit log
  expose leaderboard/panel/review DTOs
```

See [OPENCLAW_TWITTER_AGENT_INSTRUCTIONS.md](./OPENCLAW_TWITTER_AGENT_INSTRUCTIONS.md) for the exact agent contract.
