---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# AISO Free Scanner Contract (Verified 2026-05-05)

Source of truth checked from AISO backend code:
- `app/api/scan/route.ts`
- `app/api/scan/run/route.ts`
- `app/api/scan/[id]/route.ts`

## Endpoint flow

1. Submit scan:
- `POST {AISO_API_BASE}/api/scan`
- Body:
```json
{
  "url": "https://example.com",
  "billingTier": "free",
  "profile": "agent-readiness"
}
```
- `billingTier` is optional for free scans (defaults to `free`).
- `profile` is optional (`"full"` or `"agent-readiness"`).

2. Poll status/result:
- `GET {AISO_API_BASE}/api/scan/{scanId}`

## Submit response

```json
{
  "scanId": "uuid",
  "status": "queued",
  "mode": "homepage|quick|...",
  "resultUrl": "https://aiso.tools/scan/{scanId}",
  "source": "web|api|cli|mcp",
  "projectName": null,
  "projectUrl": null
}
```

## Result response (normalized shape used by STARSCREENER)

```json
{
  "scanId": "uuid",
  "url": "https://example.com",
  "status": "queued|running|completed|failed",
  "score": 0,
  "tier": "invisible|partial|visible|cited|null",
  "completedAt": "2026-05-05T00:00:00.000Z",
  "runtimeVisibility": 0,
  "dimensions": [],
  "issues": [],
  "promptTests": []
}
```

## Rate limit / auth notes

- Free scans are unauthenticated.
- `/api/scan` applies IP and domain rate limiting.
- If limited, submit returns HTTP `429` (`rate_limited_ip` or `rate_limited_domain`).
- Paid tiers require payment-gateway headers and are out of scope for this bridge.

## Mapping note

The legacy cross-project draft referenced:
`POST /scan` with `{ url, depth: "free"|"deep", repoFullName? }`.

Current live/verified AISO contract is `POST /api/scan` with:
- `billingTier` (free/paid tiers) instead of `depth`
- optional `profile` (`full` or `agent-readiness`)
- no `repoFullName` parameter in AISO API.
