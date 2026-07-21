# Auth · Payments · UUID Identity Repair — Evidence & Handoff

**Date:** 2026-07-20 · **Model:** Claude Opus 4.8 (1M) · **Branch:**
`fix/auth-payments-identity-ledger-20260720` · **HEAD:** `5c7dc7420` (this doc +
`fix(build): rename useDbBackend` follow on after the 8 commits below)
**Base:** `origin/main` @ `140bd7f46` (identity PRs #3201/#3202 confirmed ancestors)
**Worktree:** `C:\dev\trendingrepo-wt\auth-payments` (isolated — a concurrent mobile session
was actively committing on `feat/mobile-app-experience-v1-20260720`; this repair never
touched that checkout). **No deploy. No live card. No secret/live-config change. No Vercel commands.**

Draft PR only. Production remains HOSTUP + Cloudflare.

---

## 1. What was repaired

One trustworthy chain: `active Clerk session → profile UUID → checkout → retry-safe webhook
→ UUID-owned entitlement → paid access → billing/cancel/delete lifecycle`. Every defect was a
boundary where PRs #3201/#3202's good primitives failed to meet — this completes their intent,
not a rewrite.

### Commits (8, `git log origin/main..HEAD`)
| SHA | Subject |
|---|---|
| `7db17eb2d` | test(payments): pin Stripe webhook retry-safety regression (P0) |
| `a96bc8f69` | fix(auth): bind browser identity to Clerk and profile UUID |
| `bc59115be` | fix(payments): make Stripe webhooks durable and retry-safe |
| `ef19b3b19` | fix(billing): close checkout, portal and account lifecycle |
| `cf8b4ac20` | fix(db): bind billing and paid watchlists to profile UUIDs |
| `2531dcf23` | chore(revenue): gate migrations, catalog and operator readiness |
| `24171ba50` | fix(db): mark user_tiers schema server-only (lint:guards) |
| `e2e077268` | fix(review): close P1s from adversarial wave — Clerk middleware + watchlist race |

`git diff --stat`: **50 files, +7656 / −341.** Working tree clean.

---

## 2. Findings → fixes (all reproduced from `main` before fixing)

| # | Sev | Finding | Fix | Verdict |
|---|-----|---------|-----|---------|
| 1 | P0 | `/account` read tier under RAW Clerk id → paid users showed Free | `load.ts` routes tier + watchlist through canonical `c_` (`getTierRecordForClerkUser`) | **FIXED (PROVEN mechanism)** |
| 2 | P0 | Webhook Redis-NX lock + in-memory Set marked "seen" pre-commit → failed event acked as duplicate on retry | Durable `tr.stripe_webhook_events` ledger; failed→reclaim→reprocess; deleted `idempotency.ts` | **FIXED (PROVEN)** |
| 3 | P0 | No out-of-order guard → stale `subscription.updated` re-enabled canceled sub | Per-subscription `event.created` monotonic guard in the ledger | **FIXED (PROVEN, best-effort — see §7)** |
| 4 | P0 | 30-day `ss_user` cookie authorized paid APIs after Clerk sign-out | `resolveUserPrincipal` re-verifies live Clerk for cookie `c_` principals; 3 paid routes migrated; middleware Clerk context added | **FIXED (PROVEN)** |
| 5 | P0 | No CheckoutSuccess surface | `CheckoutSuccess` + owner-verified `/api/checkout/verify` | **FIXED (STATICALLY INFERRED)** |
| 6 | P0 | Paid watchlist ephemeral JSONL; DB tables had reader, no writer → alert fan-out empty | Postgres-primary adapter (profile-UUID) + JSONL read-through | **FIXED (DB path STATICALLY INFERRED; JSONL PROVEN)** |
| 7 | P0 | Price drift: runbook $19/$180 vs code $6.50/$60 | Runbook corrected; `verify:stripe-catalog` script | **FIXED (verifier REQUIRES LIVE PROBE)** |
| 8 | P0/P1 | Team sellable, no team schema | Server 403 `TEAM_NOT_AVAILABLE` + client waitlist | **FIXED (STATICALLY INFERRED)** |
| 9 | P1 | Portal unsurfaced; `return_url`→`/you/settings` (404) | Manage Billing in `/account`; return_url→`/account` | **FIXED (STATICALLY INFERRED)** |
| 10 | P1 | Delete never canceled Stripe sub → kept billing | 409 `ACTIVE_SUBSCRIPTION` guard + tier revoke | **FIXED (guard helper PROVEN; route STATICALLY INFERRED)** |
| 11 | P1 | CI no migration replay; no readiness; no catalog verifier | PG17 CI job; `/api/ready`; catalog verifier | **FIXED (CI job REQUIRES LIVE CI RUN)** |
| 12 | P1 | Docs stale (Vercel live-key landmine, price, env names, `/you/settings`) | Runbook de-Vercel'd; prices; `.env.example`; env names | **FIXED (PROVEN — text)** |
| — | — | Handover claim "`user_tiers` missing from migrations" | **REFUTED** — it's in `0001`; docs-list drift only | n/a |

---

## 3. Migrations + schema objects added

- **`0002_stripe_webhook_events.sql`** — `tr.stripe_webhook_events` (event_id PK, status/lease/attempt/error/payload_sha256/event_created_at) + 2 indexes.
- **`0003_user_tier_profile_id.sql`** — `tr.user_tiers.profile_id uuid` nullable + FK→profiles.id (ON DELETE set null) + partial UNIQUE `WHERE profile_id is not null`.
- **`0004_watchlist_profile_unique.sql`** — `tr.watchlists` profile_id index → UNIQUE (one default per profile; closes the find-or-create race).

All additive/replay-safe (no DROP TABLE / SET NOT NULL / DELETE / TRUNCATE); confirmed by the migration reviewer. New tables/columns are empty in prod (the relational watchlist path had no writer before this repair), so the UNIQUE and NOT-NULL constraints apply cleanly.

**New operator tooling:** `npm run stripe:events:replay -- --event evt_…` (dry-run default), `npm run backfill:user-tier-profiles` (dry-run default), `npm run verify:stripe-catalog`, `GET /api/ready` (admin-gated, redacted).

---

## 4. Verification results

| Gate | Result |
|---|---|
| `npx tsc --noEmit` (typecheck) | **0 errors** |
| `npm run lint:guards` (20 meta-lints) | **all pass** (incl. server-only, error-envelope, zod-on-mutating-routes, route-runtime) |
| `npm test` (node:test, full) | **1605 pass / 0 fail** |
| `npm run build` (production Next) | **exit 0** (166/166 static pages; needed one lint rename — `useDbBackend`→`shouldUseDbBackend`, `react-hooks/rules-of-hooks`) |
| PG17 migration replay | **CI job added** (`.github/workflows/ci.yml` `db-migrate` on `postgres:17` + `assert-db-schema.mjs`) — REQUIRES a CI run to execute |

### Regression tests (the ones that BITE — evidence reviewer confirmed)
- Webhook retry-safety (`event-ledger.test.ts` `evt_fail`): failed event reprocesses on retry (`calls===2`).
- Out-of-order (`event-ledger.test.ts`): stale `updated` after newer succeeded → skipped (`applied===["newer"]`).
- Busy-lease / lease-recovery / durable-ignore ledger tests.
- Stale-cookie truth-table (`private-watchlist.test.ts`): null→401, live-match→200, cross-identity→401 — same validly-signed cookie, so the 401s come from the live-Clerk re-check, not cookie-verify.
- `subscription-status.test.ts`: billing-status classification.

---

## 5. Adversarial review wave (4 fresh read-only reviewers)

- **Auth security:** NO exploitable bypass / no paid-access-after-signout. Found **P1**: migrated routes missing from middleware `isClerkSessionRoute` → prod fail-closed 401 for all browser Pro users. **CLOSED** in `e2e077268`.
- **Stripe correctness:** both P0s genuinely fixed + pinned; atomic-claim + reclaim race-free under READ COMMITTED. Residual **P2s** (§7).
- **Migration/data-loss:** migrations clean/additive/replay-safe; no `db.query.*`. Found **P1**: `findOrCreateDefaultWatchlist` race → duplicate default watchlists → paid data loss. **CLOSED** in `e2e077268` (UNIQUE + onConflict).
- **Evidence/QA:** 38/38 targeted tests green; headline P0 tests bite; 6 surfaces ship STATICALLY-INFERRED (§6); no dishonestly-weakened assertions; no cross-test pollution.

**All P0/P1 findings closed.** Residual items are P2.

---

## 6. Claim classification

**PROVEN (test/gate in this session):** webhook retry-safety · out-of-order guard · busy/lease reclaim · durable-ignore · stale-cookie deny/allow/cross-identity · tier canonicalization mechanism (`tier-resolve`) · billing-status classification · JSONL watchlist path · typecheck · lint:guards · `npm test` 1605/0 · production build.

**STATICALLY INFERRED (typecheck + reviewer read, no behavioral test — Clerk+DB seam absent):** `load.ts` wiring to the canonical resolver · checkout idempotency-key derivation · Team-403 · `/api/checkout/verify` ownership · account-delete route 409 guard · watchlist Postgres path (`resolveProfileId`/`findOrCreate`/`dbGet/Set/Delete`) · `/api/ready` output · CheckoutSuccess/ManageBilling UI.

**REQUIRES LIVE OPERATOR PROBE:** PG17 CI migration replay (run CI) · `verify:stripe-catalog` vs live Stripe · real Clerk sign-up→checkout(test-mode)→webhook→paid canary · `/api/ready` prod values · Clerk `session.removed` webhook wiring in the dashboard · prod migration apply (0002-0004 before code) · visual confirm of CheckoutSuccess states.

**NOT COMPLETED (deliberately deferred, documented):** normalized `billing_customers`/`billing_subscriptions` tables (plan said don't half-build) · fully monotonic per-subscription `setUserTier` (the same-second out-of-order edge, §7) · deleting the dead `src/lib/db/schema.ts` footgun file · behavioral tests for the Clerk+DB-walled routes (need a DI seam or the PG17 integration harness).

---

## 7. Residual P2s (honest, non-blocking)

1. **Same-second out-of-order edge.** The guard skips a stale event only when a *succeeded* event for the sub has a strictly-greater `event.created` (second-granular). Two lifecycle events in the same second, reordered across instances, aren't distinguished, and `setUserTier` is last-writer-wins. Bounded (revenue-leak direction, expiry-capped at `period_end`). Full fix = store `latest_event_created_at` per subscription and make `setUserTier` monotonic (the deferred normalized billing tables).
2. **`checkout.session.completed` isn't in the out-of-order guard set** — a checkout event reclaimed after a `deleted` succeeded could re-upgrade. Requires a sustained handler outage spanning the sub lifetime; narrow.
3. **`last_error_redacted` stores `err.message` verbatim** (at-rest only; never echoed to Stripe/client). Rename or scrub if error text could carry sensitive values.
4. **Dead-schema footgun:** `db/client.ts` `import * as schema from "./schema"` binds the legacy `schema.ts`. Harmless today (zero `db.query.*`); any future `db.query.*` silently hits the stale schema. Delete/rename `schema.ts` in a follow-up.
5. **Coverage gaps** (§6 STATICALLY INFERRED) — add behavioral tests once a Clerk+DB test seam exists (or via the PG17 integration harness).

---

## 8. Operator next steps (pre-deploy — HOSTUP)

1. Apply migrations `0002`→`0004` **before** the new image (`npm run db:migrate` with `DIRECT_URL`), per DEPLOY-TOOLBOX.md.
2. `npm run backfill:user-tier-profiles` (dry-run → review → `-- --apply`) to link existing `c_` tier rows to profiles.
3. `npm run verify:stripe-catalog` (with the Stripe secret) — must match `tiers.ts` before charging.
4. Add the Clerk webhook `session.removed`/`session.revoked` events if server-side sign-out propagation is wanted (the `resolveUserPrincipal` guard already covers paid-route safety without it).
5. Test-mode canary: real Clerk sign-up → checkout → webhook ledger `succeeded` → `/account` shows paid → private watchlist persists across restart → portal opens → cancel → sign-out denies paid access → delete after cancel.
6. `GET /api/ready` (admin token) — confirm auth/billing/DB all green.

No production change was made in this session.
