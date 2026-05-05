# AGN-1503 — Backend EngineError Category Adoption Audit

**Date:** 2026-05-05
**Scope:** `src/app/api/**` (Next.js API route handlers)
**Mode:** Read-only
**Auditor:** Sprint 1 audit pass (AGN-1503)
**Source-of-truth file:** `src/lib/errors.ts`

---

## 1. Taxonomy (from `src/lib/errors.ts`)

`EngineError` is an abstract base class with two required readonly fields:

- `category: "recoverable" | "quarantine" | "fatal"`
- `source: EngineErrorSource` (21-value union — see file)

`category` is **always set on a per-subclass basis** (e.g. `AuthRecoverableError.category = "recoverable"` is hard-coded in the class). Therefore, **call-sites cannot get the category wrong** — selecting the right subclass *is* selecting the category. This is a strong shape: the audit collapses to "is the right *subclass* picked?" rather than "is `category` set?".

Helpers exported:

- `engineErrorTags(err)` → `{ source, category }` Sentry tag map (returns `{}` for non-EngineError)
- `engineErrorSentryContext(err, baseTags, baseExtra)` → unified Sentry payload

Central error-boundary helper: `src/lib/api/error-response.ts` imports `engineErrorSentryContext` and is the canonical wrap-and-return path for handler-level catches.

---

## 2. Production throw inventory (excludes `__tests__`)

`rg "^\s*throw\s+" src/app/api -g '!**/__tests__/**'` → 11 sites total, **0 untyped throws** in production paths.

