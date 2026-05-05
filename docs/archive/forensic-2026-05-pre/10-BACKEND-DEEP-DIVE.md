# Backend Deep-Dive Forensic Log

## Audit Slice 2026-05-04 (Heartbeat: AGN-542)

- Scope audited this heartbeat: 8 route files
- Routes audited: 8
- Findings: 1 Medium, 0 High, 0 Critical
- Security lenses: OWASP API4, OWASP A04, OWASP A05, OWASP LLM07

### POST /api/admin/login
- File: `src/app/api/admin/login/route.ts`
- Auth gate: PASS (`checkRateLimitAsync` + constant-time compare + signed HttpOnly cookie)
- Zod validation: PASS (`parseBody` at line 118)
- Rate limit: PASS (`checkRateLimitAsync` at line 68)
- Error envelope: PASS (no raw exception body returned)
- Sentry capture: PASS (`Sentry.captureException` lines 71/97/148)
- Timeouts/retry: N/A (no external fetch)
- Security note: cookie uses `SameSite=Lax`; acceptable for admin login flow, but Strict would further reduce CSRF surface.

### POST /api/admin/scan
- File: `src/app/api/admin/scan/route.ts`
- Auth gate: PASS (`verifyAdminAuth` at line 221)
- Zod/body validation: PARTIAL (manual source validation, not centralized schema)
- Rate limit: PASS (`checkRateLimitAsync` at line 79)
- Tool execution sink: PASS with safeguards (`spawn` with script allow-list + curated env)
- LLM/tool surface: PASS (no freeform shell string; fixed script map)

### POST /api/compare/share
- File: `src/app/api/compare/share/route.ts`
- Auth gate: FAIL (public write by design)
- Zod validation: PASS (`parseBody` line 52)
- Rate limit: FAIL (no `checkRateLimitAsync`)
- Data-store discipline: PASS (`getDataStore().write`)

#### Finding [Medium] [OWASP API4: Unrestricted Resource Consumption / CWE-770]
- **File:line:** `src/app/api/compare/share/route.ts:52-73`
- **Evidence:** Route accepts unauthenticated POST and persists every payload to data-store with no limiter/TTL.
- **Exploit sketch:** Automated clients can create unbounded share entries, growing Redis keyspace and write traffic; this degrades read/write latency for unrelated features.
- **Fix sketch:** Add `checkRateLimitAsync` keyed by IP + user token (if present), and enforce TTL in `store.write(compareShareKey(shortId), payload, { ttlSeconds: ... })`.
- **Required security test:** regression test proving repeated burst POSTs return 429 and key count does not grow indefinitely.

### POST /api/mcp/record-call
- File: `src/app/api/mcp/record-call/route.ts`
- Auth gate: PARTIAL (anonymous callers return `{ok:true, skipped:"anonymous"}`)
- Zod validation: PASS (`parseBody` line 80)
- Rate limit: FAIL (not present)
- LLM/tool surface: PASS (no execution sink)
- Security note: anonymous skip is intentional for non-blocking telemetry; residual abuse risk is low because no privileged state mutation.

### GET /api/search
- File: `src/app/api/search/route.ts`
- Auth gate: N/A (public read route)
- Validation: PASS (`parseSearchQuery` + 400 on invalid)
- Rate limit: MISSING (public expensive query path)
- Timeout/retry: N/A in route (store-backed refresh helpers)
- Security note: candidate Medium if abuse appears in production metrics; currently logged as hygiene watch item.

### GET /api/stream
- File: `src/app/api/stream/route.ts`
- Auth gate: N/A (public event stream)
- Resource control: PASS (`MAX_SUBSCRIBERS`, 503 when full)
- DoS control: PARTIAL (connection cap exists, no identity-based RL)
- Security note: keep cap conservative in production env.

### GET/PUT/DELETE /api/watchlist/private
- File: `src/app/api/watchlist/private/route.ts`
- Auth gate: PASS (`verifyUserAuth` + entitlement gate)
- AuthZ scope: PASS (userId derived only from auth context)
- Validation: PASS (`parseBody` + max list check)
- Cache control: PASS (`private, no-store`)

### POST /api/webhooks/stripe
- File: `src/app/api/webhooks/stripe/route.ts`
- Signature verification: PASS (`constructEvent` on raw body)
- Error disclosure: PASS (no raw body or stack leak)
- Idempotency: PASS (`acquireStripeEventLock`)
- Security note: strong implementation; no immediate finding.

