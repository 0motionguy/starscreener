# OpenClaw Twitter Agent Instructions

This is the contract the OpenClaw Twitter/X scan agent must follow when writing findings into TrendingRepo.

## Endpoint

Before scanning, fetch candidates from TrendingRepo:

```txt
GET /api/internal/signals/twitter/v1/candidates?limit=50
```

Then submit findings:

Use:

```txt
POST /api/internal/signals/twitter/v1/ingest
```

Auth:

```txt
Authorization: Bearer <internal-agent-token>
Content-Type: application/json
```

## Core rules

1. Always send `version: "v1"` and `source: "twitter"`.
2. Always send the canonical TrendingRepo `repoId`.
3. Prefer repos returned by the candidates endpoint. Do not choose arbitrary X topics as scan targets.
4. Always send the full accepted matched-post evidence, not just top posts.
5. Include the real X profile avatar URL for each author when visible.
6. Reuse the exact same `scan.scanId` when retrying the same scan.
7. Do not treat agent-computed score or badge as canonical. The server recomputes them.
8. If the scan is partial, still submit what was collected and set `scan.status` accordingly.

## Candidate response

The candidates endpoint returns known TrendingRepo repos ordered by scan priority:

```json
{
  "ok": true,
  "version": "v1",
  "source": "twitter",
  "generatedAt": "2026-04-22T13:30:00.000Z",
  "count": 1,
  "candidates": [
    {
      "priorityRank": 1,
      "priorityScore": 236.4,
      "priorityReason": "known TrendingRepo repo; no X scan yet",
      "lastScannedAt": null,
      "repo": {
        "repoId": "anthropic--claude-code",
        "githubFullName": "anthropic/claude-code",
        "githubUrl": "https://github.com/anthropic/claude-code",
        "repoName": "claude-code",
        "ownerName": "anthropic",
        "homepageUrl": null,
        "docsUrl": null,
        "packageNames": [],
        "aliases": ["claude-code"],
        "description": "Agentic coding CLI"
      }
    }
  ]
}
```

## Required request body

```json
{
  "version": "v1",
  "source": "twitter",
  "agent": {
    "name": "openclaw-twitter-scan-agent",
    "version": "1.0.0",
    "runId": "run_2026_04_22_abc123"
  },
  "repo": {
    "repoId": "anthropic--claude-code",
    "githubFullName": "anthropic/claude-code",
    "githubUrl": "https://github.com/anthropic/claude-code",
    "repoName": "claude-code",
    "ownerName": "anthropic",
    "homepageUrl": "https://claude.ai/code",
    "docsUrl": "https://docs.anthropic.com/claude-code",
    "packageNames": ["@anthropic-ai/claude-code"],
    "aliases": ["Claude Code"],
    "description": "Agentic coding CLI"
  },
  "scan": {
    "scanId": "twscan_2026_04_22_abc123",
    "scanType": "targeted_repo_scan",
    "triggeredBy": "trending_pipeline",
    "windowHours": 24,
    "startedAt": "2026-04-22T11:55:00.000Z",
    "completedAt": "2026-04-22T12:00:00.000Z",
    "status": "completed"
  },
  "queries": [
    {
      "queryText": "anthropic/claude-code",
      "queryType": "repo_slug",
      "tier": 1,
      "confidenceWeight": 1,
      "enabled": true,
      "matchCount": 17
    },
    {
      "queryText": "\"Claude Code\"",
      "queryType": "project_name",
      "tier": 2,
      "confidenceWeight": 0.7,
      "enabled": true,
      "matchCount": 42
    }
  ],
  "posts": [
    {
      "postId": "189123456789",
      "canonicalPostId": "189123456789",
      "postUrl": "https://x.com/example/status/189123456789",
      "authorHandle": "example",
      "authorId": "author_1",
      "authorAvatarUrl": "https://pbs.twimg.com/profile_images/123/example_normal.jpg",
      "postedAt": "2026-04-22T10:14:00.000Z",
      "text": "Claude Code is insanely good...",
      "likes": 840,
      "reposts": 230,
      "replies": 39,
      "quotes": 11,
      "matchedBy": "repo_slug",
      "confidence": "high",
      "matchedTerms": ["anthropic/claude-code", "Claude Code"],
      "whyMatched": "Contains exact repo slug and product phrase",
      "supportingContext": ["owner"],
      "sourceQuery": "anthropic/claude-code",
      "sourceQueryType": "repo_slug",
      "isRepost": false
    }
  ],
  "rawSummary": {
    "candidatePostsSeen": 91,
    "acceptedPosts": 1,
    "rejectedPosts": 90,
    "rateLimited": false,
    "timeoutHit": false,
    "challengeDetected": false
  },
  "observed": {
    "metrics": {
      "mentionCount24h": 47,
      "uniqueAuthors24h": 12,
      "totalLikes24h": 2300,
      "totalReposts24h": 890,
      "totalReplies24h": 140,
      "totalQuotes24h": 56,
      "finalTwitterScore": 82.4
    },
    "badge": {
      "state": "x_fire",
      "reason": "High-confidence multi-author buzz with strong repost velocity"
    },
    "topPostIds": ["189123456789"]
  }
}
```

