# Local Degraded Mode — Contract

**Date:** 2026-05-21
**Status:** Active
**Branch:** `fix/csp-clerk-cname-fonts` (and all subsequent)

## Summary

The local dev experience is **intentionally degraded** when env vars are
missing. The dev server should boot, public routes should render, and
protected routes should redirect instead of throwing 500s. This document is
the authoritative contract: it lists exactly which env vars gate which
behaviours, and what the graceful fallback looks like for each.

A new contributor with no `.env.local` should be able to run `npm run dev`,
hit `http://localhost:3023/`, and see the home page. The product simply
removes features that need credentials the contributor hasn't been issued
yet — no opaque crashes, no inscrutable 500s.

This is the inverse companion document to `docs/HANDOVER-2026-05-21-V6-DEPLOY.md`,
which describes the fully-keyed production deployment.

## The Contract, By Missing Key

### Missing `CLERK_SECRET_KEY` and/or `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`

Clerk is fully off. The middleware detects the missing publishable key and
routes traffic through `middlewareWithoutClerk` instead of
`middlewareWithClerk`.

| Surface | Without Clerk |
| --- | --- |
| `/account`, `/build`, `/you/alerts`, `/you/refer`, `/api/me/*` | 307 redirect to `/sign-in?redirect_url=…` (was a 500 before — fixed in `c931a41db`) |
| `/sign-in`, `/sign-up` | Renders "Sign-in unavailable" fallback instead of mounting `<SignIn />` / `<SignUp />` |
| Header user menu | Falls back to anonymous chrome (no avatar, no dropdown) |
| `/api/webhooks/clerk` | Route handler still registers, but rejects incoming calls (no signing secret = no HMAC match) |

The middleware's protected-route matcher is the same in both Clerk and
no-Clerk paths — what differs is whether the redirect is issued by Clerk's
`clerkMiddleware()` or by the fallback's bare `NextResponse.redirect()`.

References:

- `src/middleware.ts:45-55` — `isProtectedRoute` matcher (shared)
- `src/middleware.ts:165-183` — `middlewareWithoutClerk` fallback path
- `src/app/sign-in/[[...sign-in]]/page.tsx:32-55` — "Sign-in unavailable"
  fallback JSX (rendered when `getClerkPublishableKey()` returns falsy)
- `src/lib/auth/clerk-config.ts` — `getClerkPublishableKey()` implementation

### Missing `DATABASE_URL` and/or `DIRECT_URL`

All Drizzle-backed readers degrade to empty results. They never throw — every
reader wraps the DB call in a try/catch and returns the documented empty
shape. The /account UI is built to accept these empties without rendering
broken layouts.

| Surface | Without DB |
| --- | --- |
| `src/lib/referrals/queries.ts` `getReferralStats()` | Returns `EMPTY_REFERRAL_STATS` (`{ invites: 0, paidConversions: 0, creditBalance: 0 }`) |
| `src/lib/alerts/queries.ts` `listAlertsForUser()` | Returns `[]` |
| `src/lib/star-activity.ts` `countStarPlotRequests()` | Returns `0` |
| `AccountReferralsCard` | Renders the card with display-floored counters (uses `Math.max(invites, 12)` as the displayed metric) |
| `AccountAlertInbox` | Renders 6 seeded sample events when the query returns `[]` (`SEEDED_EVENTS` fallback) |
| `drizzle-kit migrate` / `generate` | Errors immediately — should only ever target a real environment, never local-without-db |

Each reader checks for `process.env.DATABASE_URL` at call time, returns the
empty shape if absent, and additionally wraps the DB call in try/catch so a
real DB error (timeout, RLS denial, schema drift) also degrades gracefully.

References:

- `src/lib/db/client.ts:37-44` — `buildPooled()` throws `FatalConfigError` if
  `DATABASE_URL` is unset (intentional — this is the lower-level construct,
  the readers above never let the call get this far)
- `src/lib/db/client.ts:47` — `ssl: "require"` (mandatory for Supabase pooler)
- `src/lib/db/client.ts:71` — same `ssl: "require"` on the direct client
- `src/lib/referrals/queries.ts:33` — `isDatabaseAvailable()` checks
  `Boolean(process.env.DATABASE_URL)`
- `src/lib/referrals/queries.ts:27-31` — `EMPTY_REFERRAL_STATS` export
- `src/lib/alerts/queries.ts:38-40` — same `isDatabaseAvailable()` pattern
- `src/lib/star-activity.ts:321-330` — `countStarPlotRequests` honest stub
  with degraded `console.warn` on the error path
- `src/components/account/AccountAlertInbox.tsx:18-79` — `SEEDED_EVENTS`
  array (6 entries) and `events.length === 0 ? SEEDED_EVENTS : events`
  fallback selector

### Missing `CLERK_WEBHOOK_SIGNING_SECRET`

