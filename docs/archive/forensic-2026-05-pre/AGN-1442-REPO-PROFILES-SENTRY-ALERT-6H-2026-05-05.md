# AGN-1442 Repo-profiles freshness Sentry alert over 6h (2026-05-05)

## Scope
- Owned surfaces only:
  - `.github/workflows/health-watch.yml`
  - `scripts/check-source-health.mjs`
  - `scripts/_freshness-budgets.mjs`

## Change summary
- Added `repo-profiles` freshness budget to shared map: `6h`.
- Added `repo-profiles` to required freshness source list.
- Added optional Sentry emission in `check-source-health`:
  - Initializes only when `SENTRY_DSN` is present.
  - Emits error message when any source fails.
  - Uses alert tag `repo-profiles-freshness-over-6h` when `repo-profiles` is among failures.
- Passed `SENTRY_DSN` secret through `health-watch` workflow environment.

## Verification evidence
1. Mandatory opener + freshness gate
- `npm run freshness:check`
- Result: `freshness-check: request timed out while contacting http://localhost:3023`.
- Classification: localhost:3023 missing/unreachable in this heartbeat.

2. Health-watch script verification
- `node scripts/check-source-health.mjs`
- Output includes row:
  - `repo-profiles | OK | 2.4h | 6h |`
- Confirms `repo-profiles` is now evaluated against a 6h threshold.

## Rollback
- Revert commit touching:
  - `scripts/_freshness-budgets.mjs`
  - `scripts/check-source-health.mjs`
  - `.github/workflows/health-watch.yml`
- Or set/remove `SENTRY_DSN` in Actions secrets to disable Sentry emission without reverting threshold logic.

## Risk notes
- If `SENTRY_DSN` secret is absent in GitHub Actions, Sentry alert emission is a no-op (workflow still fails on unhealthy sources as before).
- Tightening `repo-profiles` from implicit 24h fallback to 6h may increase alert frequency until upstream freshness stabilizes.
