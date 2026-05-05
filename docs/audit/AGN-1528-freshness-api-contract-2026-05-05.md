---
status: archive
audit-date: 2026-05-05
reason: bulk drift sweep - content not yet drift-audited; treat as historical reference
---

# AGN-1528 — Backend Freshness API Contract Verification

**Date:** 2026-05-05
**Sprint:** 1 audit
**Parent:** AGN-58 (KICKOFF: STARSCREENER A-to-Z onboarding)
**Scope:** Trace `scripts/check-freshness.mts` against the actual API handlers
it consumes; confirm typed contract, error envelope conformance, and test
coverage; document divergences and propose minimal fixes.

---

## 1. Surface map (what the script calls vs. what exists)

`scripts/check-freshness.mts` (the operator-facing freshness gate) hits three
endpoints in parallel:

| Caller line | URL | Handler file | Auth |
|---|---|---|---|
| `check-freshness.mts:421` | `GET /api/health?soft=1` | `src/app/api/health/route.ts` | none (public soft path) |
| `check-freshness.mts:422` | `GET /api/cron/freshness/state` | `src/app/api/cron/freshness/state/route.ts` | `verifyCronAuth` (Bearer `CRON_SECRET`) |
| `check-freshness.mts:205` | `GET /api/_internal/sentry-canary` (opt-in via `--sentry-canary`) | `src/app/api/%5Finternal/sentry-canary/route.ts` | `verifyCronAuth` |

Adjacent freshness-shaped routes that exist but the script does **not** hit:

- `GET /api/health/sources` — per-source circuit-breaker breakdown.
- `GET /api/health/cron-activity` — cron-fire ring buffer.
- `GET /api/health/portal` — portal manifest probe.
- `GET /api/pipeline/freshness` — scanner source health summary.
- `GET /api/repos/[owner]/[name]/freshness` — per-repo source ages.

These are out of scope for the freshness-check script but use overlapping
contracts; covered only briefly below.

---

## 2. Typed-contract status per endpoint

### 2.1 `/api/health` (the script's `HealthState`)

- **Route side:** Strong TS interfaces `HealthBody` / `PublicHealthBody`
  (`src/app/api/health/route.ts:72-154`). Generic `NextResponse<HealthBody | PublicHealthBody>`
  on the handler signature (`route.ts:204`). `?soft=1` short-circuits to a
  cached body that is also `HealthBody | PublicHealthBody`.
- **Script side:** Defines its own narrow interface `HealthState` covering
  only `{status, sourceStatus, lastFetchedAt, computedAt}` (`check-freshness.mts:28-33`).
  Reads only those four fields.
- **Schema enforcement:** TS-type-only on both sides. **No Zod, no runtime guard**
  for `/api/health` in either the route response or the script. The script
  never validates the parsed body before reading it (`fetchJson<HealthState>`
  just casts).
- **Verdict:** Contract is **stable** because the four fields the script
  reads are public-tier (always emitted, even on `error` fallback at
  `route.ts:441-447` and `:461-540`). No drift risk for the script — but
  also no defensive validator if the route ever drops a field.

### 2.2 `/api/cron/freshness/state` (the script's `FreshnessState`)

- **Route side:** Exported `FreshnessStateResponse` (`route.ts:77-87`) with
  per-source `SourceState` (`route.ts:40-50`) including:
  `name, lastUpdate, lastWriter, lastWriterRunId, lastWriterCommit,
  freshnessBudget, ageMs, status, blocking`. Plus a top-level `health: FreshnessHealth`
  derived from `deriveHealth(sources)`.
- **Script side:** Defines `FreshnessSource` (`check-freshness.mts:8-15`) and
  `FreshnessState` (`:17-26`) that omit:
  - top-level `health`
  - `lastWriter`, `lastWriterRunId`, `lastWriterCommit`
  - declares `blocking?: boolean | undefined` (route declares it `boolean`,
    always present; script's optional shape is permissive but consistent).
- **Schema enforcement:** Hand-rolled validator `validateFreshnessState` runs
  after parse (`check-freshness.mts:316-341`). It enforces presence/type for
  `checkedAt`, `sources[*].name`, `lastUpdate`, `freshnessBudget`, `ageMs`,
  `status` (must be one of `GREEN/YELLOW/RED/DEAD`), and `blocking`. It does
  **not** validate `summary{green,yellow,red,dead}` shape, `health`, or the
  provenance fields.
- **Verdict:** Contract holds for the fields the script consumes. The script
  is forward-compatible with extra fields (`health`, `lastWriter*`) because
  the validator is non-exhaustive. **No Zod schema on the route response**.

### 2.3 `/api/_internal/sentry-canary` (the script's `SentryCanaryResponse`)

- **Route side:** Returns either `{ok: false, error: "not found", code: "NOT_FOUND"}` (404)
  or **throws** to surface a 5xx via Next's error boundary (no JSON body
  guaranteed on the success path — that path is intentionally fatal).
