---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# AGN-1501 — Backend unauth 500-envelope compliance sweep

**Date:** 2026-05-05
**Scope:** `src/app/api/**` — 112 `route.ts` files, ~50 with auth gates.
**Goal:** Verify that unauthenticated requests to protected routes return a sanitized 401/403 with the project's canonical error envelope, never a leaky 500 / raw `err.message`.
**Mode:** Read-only audit. No code mutations performed (no tiny fixes warranted; see findings).
**Branch context:** `bot/sre/AGN-819` (active worktree, unrelated edits left untouched).

---

## TL;DR — verdict

**PASS for the 500-leakage criterion** (no protected route returns 500 on missing auth).
**PARTIAL FAIL for envelope compliance** (3 distinct envelope shapes coexist; helper-shaped 401/403 use `{ok:false, reason}` instead of canonical `{ok:false, error, code}`).

- All audited unauth surfaces short-circuit on `verify*Auth(request)` BEFORE handler logic — no raw `err.message` echo on the auth gate itself.
- Canonical envelope per `src/lib/api/error-response.ts:30-37` (APP-10): `{ok:false, error: string, code?: string}`.
- Three concrete shapes ship today:
  1. **Canonical** — `{ok:false, error, code}` (middleware, user-auth, watchlist, ideas, alerts, mcp/usage, stripe webhook, export/csv, reactions).
  2. **Legacy `reason`** — `{ok:false, reason}` (`authFailureResponse`, `adminAuthFailureResponse`, admin-login). Status codes correct (401/403/503).
  3. **Bespoke nested** — `{ok:false, error: {code, message, retryable}}` (`internalAgentAuthFailureResponse`, internal/twitter findings). Status codes correct. Documented as "agent-platform contract requires it" (`internal/twitter/v1/findings/route.ts:1-5`).

