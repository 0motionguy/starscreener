# PAPERCLIP AGENT ONBOARDING CHECKLIST (STARSCREENER)

Issue: AGN-831  
Owner lane: paperclip agents onboarding  
Last updated: 2026-05-04

## Purpose

Give every new Paperclip agent a single, mandatory startup checklist so work starts from verified repo reality instead of stale assumptions.

## Day-0 startup checklist (must complete in order)

1. Confirm repo root:
   - `git rev-parse --show-toplevel`
   - Must equal `C:/Users/mirko/OneDrive/Desktop/STARSCREENER`
2. Read required context files:
   - `CLAUDE.md`
   - `docs/ENGINE.md`
   - `docs/SITE-WIREMAP.md`
   - `docs/AUDIT-2026-05-04.md`
   - `docs/forensic/00-INDEX.md`
   - `tasks/CURRENT-SPRINT.md`
   - `tasks/BACKLOG.md`
3. Run freshness gate:
   - `npm run freshness:check`
4. Classify the freshness result before any planning or code:
   - `localhost missing/unreachable` only if no listener is present on `:3023` or requests fail with `ECONNREFUSED`
   - `product-state failure` if a listener exists on `:3023` but freshness or direct endpoint probes time out, error, or return non-green
   - `pass` only when command exits `0`
   - required tie-breaker when ambiguous timeout appears:
     - `Get-NetTCPConnection -LocalPort 3023 -State Listen`
     - if listener exists, classify as `product-state failure`
5. Record evidence in issue comment (command + UTC timestamp + classification + key failure line).

## Hard operating rules

- Do not propose features before the Day-0 checklist is complete.
- Redis-backed data-store is source of truth for live data reads (`src/lib/data-store.ts`).
- New backend/platform errors must use `EngineError` categories from `src/lib/errors.ts`.
- No swallowed errors; route relevant failures to Sentry with source/category context.
- Use exponential backoff `1s/2s/4s` for recoverable external calls (max 3 attempts).
- Never expose secrets; mask to first4+last4 if needed in evidence.

## Sprint scope guardrail

- If a request is outside active sprint scope, defer it to `tasks/BACKLOG.md`.
- Treat `tasks/CURRENT-SPRINT.md` as the authoritative in-flight scope.

## Minimum verification before claiming done

- Docs-only task: show exact file path changed + checklist evidence line.
- Code task: run only the smallest relevant verification command(s) and attach pass/fail evidence.
- Visibility task: include browser/API/endpoint proof, not just a local code diff.

## Handoff template (copy/paste)

- Opening protocol: complete (`yes/no`)
- Freshness check: `<pass|localhost-unreachable|product-failure>`
- Evidence timestamp (UTC): `<YYYY-MM-DDTHH:mm:ssZ>`
- Scope decision: `<in sprint|moved to backlog>`
- Files changed: `<paths>`
- Verification run: `<command + result>`
- Blocker (if any): `Blocked on: ... Needs: ...`

## Example evidence (2026-05-04 heartbeat)

- Opening protocol: complete (`yes`)
- Freshness check: `product-failure`
- Evidence timestamp (UTC): `2026-05-04T16:01:27Z`
- Verification run:
  - `npm run freshness:check` -> `freshness-check: request timed out while contacting http://localhost:3023`
  - `Get-NetTCPConnection -LocalPort 3023 -State Listen` -> listener present (`node` on `:3023`)
- Classification reason: listener exists but health/freshness endpoints time out, therefore runtime/product failure (not missing localhost server).
