# Frontend Deep-Dive Forensic Audit (In Progress)

Scope target: `src/app/**/page.tsx` (83) + `src/components/**/*.tsx` (313)
Heartbeat batch: 5 files

## page.tsx — /about
File: `src/app/about/page.tsx`

Verdict: PASS with one structural follow-up.

1. RSC discipline: PASS (`'use client'` not used; static server page).
2. Sequential awaits: PASS (no async chain).
3. fs/sync calls in RSC body: PASS.
4. External API in RSC: PASS.
5. `next/image` vs `<img>`: PASS (no `<img>`).
6. Suspense boundaries: N-A (no slow async work).
7. Error boundaries: FAIL (`src/app/about/` has no `error.tsx`; neighbor listing contains only `page.tsx`).
8. Loading states: N-A (no async page body).
9. Cache headers: PASS (fully static content; no dynamic/revalidate required).
10. Bundle weight: PASS (light imports only).
11. Hydration mismatches: PASS (no time/random/locale runtime values in render).
12. Accessibility: PASS (semantic headings/lists/links; no interactive div patterns).

Notes:
- Structural seam is clean: domain text and SEO constants are separated via `@/lib/seo`.

## page.tsx — /admin/ideas-queue
File: `src/app/admin/ideas-queue/page.tsx`

Verdict: PASS.

1. RSC discipline: PASS (server-only auth gate).
2. Sequential awaits: PASS (single cookie read).
3. fs/sync calls in RSC body: PASS.
4. External API in RSC: PASS.
5. `next/image` vs `<img>`: N-A (delegates UI to component).
6. Suspense boundaries: N-A (no in-page long fetch).
7. Error boundaries: PASS (`src/app/admin/ideas-queue/error.tsx` exists).
8. Loading states: N-A (auth gate + render only).
9. Cache headers: PASS (`dynamic = "force-dynamic"` is justified for session-gated admin content).
10. Bundle weight: PASS (small surface).
11. Hydration mismatches: PASS (no client-time/random usage in page body).
12. Accessibility: N-A at page shell level.

Notes:
- Good depth: auth concern stays at page boundary; UI concern stays in `IdeasQueueAdmin`.

## page.tsx — /admin/keys
File: `src/app/admin/keys/page.tsx`

Verdict: FAIL (material architecture issue).

1. RSC discipline: PASS (server page).
2. Sequential awaits: PASS (short chain).
3. fs/sync calls in RSC body: PASS.
4. External API in RSC: PASS (no direct remote fetch in page body).
5. `next/image` vs `<img>`: N-A at page shell level.
6. Suspense boundaries: N-A (single fetch path).
7. Error boundaries: FAIL (`src/app/admin/keys/` has no `error.tsx` neighbor).
8. Loading states: N-A (single server render path).
9. Cache headers: PASS (`dynamic = "force-dynamic"` fits session-bound telemetry).
10. Bundle weight: PASS at page shell.
11. Hydration mismatches: PASS.
12. Accessibility: N-A at page shell level.

Architecture findings:
- Layering + seam violation: `src/app/admin/keys/page.tsx:L10` imports route handler `@/app/api/admin/pool-state/route`, then instantiates `NextRequest` (`:L32-L36`) and calls `getPoolState` directly (`:L37`). This couples UI-layer rendering to HTTP adapter internals and forces request-shape knowledge into a page.
- Deepening opportunity: move pool-state retrieval into a domain/service seam (e.g., `lib/admin/pool-state.ts`) consumed by both route handler and page; keep route file as thin adapter.

## page.tsx — /admin/login
File: `src/app/admin/login/page.tsx`

Verdict: PASS with one quality follow-up.

1. RSC discipline: PASS.
2. Sequential awaits: PASS.
3. fs/sync calls in RSC body: PASS.
4. External API in RSC: PASS.
5. `next/image` vs `<img>`: N-A.
6. Suspense boundaries: PASS (explicit boundary around client form).
7. Error boundaries: PASS (`src/app/admin/login/error.tsx` exists).
8. Loading states: N-A (minimal shell).
9. Cache headers: PASS (`dynamic = "force-dynamic"` justified by session redirect).
10. Bundle weight: PASS.
11. Hydration mismatches: PASS at page level.
12. Accessibility: N-A at page shell.