## Things that look like vulns but are not

### `spawn()` in admin scan route
- Why it looks bad: process launch in API handler can imply command injection.
- Why it is fine: sink is constrained to fixed allow-listed script paths and does not interpolate user input into shell commands.

### Anonymous success path in MCP metering endpoint
- Why it looks bad: unauthenticated requests are accepted.
- Why it is fine: endpoint writes non-privileged telemetry only; response intentionally non-blocking to avoid breaking MCP clients without tokens.

## Next Slice
- Continue with 8 additional routes, prioritizing high-write/public endpoints under `src/app/api/pipeline/**` and `src/app/api/repos/**`.
- File follow-up issue for compare/share resource-consumption hardening.

## Audit Slice 2026-05-04 (Heartbeat continuation)

- Scope audited this heartbeat: 8 route files
- Routes audited in this slice: 8
- Findings: 1 Low, 0 Medium, 0 High, 0 Critical
- Security lenses: OWASP A05, OWASP API8, Fail-Secure Defaults

### POST /api/pipeline/ingest
- File: `src/app/api/pipeline/ingest/route.ts`
- Auth gate: PASS (`verifyCronAuth` line 156)
- Validation: PASS (manual parser + strict shape checks)
- Rate limit: N/A (cron-protected endpoint)
- Error handling: PASS (generic API response; details bounded)

### POST /api/pipeline/persist
- File: `src/app/api/pipeline/persist/route.ts`
- Auth gate: PASS (`verifyCronAuth` line 35)
- Validation: N/A (no body)
- Error handling: FAIL (returns raw `err.message` in 500 response)

#### Finding [Low] [OWASP A05: Security Misconfiguration / CWE-209]
- **File:line:** `src/app/api/pipeline/persist/route.ts:73-76`
- **Evidence:** Catch block maps internal exception text directly to client body `{ ok:false, error: message }`.
- **Exploit sketch:** Caller with cron credential can receive backend exception detail (paths/env/driver errors) that should remain server-only.
- **Fix sketch:** Return stable public error code/message and keep full detail in Sentry/server logs only.
- **Required security test:** assert 500 response does not include thrown error string.

### POST /api/pipeline/rebuild
- File: `src/app/api/pipeline/rebuild/route.ts`
- Auth gate: PASS (`verifyCronAuth` line 89)
- Validation: PASS (`parseBody` + zod schema)
- Resource controls: PASS (limit/offset/maxPages caps)

### POST /api/pipeline/refresh
- File: `src/app/api/pipeline/refresh/route.ts`
- Auth gate: public by design
- Rate limit: PASS (`checkRateLimitAsync` line 63)
- Note: bounded public write trigger with explicit limiter

### GET /api/repos
- File: `src/app/api/repos/route.ts`
- Public read endpoint; no immediate exploit path found in reviewed section.

### GET /api/repos/[owner]/[name]
- File: `src/app/api/repos/[owner]/[name]/route.ts`
- Slug validation: PASS (`SLUG_PART_PATTERN` check)
- Error envelope: PASS (generic internal error response)

### GET /api/repos/[owner]/[name]/mentions
- File: `src/app/api/repos/[owner]/[name]/mentions/route.ts`
- Input validation: PASS (slug/source/limit/cursor validation)
- Error handling: PASS (generic 500 envelope + Sentry)

### GET /api/repos/[owner]/[name]/events
- File: `src/app/api/repos/[owner]/[name]/events/route.ts`
- Input validation: PASS (slug + bounded limit)
- Cache controls: PASS

## Things that look like vulns but are not

### Public `/api/pipeline/refresh` trigger
- Why it looks bad: unauthenticated pipeline refresh endpoint.
- Why it is fine: endpoint enforces cross-instance rate limiting (`checkRateLimitAsync`) and does not expose privileged data.

### Repo mentions cursor decode
- Why it looks bad: base64 cursor input could imply parser abuse.
- Why it is fine: strict decode + JSON shape + date validation; malformed input deterministically returns 400.

## Audit Slice 2026-05-05 (Heartbeat continuation)

- Scope audited this heartbeat: 8 route files
- Routes audited in this slice: 8
- Findings: 4 Low, 0 Medium, 0 High, 0 Critical
- Security lenses: OWASP A05, OWASP API8, CWE-209, Fail Securely

