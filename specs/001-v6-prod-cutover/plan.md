# Implementation Plan: v6 Production Cutover

**Branch**: `001-v6-prod-cutover` | **Date**: 2026-05-21 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-v6-prod-cutover/spec.md`

## Summary

Ship the v6 rebuild (24 routes: 14 core + 8 /tools + 2 auth) to `trendingrepo.com` on
HOSTUP without regressing the 85+ legacy URLs already indexed. Approach: native Next.js
`redirects()` in `next.config.ts` for 6 moved/renamed routes + 89 legacy redirects;
preserve `/pricing` and `/contact` as new App Router pages; extend the post-deploy smoke
workflow to cover all 24 v6 routes + redirect-map samples; add a pre-cutover verification
GitHub Actions workflow that runs Lighthouse + smoke + manual click-through gates;
document a sub-5-minute DNS-swap rollback to the standby HOSTUP origin.

## Technical Context

**Language/Version**: TypeScript 5 (strict) on Node.js 22.x (pinned via `engines`)

**Primary Dependencies**: Next.js 15 (App Router + Turbopack), React 19, Tailwind 4,
ECharts (via `src/components/charts/EChart.tsx`), Framer Motion, Zustand, Zod (API
boundary validation), Clerk (auth + svix HMAC webhook), Drizzle ORM (postgres-js with
`ssl: 'require'` for Supabase pooler), `ioredis` and Upstash REST client (data-store
backends).

**Storage**: Redis (Railway-native `redis://` via ioredis OR Upstash REST `https://`)
as source of truth for 30 cron-driven payloads. Three-tier read at
`src/lib/data-store.ts`: Redis → bundled `data/*.json` → in-memory LKG. Drizzle on
Supabase Postgres for auth + ideas persistence.

**Testing**: `npm test` (node:test + tsx + vitest in serial), `npm run test:hooks`
(vitest), `npm run test:e2e` (Playwright). Lighthouse via
`PAGESPEED_API_KEY=<key> npm run lighthouse:routes:prod`. Lint guards via
`npm run lint:guards` (meta-lint catching Zod-on-mutating-routes, error envelope drift,
runtime drift).

**Target Platform**: HOSTUP single-region production, Cloudflare-fronted (expect
`Server: cloudflare`, no `X-Vercel-*` headers). Vercel project `starscreener` REMAINS
PAUSED per constitution.

**Project Type**: web-application (Next.js fullstack, SSR + RSC + ISR + route handlers).

**Performance Goals**: No regression on existing Lighthouse mobile budget across the 14
core routes. Smoke probe completes in ≤ 3 min wall-clock. Rollback completes in ≤ 5 min
wall-clock.

**Constraints**: HOSTUP-only deploy target (Vercel commands forbidden without explicit
approval). All data reads through `refreshXxxFromStore()`. No `git add -A` / `git add .`.
No new exports from `route.ts` files. Collectors stay in `direct` mode. Redirect chains
must terminate at 200 OK within ≤ 2 hops. Pre-cutover gate REQUIRES Lighthouse +
smoke + manual click-through to all pass.

**Scale/Scope**: 24 v6 routes + 6 moved/renamed redirects + 91 legacy URL redirects ≈
121 URL contracts. Smoke probe samples ~50 of these. 30 cron-driven data payloads.
Test suite baseline 1331/1337; cutover gate ≥ 1335/1337.

## Constitution Check

*Constitution v1.0.0 — see [.specify/memory/constitution.md](../../.specify/memory/constitution.md).*

| Principle | Compliance | Notes |
|-----------|------------|-------|
| **K1 — Think Before Coding** | ✅ Pass | All assumptions documented in spec § Assumptions. 3 clarifications surfaced + resolved in spec § Clarifications before plan. |
| **K2 — Simplicity First** | ✅ Pass | Uses native Next.js `redirects()` (no new framework/runtime). Extends existing smoke workflow rather than building a new one. No new abstractions. |
| **K3 — Surgical Changes** | ✅ Pass | Touches only `next.config.ts`, two new marketing pages, two GH workflow files, 3 Ideas UI components, and `tasks/CURRENT-SPRINT.md`. No refactor of adjacent code. |
| **K4 — Verify Before Claiming Done** | ✅ Pass | FR-016 mandates Lighthouse + smoke + manual click-through gate. Smoke workflow already enforces probe-or-fail. Cutover gate explicitly defined. |
| **Boil The Ocean** | ✅ Pass | Ships complete: redirects + preserved pages + verify gate + smoke probe + rollback runbook + Ideas degraded-mode toast. No partial shipping. |
| **Data Layer** | ✅ Pass | Plan does not introduce any new data sources or `readFileSync` calls. Existing `refreshXxxFromStore()` pattern unaffected. |
| **Anti-Patterns Already Burned** | ✅ Pass | No Vercel commands. No `git add .`. No new exports from `route.ts`. No mocked Redis. No cookie-based scraping. |
| **Production Deployment** | ✅ Pass | HOSTUP only. Vercel `starscreener` stays paused. |

**Constitution gate**: ✅ PASS — proceed to Phase 0.

## Project Structure

### Documentation (this feature)

```text
specs/001-v6-prod-cutover/
├── plan.md              # This file
├── spec.md              # /speckit-specify output (with clarifications)
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   ├── redirect-map.md
│   ├── smoke-probe.md
│   └── verify-gate.md
├── quickstart.md        # Phase 1 output — operator runbook
├── checklists/
│   └── requirements.md  # /speckit-specify quality checklist
└── tasks.md             # /speckit-tasks output (not yet created)
```

