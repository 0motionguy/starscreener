# Sprint 7 Plan - Clerk Auth + User Profiles Scoping

Issue: AGN-375  
Owner: [LEAD] CTO  
Date: 2026-05-04

## Mandatory opening protocol evidence

Read in this heartbeat:
- `CLAUDE.md`
- `docs/ENGINE.md`
- `docs/SITE-WIREMAP.md`
- `docs/AUDIT-2026-05-04.md`
- `docs/forensic/00-INDEX.md`
- `tasks/CURRENT-SPRINT.md`
- `tasks/BACKLOG.md`

Freshness check run:
- Command: `npm run freshness:check`
- Checked at: `2026-05-04T12:38:51.798Z`
- Result: `FAIL`
- Classification: product-state failure (not localhost-missing)
- Root signal:
  - Blocking non-green: `producthunt` (YELLOW, age 12.7h vs 12h budget)
  - Advisory non-green: `model-usage` (DEAD, non-blocking)
  - `Sentry: MISSING`

## Objective

Define Sprint 7 implementation scope for replacing/augmenting current custom cookie auth with Clerk and decoupling user profile identity from `authorHandle === userId`, without breaking current alert/reaction/profile behavior.

## Current verified baseline

Auth/session code paths today:
- `src/lib/api/auth.ts`
- `src/lib/api/session.ts`
- `src/app/api/auth/session/route.ts`
- Admin session path exists separately (`src/lib/api/admin-session.ts` usage in auth helpers)

User/profile surfaces today:
- Public profile page: `src/app/u/[handle]/page.tsx`
- Public profile API: `src/app/api/profile/[handle]/route.ts`
- Aggregator: `src/lib/profile.ts`
- Current identity model in code comments and logic: `authorHandle === authorId/userId`

## Scope for Sprint 7

1. Authentication foundation (Clerk integration)
- Add Clerk server/client wiring for Next.js 15 app router.
- Introduce a single adapter layer that maps Clerk principal -> internal `userId`.
- Keep existing `verifyUserAuth` contract operational during migration window.

2. Identity model split (critical)
- Move from `handle == userId` to explicit fields:
  - `userId` (stable internal key)
  - `handle` (public slug)
  - optional `displayName`
- Refactor profile aggregation joins in `src/lib/profile.ts` to use `userId` as join key.

3. Session and endpoint migration
- Update user-scoped API routes that currently depend on custom token/cookie auth to accept Clerk-backed identity via adapter.
- Preserve current response envelopes and status codes where possible.

4. Profile ownership + routing rules
- Define canonical handle creation/update policy.
- Define collision and rename behavior.
- Keep `/u/[handle]` public and stable; map handle -> user record before aggregating ideas/reactions.

5. Compatibility + rollback
- Feature flag the Clerk path for staged rollout.
- Maintain fallback to current auth flow until parity checks pass.

## Out of scope

- Redesigning profile UI layout.
- Expanding product surfaces beyond existing `/u/[handle]`, `/api/profile/[handle]`, and current auth-gated APIs.
- Reworking data freshness pipelines unrelated to auth/profile identity.

## Work packages (execution-ready)

1. WP-A - Auth adapter and env contract
- Files: `src/lib/api/auth.ts`, new `src/lib/auth/*`, middleware/config touchpoints.
- Deliverables:
  - Clerk principal extraction helper.
  - Internal adapter: Clerk principal -> stable `userId`.
  - Guarded fallback path to legacy auth.
- Done when:
  - Unit tests prove both legacy and Clerk flows resolve identical `userId` semantics.

2. WP-B - User identity data model
- Files: ideas/reactions/user storage modules (`src/lib/ideas*`, `src/lib/reactions*`, `src/lib/profile.ts` and related).
- Deliverables:
  - Explicit mapping record for `userId`, `handle`, `displayName`.
  - Migration/read-compat layer for legacy rows.
- Done when:
  - Existing rows still resolve profiles; new writes use split identity model.

3. WP-C - Profile API and page migration
- Files: `src/app/u/[handle]/page.tsx`, `src/app/api/profile/[handle]/route.ts`, related loaders.
- Deliverables:
  - Handle lookup against mapping record.
  - `getProfile` joins by `userId`.
- Done when:
  - `/u/[handle]` and `/api/profile/[handle]` work for migrated and legacy users.

4. WP-D - Authenticated endpoint parity
- Files: user-scoped routes under `src/app/api/*` currently using `verifyUserAuth`.
- Deliverables:
  - Parity matrix documenting migrated endpoints.
  - Quarantine/fatal error mapping stays on `EngineError` categories.
- Done when:
  - Auth-required endpoints pass integration checks with Clerk and legacy fallback.

5. WP-E - Verification and rollout guard
- Deliverables:
  - Test matrix (unit + route-level integration) for auth/profile critical paths.
  - Rollout checklist and rollback switch.
- Done when:
  - Staging verification passes and production activation can be toggled safely.

## Acceptance criteria (Sprint 7)

- Clerk-authenticated users can access all existing user-scoped endpoints without regression.
- Public profile route `/u/[handle]` resolves via handle mapping (not direct `userId` equality assumption).
- Legacy data remains readable during migration; no hard break for existing idea/reaction records.
- New backend/platform errors introduced in this sprint use `EngineError` categories (`recoverable`, `quarantine`, `fatal`).
- Sentry captures auth/profile failures with source/category tags for triage.
- A documented rollback path restores legacy auth behavior behind a flag.

## Risks and mitigations

- Risk: identity mismatch during migration causes profile data loss.
  - Mitigation: dual-read compatibility layer + migration audit script before cutover.
- Risk: partial endpoint migration creates inconsistent auth behavior.
  - Mitigation: endpoint parity checklist and gated rollout.
- Risk: Clerk outage or misconfig blocks writes.
  - Mitigation: legacy fallback path retained until post-cutover stability window completes.

## Dependencies

- Clerk project/env provisioning in deployment targets.
- Decision on persistent user mapping storage location.
- Sprint boundary note: this plan is scoping/output only; implementation subtasks are created after explicit approval.

## Next action

- Request confirmation on this plan revision, then create implementation child issues for WP-A through WP-E with explicit file ownership and acceptance checks.