Notes:
- `Suspense` fallback is `null` (`src/app/admin/login/page.tsx:L26`), which is non-blocking but provides no loading affordance.

## page.tsx — /admin
File: `src/app/admin/page.tsx`

Verdict: PASS.

1. RSC discipline: PASS.
2. Sequential awaits: PASS.
3. fs/sync calls in RSC body: PASS.
4. External API in RSC: PASS.
5. `next/image` vs `<img>`: N-A.
6. Suspense boundaries: N-A.
7. Error boundaries: PASS (`src/app/admin/error.tsx` exists).
8. Loading states: N-A.
9. Cache headers: PASS (`dynamic = "force-dynamic"` justified).
10. Bundle weight: PASS.
11. Hydration mismatches: PASS.
12. Accessibility: N-A at page shell.

Notes:
- Clean responsibility split: page performs auth gate and delegates to `AdminDashboard`.

## Findings created this heartbeat

1. Missing page error boundary on `/about`: `src/app/about/page.tsx` (no `src/app/about/error.tsx`).
2. Layering/seam violation on `/admin/keys`: `src/app/admin/keys/page.tsx:L10,L32-L37` (page directly calls API route handler).
3. Missing page error boundary on `/admin/keys`: `src/app/admin/keys/page.tsx` (no local `error.tsx`).

## Things that look bad but are actually fine

- `src/app/admin/page.tsx:L18` with `dynamic = "force-dynamic"` looks expensive at first glance, but it is correct for session-gated admin surfaces where static caching risks stale/incorrect access behavior.
- `src/app/admin/ideas-queue/page.tsx:L23` redirect in page body looks abrupt, but this is the correct boundary for auth enforcement before rendering client-heavy admin UI.

## page.tsx — /admin/pool
File: `src/app/admin/pool/page.tsx`

Verdict: PASS with one architecture finding.

1. RSC discipline: PASS (server page, client code not leaked).
2. Sequential awaits: PASS.
3. fs/sync calls in RSC body: PASS.
4. External API in RSC: PASS (uses local pool seam `@/lib/github-token-pool`).
5. `next/image` vs `<img>`: N-A at page shell level.
6. Suspense boundaries: N-A.
7. Error boundaries: PASS (`src/app/admin/pool/error.tsx` exists).
8. Loading states: N-A.
9. Cache headers: PASS (`dynamic = "force-dynamic"` is appropriate for live admin telemetry).
10. Bundle weight: PASS for page shell.
11. Hydration mismatches: PASS (server-only timestamps rendered once).
12. Accessibility: PASS (tabular data with semantic `<table>` + headers).

Architecture finding:
- **Duplicated logic risk (with sibling route):** `relTime`/`relFuture` helpers at `src/app/admin/pool/page.tsx:L44-L60` are duplicated in `/admin/pool-aggregate` (`src/app/admin/pool-aggregate/page.tsx:L46-L62`). This creates slow divergence risk in operator-visible time semantics.

## page.tsx — /admin/pool-aggregate
File: `src/app/admin/pool-aggregate/page.tsx`

Verdict: PASS with one shared finding.

1. RSC discipline: PASS.
2. Sequential awaits: PASS (single datastore read path).
3. fs/sync calls in RSC body: PASS.
4. External API in RSC: PASS (goes through aggregate seam `readAggregatePoolState`).
5. `next/image` vs `<img>`: N-A at page shell.
6. Suspense boundaries: N-A.
7. Error boundaries: PASS (`src/app/admin/pool-aggregate/error.tsx` exists).
8. Loading states: N-A.
9. Cache headers: PASS (`dynamic = "force-dynamic"` justified by fleet telemetry).
10. Bundle weight: PASS.
11. Hydration mismatches: PASS.
12. Accessibility: PASS (structured tables, headings).

Architecture finding:
- **Duplicated logic risk (with sibling route):** duplicates `relTime`/`relFuture` in route file (`src/app/admin/pool-aggregate/page.tsx:L46-L62`) instead of shared formatter seam.

## page.tsx — /admin/revenue-queue
File: `src/app/admin/revenue-queue/page.tsx`

Verdict: PASS.