The webhook handler at `src/app/api/webhooks/clerk/route.ts` still registers
its POST handler. Without the secret, svix's `Webhook(secret).verify()`
throws on every call. This is the correct behaviour — an unauthenticated
webhook should fail closed.

For local testing of webhook behaviour you have two options:

1. Configure a Clerk Dashboard webhook pointing at an ngrok tunnel to
   `http://localhost:3023/api/webhooks/clerk`, set the signing secret
   locally, and exercise real Clerk events.
2. Skip webhook testing locally entirely. The `profiles` table population
   only runs through this endpoint, so without it your local DB will not
   gain new rows from sign-up flows.

References:

- `src/app/api/webhooks/clerk/route.ts` — svix verification + idempotent
  upsert
- `src/app/api/webhooks/clerk/route.ts:38` — `export const runtime = "nodejs"`
  (svix uses Node crypto, not the Edge subset)
- `src/app/api/webhooks/clerk/route.ts:40` — `export const dynamic =
  "force-dynamic"` (webhooks are pure I/O, never cached)

## What Still Works Without Any Of The Above

The public product is fully functional with zero auth and zero DB. As long
as `GITHUB_TOKEN` and one Redis backend (`REDIS_URL` or `UPSTASH_*`) are
set, the data plane is hot.

| Surface | Notes |
| --- | --- |
| `/` (home) | ISR-cached at 30 min, bundled JSON seeds cold start |
| `/breakout`, `/market-signals`, `/funding`, `/agent-commerce` | All public reader surfaces |
| `/tools/*` (8 sub-routes: top-10, tier-list, star-history, digest, treemap, compare, watchlist, revenue-estimate) | All public |
| `/repo/*` | Repo detail pages, no auth gate |
| `/ideas` | JSONL-backed, no SQL dependency for the read path |
| `/api/health`, `/api/og/*`, `/api/trending`, `/api/repo/*` | Read-only public API endpoints |
| News scraping (collectors) | Uses `GITHUB_TOKEN` + Redis only |
| Lighthouse probes against `http://localhost:3023` | Public surfaces measurable |

## Verifying Degraded Mode Locally

Quick sanity check after pulling without setting up auth/db keys:

```bash
# 1. Boot dev server
npm run dev

# 2. Public surfaces — expect 200
curl -sI http://localhost:3023/ | head -1
curl -sI http://localhost:3023/breakout | head -1
curl -sI http://localhost:3023/tools/top-10 | head -1

# 3. Protected surface — expect 307 to /sign-in
curl -sI http://localhost:3023/account | head -1

# 4. Sign-in page — expect 200 with "Sign-in unavailable" in body
curl -s http://localhost:3023/sign-in | grep -i "sign-in unavailable"
```

If any of these don't behave as expected, the fallback path is broken — open
an issue. The intentionally-degraded contract is part of the testing surface
(see `src/lib/auth/__tests__/auth-provider-policy.test.ts`).

## Why This Matters

Before the `c931a41db` middleware patch, `/account` and `/build` would crash
with a 500 when `CLERK_SECRET_KEY` was unset, because the server-component
`auth()` call from `@clerk/nextjs/server` throws outside a Clerk middleware
context. That broke local dev for anyone without Clerk keys provisioned.

The middleware now routes those routes through a Clerk-less fallback that
issues a clean 307 to `/sign-in`. The sign-in page in turn detects the
missing publishable key and renders an explicit "Sign-in unavailable"
surface instead of trying to mount Clerk's component.

Same idea on the DB side: every reader returns an explicit empty shape
instead of letting `getDb()` throw `FatalConfigError`. The UI components
render their own seeded fallbacks or zeroed metrics when handed those empties.

The combined effect: a fresh `git clone` + `npm install` + `npm run dev`
without any `.env.local` yields a browsable local site, just without the
account-bound features. That is the contract.

## References

- `src/middleware.ts:45-55` — `/account` and `/build` protected route matcher
- `src/middleware.ts:165-183` — `middlewareWithoutClerk` Clerk-less fallback
- `src/app/account/page.tsx` — Clerk-gated route, redirects anon to `/sign-in`
- `src/app/sign-in/[[...sign-in]]/page.tsx:32-55` — degraded-surface JSX
- `src/lib/db/client.ts:47` — Supabase `ssl: "require"` on the pooler
- `src/lib/referrals/queries.ts:33,47-51` — empty-stats degradation
- `src/lib/alerts/queries.ts:38-40,58-60` — empty-array degradation
- `src/lib/star-activity.ts:321-330` — `countStarPlotRequests` stub
- `src/components/account/AccountAlertInbox.tsx:18-79` — SEEDED_EVENTS fallback
- `src/components/account/AccountReferralsCard.tsx:21` — `Math.max(invites, 12)` display floor
- `src/app/api/webhooks/clerk/route.ts` — svix HMAC verification
