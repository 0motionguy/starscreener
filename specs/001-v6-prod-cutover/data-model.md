# Phase 1 Data Model: v6 Production Cutover

**Feature**: 001-v6-prod-cutover | **Date**: 2026-05-21

The cutover is configuration-and-content work, not new domain entities. The "entities"
below are operational artifacts the implementation must produce, validate, and version-control.

---

## Entity 1 — Route

A single URL path served by the production site post-cutover.

**Fields**:
- `path: string` — URL path, e.g., `/breakout`, `/tools/top-10`
- `category: 'v6-core' | 'v6-tools' | 'v6-auth' | 'preserved-marketing' | 'redirect-moved' | 'redirect-renamed' | 'redirect-aggregator' | 'redirect-collection' | 'redirect-marketing'`
- `pre_cutover_status: 200 | 404 | 308` — what the live site returns today
- `post_cutover_status: 200 | 308` — what v6 must return
- `post_cutover_destination: string | null` — final URL after redirect chain (null if not a redirect)
- `data_source: string | null` — collector/data-store key that backs this route (null for static pages and pure redirects)

**Validation rules**:
- Every entry MUST have `post_cutover_status` ∈ {200, 308}; no 404, no 5xx.
- If `post_cutover_status === 308`, `post_cutover_destination` MUST be non-null and
  resolve to an entry with `post_cutover_status === 200`.
- If `category === 'v6-core' | 'v6-tools' | 'v6-auth' | 'preserved-marketing'`,
  `post_cutover_status` MUST equal 200.

**Lifecycle**: Created at cutover-plan time, frozen for the duration of the cutover,
revisited only if a follow-up wave rebuilds a `redirect-*` route into a `v6-*` route.

---

## Entity 2 — Redirect Rule

One entry in the cutover redirect map (subset of Route where `post_cutover_status === 308`).

**Fields**:
- `legacy_path: string` — source URL pattern, e.g., `/top10`, `/breakouts`, `/githubrepo`
- `target_path: string` — destination URL, e.g., `/tools/top-10`, `/breakout`, `/`
- `redirect_type: 308` — fixed for this cutover; no 301/302/307 allowed
- `category: 'moved' | 'renamed' | 'aggregator' | 'collection' | 'marketing'`
- `seo_value: 'high' | 'medium' | 'low'` — informational; high = direct backlink target,
  medium = aggregator, low = tail-collection

**Validation rules**:
- `target_path` MUST be an entry in the Route table with `post_cutover_status === 200`.
- `legacy_path` MUST NOT equal `target_path` (no self-redirect).
- Redirect chain depth MUST be ≤ 2 (i.e., `target_path` may itself redirect, but the
  chain MUST terminate at a 200 within 2 hops total).

**Storage**: As entries in `next.config.ts` `redirects()` array. One entry per rule.

**Count**: 6 (moved + renamed) + 22 (aggregator) + 63 (collection) + 4 (marketing 308s) = 95.

---

## Entity 3 — Smoke Probe Target

One assertion in the post-deploy smoke workflow.

**Fields**:
- `url: string` — full URL to probe (relative to deploy URL or full https://)
- `expected_status: 200 | 308`
- `expected_final_url: string | null` — required if `expected_status === 308`
- `expected_location_header: string | null` — for 308, the `Location` header value to assert
- `timeout_seconds: number` — default 10
- `retry_on_503: boolean` — true for routes backed by cold-start collectors
- `max_chain_hops: number` — default 2 per FR-015

**Validation rules**:
- For every Route with `category` ∈ {`v6-core`, `v6-tools`, `v6-auth`,
  `preserved-marketing`}, a smoke probe target with `expected_status: 200` MUST exist.
- For every Route with `category` ∈ {`redirect-moved`, `redirect-renamed`}, a smoke
  probe target with `expected_status: 308` MUST exist.
- For `category` ∈ {`redirect-aggregator`, `redirect-collection`,
  `redirect-marketing`}, sample 10 per run (seeded by date hash) — coverage is
  probabilistic, not exhaustive.

**Storage**: As GitHub Actions matrix entries in `post-deploy-smoke.yml`, or as a JSON
array consumed by a probe script. Choose JSON for maintainability.

**Count per run**: ~50 (24 v6 + 6 moved/renamed + 10 sampled legacy + 10 buffer).

---

## Entity 4 — Rollback Runbook Entry

One step in the operator rollback procedure documented at `tasks/CURRENT-SPRINT.md`
§ "V6 Cutover Rollback" and `specs/001-v6-prod-cutover/quickstart.md` § Rollback.

**Fields**:
- `step_number: 1..N` — sequential
- `command: string` — the literal command the operator runs (no placeholders without
  defaults; if a placeholder, defaults MUST be inlined as comments)
- `expected_outcome: string` — one-sentence success criterion
- `verification_probe: string | null` — optional probe command to confirm step success
- `estimated_seconds: number` — operator's time budget per step
- `failure_mode: string` — what to do if this step fails (escalate? retry? abort?)

**Validation rules**:
- Sum of `estimated_seconds` across all steps MUST be ≤ 300 (5-minute total budget).
- Every step MUST have either a `verification_probe` OR a clearly stated visual outcome
  in `expected_outcome`.
- The final step MUST be a verification probe confirming `https://trendingrepo.com`
  serves the pre-cutover homepage (HTTP 200, expected title string match).

**Expected step count**: 4 (per `quickstart.md` § Rollback design).

---

## Entity Relationships

```text
Route ─┬─< Redirect Rule (1:0..1 — only if category starts with 'redirect-')
       └─< Smoke Probe Target (1:0..1 — always for v6-* + redirect-moved/renamed; sampled for legacy)

Rollback Runbook Entry — standalone; no FK to other entities.
```

---

## Source Files Implementing Each Entity

| Entity | Implemented in |
|--------|----------------|
| Route | `next.config.ts` (redirects), `src/app/**/page.tsx` (200 routes) |
| Redirect Rule | `next.config.ts` `redirects()` array |
| Smoke Probe Target | `.github/workflows/post-deploy-smoke.yml` + probe target JSON |
| Rollback Runbook Entry | `tasks/CURRENT-SPRINT.md` §, `specs/001-v6-prod-cutover/quickstart.md` § |
