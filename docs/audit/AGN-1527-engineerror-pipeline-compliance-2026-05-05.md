---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# AGN-1527 — Backend EngineError Category Compliance in Pipeline Handlers

**Date:** 2026-05-05
**Scope:** `src/app/api/pipeline/**/route.ts` (14 route files / 16 handlers)
**Branch audited:** `bot/marco/AGN-799` working tree
**Author (agent):** AFK worker bot

## TL;DR

**No bare `throw new Error(...)` exists in any production pipeline route handler.** The single match in the scoped path is a Vitest fixture (`sidebar-data/__tests__/error-envelope.test.ts:10`) that intentionally throws to verify the envelope builder swallows-and-redacts.

The compliance gap is structural, not local: route handlers themselves only `try { ... pipeline.X() ... } catch (err)` and funnel everything through `serverError(err, { scope })` — which **already** routes through `engineErrorSentryContext()` in `src/lib/api/error-response.ts:80–92`. So whenever an `EngineError` subclass bubbles up from the pipeline layer, Sentry gets correctly tagged with `category` + `source`. **When a bare `Error` bubbles up, Sentry gets a 500 with no category, no source, no triage signal.**

The fixable surface is therefore one layer down — in the pipeline / store / alerts code that the route handlers call. Three concrete bare-`Error` throws on caller-reachable paths are the patch-ready targets below.

## Definition of compliant

A handler is "EngineError-category compliant" if every error path that can reach `serverError(...)` arrives as an `EngineError` subclass (so Sentry tags `category` ∈ `recoverable | quarantine | fatal` and `source` ∈ 21-source enum) **or** is a 4xx envelope built explicitly via `errorEnvelope(...)` (no Sentry tagging needed for client errors).

Reference: `src/lib/errors.ts` — `EngineError` is abstract with `category: "recoverable" | "quarantine" | "fatal"` and a 21-value `source` union.

## Per-route audit

