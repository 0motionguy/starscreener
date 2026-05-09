# Rate-limit hardening — follow-up needed

**Status:** DEFERRED — patch saved at [`tasks/RATE_LIMIT_HARDENING_PATCH_2026-04-28.patch`](RATE_LIMIT_HARDENING_PATCH_2026-04-28.patch) (9.0 KiB, 233 lines).

## Context

The 3 unstaged rate-limit modifications that lived alongside worktree-2 (Phase 3.3 events firehose) were originally targeted to be split off into their own PR per the [2026-04-28 audit](AUDIT_TRENDINGREPO_2026-04-28.md). On 2026-04-28 we attempted the split and discovered the patch no longer applies cleanly to current `main` HEAD `b762c6a`.

## What the patch does (preserve for future re-implementation)

- `POST /api/repo-submissions` — adds 5 / 10min per-IP cap (was unprotected). Imports `checkRateLimitAsync` from `@/lib/api/rate-limit`. Adds `SUBMISSION_RATE_LIMIT` constant. Rate-limits BEFORE body parsing so malformed JSON floods can't bypass.
- `POST /api/submissions/revenue` — adds 3 / 10min per-IP cap (was unprotected). Same pattern.
- `POST /api/repos/[owner]/[name]/aiso` — migrates from in-memory rate-limit to Upstash-backed (1 / 60s) so the cap survives Vercel cold-start cycling.
- All three routes preserve cron-bypass via `verifyCronAuth` so trusted batch operators aren't throttled.

## Why the split failed

Main HEAD has since adopted a `parseBody(request, ZodSchema)` helper for input shape validation in these public routes (see [src/app/api/repo-submissions/route.ts](../src/app/api/repo-submissions/route.ts) on `b762c6a`). The original rate-limit patch was authored against a pre-`parseBody` version that called `request.json()` directly. The conflict regions:

- `repo-submissions/route.ts` lines 5-9 (import block)
- `repo-submissions/route.ts` lines 22-36 (constants + Zod schema)
- `repo-submissions/route.ts` lines 79-113 (POST handler body)
- `submissions/revenue/route.ts` lines 13-15 (import block)
- `submissions/revenue/route.ts` lines 28-33 (constants + Zod schema)
- `submissions/revenue/route.ts` lines 80-111 (POST handler body)
- `aiso/route.ts` — applies cleanly (no conflict)

## Re-implementation path

The semantic merge is straightforward: keep main's `parseBody` shape validation AND add the rate-limit check before `parseBody`. The two pieces are orthogonal in intent (one validates input shape, the other throttles spam); they only conflict textually because they edit nearby lines.

When you pick this up:
1. Branch from current main: `git checkout -b feat/api-rate-limit-hardening main`
2. Open the patch: [`RATE_LIMIT_HARDENING_PATCH_2026-04-28.patch`](RATE_LIMIT_HARDENING_PATCH_2026-04-28.patch)
3. Manually apply the 6 conflict regions, preserving main's `parseBody` calls and inserting the rate-limit check immediately after `verifyCronAuth` and before `parseBody`.
4. The `aiso/route.ts` change can be applied cleanly with `git apply --include='*aiso*' tasks/RATE_LIMIT_HARDENING_PATCH_2026-04-28.patch`.

## Why this isn't on a branch on origin

The first auto-apply attempt produced a stub branch on origin pointing at `main` (no real commits). It was deleted on 2026-04-28 since no PR had been opened. The patch + this note are the durable record.
