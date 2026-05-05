# AGN-1263 - [SEO-007] Monthly AISO self-scan regression watcher

Date: 2026-05-05

## Wake handling

- Latest wake payload had no pending human comment (`pending comments: 0/0`), so this heartbeat proceeded directly with implementation work on the regression watcher guardrail.

## Implemented in this heartbeat

1. Added a workflow regression test for monthly cadence:
   - New test file: `scripts/__tests__/aiso-self-scan-workflow.test.mjs`.
   - Assertions:
     - `.github/workflows/aiso-self-scan.yml` must keep cron `17 3 1 * *`.
     - Workflow name must remain `AISO monthly self-scan dogfood`.

2. Wired the guard into the fast shared test suite:
   - Updated `package.json` script `test:scraper-shared` to include
     `scripts/__tests__/aiso-self-scan-workflow.test.mjs`.

## Verification

- Ran targeted test:
  - `node --test scripts/__tests__/aiso-self-scan-workflow.test.mjs`

## Next action

- Let CI execute `npm run test:scraper-shared` on the next PR/merge cycle to ensure the cadence guard stays enforced in normal pipeline runs.