## Field notes

### `repo`

- `repoId` must be the canonical TrendingRepo repo id from the intake task.
- `githubFullName` must be `owner/repo`.
- `githubUrl` must be the canonical GitHub repository URL for `githubFullName`.

### `scan`

- `scanId` is the idempotency key.
- `scanType` is always `"targeted_repo_scan"`.
- `triggeredBy` must be one of:
  - `trending_pipeline`
  - `manual_drop`
  - `review_queue`
  - `scheduled_refresh`
- `status` must be one of:
  - `completed`
  - `partial`
  - `failed`

### `queries`

Allowed `queryType` values:

- `repo_slug`
- `repo_url`
- `homepage_url`
- `docs_url`
- `package_name`
- `project_name`
- `repo_short_name`
- `owner_project_phrase`
- `alias`

### `posts`

Each accepted post must include:

- `matchedBy`
- `confidence`
- `matchedTerms`
- `whyMatched`
- `sourceQuery`
- `sourceQueryType`

Each accepted post should include:

- `authorAvatarUrl`: the real X/Twitter profile image URL if visible in the scan result

If the avatar is not visible, omit `authorAvatarUrl`. TrendingRepo will fall back to a public handle-based avatar resolver.

Allowed `matchedBy`:

- `url`
- `repo_slug`
- `package_name`
- `phrase`
- `alias`

Allowed `confidence`:

- `high`
- `medium`
- `low`

The agent must only send accepted matched posts in `posts`.

### `rawSummary`

- `acceptedPosts` must equal `posts.length`
- `candidatePostsSeen` must be greater than or equal to `acceptedPosts + rejectedPosts`

### `observed`

This is optional.

- it is useful for debugging agent behavior
- it is not canonical
- TrendingRepo recomputes the final metrics, score, badge, and top post server-side

## Retry behavior

Retry only on:

- network timeout
- `429`
- `500`
- `503`

Do not retry on:

- `400`
- `401`
- `403`
- `409`
- `422`

Retry policy:

1. reuse the exact same `scan.scanId`
2. resend the exact same payload
3. back off with jitter, for example `2s`, `5s`, `15s`
4. stop after 3 to 5 attempts

## What the server returns

Example success response:

```json
{
  "ok": true,
  "version": "v1",
  "ingestionId": "twi_1234567890abcdef123456",
  "idempotentReplay": false,
  "repo": {
    "repoId": "anthropic--claude-code",
    "githubFullName": "anthropic/claude-code"
  },
  "scan": {
    "scanId": "twscan_2026_04_22_abc123",
    "status": "completed",
    "summaryPromoted": true
  },
  "counts": {
    "queriesStored": 2,
    "postsReceived": 47,
    "postsAccepted": 44,
    "postsRejected": 3,
    "postsInserted": 44,
    "postsUpdated": 0
  },
  "computed": {
    "mentionCount24h": 44,
    "uniqueAuthors24h": 12,
    "totalLikes24h": 2300,
    "totalReposts24h": 890,
    "totalReplies24h": 140,
    "totalQuotes24h": 56,
    "engagementTotal": 3386,
    "finalTwitterScore": 82.4,
    "badgeState": "x_fire",
    "lastScannedAt": "2026-04-22T12:00:00.000Z",
    "topPostUrl": "https://x.com/example/status/189123456789"
  }
}
```

## What the agent should do after response

- if `ok: true`, mark the scan task complete
- if `idempotentReplay: true`, treat it as success
- if `summaryPromoted: false`, treat it as success; the scan was accepted but an older scan did not replace a newer repo summary
- if the response is non-retryable, stop and surface the error to the operator
