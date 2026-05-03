# CURRENT SPRINT — Sprint 1: Pool Verification + Source Activation

Status: IN PROGRESS - Phase 1.2 Reddit User-Agent pool
Started: 2026-05-03
Target completion: 2026-05-10

## Phase tracking
- [x] 1.1 GitHub pool runtime telemetry
- [x] 1.2 Reddit User-Agent pool
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
  skill-install-snapshots (no install data found). Superseded by the advisory
  deferral below.
- 2026-05-03 Mirko deferred the five advisory rows. Expanded freshness now
  reports advisory rows with `blocking=false`; local
  `npm run freshness:check -- --timeout-ms 30000` returned green=50, yellow=0,
  red=0, dead=0, blocking_non_green=0, advisory_non_green=0. Phase 1.2 may
  proceed.

## Notes for next session
- 2026-05-03 Phase 1.1 done: wired GitHub pool cold-start hydration (`hydrate: true`) into the singleton, exposed hydration status on `/admin/pool`, and added regression tests for hydrate off/on behavior.
- 2026-05-03 Phase 1.1 worker bypass migration done: `skill-derivatives` and `recent-repos` now use the worker GitHub token pool instead of direct `GITHUB_TOKEN` / `GH_PAT` reads; targeted worker regression test passed.
- Build verification found missing Sentry Next 15 hooks; patched only the required `onRouterTransitionStart` and `onRequestError` exports so `next build` can compile. Phase 1.5 Sentry delivery verification is still open.
- Verification: `npm run freshness:check` passed with 18 green / 0 yellow / 0 red / 0 dead; `npx tsx --test src/lib/__tests__/github-token-pool.test.ts` passed 23/23; `npm run typecheck` passed; `npm run lint:guards` passed; `$env:NODE_PATH=(Join-Path (Get-Location) 'node_modules'); cmd /c npm run build` passed. Plain `cmd /c npm run build` still fails in this local checkout because `.next` is a junction to `%TEMP%\trendingrepo-next-dev`, causing `_document.js` to miss repo `node_modules` during page-data collection.
- 2026-05-03 preflight correction: the prior freshness pass only covered the
  old 18-row inventory; the expanded rows have now been repaired or explicitly
  deferred.
- 2026-05-03 advisory preflight deferral done: `hotness-snapshots`,
  `mcp-dependents`, `mcp-smithery-rank`, `model-usage`, and
  `skill-install-snapshots` no longer block `freshness:check`.
- 2026-05-03 Phase 1.2 done: root Reddit scrapers and the Railway worker now
  support comma/newline-separated `REDDIT_USER_AGENTS` round-robin rotation
  when `REDDIT_USER_AGENT` is absent; the single-UA override remains stable.
  GitHub Actions pass the new secret through on Reddit jobs, admin scan child
  env allow-list includes it, and deploy docs describe it. Verification:
  `node --test scripts/__tests__/reddit-shared.test.mjs` passed 8/8;
  `npm run test:scraper-shared` passed 46/46; `npm run test:reddit` passed
  54/54; `npx vitest run tests/reddit-source.test.ts` passed 2/2;
  root `npm run typecheck` passed; worker `npm run typecheck` passed;
  `npm run lint:guards` passed.
