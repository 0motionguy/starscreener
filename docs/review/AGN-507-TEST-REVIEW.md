---
status: archive
audit-date: 2026-05-05
reason: code review report of past state; references may not resolve to current files
---

## Test review - Carmela

**Lenses applied:** Behavior-over-implementation, Regression-on-fix, Failure-mode coverage, Determinism

### Findings

**[High] Regression-on-fix missing - `src/components/providers/PostHogProvider.tsx:14` + `.env.example:101` / `src/components/providers/PostHogProvider.test.tsx:1 (missing file)`**
AGN-507 is scoped to PostHog client/server host inconsistency. The client still defaults to `https://us.i.posthog.com` while server analytics uses EU host. There is no regression test proving host alignment behavior and no evidence of a fail-before/pass-after test for the stated inconsistency.
**Add:** a client test that renders provider init with `NEXT_PUBLIC_POSTHOG_HOST` unset and asserts host equals the intended canonical value for this project, plus a test with env override set to assert explicit host precedence.

**[High] Failure-mode coverage gap - `src/lib/analytics/posthog.ts:34` / `src/lib/__tests__/posthog.test.ts:1 (missing file)`**
Server host is hardcoded to EU while client default path is configurable and currently US by default. There is no contract test asserting that client and server hosts remain region-consistent under default envs.
**Add:** a test that imports server helper host config and client provider host config through a shared helper (or explicit constants) and asserts equality under default env; add a mismatch case that fails when one side drifts.

### Tests that look weak but are actually fine

- None in AGN-507 scope; there are no PostHog tests to validate exceptions.

---

**Verdict: REQUEST_CHANGES** - two High findings block merge for AGN-507 because the regression is not encoded in tests and region-host drift remains unguarded.

## CTO sweep verification (2026-05-05)

- Acceptance criteria met (binary): NO
- Visual or functional proof: functional mismatch still present
  - Client default host remains US: `src/components/providers/PostHogProvider.tsx:62`
  - Env defaults remain US: `.env.example:103` and `.env.example:105`
  - Server host remains EU: `src/lib/analytics/posthog.ts:34`
- `npm run typecheck` clean: NO
  - Current workspace typecheck fails with unrelated pre-existing errors in generated `.next/types` contracts, including:
    - `.next/types/app/api/compare/share/route.ts:12`
    - `.next/types/app/api/webhooks/stripe/route.ts:12`
    - `.next/types/app/arxiv/trending/page.ts:34`
    - `.next/types/app/trending/page.ts:2`

### Sibling spot-check

- Spot-checked sibling config path `apps/trendingrepo-worker/.env.example` for PostHog host defaults: no compensating AGN-507 fix evidence found in this heartbeat.

### Test-gate status

- Verdict remains `REQUEST_CHANGES` until:
  1. host consistency fix is implemented for the scoped surface, and
  2. regression + contract tests are added to prevent client/server host drift.
