---
status: archive
audit-date: 2026-05-05
reason: dated release-validation heartbeat artifact
---

# AGN-378 verification - GitHub token-pool rotation balance (+/-15%)

Timestamp (UTC): 2026-05-04T12:36:24.924Z

## Mandatory preflight status

- Mandatory opening docs re-read (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- `npm run freshness:check` at `2026-05-04T12:35:07.797Z` reached `localhost:3023` (not missing), but product is stale/degraded:
  - `blocking_non_green=1` (`producthunt` YELLOW)
  - `advisory_non_green=1` (`model-usage` DEAD)
  - `Sentry: MISSING`

## Evidence method

Two live checks were run against local runtime + Redis:

1. Authenticated `/api/admin/pool-state` to get normalized 24h per-token GitHub usage rows.
2. Direct Redis dump over `pool:github:usage:*` keys for the last 24 hourly buckets to confirm raw-store activity exists and totals align.

## Raw Redis dump summary (last 24h)

- `keyPattern`: `pool:github:usage:*`
- `hourBuckets`: `2026-05-04-12` back to `2026-05-03-13`
- `scannedKeyCount`: `109`
- `selectedKeyCount` (last-24h buckets): `103`
- `totalRequests24h`: `2485`

## +/-15% balance proof (normalized 11-token pool)

Definition used for AGN-378:

- `mean = totalRequests24h / totalConfigured`
- pass only if every token satisfies `abs((requests24h - mean)/mean) <= 15%`

Computed values:

- `totalConfigured=11`
- `totalRequests24h=2485`
- `meanRequests24h=225.91`
- `stddevRequests24h=269.91`
- `stddev/mean=1.1948`
- `passWithinPlusMinus15Pct=false`

Per-token deviations:

| token | requests24h | deviation vs mean | within +/-15% |
|---|---:|---:|---:|
| ghp_****nWII | 1012 | +347.97% | no |
| ghp_****fC8P | 310 | +37.22% | no |
| ghp_****R7kM | 279 | +23.50% | no |
| ghp_****FUUl | 247 | +9.34% | yes |
| ghp_****KPtO | 50 | -77.87% | no |
| ghp_****H3Dx | 46 | -79.64% | no |
| ghp_****UHB0 | 10 | -95.57% | no |
| ghp_****JYx1 | 170 | -24.75% | no |
| ghp_****M5db | 10 | -95.57% | no |
| ghp_****tPqf | 111 | -50.87% | no |
| ghp_****39R2 | 240 | +6.24% | yes |

## Verdict

AGN-378 verification result: **FAIL**.

- `stddev/mean=1.1948` exceeds the dashboard anomaly threshold (`0.7`).
- +/-15% balance gate fails.
- Usage is heavily concentrated on `ghp_****nWII`.