1. RSC discipline: PASS.
2. Sequential awaits: PASS.
3. fs/sync calls in RSC body: PASS.
4. External API in RSC: PASS.
5. `next/image` vs `<img>`: N-A at page shell.
6. Suspense boundaries: N-A.
7. Error boundaries: PASS (`src/app/admin/revenue-queue/error.tsx` exists).
8. Loading states: N-A.
9. Cache headers: PASS (`dynamic = "force-dynamic"` justified for session-gated admin queue).
10. Bundle weight: PASS.
11. Hydration mismatches: PASS.
12. Accessibility: N-A at page shell level (delegates UI to `RevenueQueueAdmin`).

## page.tsx — /admin/scoring-shadow
File: `src/app/admin/scoring-shadow/page.tsx`

Verdict: PASS with one structural finding.

1. RSC discipline: PASS.
2. Sequential awaits: PASS (bounded await chain).
3. fs/sync calls in RSC body: PASS.
4. External API in RSC: PASS (reads via `getDataStore` seam).
5. `next/image` vs `<img>`: N-A.
6. Suspense boundaries: N-A (single report fetch, deterministic render path).
7. Error boundaries: PASS (`src/app/admin/scoring-shadow/error.tsx` exists).
8. Loading states: N-A.
9. Cache headers: PASS (`dynamic = "force-dynamic"` matches admin diagnostics).
10. Bundle weight: PASS (no heavy animation/chart libs pulled here).
11. Hydration mismatches: PASS.
12. Accessibility: PASS (table abstractions + textual fallbacks).

Architecture finding:
- **Depth / cohesion erosion:** `src/app/admin/scoring-shadow/page.tsx` mixes route auth/data orchestration with dense presentational submodules in the same file (`DomainReportSection` and render column definitions at `:L163-L406`). The module is becoming load-bearing for both data boundary and UI composition, making changes to table rendering and route behavior collide.
- **Deepening opportunity:** extract the domain report rendering block (starting at `:L163`) into a dedicated module under `src/components/admin/` while preserving the page seam for auth + data read only.

## page.tsx — /admin/staleness
File: `src/app/admin/staleness/page.tsx`

Verdict: PASS.

1. RSC discipline: PASS.
2. Sequential awaits: PASS.
3. fs/sync calls in RSC body: PASS (`readFile` is async via `node:fs/promises`).
4. External API in RSC: PASS.
5. `next/image` vs `<img>`: N-A.
6. Suspense boundaries: N-A.
7. Error boundaries: PASS (`src/app/admin/staleness/error.tsx` exists).
8. Loading states: N-A.
9. Cache headers: PASS (`dynamic = "force-dynamic"` appropriate for admin diagnostics).
10. Bundle weight: PASS.
11. Hydration mismatches: PASS.
12. Accessibility: PASS (semantic tables + labels; no div-button anti-patterns).

## Findings created this heartbeat

1. Duplicated relative-time formatter logic across `/admin/pool` and `/admin/pool-aggregate` (`src/app/admin/pool/page.tsx:L44-L60`, `src/app/admin/pool-aggregate/page.tsx:L46-L62`).
2. Cohesion/depth drift in `/admin/scoring-shadow` route module (`src/app/admin/scoring-shadow/page.tsx:L163-L406`).

## page.tsx — /admin/unknown-mentions
File: `src/app/admin/unknown-mentions/page.tsx`

Verdict: PASS.

1. RSC discipline: PASS.
2. Sequential awaits: PASS.
3. fs/sync calls in RSC body: PASS (`readFile` is async).
4. External API in RSC: PASS.
5. `next/image` vs `<img>`: N-A at page shell.
6. Suspense boundaries: N-A.
7. Error boundaries: PASS (`src/app/admin/unknown-mentions/error.tsx` exists).
8. Loading states: N-A.
9. Cache headers: PASS (`dynamic = "force-dynamic"` justified for admin diagnostics).
10. Bundle weight: PASS.
11. Hydration mismatches: PASS.
12. Accessibility: N-A at page shell (delegates to `UnknownMentionsAdmin`).

## page.tsx — /agent-commerce/[slug]
File: `src/app/agent-commerce/[slug]/page.tsx`

Verdict: PASS with one architecture note.