| # | Route | Line | Throw kind | Category derivable | Verdict |
|---|---|---|---|---|---|
| 1 | `api/admin/scan-log/route.ts` | 136 | `throw new AdminRecoverableError(...)` | recoverable / admin | OK |
| 2 | `api/cron/sources-auto-recover/route.ts` | 72 | `throw new OpsAlertFatalError(...)` | fatal / ops-alert | OK |
| 3 | `api/cron/llm/sync-models/route.ts` | 108 | `throw new LlmModelSyncError(...)` (extends `DataStoreFatalError`) | fatal / data-store | **WEAK** — see §4 |
| 4 | `api/openapi.json/route.ts` | 71 | `throw new OpenApiLoadError(...)` (extends `AdminFatalError`) | fatal / admin | OK |
| 5 | `api/openapi.json/route.ts` | 94 | `throw loadError` (cached EngineError) | inherited | OK |
| 6 | `api/_internal/sentry-canary/route.ts` | 48 | `throw error` (synthetic `SentryCanaryError extends EngineError`) | configured per-call | OK |
| 7 | `api/repo-submissions/route.ts` | 140 | `throw err` (rethrow, EngineError-instanceof checked above) | preserved | OK |
| 8 | `api/submissions/revenue/route.ts` | 146 | `throw err` (same pattern as #7) | preserved | OK |
| 9 | `api/og/top10/route.tsx` | 704 | `throw err` (rethrow inside catch with Sentry tag) | **NOT preserved** — see §4 | **WEAK** |
| 10 | `api/og/star-activity/route.tsx` | 978 | `throw err` (same) | **NOT preserved** | **WEAK** |
| 11 | `api/og/mindshare/route.tsx` | 474 | `throw err` (same) | **NOT preserved** | **WEAK** |

`__tests__/*` `throw new Error(...)` sites are **fixtures simulating handler failures** and intentionally untyped — not in scope.

---

## 3. Coverage by route bucket

| Bucket | Compliant routes | Non-/weak compliance | Notes |
|---|---|---|---|
| `api/admin/*` | `admin/login`, `admin/scan`, `admin/scan-log`, `admin/sentry-verify` | — | Uses `engineErrorSentryContext` consistently |
| `api/cron/*` | `cron/subdomain-takeover`, `cron/sources-auto-recover` (typed throw) | `cron/digest/weekly`, `cron/news-auto-recover`, `cron/aiso-drain`, `cron/llm/aggregate`, `cron/llm/sync-models`, `cron/mcp/rotate-usage` | Catch-and-Sentry blocks log raw `err` without `engineErrorTags` → no `source`/`category` tag in Sentry |
| `api/og/*` | — | `og/top10`, `og/star-activity`, `og/mindshare` | catch+capture+rethrow with custom tags but **no engine-error tagging**, no rewrap of raw `err` |
| `api/pipeline/*` | `pipeline/sidebar-data` (via central boundary), `pipeline/freshness` (boundary) | `pipeline/recompute`, `pipeline/ingest`, `pipeline/deltas` | Inline Sentry capture, no engineErrorTags |
| `api/submissions/*`, `api/repo-submissions` | both | — | Best-in-class: `instanceof EngineError` checks before tagging |
| `api/webhooks/stripe` | partial | partial | Custom Sentry capture indirection; inspect for completeness |
| `api/repos/[owner]/[name]/mentions` | — | this route | Two raw `Sentry.captureException(err)` calls without tags |
| `api/openapi.json` | this route | — | OK; uses engineErrorTags downstream |
| `api/_internal/sentry-canary` | this route | — | OK; SentryCanaryError extends EngineError |

---

## 4. Top 5 worst offenders (recommended fix order)

1. **`api/og/mindshare/route.tsx`, `api/og/top10/route.tsx`, `api/og/star-activity/route.tsx`** — three OG image renderers. Each catches, captures with route/aspect/format tags, then re-throws raw `err`. *No EngineError wrap; no source/category tag.* Recommend wrapping render failures into a new `OgRenderRecoverableError` / `OgRenderFatalError` (needs new `source: "og-render"` enum value) **or** at minimum spreading `...engineErrorTags(err)` into the `tags` object — non-EngineError throws return `{}` harmlessly. **Highest priority** because these are user-facing routes producing the most exception volume.
2. **`api/cron/llm/sync-models/route.ts`** — `LlmModelSyncError extends DataStoreFatalError`. The throw triggers on a non-2xx upstream HTTP from openrouter.ai/api/v1/models. That is a transient/upstream concern; `fatal/data-store` mis-tags it as our datastore failing. Recommend: introduce an LLM/openrouter source (e.g. add `"openrouter"` to `EngineErrorSource`) and split into `LlmModelSyncQuarantineError` (rate-limit/5xx) vs `LlmModelSyncFatalError` (config/4xx-non-429).
3. **`api/cron/digest/weekly/route.ts`, `api/cron/news-auto-recover/route.ts`, `api/cron/aiso-drain/route.ts`, `api/cron/llm/aggregate/route.ts`, `api/cron/mcp/rotate-usage/route.ts`** — common pattern: top-level `catch (err)` → `Sentry.captureException(err, { tags: { route: "..." } })`. None spread `engineErrorTags(err)`. Trivial mechanical fix; restores category/source visibility without changing throw semantics.
4. **`api/pipeline/{recompute,ingest,deltas}/route.ts`** — same pattern as #3 but on hot pipeline endpoints. Either spread `engineErrorTags` or migrate the catch block to `withSentryErrorBoundary` from `lib/api/error-response.ts`.
5. **`api/repos/[owner]/[name]/mentions/route.ts`** — two `Sentry.captureException(err)` calls (line 286 with no tags at all, line 340 with a single `route` tag). Add `engineErrorTags(err)` spreads.

---

## 5. Validated compliant examples (one per category)

| Category | Example | File:Line | Why compliant |
|---|---|---|---|
| `recoverable` | `throw new AdminRecoverableError("admin scan log directory read failed", {...})` | `api/admin/scan-log/route.ts:136` | Subclass fixes `category="recoverable"`, `source="admin"`; metadata attached |
| `quarantine` | `if (err instanceof AuthQuarantineError \|\| err instanceof AuthFatalError) Sentry.captureException(err, { tags: { ...engineErrorTags(err), abuse_surface: "repo-submissions" } })` | `api/repo-submissions/route.ts:108` | Instance-of guard + engineErrorTags spread on rethrow |
| `fatal` | `throw new OpsAlertFatalError("sources-auto-recover: freshness state unavailable", {...})` | `api/cron/sources-auto-recover/route.ts:72` | Subclass fixes `category="fatal"`, `source="ops-alert"`; metadata captures freshness state |

---

## 6. Verdict

**PASS with action items.**

- 0 untyped `throw new Error(...)` sites in production code under `src/app/api/**`. The taxonomy is well-adopted at *throw* sites.
- The gap is at *catch+capture* sites: ~9 handler-level catch blocks call `Sentry.captureException(err, { tags })` without spreading `engineErrorTags(err)`. This loses `source`/`category` tagging on already-typed EngineErrors that bubble up from `lib/`.
- 3 OG renderer routes additionally rethrow raw `err` without ever wrapping unknown errors into an EngineError subclass — these have no source taxonomy at all.

## 7. Recommended next action

Open a code-touch follow-up issue (separate from this audit) covering:

- (a) Mechanical patch: spread `...engineErrorTags(err)` into all `Sentry.captureException(err, { tags })` sites listed in §3 (≈9 routes).
- (b) Taxonomy extension: add `"openrouter"` and `"og-render"` to `EngineErrorSource`; create matching subclasses for the OG renderers and the openrouter sync.
- (c) Validation: re-run `rg -n "Sentry\.captureException" src/app/api -g '!**/__tests__/**'` and assert each match is paired with `engineErrorTags` or `engineErrorSentryContext` on the same call.

**Owner suggestion:** Backend platform agent (handler-layer changes only; no schema/DB impact).

---

## Appendix: validation commands run

```
rg -n "EngineError" src/lib
rg -n "throw new \w+Error\(" src/app/api
rg -n "throw\s+" src/app/api -g '!**/__tests__/**'
rg -n "Sentry\.captureException|engineErrorTags|engineErrorSentryContext" src/app/api
```
