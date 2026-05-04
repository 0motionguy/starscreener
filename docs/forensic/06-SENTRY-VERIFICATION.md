# Sentry Verification - Sprint 1 Phase 1.5

Verification timestamp: `2026-05-04T15:45:00+08:00`

## Status

Sentry delivery is verified for the Next.js production runtime via the canary
endpoint.

| Surface | Result | Evidence |
|---|---|---|
| Vercel production | CONFIGURED | `SENTRY_DSN` was copied from the Railway worker Sentry config into Vercel production and a clean production deploy completed. |
| Railway production worker | CONFIGURED | `railway variables --json --environment production --service trendingrepo-worker` confirmed `SENTRY_DSN` is present. |
| Local shell | PARTIAL | `CRON_SECRET` was available for firing the canary via pulled Vercel production env. `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and `SENTRY_PROJECT` were not present, so dashboard API readback was not run from this shell. |
| Local Next startup | VERIFIED | `next dev -p 3023` logged `[STARTUP] SENTRY_DSN not configured - runtime errors will not be reported`. Next compiled the active root `instrumentation.ts`; `src/instrumentation.ts` carries the same startup check for the sprint contract. |
| Canary event | FIRED | Authenticated production request returned deliberate HTTP 500 and Vercel runtime logs recorded `[sentry-canary] fired 0e5dd1c4da3e496e9ff114b8c5902b47` at `2026-05-04T07:41:38.577Z`. |

Optional operator action: add `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, and
`SENTRY_PROJECT` only if source-map upload and API verification should run from
CI/operator shells. Do not paste values in chat.

## Canary Endpoint

Endpoint: `GET /api/_internal/sentry-canary`

Physical route file: `src/app/api/%5Finternal/sentry-canary/route.ts`. Next.js
App Router treats folder names beginning with `_` as private folders, so the
literal URL segment is stored as `%5Finternal`.

Auth: `Authorization: Bearer <CRON_SECRET>`

Gate: returns `404` unless `SENTRY_CANARY_ENABLED=1`.

Enabled behavior:

1. Creates a deliberate local `SentryCanaryError` typed as an `EngineError`.
2. Captures it to Sentry with tags:
   - `canary=true`
   - `route=api/_internal/sentry-canary`
   - `source=sentry-canary`
   - `category=fatal`
3. Flushes Sentry for up to 2 seconds.
4. Throws the same typed error so Next's request-error instrumentation sees a real unhandled route failure.

Production proof command:

```powershell
curl.exe -i -H "Authorization: Bearer $env:CRON_SECRET" https://trendingrepo.com/api/_internal/sentry-canary
```

`SENTRY_CANARY_ENABLED` was temporarily set to `1`, deployed, fired, then
removed again after proof capture.

| Field | Value |
|---|---|
| Sentry event ID | `0e5dd1c4da3e496e9ff114b8c5902b47` |
| Sentry event URL | `https://agnt-pf.sentry.io/issues/?project=4511285393686608&query=0e5dd1c4da3e496e9ff114b8c5902b47` |
| Vercel proof | Runtime log row: `[sentry-canary] fired 0e5dd1c4da3e496e9ff114b8c5902b47`, request path `/api/_internal/sentry-canary`, domain `trendingrepo.com`, timestamp `2026-05-04T07:41:38.577Z`. |

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
