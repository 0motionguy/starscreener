# ADR 0002 - Multi-tier cache architecture (CDN / KV / Redis / in-memory / browser)

- Status: Proposed
- Date: 2026-05-04
- Driver: AGN-670 [CACHE-EPIC]
- Author: [LEAD] CTO
- Related: `src/lib/data-store.ts`, `src/lib/data-store-reader.ts`, `src/lib/api/cache.ts`, `src/app/page.tsx`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`

---

## Context

Trendingrepo currently serves data through multiple cache behaviors that are real but not yet unified as one decision:

1. Edge/page cache via Next.js ISR (`revalidate` on many routes).
2. API response cache headers via `src/lib/api/cache.ts` (`s-maxage` + `stale-while-revalidate`).
3. Data-store runtime cache path in `src/lib/data-store.ts`: Redis -> bundled file -> in-memory LKG.
4. Browser/client caching (HTTP cache + client-side fetch reuse).

The May 4 audit confirms route HTTP 200 can coexist with stale or inconsistent source freshness. We need one explicit cache contract so freshness incidents are triaged against a known tier model, not ad-hoc assumptions.

## Decision

Adopt a five-tier cache architecture with strict ownership boundaries:

1. CDN/Edge cache (Vercel ISR + response headers) is the **delivery cache**.
2. KV/Redis cache (`src/lib/data-store.ts`) is the **application source-of-truth cache**.
3. In-process memory cache is **last-known-good resilience only**.
4. Bundled JSON file cache is **cold-start/disaster fallback only**.
5. Browser cache is **presentation-level acceleration only**.

No new product data path may bypass `src/lib/data-store.ts` for server reads. New server routes/pages must use existing `refreshXxxFromStore()` patterns before sync getters.

## Tier contract

### Tier A: CDN/Edge (ISR + Cache-Control)

- Owner: frontend/runtime.
- Purpose: latency + origin offload.
- Truth policy: may be stale by configured budget; never treated as canonical freshness proof.
- Existing examples:
  - Route-level ISR `revalidate` values in `src/app/**/page.tsx`.
  - API cache profiles in `src/lib/api/cache.ts`.

### Tier B: KV/Redis (data-store)

- Owner: platform/data pipeline.
- Purpose: canonical runtime payload for all shared source data.
- Truth policy: primary read tier for server code.
- Read path: Redis first via `getDataStore().read()`.
- Write path: collector dual-write already via `scripts/_data-store-write.mjs`.

### Tier C: Bundled file mirror

- Owner: platform.
- Purpose: deterministic seed and outage fallback.
- Truth policy: non-primary; allowed stale.
- Requirement: treat as fallback only; do not build new features that depend on file freshness.

### Tier D: In-memory LKG

- Owner: runtime process.
- Purpose: survive Redis/file transient failures without blank pages.
- Truth policy: resilience cache, not freshness source.
- Constraint: process-local only; not cross-instance coherent.

### Tier E: Browser cache

- Owner: client runtime.
- Purpose: user-perceived speed.
- Truth policy: never used for operator freshness decisions.

## Cache invalidation policy

1. Collector success writes Redis (+ optional file mirror) and updates meta timestamp.
2. Server render path calls `refreshXxxFromStore()`; internal 30s dedupe/rate-limit prevents thundering herd.
3. CDN and browser naturally revalidate by their own TTL.
4. Incident command rule: for stale-route investigation, inspect data-store freshness first, then CDN behavior.

## Freshness SLO mapping (initial)

- Source freshness truth comes from data-store freshness state endpoints, not route status code.
- ISR/page TTLs must never be stricter than source update cadence assumptions.
- On conflict (fresh page shell vs stale source payload), classify as data freshness incident.

## Security and reliability constraints

- Platform/backend errors in new cache paths must use `EngineError` categories from `src/lib/errors.ts` (`recoverable`, `quarantine`, `fatal`).
- No bare `throw new Error` in new backend/platform cache code.
- Recoverable external cache calls use 1s/2s/4s retry, max 3.
- Quarantine auth/rate-limit cases; fatal paths trigger `OPS_ALERT_WEBHOOK` policy.
- Secrets in logs stay masked (first4+last4 only).

## Non-goals

- This ADR does not replace Redis with a different primary store.
- This ADR does not remove bundled JSON immediately.
- This ADR does not redefine every route TTL in one sweep.
- This ADR does not introduce a new browser persistence layer.

## Implementation guardrails

1. New shared-source reads: `refreshXxxFromStore()` + sync getter pattern only.
2. New shared-source writes: `writeDataStore()` path only.
3. Health verification: `/api/cron/freshness/state` must stay green before accepting cache-tier changes.
4. Route 200 is insufficient evidence for freshness acceptance.

## Rollout plan

### Phase 1 (this issue)

- Publish this ADR as canonical cache-tier contract.
- Reference it from sprint/cache epic discussions.

### Phase 2

- Audit top stale-prone routes and align TTL vs source cadence.
- Document per-surface TTL/freshness matrix under `docs/forensic/`.

### Phase 3

- Reduce fallback dependency risk by shrinking file-tier reliance where Redis coverage is complete.
- Add stronger operator dashboards for tier-specific freshness attribution.

## Verification evidence (heartbeat)

- Mandatory opening protocol docs read this heartbeat (`CLAUDE.md`, `docs/ENGINE.md`, `docs/SITE-WIREMAP.md`, `docs/AUDIT-2026-05-04.md`, `docs/forensic/00-INDEX.md`, `tasks/CURRENT-SPRINT.md`, `tasks/BACKLOG.md`).
- `npm run freshness:check` result at this heartbeat: `GET http://localhost:3023/api/cron/freshness/state -> HTTP 500 Internal Server Error`.
- Classification: product failure (endpoint error), not missing localhost server.

## Consequences

Positive:
- One explicit cache ownership model across runtime, data, and client tiers.
- Faster incident triage: freshness root cause starts at the correct tier.
- Less chance of new direct-file regressions.

Tradeoffs:
- Requires discipline on every new route/collector change.
- Does not by itself fix current stale sources; it sets the enforcement baseline.
