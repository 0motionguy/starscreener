# ADR — Clerk env vars required at build time

**Date:** 2026-05-07
**Status:** Forward-looking (Clerk installed, root wiring pending)
**Branch context:** `feat/funding-investor-enrich`

## Context

`@clerk/nextjs` is in `package.json` deps. The webhook endpoint
(`src/app/api/webhooks/clerk/route.ts`) and the referral-cookie handoff
component (`src/components/auth/ClerkRefHandoff.tsx`) are already wired,
but `<ClerkProvider>` does not yet wrap the root layout
(`src/app/layout.tsx`). Today's build does not require Clerk env vars.

## Decision

When `<ClerkProvider>` is added to the root layout, the following env
vars become **build-time required**:

- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` — read by Clerk's React provider
  on both server and client. Format `pk_test_<base64>` (dev) or
  `pk_live_<base64>` (prod). Without it `next build` fails at the static
  prerender of any page that crosses a Clerk hook (e.g. `/about`, the
  marketing home, any `currentUser()` server component).
- `CLERK_SECRET_KEY` — server-only. Format `sk_test_...` / `sk_live_...`.
  Required by `auth()` / `currentUser()` and by the webhook route.
- `CLERK_WEBHOOK_SECRET` (`whsec_...`) — Svix signing secret. Already
  read by the webhook route; without it `/api/webhooks/clerk` 401s every
  delivery.

Vercel production has these set at the project level. Local development
must mirror them in `.env.local`. Preview branches inherit the
production env unless overridden.

## Consequences

- Adding `<ClerkProvider>` becomes a coordinated change: env must be set
  in every Vercel environment (production, preview, dev) **before** the
  PR merges, or every preview build will fail.
- `.env.example` documents the keys with the exact comment block above
  the stubs, so a fresh clone surfaces the requirement immediately.
- The bootstrap validator in `src/lib/bootstrap.ts` should be extended
  to fail fast on missing Clerk keys when `<ClerkProvider>` is wired —
  same pattern as `GITHUB_TOKEN` / `CRON_SECRET` today.

## References

- `package.json` (`@clerk/nextjs ^6.21.0`)
- `src/app/api/webhooks/clerk/route.ts`
- `src/components/auth/ClerkRefHandoff.tsx`
- Clerk docs: https://clerk.com/docs/quickstarts/nextjs