### Source Code (repository root)

Existing layout — only the files below are touched by this cutover:

```text
trendingrepo/
├── next.config.ts                                  # MODIFIED — add redirects() entries
├── src/
│   ├── app/
│   │   ├── (marketing)/                            # NEW — route group for preserved pages
│   │   │   ├── pricing/page.tsx                    # NEW — ported from legacy /pricing
│   │   │   └── contact/page.tsx                    # NEW — ported from legacy /contact
│   │   ├── api/
│   │   │   └── ideas/[id]/
│   │   │       ├── brief/save/route.ts             # UNCHANGED — keeps 501 stub
│   │   │       ├── brief/regenerate/route.ts       # UNCHANGED — keeps 501 stub
│   │   │       └── attach-repo/route.ts            # UNCHANGED — keeps 501 stub (operator WIP carry-over)
│   │   └── (existing 14 core + 8 tools + 2 auth routes — unchanged)
│   ├── components/
│   │   ├── layout/
│   │   │   ├── HeaderAccount.tsx                   # NEW (or RESTORED) — blocks 4 of 6 failing tests
│   │   │   └── HeaderAccountLoaded.tsx             # NEW (or RESTORED) — blocks 2 of 6 failing tests
│   │   └── ideas/
│   │       ├── IdeaBriefActions.tsx                # MODIFIED — toast wrapper for save+regenerate
│   │       ├── IdeaRelatedReposTab.tsx             # MODIFIED — toast wrapper for attach-repo
│   │       └── IdeaSideStack.tsx                   # MODIFIED — toast wrapper for save trigger
│   └── lib/
│       └── (existing — unchanged)
├── tasks/
│   └── CURRENT-SPRINT.md                           # MODIFIED — append V6 Cutover Rollback section
└── .github/workflows/
    ├── post-deploy-smoke.yml                       # MODIFIED — add 8 tools + 6 redirects + 10 legacy samples
    └── pre-cutover-verify.yml                      # NEW — Lighthouse + smoke + manual-gate emitter
```

**Structure Decision**: Use the existing single-project Next.js App Router layout under
`src/app/`. Add a new `(marketing)` route group for the two preserved legacy pages —
route groups give us URL stability without forcing a layout nesting change. Workflows
land in the existing `.github/workflows/` directory. No new top-level dirs.

## Complexity Tracking

*No constitution violations. Table intentionally empty.*

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|--------------------------------------|

---

## Phase 0: Outline & Research

See [research.md](./research.md). Summary:

- **Decision 1 (redirect type)**: 308 Permanent for all redirects in this cutover.
- **Decision 2 (preserved page source)**: One-time WebFetch of the live `/pricing` and `/contact` URLs at planning time, vendored into the new App Router pages as static content.
- **Decision 3 (rollback mechanism)**: HOSTUP origin-swap (DNS-level) to the standby origin holding the prior live build. Standby retention: ≥72h post-cutover.
- **Decision 4 (verify gate orchestration)**: New GH Actions workflow `.github/workflows/pre-cutover-verify.yml` runs Lighthouse + smoke + emits a status check. Manual click-through is a checkbox in the cutover PR body.
- **Decision 5 (Ideas degraded UX)**: Sonner toast (already in deps) showing "Editing coming soon — saving + regenerate + repo attach ship in the next wave."
- **Decision 6 (smoke probe scope expansion)**: All 24 v6 routes + 6 moved/renamed redirects (asserting 308 + correct Location) + 10 randomized samples from the 85 legacy redirects per run.

All unknowns from Technical Context resolved. ✅ Phase 0 complete.

## Phase 1: Design & Contracts

See [data-model.md](./data-model.md) and [contracts/](./contracts/).

- **data-model.md**: Route, Redirect Rule, Smoke Probe Target, Rollback Runbook Entry (entities from spec § Key Entities, fleshed with types).
- **contracts/redirect-map.md**: Canonical mapping of all 97 redirect rules (6 moved/renamed + 91 legacy → 200 or 308) in tabular form, suitable for copy-paste into `next.config.ts`.
- **contracts/smoke-probe.md**: The 50 smoke-probe targets with expected status, expected final URL, timeout, and retry policy.
- **contracts/verify-gate.md**: The pre-cutover verify gate contract — inputs (deploy URL, Lighthouse threshold), outputs (status check name), failure modes.
- **quickstart.md**: Operator runbook covering pre-cutover checklist, cutover steps, post-cutover verification, and rollback.

**Agent context update**: `CLAUDE.md` is updated between the `<!-- SPECKIT START -->` and
`<!-- SPECKIT END -->` markers to reference `specs/001-v6-prod-cutover/plan.md`.

### Constitution Re-Check (post-design)

| Principle | Compliance | Notes |
|-----------|------------|-------|
| **K1–K4 + Boil The Ocean** | ✅ Pass | No new abstractions introduced in design. Every design artifact maps directly to a spec requirement. |
| **Data Layer** | ✅ Pass | Preserved pages (`/pricing`, `/contact`) are static — no data-store usage; no `readFileSync`. |
| **Production Deployment** | ✅ Pass | Verify gate workflow runs against the cutover deploy URL on HOSTUP, never Vercel. |

**Post-design constitution gate**: ✅ PASS — ready for `/speckit-tasks`.

---

## Next Step

Run `/speckit-tasks` to generate the actionable, dependency-ordered task list from this
plan. After tasks, optionally run `/speckit-analyze` for cross-artifact consistency check
before `/speckit-implement` (the latter is the actual ~28h cutover execution and may be
sequenced across days).