| Route (`src/app/api/pipeline/...`) | Method(s) | Catches → | Throws bare `Error` in handler? | Bubble-up risk (callee throws bare `Error`) | Required action |
|---|---|---|---|---|---|
| `alerts/route.ts` | GET, POST | `serverError` | No | **Yes** — `pipeline.markAlertRead` → `evaluateRulesForRepo` (engine.ts:107) | Convert engine.ts:107 to `AdminFatalError` (programmer-error invariant). |
| `alerts/rules/route.ts` | GET, POST, DELETE | `serverError` + ad-hoc `instanceof Error` 400 branch (line 119–125) | No | **Yes** — `pipeline.createAlertRule` (pipeline.ts:799) and `createRule` (rule-management.ts:55) both throw bare `Error` for validation failures. | Already mapped to 400 by message-string sniff — convert to `AdminRecoverableError` and key the 400 branch off `instanceof EngineError && err.category === "recoverable"`. Removes brittle `.includes("invalid rule")` check. |
| `backfill-history/route.ts` | POST | bespoke 500 builder (lines 105–117), redacts message, no Sentry capture | No | Low — `backfillStargazerHistory` either resolves with `{skipped}` or throws a fetch/IO error. | Wrap underlying fetch errors as `GithubRecoverableError` / `GithubRateLimitError` / `GithubPoolExhaustedError` at the source-adapter layer; keep handler unchanged. Optionally route handler through `serverError` so Sentry actually fires. **Sentry currently silent on this route.** |
| `cleanup/route.ts` | POST, GET | bespoke 500 for adapter-build failure (lines 37–48); main loop has no top-level catch | No | Low (adapter errors swallowed per-repo by inner `try{}`) | Adapter-build failure should throw `AdminFatalError` (config/env missing). Add an outer `try { ... } catch` that routes through `serverError`. |
| `deltas/route.ts` | POST | inline 500 + Sentry capture, but **does not call `serverError`** so EngineError tags are NOT applied (lines 192–203) | No | Yes — `getDataStore().read()` may throw `DataStoreFatalError` already, but the handler captures with hand-rolled tags only. | Replace inline `Sentry.captureException` + `NextResponse.json({error})` with `serverError(err, { scope: "[pipeline/deltas]", code: "PIPELINE_DELTAS_FAILED" })`. **Highest-leverage single edit in this audit.** |
| `featured/route.ts` | GET | `serverError` ✓ | No | Low (read-only computation over in-memory stores) | Compliant. |
| `freshness/route.ts` | GET | **No try/catch** — any throw becomes a Next.js generic 500 with no Sentry tags. | No | Yes — `refreshScannerSourceHealthFromStore` does I/O. | Wrap in `try {} catch (err) { return serverError(err, { scope: "[pipeline/freshness]" }) }`. |
| `ingest/route.ts` | POST | `Sentry.captureException` + `serverError` ✓ (lines 173–188) | No | Yes — adapter layer mostly throws typed `GithubRateLimitError`/`RedditBlockedError`/etc. ✓ | Compliant. The double-Sentry capture (line 174 + serverError's own line 89) means events get tagged twice; consider dropping the manual capture since `serverError` does it. |
| `meta-counts/route.ts` | GET | `serverError` ✓ | No | Low (in-memory rollup) | Compliant. |
| `persist/route.ts` | POST, GET | `serverError` ✓ | No | **Yes** — `file-persistence.ts:56` throws bare `Error` on `..` path-traversal in `STARSCREENER_DATA_DIR`. | Convert file-persistence.ts:56 to `DataStoreFatalError` — config invariant violation, not user-recoverable. |
| `profiles/enrich/route.ts` | GET, POST | **No try/catch** anywhere; spawns child process and returns its exit code | No | Low (child-process boundary handles failures via `code !== 0`) | Add an outer try/catch around `summarizeProfiles()` and `runEnricher()` so I/O / spawn failures don't leak as Next.js 500s. |
| `rebuild/route.ts` | POST, GET | inner per-repo try/catch logs + degrades gracefully (lines 219–235); **no outer try/catch** | No | Yes — `pipeline.recomputeAll()` and `repoStore.getAll()` can throw. | Wrap `POST` body in `try { ... } catch (err) { return serverError(err, { scope: "[pipeline/rebuild]", code: "PIPELINE_REBUILD_FAILED" }) }`. |
| `recompute/route.ts` | POST | `Sentry.captureException` + `serverError` ✓ | No | Low (typed errors at adapter layer) | Compliant; same double-capture observation as `ingest`. |
| `refresh/route.ts` | POST | `serverError` ✓ | No | Low | Compliant. |
| `sidebar-data/route.ts` | GET | `serverError` ✓ | No | Low | Compliant. |
| `status/route.ts` | GET | `serverError` ✓ | No | Low | Compliant. |

## Bare `Error` throws on caller-reachable paths (patch-ready, keyed by file:line)

| File:line | Current | Required EngineError | Why |
|---|---|---|---|
| `src/lib/pipeline/alerts/engine.ts:107` | `throw new Error(\`evaluateRulesForRepo: ctx.repo.id ${...} does not match repoId ${...}\`)` | `AdminFatalError` | Invariant violation — caller passed mismatched ids. Programmer error, not user-recoverable. |
| `src/lib/pipeline/alerts/rule-management.ts:55` | `throw new Error(\`createRule: invalid trigger type "${input.trigger}"\`)` | `AdminRecoverableError` | User-supplied trigger string failed validation. Maps to 400, retryable with corrected input. |
| `src/lib/pipeline/pipeline.ts:799` | `throw new Error(\`createAlertRule: invalid rule — ${validation.errors.join("; ")}\`)` | `AdminRecoverableError` | Same shape as rule-management.ts:55; the route handler at `alerts/rules/route.ts:119–125` already special-cases this with a `.includes("invalid rule")` string sniff — converting to a typed error replaces the sniff with `instanceof AdminRecoverableError`. |
| `src/lib/pipeline/storage/file-persistence.ts:56` | `throw new Error(\`TRENDINGREPO_DATA_DIR / STARSCREENER_DATA_DIR must not contain '..' segments\`)` | `DataStoreFatalError` | Operator-config invariant. Fatal, not retryable. |

## Sentry-coverage gaps (non-swallowed failures that don't hit `serverError`)

These routes catch & build their own 500 envelope, so `engineErrorSentryContext` never runs and `category`/`source` tags never fire even when an `EngineError` IS thrown:

| File | Lines | Fix |
|---|---|---|
| `pipeline/deltas/route.ts` | 192–203 | Replace inline 500 builder with `serverError(err, { scope: "[pipeline/deltas]", code: "PIPELINE_DELTAS_FAILED" })`. Manual `Sentry.captureException` becomes redundant — drop. |
| `pipeline/backfill-history/route.ts` | 105–117 | Same — currently has zero Sentry capture on the 500 path. |
| `pipeline/cleanup/route.ts` | 37–48 | Adapter-build failure — currently zero Sentry capture. |

## Routes missing top-level try/catch

`freshness/route.ts`, `profiles/enrich/route.ts`, and `rebuild/route.ts` have no outer try/catch around their handler body. Any unexpected throw becomes a Next.js generic 500 with no envelope, no Sentry tagging, no operator scope log line. Wrap each in:

```ts
try {
  // existing body
} catch (err) {
  return serverError(err, { scope: "[pipeline/<name>]", code: "PIPELINE_<NAME>_FAILED" });
}
```

## Recommended sequencing (1 PR per row)

| # | Change | LOC est. | Risk | Surface |
|---|---|---|---|---|
| 1 | `pipeline/deltas/route.ts`: swap inline 500 → `serverError`. | ~12 | None. | Pure refactor. |
| 2 | Convert the 4 bare-`Error` throws above to `EngineError` subclasses. Mirror the `alerts/rules/route.ts:119–125` 400-branch to `instanceof AdminRecoverableError && err.category === "recoverable"`. | ~25 | Low — string-sniff branch becomes type-checked. | One regression test asserting POST `/api/pipeline/alerts/rules` with bad trigger returns 400 + `{ok:false, error:"invalid rule"}`. |
| 3 | Add top-level try/catch wrappers to `freshness`, `profiles/enrich`, `rebuild`. | ~15 | None. | Pure resilience. |
| 4 | Drop the duplicate `Sentry.captureException` in `ingest/route.ts:174` and `recompute/route.ts:66` (both already covered by `serverError`'s own capture at error-response.ts:89). | ~20 lines deleted | Low — verify Sentry event count drops in staging. | None. |

## Acceptance-criteria checklist

- [x] Identify bare `throw new Error` occurrences in scoped backend paths. → **Zero in route handlers; 4 on caller-reachable callee paths (table above).**
- [x] Classify each as recoverable / quarantine / fatal target category. → **Done in patch-ready table.**
- [x] Verify Sentry logging presence for non-swallowed failures. → **Three gaps identified: `deltas`, `backfill-history`, `cleanup`.**
- [x] Produce patch-ready list keyed by file and line. → **Done; 4 throw sites + 3 Sentry gaps + 3 missing-try/catch wrappers.**

## Files referenced

- `src/lib/errors.ts` — EngineError taxonomy.
- `src/lib/api/error-response.ts:73–98` — `serverError` (the funnel).
- `src/lib/api/error-response.ts:80–92` — `engineErrorSentryContext` integration point.
- `src/app/api/pipeline/**/route.ts` — 14 files audited.
- `src/lib/pipeline/alerts/engine.ts:107`
- `src/lib/pipeline/alerts/rule-management.ts:55`
- `src/lib/pipeline/pipeline.ts:799`
- `src/lib/pipeline/storage/file-persistence.ts:56`
