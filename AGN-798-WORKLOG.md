# AGN-798 - [SEO-007] Recurring monthly self-scan routine

Date: 2026-05-04

## Wake handling

- Latest wake payload had no pending human comment (`pending comments: 0/0`), so this heartbeat proceeded directly with implementation work for AGN-798.

## Implemented in this heartbeat

1. Switched the AISO dogfood self-scan workflow from daily to monthly cadence:
   - Updated workflow title and cron in `.github/workflows/aiso-self-scan.yml`.
   - New schedule: `17 3 1 * *` (03:17 UTC on day 1 of each month).

2. Synced operator documentation to reflect monthly self-scan operation:
   - Added monthly entry for `aiso-self-scan` in `docs/OPERATOR.md`.
   - Updated daily table row wording to indicate day-1 monthly firing.

3. Synced site wiremap cron inventory:
   - Updated `docs/SITE-WIREMAP.md` workflow inventory row from `daily` to `monthly day 1 (17 3 1 * *)`.

## Verification

- Verified the workflow and docs now reflect monthly cadence via direct file inspection and targeted grep:
  - `.github/workflows/aiso-self-scan.yml`
  - `docs/OPERATOR.md`
  - `docs/SITE-WIREMAP.md`

## Next action

- Observe the next scheduled month-boundary run in GitHub Actions and confirm one successful `aiso_self_scan_triggered` PostHog event for that monthly window.

## Resume heartbeat (2026-05-05): Paperclip routine + first-run evidence

4. Created the Paperclip routine via runtime API:
   - Endpoint: `POST /api/companies/{companyId}/routines`
   - routine_id: `42519b46-c1fa-47a1-adfe-eded33908733`
   - title: `[SEO-007] Monthly AISO self-scan regression watcher`
   - cron: `0 9 1 * *`
   - timezone: `UTC`
   - parentIssueId: `AGN-798`

5. Captured first run for acceptance proof:
   - Endpoint: `POST /api/routines/{routineId}/run`
   - run_id: `7ca2cd04-5cd8-41b7-ace2-cd5ddf9f056f`
   - source: `manual`
   - status: `issue_created`
   - linked execution issue: `AGN-1263` (`2eb30ffd-76aa-45ad-bbab-d310a2ca5624`)

6. Posted durable progress comment on AGN-798 issue thread:
   - comment_id: `5694e13d-5676-4630-9af0-91e6307d1eb2`

Acceptance mapping:
- Routine created: satisfied
- Monthly cron `0 9 1 * *` UTC: satisfied
- First run captured: satisfied
