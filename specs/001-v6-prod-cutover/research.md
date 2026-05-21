# Phase 0 Research: v6 Production Cutover

**Feature**: 001-v6-prod-cutover | **Date**: 2026-05-21

This document resolves the design-time unknowns identified in `plan.md` §Technical Context.
The v6 rebuild's tech stack is fully specified by the existing codebase; research focuses
on the cutover-specific decisions.

---

## Decision 1 — Redirect Type (308 vs 301)

**Decision**: Use HTTP 308 Permanent Redirect for all redirects in this cutover.

**Rationale**:
- Next.js 15 `redirects()` defaults `permanent: true` → 308 (not 301). The framework
  team chose 308 because it preserves the request method (a 301 lets clients downgrade
  POST→GET). For our case all redirects are GET only, but 308 is the framework default
  and matches the project convention.
- 308 has equivalent SEO weight to 301 in Google's documented handling (since 2017).
- Mixing 301 and 308 in the same `next.config.ts` would create reviewer friction.

**Alternatives considered**:
- 301: Equal SEO value but Next requires `permanent: true` + explicit `statusCode: 301`
  override. Adds noise for no benefit.
- 302/307: Wrong semantics — these are temporary. Search engines will not transfer ranking.

---

## Decision 2 — Preserved Marketing Page Content Source

**Decision**: One-time `WebFetch` of the live `https://trendingrepo.com/pricing` and
`https://trendingrepo.com/contact` URLs at planning time. Vendor the resulting copy +
structure into the new App Router pages as static content.

**Rationale**:
- The legacy pages are already SEO-equipped (canonical URL, OG cards, meta description).
  Reusing their copy preserves keyword density and avoids accidental content drift that
  would harm ranking.
- The pages are low-change-rate (pricing tiers, contact form schema). Vendoring is
  acceptable; we don't need a CMS pipeline.
- New page styling adopts v6's existing Tailwind 4 design tokens — copy stays, chrome
  becomes v6-native.

**Alternatives considered**:
- Iframe the legacy origin: Breaks under CSP, breaks under HTTPS cookie context, fragile.
- Rewrite (`rewrite: true` in `next.config.ts`) proxying to the legacy origin: Couples v6
  to legacy origin uptime; defeats the cutover goal.
- Rebuild from scratch in v6 design: Acceptable but +1 day per page; we have a "boil the
  ocean" pressure to ship, not a redesign pressure.

---

## Decision 3 — HOSTUP Rollback Mechanism

**Decision**: HOSTUP origin-swap (DNS-level CNAME change) back to the standby origin
holding the prior live build. Standby origin retention: ≥72h post-cutover.

**Rationale**:
- Confirmed via clarification Q2 (see spec § Clarifications, Session 2026-05-21).
- DNS-swap is the only mechanism that meets the ≤5min budget without depending on a
  HOSTUP-specific rollback API the repo cannot confirm exists.
- 72h retention is the operator's standard window for catching delayed regressions
  (Lighthouse drift, slow Crawler revisit, ticket spike).

**Alternatives rejected**:
- HOSTUP native deploy-revert API: Repo docs don't confirm this exists; trusting it
  without verification violates Constitution K1.
- Manual re-deploy of previous SHA: Build duration on this codebase is ~3–4 min; cutting
  it too close to the 5-min budget under any pressure.

**Implementation notes**:
- Rollback runbook in `quickstart.md` § Rollback documents the exact DNS records to flip.
- Pre-cutover task: confirm standby origin is healthy via direct probe before flipping
  prod DNS to v6.

---

## Decision 4 — Verify Gate Workflow Orchestration

**Decision**: New GitHub Actions workflow at `.github/workflows/pre-cutover-verify.yml`.

Three-job pipeline:
1. `lighthouse` — runs `npm run lighthouse:routes:prod` against the 14 core routes on
   the cutover deploy URL; asserts mobile score ≥ recorded pre-cutover baseline (stored
   at `.perf/lighthouse-mobile-prod.json`).
2. `smoke` — invokes the extended smoke probe workflow against the cutover deploy URL.
3. `gate` — depends on both above; if both green, emits a `cutover-verify` status check
   = success; otherwise = failure.

Manual click-through is enforced via a PR-body checklist (not by the workflow). The PR
template includes:
```
[ ] Operator clicked through all 14 core routes in browser
[ ] Operator verified Clerk sign-in/sign-up flow
[ ] Operator verified IdeaBrief degraded mode shows "Editing coming soon" toast
```

**Rationale**:
- Automation handles deterministic checks (Lighthouse, smoke). Operator owns
  judgment-calls (does the page LOOK right, does the auth flow feel right).
- Three-job split lets Lighthouse and smoke run in parallel, completing in ~3 min total.

**Alternatives rejected**:
- All-in-one job: Slower; harder to re-run a single failed gate.
- Manual gate without workflow: Loses the audit trail of "what was verified, when, by
  whom" that GH status checks provide.

---

## Decision 5 — Ideas Degraded-Mode UX Implementation

**Decision**: Wrap the three affected click handlers in `IdeaBriefActions.tsx`,
`IdeaRelatedReposTab.tsx`, and `IdeaSideStack.tsx` with a Sonner toast call. Toast text:
"Editing coming soon — saving + regenerate + repo attach ship in the next wave."

**Rationale**:
- Sonner is already in the dependency graph (used elsewhere in v6 for non-blocking
  notifications). No new dependency.
- Click → toast is a one-line change per component, satisfies K3 (surgical).
- Per Q3 clarification, operator confirmed: ship with degraded mode visible. Hiding the
  buttons entirely was rejected because the buttons signal "this is coming."

**Alternatives rejected**:
- Disabled button with tooltip: Discoverability lower; visual signal weaker. Sonner
  toast is the existing pattern in v6.
- Inline alert above the section: More invasive change to layout.

---

## Decision 6 — Smoke Probe Scope Expansion

**Decision**: Extend `.github/workflows/post-deploy-smoke.yml` from the current 30
routes (per PR #1329) to cover:
- All 24 v6 routes (14 core + 8 tools + 2 auth) — assert HTTP 200
- All 6 moved/renamed redirects — assert HTTP 308 + correct `Location` header value
- 10 randomized samples from the 91 legacy redirects per run — assert HTTP 200 or 308
  (no 404 / 5xx)

Total probes per run: ~50. Expected wall-clock: ~3 min (within FR-016's 3-min budget).

**Rationale**:
- Sampling 10 of 91 legacy redirects (rather than all 91) keeps wall-clock under the
  budget while still detecting systematic breakage. The sampling is seeded by date so
  consecutive runs cover different subsets.
- 100% coverage of the 24 v6 routes + 6 moved/renamed is non-negotiable — these are
  the highest-traffic / highest-SEO-equity URLs.

**Alternatives rejected**:
- Cover all 91 legacy redirects every run: Pushes wall-clock to ~8 min, violates
  FR-016's 3-min budget.
- Sample only 5 legacy redirects: Too small to catch breakage with high confidence.

---

## Decision 7 — Test Suite Restoration Path (FR-011)

**Decision**: Restoring `HeaderAccount.tsx` and `HeaderAccountLoaded.tsx` is a
prerequisite blocker (B1 in S6041), tracked in tasks.md as the first task. The
restoration is NOT itself part of the cutover spec — but the cutover gate (≥1335/1337
tests) cannot pass without it.

**Rationale**:
- Spec FR-011 already states this dependency.
- Keeping it as a tracked task in `tasks.md` (rather than burying it in research) makes
  the dependency visible at execution time.

---

## Open Items — None

All 7 design-time unknowns resolved. Ready for Phase 1 design artifacts.
