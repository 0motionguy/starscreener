# CURRENT SPRINT — Sprint 1: Pool Verification + Source Activation

Status: BLOCKED BY 5 PREFLIGHT ADVISORY ROWS
Started: 2026-05-03
Target completion: 2026-05-10

## Phase tracking
- [x] 1.1 GitHub pool runtime telemetry
- [ ] 1.2 Reddit User-Agent pool
- [ ] 1.3 Twitter Apify + Nitter fallback
- [ ] 1.4 /admin/keys dashboard
- [ ] 1.5 Sentry verification + error class hierarchy

## Acceptance criteria (Sprint 1)
See individual phase prompts.

## Blockers
- 2026-05-03: `/api/cron/freshness/state` inventory was expanded beyond the
  original scanner-only set. Direct route probe returned green=40, yellow=1,
  dead=9. Non-green rows: agent-commerce, category-metrics, consensus,
  engagement-composite, hotness-snapshots, mcp-dependents, mcp-smithery-rank,
  model-usage, skill-install-snapshots, trendshift-daily.
- 2026-05-03 repair pass: worker root redeployed to Railway deployment
  `d73c4e73-b5ea-4dd6-be32-294febd38d44` from commit `30bd20bb`; production
  `/api/worker/health` returned HTTP 200 with green=34, amber=2, red=0,
  missing=0, blockingRed=0, blockingMissing=0. Authenticated production
  `npm run freshness:check -- --prod --timeout-ms 30000` returned 18 green.
  Local expanded `npm run freshness:check -- --timeout-ms 30000` improved to
  green=45, yellow=0, red=0, dead=5. Remaining dead rows:
  hotness-snapshots (trending-skill snapshot published 0 items),
  mcp-dependents (LIBRARIES_IO_API_KEY missing), mcp-smithery-rank
  (SMITHERY_API_KEY missing), model-usage (cron succeeds but no events touched),
  skill-install-snapshots (no install data found). Treat as advisory/defer
  decision; do not start phase 1.2 until Mirko explicitly defers these five or
  the expanded route marks them non-blocking.

## Notes for next session
- 2026-05-03 Phase 1.1 done: wired GitHub pool cold-start hydration (`hydrate: true`) into the singleton, exposed hydration status on `/admin/pool`, and added regression tests for hydrate off/on behavior.
- Build verification found missing Sentry Next 15 hooks; patched only the required `onRouterTransitionStart` and `onRequestError` exports so `next build` can compile. Phase 1.5 Sentry delivery verification is still open.
- Verification: `npm run freshness:check` passed with 18 green / 0 yellow / 0 red / 0 dead; `npx tsx --test src/lib/__tests__/github-token-pool.test.ts` passed 23/23; `npm run typecheck` passed; `npm run lint:guards` passed; `$env:NODE_PATH=(Join-Path (Get-Location) 'node_modules'); cmd /c npm run build` passed. Plain `cmd /c npm run build` still fails in this local checkout because `.next` is a junction to `%TEMP%\trendingrepo-next-dev`, causing `_document.js` to miss repo `node_modules` during page-data collection.
- 2026-05-03 preflight correction: the prior freshness pass only covered the
  old 18-row inventory. Do not start phase 1.2 until the expanded freshness
  rows above are repaired or explicitly deferred by Mirko.
