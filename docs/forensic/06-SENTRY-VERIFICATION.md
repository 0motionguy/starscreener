# Sentry Verification - Sprint 1 Phase 1.5

Verification timestamp: `2026-05-04T14:24:03.0378696+08:00`

## Status

Sentry delivery is not fully verified yet.

| Surface | Result | Evidence |
|---|---|---|
| Vercel production | MISSING | `vercel env ls production` for project `starscreener` returned no `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, or `SENTRY_PROJECT` rows. |
| Railway production worker | CONFIGURED | `railway variables --json --environment production --service trendingrepo-worker` confirmed `SENTRY_DSN` is present. |
| Local shell | MISSING | `SENTRY_AUTH_TOKEN`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_ORG`, and `SENTRY_PROJECT` are not present in the local process environment. |
| Local Next startup | VERIFIED | `next dev -p 3024` logged `[STARTUP] SENTRY_DSN not configured - runtime errors will not be reported`. Next compiled the active root `instrumentation.ts`; `src/instrumentation.ts` carries the same startup check for the sprint contract. |
| Canary event | BLOCKED | The Next.js production runtime has no Vercel Sentry DSN, so `/api/_internal/sentry-canary` cannot produce a real production Sentry event yet. |

Required operator action: add `SENTRY_DSN` to Vercel production for `starscreener`. Add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` only if source-map upload and API verification should run from CI/operator shells. Do not paste values in chat.

## Canary Endpoint

Endpoint: `GET /api/_internal/sentry-canary`

Auth: `Authorization: Bearer <CRON_SECRET>`

Gate: returns `404` unless `SENTRY_CANARY_ENABLED=1`.

Enabled behavior:

1. Throws and catches a typed `SentryCanaryError`.
2. Captures it to Sentry with tags:
   - `canary=true`
   - `route=api/_internal/sentry-canary`
   - `source=sentry-canary`
   - `category=fatal`
3. Flushes Sentry for up to 2 seconds.
4. Returns HTTP `500` JSON with `code=SENTRY_CANARY_FIRED` and `eventId` when the SDK returns one.

Production proof is pending. After Vercel `SENTRY_DSN` is configured, fire:

```powershell
curl.exe -i -H "Authorization: Bearer $env:CRON_SECRET" https://trendingrepo.com/api/_internal/sentry-canary
```

Expected proof fields to add here:

| Field | Value |
|---|---|
| Sentry event ID | BLOCKED - Vercel `SENTRY_DSN` missing |
| Sentry event URL | BLOCKED - Vercel `SENTRY_DSN` missing |

## EngineError Hierarchy

`src/lib/errors.ts` now has 38 classes:

| Group | Classes |
|---|---|
| Base | `EngineError` |
| GitHub | `GithubRateLimitError`, `GithubInvalidTokenError`, `GithubPoolExhaustedError`, `GithubRecoverableError` |
| Reddit | `RedditRateLimitError`, `RedditBlockedError`, `RedditPoolExhaustedError`, `RedditRecoverableError` |
| Twitter/Apify/Nitter | `ApifyQuotaError`, `ApifyTokenInvalidError`, `NitterInstanceDownError`, `NitterAllInstancesDownError`, `TwitterAllSourcesFailedError` |
| Hacker News | `HackerNewsRecoverableError`, `HackerNewsQuarantineError`, `HackerNewsFatalError` |
| Bluesky | `BlueskyRecoverableError`, `BlueskyQuarantineError`, `BlueskyFatalError` |
| Dev.to | `DevtoRecoverableError`, `DevtoQuarantineError`, `DevtoFatalError` |
| Lobsters | `LobstersRecoverableError`, `LobstersQuarantineError`, `LobstersFatalError` |
| Product Hunt | `ProductHuntRecoverableError`, `ProductHuntQuarantineError`, `ProductHuntFatalError` |
| Hugging Face | `HuggingFaceRecoverableError`, `HuggingFaceQuarantineError`, `HuggingFaceFatalError` |
| npm | `NpmRecoverableError`, `NpmQuarantineError`, `NpmFatalError` |
| arXiv | `ArxivRecoverableError`, `ArxivQuarantineError`, `ArxivFatalError` |

All subclasses expose:

- `category`: `recoverable`, `quarantine`, or `fatal`
- `source`: typed `EngineErrorSource`
- `metadata`: structured context safe for Sentry `extra`/context fields

## Sentry Tags

| Source | Current tags |
|---|---|
| GitHub pool/runtime | `pool=github`, `alert=github-pool-exhausted`, `alert=github-pool-network`, `alert=github-pool-key-invalid`, `alert=github-pool-rate-limit`, `alert=github-pool-5xx`, plus low-quota tags `token` and `remaining` with token redaction. |
| Reddit UA pool | `pool=reddit`, `alert=reddit-ua-pool-exhausted`, `alert=reddit-ua-rate-limit`, `alert=reddit-ua-blocked`, `alert=reddit-ua-5xx`, `alert=reddit-ua-network`. |
| Twitter fallback | `pool=twitter`, `alert=twitter-degraded`, `source=apify`, `alert=twitter-all-sources-failed`. |
| Nitter health | `source=nitter-health-check`, `alert=twitter-nitter-health`. |
| Canary | `canary=true`, `route=api/_internal/sentry-canary`, `source=sentry-canary`, `category=fatal`. |
| Sprint 2 placeholders | No Sentry events emitted yet. Add `source=<EngineError.source>` and `category=<EngineError.category>` when wiring each source. |

## Adding a New EngineError Subclass

1. Add the source slug to `EngineErrorSource`.
2. Add one or more concrete subclasses extending `EngineError`.
3. Use exact literal `category` and `source` fields with `as const`.
4. Throw the subclass at the failure boundary with structured metadata.
5. Capture with Sentry tags `source`, `category`, and a source-specific `alert`.
6. Add retry/quarantine behavior before fatal escalation.
7. Update this document with the emitted tags and verification proof.
