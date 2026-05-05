# AGN-490 Cross-Cutting Deliverables (2026-05-05)

Scope: observability + security headers + cron overlap truth-check for AGN-490.

## 1) Cron truth-check: `:00` vs `:27`

Method: parsed all current `.github/workflows/*.yml`/`*.yaml` `cron:` expressions from this workspace revision.

Result:
- `:00` minute schedules: **12**
- explicit `:27` schedules: **2** (`sync-trustmrr`) + one mixed minute list (`7,27,47` in `scrape-trending`)

Conclusion:
- The global collision minute is still **`:00`**, not `:27`.
- `:27` exists, but it is no longer the dominant overlap bucket.

Evidence samples:
- [.github/workflows/collect-funding.yml](../../.github/workflows/collect-funding.yml:4) -> `0 */6 * * *`
- [.github/workflows/collect-twitter.yml](../../.github/workflows/collect-twitter.yml:5) -> `0 */3 * * *`
- [.github/workflows/cron-digest-weekly.yml](../../.github/workflows/cron-digest-weekly.yml:21) -> `0 14 * * 5`
- [.github/workflows/sync-trustmrr.yml](../../.github/workflows/sync-trustmrr.yml:8) -> `27 2 * * *`
- [.github/workflows/scrape-trending.yml](../../.github/workflows/scrape-trending.yml:5) -> `7,27,47 * * * *`

## 2) CSP starter status (ready-to-ship)

Added reusable CSP builder:
- [src/lib/security/csp-starter.ts](../../src/lib/security/csp-starter.ts)

Wired into Next headers:
- [next.config.ts](../../next.config.ts)

Current policy characteristics:
- `default-src 'self'`
- `object-src 'none'`, `frame-ancestors 'none'`
- explicit `connect-src` for PostHog + optional Sentry origin
- optional `report-uri` derived from Sentry DSN
- production HSTS remains enabled in `next.config.ts`

## 3) `/admin/observability` mock/wireframe

Added protected admin route:
- [src/app/admin/observability/page.tsx](../../src/app/admin/observability/page.tsx)
- [src/app/admin/observability/loading.tsx](../../src/app/admin/observability/loading.tsx)
- [src/app/admin/observability/error.tsx](../../src/app/admin/observability/error.tsx)

Dashboard link added:
- [src/components/admin/AdminDashboard.tsx](../../src/components/admin/AdminDashboard.tsx)

## 4) Alert rules requested by issue

Implemented as explicit rule cards in `/admin/observability`:

1. `OBS-GH-POOL-001` GitHub token pool exhausted  
Trigger: usable token count `== 0` for 2 checks over 2 minutes.

2. `OBS-REDIS-001` Redis memory pressure  
Trigger: `used_memory / maxmemory >= 0.70` sustained for 10 minutes.

3. `OBS-SENTRY-001` Sentry error-rate spike  
Trigger: `>= 15` fatal/5xx events per 5 minutes and at least `3x` 7-day baseline.

## 5) Noted follow-up risk

PostHog region mismatch remains visible:
- Browser default host in [PostHogProvider.tsx](../../src/components/providers/PostHogProvider.tsx:48) is `https://us.i.posthog.com`.
- Server helper in [posthog.ts](../../src/lib/analytics/posthog.ts:34) is pinned to `https://eu.i.posthog.com`.

This is a cross-surface observability/data-residency consistency decision, not a blocker for AGN-490 deliverables.