1. RSC discipline: PASS.
2. Sequential awaits: PASS (bounded awaits for params/store refresh).
3. fs/sync calls in RSC body: PASS.
4. External API in RSC: PASS (data through `@/lib/agent-commerce` seam).
5. `next/image` vs `<img>`: N-A in this file.
6. Suspense boundaries: N-A.
7. Error boundaries: PASS (`src/app/agent-commerce/[slug]/error.tsx` exists).
8. Loading states: PASS (`src/app/agent-commerce/[slug]/loading.tsx` exists).
9. Cache headers: PASS (`revalidate = 600` is explicit and plausible for this dataset).
10. Bundle weight: PASS for this route file.
11. Hydration mismatches: PASS.
12. Accessibility: PASS (semantic structure; links and headings present).

## page.tsx — /agent-commerce/facilitator/[name]
File: `src/app/agent-commerce/facilitator/[name]/page.tsx`

Verdict: FAIL.

1. RSC discipline: PASS (server route).
2. Sequential awaits: PASS.
3. fs/sync calls in RSC body: FAIL (`require("fs")` + `readFileSync` at `:L68-L74` in render-path loader).
4. External API in RSC: PASS.
5. `next/image` vs `<img>`: N-A.
6. Suspense boundaries: N-A.
7. Error boundaries: PASS (`error.tsx` exists).
8. Loading states: PASS (`loading.tsx` exists).
9. Cache headers: FAIL (no explicit `revalidate`/`dynamic`; route relies on implicit behavior while reading mutable `.data/*` files).
10. Bundle weight: PASS.
11. Hydration mismatches: PASS.
12. Accessibility: PASS.

Architecture findings:
- **Concern leakage + missing seam:** filesystem transport is embedded via CommonJS require/sync IO in route module (`src/app/agent-commerce/facilitator/[name]/page.tsx:L68-L74`) instead of going through a data seam.
- **Deepening opportunity:** extract chain-file reads into a shared async data accessor in `lib/agent-commerce/*` and consume from both this route and parent `/agent-commerce` route.

## page.tsx — /agent-commerce
File: `src/app/agent-commerce/page.tsx`

Verdict: FAIL (material structural debt).

1. RSC discipline: PASS.
2. Sequential awaits: PASS.
3. fs/sync calls in RSC body: FAIL (inherited anti-pattern noted by facilitator route comments; this route remains the source convention).
4. External API in RSC: PASS (store/file reads, no direct third-party fetch in page body).
5. `next/image` vs `<img>`: N-A in route shell.
6. Suspense boundaries: N-A.
7. Error boundaries: PASS (`src/app/agent-commerce/error.tsx` exists).
8. Loading states: PASS (`src/app/agent-commerce/loading.tsx` exists).
9. Cache headers: PASS (`revalidate = 600` explicit).
10. Bundle weight: FAIL (route module is 2238 LOC, `src/app/agent-commerce/page.tsx`, mixing data ingest, scoring, rendering, and admin telemetry sections).
11. Hydration mismatches: PASS (server-rendered timestamps only).
12. Accessibility: PASS overall at route shell level.

Architecture finding:
- **God module / cohesion failure:** `src/app/agent-commerce/page.tsx` at 2238 LOC has accumulated multiple responsibilities in one seam. Change risk is high because ranking logic and presentation blocks are co-located.

## page.tsx — /agent-repos/[slug]
File: `src/app/agent-repos/[slug]/page.tsx`

Verdict: PASS with caution.

1. RSC discipline: PASS.
2. Sequential awaits: PASS.
3. fs/sync calls in RSC body: PASS.
4. External API in RSC: PASS.
5. `next/image` vs `<img>`: N-A in route shell.
6. Suspense boundaries: N-A.
7. Error boundaries: PASS (`src/app/agent-repos/[slug]/error.tsx` exists).
8. Loading states: PASS (`src/app/agent-repos/[slug]/loading.tsx` exists).
9. Cache headers: PASS (`revalidate = 1800` explicit).
10. Bundle weight: PASS with caution (file is 542 LOC, approaching god-module threshold).
11. Hydration mismatches: PASS.
12. Accessibility: PASS.

## Findings created this heartbeat

1. Sync filesystem IO in facilitator route render path (`src/app/agent-commerce/facilitator/[name]/page.tsx:L68-L74`) + implicit cache policy.
2. God-module severity in `/agent-commerce` route (`src/app/agent-commerce/page.tsx`, 2238 LOC).