- **Script side:** Declares `SentryCanaryResponse` (`check-freshness.mts:41-47`)
  with `{ok?: false, error?, reason?, code?, eventId?}`. Reads `body.eventId` on
  status ≥500 (`:231`).
- **Verdict — BUG FOUND:** `body` is typed `SentryCanaryResponse | null`
  (script `:220, :223-225`). On the 5xx branch (`:227-232`) the spread reads
  `body.eventId` without a null-guard. Will throw `TypeError: Cannot read
  properties of null` whenever the canary endpoint returns a body the JSON
  parser rejects (e.g., the Sentry-rendered HTML 500 page Next emits when the
  handler `throw`s). This is the only way the canary returns a 5xx in
  practice. Severity: cosmetic — the surrounding `try/catch` at `:239-247`
  catches it and the script continues. But the canary status reported on the
  successful-fire path is mislabeled `CONFIGURED` instead of `TEST_FIRED`.

---

## 3. Error-envelope conformance

The project standard is `{ ok: false, error: string, code?: string }`
(see `src/lib/api/error-response.ts:1-55`). Audit per endpoint:

| Endpoint | Error path body | Conforms? |
|---|---|---|
| `/api/health` (caught) | `{status: "error", sourceStatus: "degraded", error: "health check failed", lastFetchedAt, computedAt}` (`route.ts:441-447`) | **NO** — uses `status` discriminator, not `ok:false`. Intentional: this endpoint's contract is the `HealthBody.status` enum (`ok|stale|error`), not the standard envelope. Documented in the file header. |
| `/api/cron/freshness/state` (caught 5xx) | `serverError(...)` returns `{ok:false, error:"freshness state unavailable", code:"FRESHNESS_STATE_FAILED"}` (`route.ts:780-786`) | **YES** |
| `/api/cron/freshness/state` (auth fail) | `authFailureResponse` returns `{ok:false, reason:"unauthorized"}` (401) or `{ok:false, reason:"CRON_SECRET not configured"}` (503) (`auth.ts:480, :490-493`) | **PARTIAL** — uses `reason` not `error`. Pre-existing project-wide cron-auth shape; tracked separately under the APP-10 rollout. |
| `/api/_internal/sentry-canary` (404 disabled) | `{ok:false, error:"not found", code:"NOT_FOUND"}` (`sentry-canary/route.ts:21-23`) | **YES** |
| `/api/_internal/sentry-canary` (auth fail) | same `authFailureResponse` as above | **PARTIAL** (same caveat) |

