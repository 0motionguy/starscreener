# Pre-existing main-side test failures — 2026-04-28

Beyond the reddit-shared.test.mjs bugs that PR #23 fixed, main has **8 additional test failures** that surface in the `Typecheck, guards, tests, build, e2e` job. Confirmed on PR #23's CI run (957 pass / 8 fail) — a docs-only branch off main + reddit fix, so these are inherent to main itself.

These were silently masked by the reddit failures (which bailed earlier in the suite). They block CI on every open PR until fixed.

## The 8 failures

| Test# | File | Assertion | Likely root |
|---|---|---|---|
| 299 | `canonical-profile-endpoint.test.ts:323` | `legacy 404 must not include 'ok'` (got `{ok: false}`) | Endpoint returning unified envelope on the v=1 legacy path that should omit `ok` per contract |
| 350 | `cross-signal.test.ts:93` | dev.to signal expected ≥0.4, got 0 | Was reverted with PR #15 revert (e1bfc5f, 2026-04-27); test or code is now stale |
| 645 | `predictions-writer.test.ts:7945` | rows expected 0, got 300 | Cron writes 300 rows on empty slate when it should write 0 — slate detection broken |
| 646 | `predictions-writer.test.ts:8708` | status expected 400, got 200 | Cron POST not validating `horizon` query parameter — invalid value accepted with 200 |
| 890 | `webhooks.test.ts:10724` | delivered count expected 1, got 0 | flush() not calling the delivery in success path |
| 891 | `webhooks.test.ts:11494` | error message regex `/500/`, got `HTTP 404 Not Found` | Test mocks 500-response, code receives 404 — fetch URL changed |
| 893 | `webhooks.test.ts:13307` | post count expected 2, got 0 | flush inter-post delay test — no posts emitted at all |
| 894 | `webhooks.test.ts:14739` | scan count expected 1, got 9 | Idempotency test — scan ran 9 times instead of 1 |

## Recency

All 4 test files were last modified 2026-04-24 to 2026-04-27:
- `canonical-profile-endpoint.test.ts` — `22771b5` (2026-04-27)
- `cross-signal.test.ts` — `e1bfc5f` (2026-04-27 — **Revert "Merge pull request #15 from 0motionguy/feat/v2-foundation"**)
- `predictions-writer.test.ts` — `a81ec3a` (2026-04-24, "feat(cron): prediction writer + AISO queue drain workers")
- `webhooks.test.ts` — `97c954e` (2026-04-24, "feat(growth): weekly email digest + Slack/Discord webhook bots")

The cross-signal failure is the most suspicious — it appeared after a revert. Either the test or the code under test got out of sync.

## Why deferred

Each failure looks like a real bug (or a stale test against reverted code), not a trivial assertion update like the reddit case. Fixing requires:
- Reading the implementation to understand intent
- Distinguishing "test wrong" from "code wrong"
- Possibly a multi-file fix per failure

Estimated effort: 30 min per test × 8 = ~4 hours of focused investigation.

## Impact on the open PR queue

All open PRs against `main` will fail CI on this same `Typecheck, guards, tests, build, e2e` job until these 8 are resolved (or selectively skipped). This includes PR #19, #20, #21, #22, #23, #24, and #7 once it rebases.

## Suggested approach

1. **Triage one file at a time.** webhooks.test.ts has 4 failures clustered — likely one root cause. Start there.
2. **`cross-signal.test.ts`** — check if PR #15's revert removed dev.to signal logic but left the test. May need to revert the test too.
3. **`predictions-writer.test.ts`** — investigate `predictions-writer.ts` cron handler; missing zod validation on `horizon` likely.
4. **`canonical-profile-endpoint.test.ts`** — small fix on the v=1 legacy 404 envelope path.

## Workaround for unblocking PRs

If the priority is getting the audit-wave PRs merged before these are resolved:
- Add a `continue-on-error: true` to the test step in `.github/workflows/ci.yml` (temporary, must be reverted).
- Or skip the 8 tests via `node --test --test-skip-pattern` until fixed.
- Or merge PRs without waiting for green CI (the worker PRs and arxiv are independently functional; risk is just future regressions slipping in).

Not recommended without operator approval — these are safety/correctness tests on critical paths (predictions, webhooks, profile endpoints).
