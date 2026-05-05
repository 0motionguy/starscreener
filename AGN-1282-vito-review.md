---
status: archive
audit-date: 2026-05-05
reason: code review report of past sprint state; references may not resolve to current files
---

## Architecture review — Sprint 1 auth/quarantine/fatal trace (admin + cron routes)

**Scope reviewed:** `src/lib/api/auth.ts` (~700 LOC), auth gates in `src/app/api/health/route.ts`, `src/app/api/health/sources/route.ts`, and representative route callsites (`src/app/api/admin/scan/route.ts`, `src/app/api/cron/freshness/state/route.ts`) (~80 LOC sampled)
**Lenses applied:** Depth, Seams, Concern leakage, Coupling/cohesion

### Findings

1. **Depth / God module — `auth.ts` mixes four auth surfaces + response mapping + telemetry policy in one load-bearing file**  
   `src/lib/api/auth.ts:L103-L202`, `src/lib/api/auth.ts:L251-L457`, `src/lib/api/auth.ts:L467-L575`
   The same module owns cron/admin/user/internal-agent verification, transport mapping (`NextResponse`), and Sentry tagging semantics. This is shallow-at-the-interface because callers import one file but still need to know which helper pair (`verifyX` + `XFailureResponse`) applies, and changes to one auth surface risk unrelated churn in others. The file is already carrying unrelated responsibilities and is now a central blast radius for auth behavior changes.
   **Suggested change:** Split by auth surface and seam: `auth/cron.ts`, `auth/admin.ts`, `auth/user.ts`, `auth/internal-agent.ts`, with a thin `auth/index.ts` re-export. Keep `engineErrorSentryContext` mapping in a dedicated `auth/failure-response.ts` so verification logic and transport/error-envelope logic evolve independently.

2. **Concern leakage / Missing seam — route-level auth gate pattern is duplicated across dozens of handlers**  
   `src/app/api/admin/scan/route.ts:L226-L227`, `src/app/api/cron/freshness/state/route.ts:L757-L760`
   The `const deny = ...; if (deny) return deny` contract is repeated at many route boundaries (43 direct instances in `src/app/api/**/route.ts`). That duplication means any envelope/tagging/headers evolution requires broad callsite edits, and it keeps auth as boilerplate concern instead of a boundary seam.
   **Suggested change:** Introduce route wrappers (for example `withAdminAuth(handler)` and `withCronAuth(handler)`) in `src/lib/api/auth-route.ts`, then migrate callsites incrementally. The wrapper should enforce the deny path and pass only authenticated control into the handler.

3. **Duplicated logic / Naming drift risk — detail-access predicate duplicated across health routes**  
   `src/app/api/health/route.ts:L156-L161`, `src/app/api/health/sources/route.ts:L95-L100`
   `canViewDetail` has the same auth predicate in multiple health endpoints. This is subtle duplication now, but it is load-bearing because any policy tweak (for example role split or audit-only paths) can drift between endpoints and create inconsistent operator access behavior.
   **Suggested change:** Extract shared policy to `src/lib/api/health-auth.ts` (for example `canViewHealthDetail(request)`), and consume it from all health routes.

### Things that look bad but are actually fine

- `src/lib/api/auth.ts:L497-L544` — keeping `adminAuthFailureResponse` separate from cron failure response is correct because the 503 body and telemetry need admin-specific semantics.
- `src/lib/api/auth.ts:L124-L127` — process-local one-shot config warnings look stateful, but for serverless cold starts this cadence is intentional and avoids log spam without suppressing deploy-time signal.

### Out of scope (handed off)

- Security: `src/lib/api/auth.ts:L157-L201` admin session-vs-bearer precedence is security-sensitive policy; assigning [Sal](/PAP/agents/sal) for threat-model sign-off on mixed credential precedence and blocked-IP behavior.
- Tests: if wrappers are introduced, regression coverage should validate unchanged deny envelopes across migrated routes; assigning [Carmela](/PAP/agents/carmela) for contract tests per route class.

### Verdict

**REQUEST_CHANGES** — findings #1-#3 are structural and should be addressed (or explicitly tracked as owned follow-ups) before calling this auth/quarantine/fatal path architecture stable.
