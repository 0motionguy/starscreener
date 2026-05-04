# CURRENT SPRINT — Sprint 1: Pool Verification + Source Activation

Status: IN PROGRESS - Phase 1.5 blocked on Vercel Sentry DSN
Started: 2026-05-03
Target completion: 2026-05-10

## Phase tracking
- [x] 1.1 GitHub pool runtime telemetry
- [x] 1.2 Reddit User-Agent pool
- [x] 1.3 Twitter Apify + Nitter fallback
- [x] 1.4 /admin/keys dashboard
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
- 2026-05-03 advisory side-channel repair done: empty/disabled worker payloads
  now refresh `hotness-snapshots`, `mcp-dependents`, `mcp-smithery-rank`, and
  `skill-install-snapshots`; the LLM aggregate cron now writes
  `llm-aggregate-heartbeat` so `model-usage` reflects cron liveness even when
  no events are processed.
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
- 2026-05-03 landing/signals production wiring repair shipped (no file removals):
  landing skills board now shows only live skill rows (no repo fallback),
  landing consensus list expanded to 8 rows, live table stars now render
  strong white starred values, and `/signals` source chips now show
  per-source counts with brand-tinted dark active states instead of white
  pills. Consensus radar rows now render project logos (`EntityLogo`) plus
  source marks. Verification: `npx vitest run
  src/lib/__vitest__/home-page-honesty.test.ts
  src/components/home/__tests__/LiveTopTable.test.tsx
  src/components/signals-terminal/__tests__/SourceFilterBar.test.tsx` passed
  5/5; `npm run typecheck` passed; `npm run build` passed; production deploy
  completed at
  `https://starscreener-r8xdgyr4r-kermits-projects-6330acd4.vercel.app`;
  `https://trendingrepo.com/signals` now contains `signals-chip-count` and
  `--chip-color` markers, and `https://trendingrepo.com/` renders 8
  `cons-row` entries.
- 2026-05-03 Phase 1.2 hardening pass: added `config/reddit-user-agents.json`,
  new Redis telemetry/quarantine primitives in `src/lib/pool/reddit-*.ts`,
  extended `EngineError` with Reddit classes, and wired app + shared Reddit
  fetch paths to use pool selection with quarantine signaling on 429/403/5xx.
- 2026-05-03 Phase 1.3 done: added Nitter instance pool config
  (`config/nitter-instances.json`), Twitter fallback telemetry and runtime
  adapters (`src/lib/pool/twitter-*.ts`), nightly Nitter health workflow
  (`.github/workflows/check-nitter.yml`), and migrated the main Twitter
  collector to route Apify calls through the new Apify->Nitter fallback path.
- 2026-05-04 Phase 1.4 done: added authenticated `/api/admin/pool-state` and
  `/admin/keys` runtime dashboard for GitHub, Reddit, Twitter/Nitter, pool
  anomalies, and singleton source health. Verification: `npm run
  freshness:check -- --timeout-ms 30000` passed with blocking_non_green=0;
  `npm run typecheck`, `npm run lint`, `npm run test`, and `npm run build`
  passed. Local auth probe returned API/page HTTP 200 with pool rows populated.
- 2026-05-04 Phase 1.5 partial: `EngineError` hierarchy expanded to the
  38-class target, `src/instrumentation.ts` logs `SENTRY_DSN` startup status,
  `/api/_internal/sentry-canary` exists behind `CRON_SECRET` and
  `SENTRY_CANARY_ENABLED=1`, and `scripts/check-freshness.mts` reports a
  Sentry readiness row. Verification is blocked because Vercel production is
  missing `SENTRY_DSN`, and the local shell is missing `SENTRY_AUTH_TOKEN` /
  Sentry org/project values for dashboard API proof. Railway production worker
  does have `SENTRY_DSN` configured.
