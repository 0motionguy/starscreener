# AGN-1287 Admin/Auth Route Hardening Delta vs Docs (2026-05-05)

Issue: AGN-1287  
Owner lane: [SEC] Platform Security  
Scope: `src/app/api/admin/**`, `src/lib/api/auth.ts`, `src/lib/errors.ts`, `.env.example`, Sentry/error tagging paths.

## Verification inputs

Mandatory opening bundle re-run in this heartbeat:
- `CLAUDE.md`
- `docs/ENGINE.md`
- `docs/SITE-WIREMAP.md`
- `docs/AUDIT-2026-05-04.md`
- `docs/forensic/00-INDEX.md`
- `tasks/CURRENT-SPRINT.md`
- `tasks/BACKLOG.md`

Freshness command:
- `npm run freshness:check` -> localhost present (`http://localhost:3023`) but stale/degraded (`GET /api/health?soft=1` returned HTTP 500).

## 1) Route-by-route admin/auth control matrix

| Route | Methods | Primary auth gate | Deny contract | Secondary controls | Error typing / telemetry |
|---|---|---|---|---|---|
| `/api/admin/drop-events` | GET | `verifyAdminAuth` + `adminAuthFailureResponse` | 401/403/503 from shared auth contract | none route-local | `AdminRecoverableError` + `serverError` |
| `/api/admin/ideas-queue` | GET, POST | `verifyAdminAuth` + `adminAuthFailureResponse` | 401/403/503 | body validation via `parseBody` | `AdminRecoverableError` + `serverError` |
| `/api/admin/login` | POST, DELETE | credential/TOTP/session flow (not bearer gate) | explicit 401/429/503 per branch | lockout + rate limit + signed cookie (`ss_admin`) | `AdminQuarantineError`/`AdminFatalError` + Sentry capture |
| `/api/admin/overview` | GET | `verifyAdminAuth` + `adminAuthFailureResponse` | 401/403/503 | none route-local | typed server error path |
| `/api/admin/pool-state` | GET | `verifyAdminAuth` + `adminAuthFailureResponse` | 401/403/503 | Redis-backed telemetry aggregation | admin-gated pool observability |
| `/api/admin/queues/repo` | GET, POST | `verifyAdminAuth` + `adminAuthFailureResponse` | 401/403/503 | POST internally calls cron drain with `CRON_SECRET`; no unauth bypass | typed server error path |
| `/api/admin/revenue-queue` | GET, POST | `verifyAdminAuth` + `adminAuthFailureResponse` | 401/403/503 | body validation on POST | `AdminRecoverableError` + `serverError` |
| `/api/admin/scan` | GET, POST | `verifyAdminAuth` + `adminAuthFailureResponse` | 401/403/503 | explicit rate limit; principal-based limiter key | quarantine+recoverable typed errors + Sentry |
| `/api/admin/scan-log` | GET | `verifyAdminAuth` + `adminAuthFailureResponse` | 401/403/503 | path-sanitized file reads | `AdminRecoverableError` |
| `/api/admin/sentry-verify` | POST | `verifyAdminAuth` + `adminAuthFailureResponse` | 401/403/503 | DSN presence check | emits tagged canary exception |
| `/api/admin/sources` | GET | `verifyAdminAuth` + `adminAuthFailureResponse` | 401/403/503 | read-only source health aggregation | admin-gated visibility surface |
| `/api/admin/stats` | GET | `verifyAdminAuth` + `adminAuthFailureResponse` | 401/403/503 | no-store; bounded reads | typed error envelope path |
| `/api/admin/unknown-mentions` | GET, POST | `verifyAdminAuth` + `adminAuthFailureResponse` | 401/403/503 | POST mutator is admin-only | `AdminRecoverableError` + `serverError` |

## 2) Drift findings vs documented standards

### D1 (fixed this run) - auth contract doc drift in revenue moderation route
- Drift: `src/app/api/admin/revenue-queue/route.ts` comment said GET required `CRON_SECRET` bearer, while implementation used `verifyAdminAuth` (ADMIN token / admin cookie).
- Action: comment corrected to match implemented control boundary.
- Security impact: operator confusion and incorrect runbook assumptions; low direct exploitability because code path was already correct.

### D2 (open, external blocker) - runtime verification plane degraded
- Observation: freshness endpoint returns 500 locally; prevents clean sprint close-readiness evidence.
- Security impact: medium operational risk. If auth regressions occur concurrently, degraded health channel delays detection.
- Unblock owner: Platform engineer.

### D3 (open, external blocker) - full Sentry provider-path verification still gated by environment/access
- Code-level tags are present (`source`, `category`, `auth_surface`), but end-to-end alert delivery cannot be proven in this heartbeat without live provider confirmation in this runtime.
- Security impact: medium observability assurance gap.
- Unblock owner: CTO / Platform.

## 3) Exploitability notes

- Current admin boundary is strong: admin routes consistently gate through `verifyAdminAuth` and do not fall back to `CRON_SECRET` for browser-admin access.
- `verifyAdminAuth` enforces optional IP denylist (`ADMIN_IP_BLOCKLIST`) and emits quarantine/fatal telemetry on deny/misconfig paths.
- Secret masking path is deterministic first4+last4 via `redactToken` and reused by auth audit logging and telemetry sanitization.
- Highest residual exploitability is operational, not direct auth bypass:
  - stale/degraded health telemetry can hide active failures,
  - incomplete provider-level Sentry verification can delay incident response if tagging/routing drifts at deploy/runtime.

## 4) Prioritized fix tickets with owners

1. P1 - Restore local freshness health endpoint stability (`/api/health?soft=1` 500 -> 200)  
   Owner: Platform engineer  
   Done when: `npm run freshness:check` passes with blocking_non_green=0 in local verification run.

2. P1 - Execute live Sentry canary verification on admin security paths (`recoverable/quarantine/fatal`)  
   Owner: CTO / Platform  
   Done when: `/api/admin/sentry-verify` events are confirmed in provider with expected `source/category/auth_surface` tags.

3. P2 - Add/maintain route-contract lint for admin auth comments vs auth gate usage  
   Owner: Platform Security + Platform engineer  
   Done when: CI flags comment/docs mismatch where admin route docs mention CRON auth while code uses admin auth (or vice versa).

## Evidence snippets

- Admin auth gate usage found across all admin route handlers via grep (`verifyAdminAuth` + `adminAuthFailureResponse`).
- Auth core confirms no admin fallback to cron secret and includes deny telemetry tags (`source`,`category`,`auth_surface`).
- `.env.example` contains required admin/session and Sentry/ops secret shape (`ADMIN_TOKEN`, `ADMIN_IP_BLOCKLIST`, `SESSION_SECRET`, `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`, `OPS_ALERT_WEBHOOK`).

## Heartbeat status summary

- Deliverable created: route matrix + drift + exploitability + prioritized owners.
- Code delta in this heartbeat: comment-level contract alignment for `revenue-queue` admin auth note.
- Remaining blockers are external/runtime verification constraints, not unaddressed in-scope auth bypass defects.