### GET/POST /api/pipeline/alerts
- File: `src/app/api/pipeline/alerts/route.ts`
- Auth gate: PASS (`verifyUserAuth` + ownership guard)
- Validation: PASS (`parseBody` for mark-read)
- Rate limit: MISSING (state-change POST has no limiter)
- Error handling: FAIL (raw exception message in 500 envelope)

#### Finding [Low] [OWASP A05: Security Misconfiguration / CWE-209]
- **File:line:** `src/app/api/pipeline/alerts/route.ts:76-79` and `116-119`
- **Evidence:** Catch blocks return `{ ok:false, error: message }` where `message` is internal exception text.
- **Fix sketch:** replace with stable public message/code; keep full detail in logs/Sentry.

### GET/POST/DELETE /api/pipeline/alerts/rules
- File: `src/app/api/pipeline/alerts/rules/route.ts`
- Auth gate: PASS (`verifyUserAuth`)
- Validation: PASS (Zod + parseBody)
- Error handling: FAIL (raw exception text returned in multiple catch paths)

#### Finding [Low] [OWASP A05: Security Misconfiguration / CWE-209]
- **File:line:** `src/app/api/pipeline/alerts/rules/route.ts:74-76`, `113-118`, `153-155`
- **Evidence:** 500/400 branches expose direct `err.message` to caller.
- **Fix sketch:** sanitize external error message, map specific validation failures to stable codes.

### POST /api/pipeline/backfill-history
- File: `src/app/api/pipeline/backfill-history/route.ts`
- Auth gate: PASS (`verifyCronAuth`)
- Validation: PASS (`parseBody` + zod)
- Error handling: FAIL (`internal error: ${message}` response)

#### Finding [Low] [OWASP A05: Security Misconfiguration / CWE-209]
- **File:line:** `src/app/api/pipeline/backfill-history/route.ts:105-111`
- **Evidence:** Internal exception text concatenated into API reason string.
- **Fix sketch:** return `INTERNAL_ERROR` style code with generic message.

### POST/GET /api/pipeline/cleanup
- File: `src/app/api/pipeline/cleanup/route.ts`
- Auth gate: PASS (`verifyCronAuth`)
- Validation: PASS (`parseBody`)
- Error handling: PARTIAL (adapter construction path still returns `err.message`)

#### Finding [Low] [OWASP A05: Security Misconfiguration / CWE-209]
- **File:line:** `src/app/api/pipeline/cleanup/route.ts:39-41`
- **Evidence:** Exposes raw adapter construction failure message in 500 response.
- **Fix sketch:** stable message/code; details only in logs.

### POST /api/internal/signals/twitter/v1/ingest
- File: `src/app/api/internal/signals/twitter/v1/ingest/route.ts`
- Auth gate: PASS (`verifyInternalAgentAuth`)
- Validation: PASS (schema safeParse + body-size cap)
- Error handling: PARTIAL (500 branch forwards raw error message)
- Note: internal endpoint but still should avoid leaking internals.

### GET /api/internal/signals/twitter/v1/candidates
- File: `src/app/api/internal/signals/twitter/v1/candidates/route.ts`
- Auth gate: PASS (`verifyInternalAgentAuth`)
- Validation: PASS (`limit` bounds)
- Finding: none in reviewed slice.

### POST /api/internal/twitter/v1/findings (deprecated)
- File: `src/app/api/internal/twitter/v1/findings/route.ts`
- Auth gate: PASS (`verifyCronAuth`)
- Validation: PASS (safeParse)
- Error handling: PARTIAL (500 branch forwards raw error message)

### GET /api/internal/twitter/v1/review/[owner]/[name]
- File: `src/app/api/internal/twitter/v1/review/[owner]/[name]/route.ts`
- Auth gate: PASS (`verifyCronAuth`)
- Validation: PASS (slug validation)
- Finding: none in reviewed slice.

## Things that look like vulns but are not

### `parseBody` lint bypass in internal twitter ingest endpoints
- Why it looks bad: manual JSON parsing can imply weak validation.
- Why it is fine: payloads are validated through explicit Zod schemas and intentionally use a custom error contract.

### Deprecated `/api/internal/twitter/v1/findings` route still enabled
- Why it looks bad: duplicate legacy endpoint increases attack surface.
- Why it is fine: route is cron-auth protected and clearly marked deprecated with canonical replacement.