Risk: low. No PII / token / stack leakage. The drift is cosmetic (clients can't `body.code === "UNAUTHORIZED"` against admin/cron failures), not security-critical.

---

## Audited routes — by category

### Compliant (returns canonical `{ok:false, error, code}` on unauth)

| Route | Auth helper | Status | Envelope |
|---|---|---|---|
| `src/middleware.ts:209-241` | IP block / rate limit | 403 / 429 | `{ok:false, error, code: "IP_BLOCKED"\|"RATE_LIMITED"}` |
| `src/app/api/watchlist/private/route.ts:84-91` | `verifyUserAuth` | 401 | `{ok:false, error:"unauthorized", code:"UNAUTHORIZED"}` |
| `src/app/api/checkout/stripe/route.ts:115-120` | `verifyUserAuth` | 401 | canonical |
| `src/app/api/ideas/route.ts:163-168` | `verifyUserAuth` | 401 | canonical |
| `src/app/api/pipeline/alerts/route.ts:47-53,87-92` | `verifyUserAuth` | 401 | canonical |
| `src/app/api/pipeline/alerts/rules/route.ts:58-63,85-90,136-141` | `verifyUserAuth` | 401 | canonical |
| `src/app/api/export/csv/route.ts:260-265` | `verifyUserAuth` | 401 | canonical |
| `src/app/api/reactions/route.ts:116-121` | `verifyUserAuth` | 401 | canonical |
| `src/app/api/mcp/usage/route.ts:72-77` | `verifyUserAuth` | 401 | canonical |
| `src/app/api/mcp/record-call/route.ts:67` | `verifyUserAuth` | 401 | canonical |
| `src/app/api/openapi.json/route.ts:148-149` | `verifyUserAuth` | 401 | canonical |
| `src/app/api/auth/session/route.ts:145` | session | 503 | canonical |
| `src/app/api/webhooks/stripe/route.ts:84-119` | Stripe HMAC | 400 | `{ok:false, error, code:"BAD_SIGNATURE"}` |
| `src/app/api/repo-submissions/route.ts:188-196` | Turnstile | 403 | `{ok:false, error, code:"TURNSTILE_REJECTED"}` |

**13 distinct routes** + middleware. All emit `{ok:false, error, code}` and never throw to a 500.

### Non-compliant — `{ok:false, reason}` shape (admin / cron helpers)

Source helper: `src/lib/api/auth.ts:467-545`.

| Helper | Used by | Status | Envelope (today) | Canonical equivalent |
|---|---|---|---|---|
| `authFailureResponse` (cron) | 21 routes (see below) | 401 / 503 | `{ok:false, reason:"unauthorized"}` / `{ok:false, reason:"CRON_SECRET not configured"}` | `{ok:false, error:"unauthorized", code:"UNAUTHORIZED"}` / `{...code:"AUTH_NOT_CONFIGURED"}` |
| `adminAuthFailureResponse` | 13 admin routes | 401 / 403 / 503 | `{ok:false, reason:"unauthorized"\|"ip blocked"\|"admin endpoint not configured (ADMIN_TOKEN unset)"}` | canonical with `code: "UNAUTHORIZED"\|"FORBIDDEN"\|"AUTH_NOT_CONFIGURED"` |
| `/api/admin/login` POST | self | 401 / 503 / 429 | `{ok:false, reason:"unauthorized"\|"not_configured"\|"rate_limited"\|"mfa_required", error?}` | canonical (or keep `reason` as a documented public contract for the admin SPA) |

Cron routes using `authFailureResponse` (envelope = `{ok:false, reason}`):

```
src/app/api/cron/aiso-drain/route.ts:309
src/app/api/cron/digest/weekly/route.ts:232
src/app/api/cron/freshness/state/route.ts:756
src/app/api/cron/github-pool-budget/route.ts:18
src/app/api/cron/llm/aggregate/route.ts:57
src/app/api/cron/llm/sync-models/route.ts:127
src/app/api/cron/mcp/rotate-usage/route.ts:39
src/app/api/cron/news-auto-recover/route.ts:67
src/app/api/cron/predictions/calibrate/route.ts:92
src/app/api/cron/predictions/route.ts:111
src/app/api/cron/sources-auto-recover/route.ts:141
src/app/api/cron/subdomain-takeover/route.ts:14
src/app/api/cron/twitter-daily/route.ts:96
src/app/api/cron/twitter-weekly-recap/route.ts:43
src/app/api/cron/webhooks/flush/route.ts:322
src/app/api/cron/webhooks/scan/route.ts:198
src/app/api/internal/twitter/v1/review/[owner]/[name]/route.ts:14
src/app/api/pipeline/backfill-history/route.ts:61
src/app/api/pipeline/cleanup/route.ts:21
src/app/api/pipeline/deltas/route.ts:148
src/app/api/pipeline/ingest/route.ts:104
src/app/api/pipeline/persist/route.ts:36
src/app/api/pipeline/profiles/enrich/route.ts:136,147
src/app/api/pipeline/rebuild/route.ts:90
src/app/api/pipeline/recompute/route.ts:38
src/app/api/_internal/sentry-canary/route.ts:16
```

Admin routes using `adminAuthFailureResponse` (envelope = `{ok:false, reason}`):

```
src/app/api/admin/drop-events/route.ts:54
src/app/api/admin/ideas-queue/route.ts:49,69
src/app/api/admin/overview/route.ts:200
src/app/api/admin/pool-state/route.ts:805
src/app/api/admin/queues/repo/route.ts:53,82
src/app/api/admin/revenue-queue/route.ts:75,98
src/app/api/admin/scan/route.ts:221,358
src/app/api/admin/scan-log/route.ts:194
src/app/api/admin/sentry-verify/route.ts:34
src/app/api/admin/sources/route.ts:99
src/app/api/admin/stats/route.ts:147
src/app/api/admin/unknown-mentions/route.ts:98,120
src/app/api/model-usage/features/route.ts:20
```

### Non-compliant — bespoke nested `{error:{code,message,retryable}}` shape

Source helpers: `src/lib/api/auth.ts:623-668` (`internalAgentAuthFailureResponse`), `src/app/api/internal/twitter/v1/findings/route.ts:16-35` (`apiErrorResponse`).

| Route | Auth helper | Status | Envelope |
|---|---|---|---|
| `src/app/api/internal/signals/twitter/v1/ingest/route.ts:45-46` | `verifyInternalAgentAuth` | 401 / 503 | `{ok:false, error:{code:"UNAUTHORIZED", message, retryable:false}}` |
| `src/app/api/internal/signals/twitter/v1/candidates/route.ts:31-32` | `verifyInternalAgentAuth` | 401 / 503 | same |
| `src/app/api/internal/twitter/v1/findings/route.ts:38-39` | `verifyCronAuth` then handler reuses bespoke | 401 / 503 | `{ok:false, error:{code, message, retryable}}` (deprecated per APP-10 but documented as agent-platform contract) |

Documented exception: the agent-platform contract pins this shape for `internal/*`. Migration would be a breaking change to external agent clients — out of scope for this audit.

### Public detail-toggle routes (no 401 path; degrade gracefully)

These accept unauth but hide privileged fields. **All return 200 with reduced detail, never a 500.** No envelope action needed.

```
src/app/api/health/route.ts:157-160          (canViewDetail)
src/app/api/health/sources/route.ts:96-100   (canViewDetail)
src/app/api/health/cron-activity/route.ts:45-49
src/app/api/worker/health/route.ts:146-151
src/app/api/pipeline/status/route.ts:110-114
src/app/api/pipeline/freshness/route.ts:16-20
src/app/api/model-usage/models/route.ts:42-46
src/app/api/model-usage/[modelId]/route.ts:64-68
src/app/api/model-usage/rankings/route.ts:69-72
src/app/api/model-usage/overview/route.ts:42-47
```

### Fully public surfaces (no auth gate by design)

`agent-commerce/*`, `funding/*`, `categories`, `collections/*`, `compare/*`, `repos/*`, `search`, `predict/*`, `tier-lists/*`, `twitter/leaderboard`, `tools/revenue-estimate`, `oembed`, `badge/*`, `profile/*`, `mentions`, `skills`, `scoring/*`, `submissions/revenue`, `stream`. Out of scope.

---

## Evidence — no 500 leakage on auth gate

Inspected the three failure helpers (`src/lib/api/auth.ts:467-668`). None call into handler logic before returning. None unwrap `err.message` from a caller-supplied source into the body. The only string interpolation is the static config-name (`"CRON_SECRET not configured"`, `"admin endpoint not configured (ADMIN_TOKEN unset)"`) — operator guidance, not user-input echo. Sentry capture wraps a project `AuthQuarantineError` / `AuthFatalError` with masked actor and route metadata.

Spot-checked routes that *also* hand-roll a CRON_SECRET probe after the helper passes (`src/app/api/cron/sources-auto-recover/route.ts:144-148`, `src/app/api/admin/queues/repo/route.ts:89-100`, `src/app/api/cron/aiso-drain/route.ts`): all return `{ok:false, error|reason: <static string>}` at 503 with no raw `err.message`. Behavior is correct; only envelope shape diverges.

---

## Recommended fix template (deferred to follow-up tickets)

The drift is in two helpers in one file. A surgical patch would replace these two response builders without touching any caller:

```ts
// src/lib/api/auth.ts — authFailureResponse (cron)
return NextResponse.json(
  { ok: false, error: "unauthorized", code: "UNAUTHORIZED" },
  { status: 401 },
);
// not_configured branch:
return NextResponse.json(
  { ok: false, error: "CRON_SECRET not configured", code: "AUTH_NOT_CONFIGURED" },
  { status: 503 },
);
```

```ts
// src/lib/api/auth.ts — adminAuthFailureResponse
// blocked   → { ok:false, error:"ip blocked",          code:"FORBIDDEN" }            status 403
// unauth    → { ok:false, error:"unauthorized",        code:"UNAUTHORIZED" }         status 401
// noconfig  → { ok:false, error:"admin endpoint not configured (ADMIN_TOKEN unset)",
//               code:"AUTH_NOT_CONFIGURED" }                                          status 503
```

This removes the `reason` key from ~36 call-sites in one diff. **Caveat:** existing tests assert `body.reason === "unauthorized"` (e.g. `src/app/api/admin/pool-state/__tests__/auth.test.ts`, `src/app/api/health/sources/__tests__/auth-gate.test.ts`); a follow-up ticket should pair the helper change with a test sweep.

The `internal/*` bespoke shape should stay (documented agent-platform contract). `/api/admin/login` keeps its `{reason}` shape if the dashboard branches on it — verify with frontend before changing.

---

## Why this audit emits no code patches

The doc above lists ~36 single-line touchpoints + a paired test sweep. That's not a "2-3 routes need a one-line fix" surface. Per the ticket's own write-policy ("Write policy: read-only audit unless explicit patch subtask is opened"), the helper migration belongs in a separate ticket so the test/contract impact can be reviewed in isolation.

---

## Acceptance criteria — verdict

- [x] **≥20 unauth routes audited under `src/app/api/**`** — 50+ inspected, 36 enumerated above.
- [x] **No raw `err.message`/`detail` echo on the auth gate** — verified across 3 helpers, 36 call-sites, 0 leaks.
- [x] **Binary compliance verdict** — 500-leakage: PASS. Envelope shape: PARTIAL (3 shapes coexist).
- [x] **Ranked remediation queue** — single helper-level patch flips 36 routes; agent-platform contract stays; admin-login frontend-coupled change last.

**Next action owner:** PM/CTO to scope a follow-up patch ticket for `src/lib/api/auth.ts` `authFailureResponse` + `adminAuthFailureResponse` envelope alignment. Estimated ~10 LOC + ~6 test updates.
