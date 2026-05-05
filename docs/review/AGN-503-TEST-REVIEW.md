## Test review — Carmela (AGN-503)

**Lenses applied:** Behavior-over-implementation, Regression-on-fix, Failure-mode coverage, Coverage-by-criticality

### Findings

**[High] Regression-on-fix missing + Coverage-by-criticality — `.github/workflows/cron-aiso-drain.yml:15` / `scripts/__tests__/source-watchers.test.mjs:11`**
The issue is explicitly a cron-cadence correction (":00 minute is the real burst"). The behavior changed from `:00,:30` to `:03,:33`, but there is no regression test that parses workflow schedules and proves burst-avoidance policy. Existing script tests validate source watcher registries only and do not assert any workflow schedule contract.

**Add:**
- `scripts/__tests__/workflow-cron-schedule.test.mjs` that reads `.github/workflows/cron-aiso-drain.yml` and asserts minute fields are staggered off `:00` for burst-sensitive jobs.
- A fail-before proof in PR notes: show the new test failing on parent commit where the cron was `0,30 * * * *`.

**[High] Failure-mode coverage — `.github/workflows/audit-freshness.yml:24` / `scripts/__tests__/source-watchers.test.mjs:37`**
`audit-freshness` moved from `0 * * * *` to `8 * * * *` to avoid top-of-hour contention, but no test verifies this operational invariant for future edits. The current tests in this area check DEV/Bluesky query/tag sets only; they do not cover scheduler behavior. This allows silent reintroduction of :00 collisions in critical freshness gating.

**Add:**
- Extend `scripts/__tests__/workflow-cron-schedule.test.mjs` with assertions for `audit-freshness.yml`, `scrape-devto.yml`, and `scrape-producthunt.yml` minute fields.
- Add one failure-mode assertion that rejects `0` minute for workflows tagged as burst-sensitive (explicit allowlist/denylist in test fixture).

### Tests that look weak but are actually fine

- `scripts/__tests__/source-watchers.test.mjs:11` is intentionally data-taxonomy focused (query families/tags), so lack of cron assertions there is acceptable by scope; the gap is absence of a dedicated workflow-schedule contract test.

---

**Verdict: REQUEST_CHANGES** — cron behavior changed in production workflows without a regression test that encodes the schedule contract and fails-before on the parent commit.
