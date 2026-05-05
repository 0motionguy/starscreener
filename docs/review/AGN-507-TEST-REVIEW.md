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