**Verdict:** The two endpoints that return canonical 5xx envelopes
(`freshness/state` and `sentry-canary`'s 404) are conformant. The
`/api/health` error fallback is intentionally non-standard (it serves uptime
monitors that key on `status`). The cron-auth `{ok:false, reason}` shape is a
known project-wide deviation, out of scope for this ticket.

---

## 4. Test coverage

| Endpoint | Happy path test | Error path test |
|---|---|---|
| `/api/health?soft=1` | `src/app/api/health/__tests__/soft-health-route.test.ts` — asserts non-500 + valid `status` enum. | None for the `try/catch` 503 fallback. |
| `/api/cron/freshness/state` | `src/app/api/cron/freshness/state/__tests__/health-states.test.ts` — exercises `deriveHealth` over 9 cases (all GREEN, advisory, stale variants). | `src/app/api/cron/freshness/state/__tests__/error-envelope.test.ts` — forces `inspectSource` to throw, asserts every entry degrades to `DEAD` with no 5xx. |
| `/api/health/sources` | `src/app/api/health/sources/__tests__/auth-gate.test.ts` — public stripping, admin-cookie pass-through, secret redaction in error messages. | Stripped public payload covered. |
| `/api/_internal/sentry-canary` | None. | None. |
| `/api/pipeline/freshness` | None. | None. |
| `/api/repos/[owner]/[name]/freshness` | None. | None. |

The script's own runtime-validator (`validateFreshnessState`) is **not**
unit-tested — it ships its expected contract as an in-script type guard with
no fixtures.

---

## 5. Reproduced failure modes (evidence)

Without spinning up the dev server, two failure modes are proven by code
inspection:

**5.1 — Script null-deref on Sentry canary 5xx with non-JSON body.**
`check-freshness.mts:231` reads `body.eventId` while `body` may be `null`
(`:223-225`). Reproduces whenever the canary endpoint returns the
text/html error page Next emits for an unhandled `throw` (the canary's
documented success path at `sentry-canary/route.ts:48`). The script's
outer try-catch swallows it but the `TEST_FIRED` branch is never reached
on the actual fire-success path; status reports `CONFIGURED` instead.

**5.2 — Auth-failure shape divergence on `freshness/state` 401/503.**
`authFailureResponse` (`src/lib/api/auth.ts:480, :490-493`) returns
`{ok:false, reason:"…"}` for cron-auth denials. The `FreshnessStateErrorResponse`
type union in the route (`route.ts:752-754`) acknowledges the non-canonical
shape, so this is *known* divergence, not drift. Worth noting because the
script's 401 path classifies any non-2xx as a thrown error and never
inspects the body — so the auth-failure body shape is invisible to the
script today.

---

## 6. Gaps and proposed minimal fixes

Listed smallest-blast-radius first. None of these change route behavior
silently — they harden contracts.

### G1 — Fix script null-deref on canary 5xx (one-line)
`scripts/check-freshness.mts:231` — guard `body?.eventId`:
```ts
...(body?.eventId ? { eventId: body.eventId } : {}),
```
**Risk:** none. **Rollback:** trivial revert. **Why minimal:** the surrounding
catch already handles the throw, but this lets `TEST_FIRED` actually surface
when the canary fires successfully.

### G2 — Add Zod schema for `FreshnessStateResponse` (single source of truth)
Currently the route exports a TS interface and the script declares a parallel
TS interface plus a hand-rolled validator. Drift risk grows every time a new
field lands on the route side. Proposed: add `src/lib/freshness/state-schema.ts`
exporting a Zod schema; `route.ts` derives `FreshnessStateResponse` via
`z.infer<>`; script imports the same module and parses with `.parse()`,
deleting `validateFreshnessState`. Confines the contract to one file.

**Risk:** medium — touches the production route. **Rollback:** revert the
import + reinstate the inline interface. **Defer if:** sprint capacity tight;
the runtime validator already catches divergence.

### G3 — Test `/api/_internal/sentry-canary`
Two cases: `SENTRY_CANARY_ENABLED!=="1"` returns 404 envelope, and auth
failure returns 401 with the `{ok:false, reason}` shape. The successful-fire
path is `throw`-driven and not unit-testable without a Sentry mock — leave it.

### G4 — Test `/api/health` error fallback (503)
Currently only the soft-200 path has a test. The `try/catch` body at
`route.ts:437-543` is uncovered. A test that monkey-patches one of the
`refresh*FromStore` calls to throw, then asserts `status: "error"` and 503,
would close the gap.

### G5 — Document the `{ok:false, reason}` cron-auth divergence
File a tracking ticket (or extend AGN-? if APP-10 is the rollout one) to
align cron-auth failure bodies with the canonical `{ok:false, error, code}`
envelope. Out of scope for a one-sprint patch but should be on the board.

---

## 7. Final verdict

The freshness API contract between `check-freshness.mts` and the three
endpoints it calls is **functionally stable** — every field the script reads
is reliably emitted by the corresponding route, and the script's runtime
validator catches drift on `/api/cron/freshness/state`.

Two real defects exist (G1 cosmetic, G3/G4 test gaps); two structural
weaknesses (G2 duplicate type definitions, G5 envelope drift on auth
failures). No P0 contract break. The script is safe to keep using as the
session-opening freshness gate.

**Recommended next action:** ship G1 immediately (one-line fix, no risk),
schedule G2 + G3 + G4 into the next maintenance sprint, file G5 as a
follow-up.
