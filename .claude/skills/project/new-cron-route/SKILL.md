---
name: new-cron-route
description: Fires when the user wants to add a daily/hourly cron, scheduled job, scraper, collector, refresh task, or background HTTP trigger. Use phrases include "add a cron", "schedule a job", "new collector", "daily refresh", "background task", "scrape every X hours", "wire up a scheduled fetch", "register a cron route", "make it run on a schedule".
---

# New Cron Route

Scaffold a new STARSCREENER cron-driven HTTP route plus its GitHub Actions trigger.
This skill enforces the project's three-tier read pattern, auth contract, and dual-write
discipline. Coordinate with the `cron-route-builder` subagent for the actual codegen.

## When to fire

Trigger phrases:
- "add a cron", "new cron", "schedule a job"
- "new collector", "new scraper", "new fetcher"
- "daily refresh", "hourly refresh", "every N hours"
- "background task", "scheduled HTTP", "wire up a scheduled fetch"

## Required reads (do these BEFORE writing code)

1. `src/app/api/cron/CLAUDE.md` (route conventions, runtime, error envelope)
2. `src/lib/api/auth.ts` -> `verifyCronAuth()` (CRON_SECRET header check)
3. `scripts/_data-store-write.mjs` -> `writeDataStore(slug, payload)` (Redis dual-write)
4. `.github/workflows/cron-*.yml` (existing YAML shape; copy the closest sibling)
5. `docs/ENGINE.md` (slot table -- pick a slot that does not collide)

## Procedure

1. Confirm the data slug. If new, name it `kebab-case` and add it to the data-store
   slug table in `tasks/data-api.md`.
2. Create the route at `src/app/api/cron/<slug>/route.ts`.
   - `export const runtime = "nodejs"` (NOT edge -- collectors need fs/crypto).
   - First two lines of `GET`/`POST`:
     `const deny = authFailureResponse(verifyCronAuth(request));`
     `if (deny) return deny;` (both imports from `@/lib/api/auth`).
   - Wrap fetch + transform in try/catch; on success call
     `writeDataStore("<slug>", payload)` AND mirror to `data/<slug>.json` during transition.
   - Return JSON envelope: `{ ok: true, slug, count, durationMs }`.
3. Create `.github/workflows/cron-<slug>.yml`:
   - Schedule cron expression -- pick an unused minute offset (see ENGINE.md slot map).
   - `concurrency: cron-<slug>` to prevent overlap.
   - Step: `curl -fsS -H "x-cron-secret: ${{ secrets.CRON_SECRET }}" $BASE_URL/api/cron/<slug>`.
   - Final step: `git add data/<slug>.json && git commit -m "chore(<slug>): refresh"
     && git push` (only if dual-write is still on).
4. Add a `refresh<Slug>FromStore()` async helper in `src/lib/<slug>.ts` following
   `src/lib/trending.ts:refreshTrendingFromStore` exactly (30s rate-limit + dedupe).
5. Wire any consuming server component to call the refresh hook at the top, then read
   the in-memory cache via sync getters.

## Delegation

For implementation, dispatch the `cron-route-builder` subagent with the slug, source URL,
schedule, and target shape. Verify its output against this checklist before approving.

## Verification

- `npm run lint:guards` (catches missing auth, wrong runtime, mutating Zod patterns)
- `npm run typecheck`
- `curl -H "x-cron-secret: $CRON_SECRET" localhost:3023/api/cron/<slug>` returns 200 envelope
- `npm run verify:data-store` shows the new key after one run

## Anti-patterns (already burned)

- DO NOT `readFileSync(process.cwd(), "data", ...)` in the route -- use the data-store.
- DO NOT use `runtime: "edge"` -- breaks node fs and crypto.
- DO NOT skip `verifyCronAuth` -- preview deploys get hammered by bots.
- DO NOT `git add -A` in the workflow -- name the specific file (parallel-merge theft).
